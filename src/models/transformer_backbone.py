"""
LIFE Platform - Multimodal Transformer & Patch Embedding Backbone
Implements:
- 1D Convolutional ECG Patch Encoder
- 2D Convolutional Mel-Spectrogram Audio Patch Encoder
- Rotary Positional Embeddings (RoPE) & Sinusoidal temporal encodings
- Cross-Modal & Self-Attention Multimodal Transformer (Shared 512-dim Latent Space)
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, Optional, Dict, Any


class RotaryPositionalEmbedding(nn.Module):
    """
    Rotary Positional Embedding (RoPE)
    Rotates query and key vectors in complex 2D planes according to token sequence position:
    (x') = (cos alpha   -sin alpha) (x)
    (y') = (sin alpha    cos alpha) (y)
    """
    def __init__(self, dim: int, max_seq_len: int = 512):
        super().__init__()
        self.dim = dim
        inv_freq = 1.0 / (10000 ** (torch.arange(0, dim, 2).float() / dim))
        self.register_buffer("inv_freq", inv_freq)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: [batch_size, seq_len, dim]
        seq_len = x.shape[1]
        t = torch.arange(seq_len, device=x.device, dtype=self.inv_freq.dtype)
        freqs = torch.einsum("i,j->ij", t, self.inv_freq) # [seq_len, dim/2]
        emb = torch.cat((freqs, freqs), dim=-1)           # [seq_len, dim]
        cos = emb.cos().unsqueeze(0)                      # [1, seq_len, dim]
        sin = emb.sin().unsqueeze(0)                      # [1, seq_len, dim]
        
        # Rotate half
        x1 = x[..., :self.dim // 2]
        x2 = x[..., self.dim // 2:]
        rotated = torch.cat((-x2, x1), dim=-1)
        return (x * cos) + (rotated * sin)


class EcgPatchEncoder(nn.Module):
    """
    Transforms 30s ECG waveform (e.g. 7500 samples @ 250Hz) into temporal patch tokens.
    Uses 1D Conv layers + GELU + MaxPool to compress 125 samples (0.5s) per token.
    Output: [batch_size, 60_tokens, 512_dim]
    """
    def __init__(self, in_channels: int = 1, embed_dim: int = 512):
        super().__init__()
        self.conv_layers = nn.Sequential(
            # Layer 1: Downsample x5 (125 -> 25)
            nn.Conv1d(in_channels, 64, kernel_size=15, stride=5, padding=7),
            nn.BatchNorm1d(64),
            nn.GELU(),
            # Layer 2: Downsample x5 (25 -> 5)
            nn.Conv1d(64, 128, kernel_size=7, stride=5, padding=3),
            nn.BatchNorm1d(128),
            nn.GELU(),
            # Layer 3: Downsample x5 (5 -> 1)
            nn.Conv1d(128, 256, kernel_size=5, stride=5, padding=2),
            nn.BatchNorm1d(256),
            nn.GELU(),
            # Final projection to embed_dim
            nn.Conv1d(256, embed_dim, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm1d(embed_dim),
            nn.GELU()
        )
        self.proj = nn.Linear(embed_dim, embed_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: [batch_size, 1, 7500]
        if x.dim() == 2:
            x = x.unsqueeze(1)
        feat = self.conv_layers(x) # [batch, embed_dim, 60]
        feat = feat.transpose(1, 2) # [batch, 60, embed_dim]
        return self.proj(feat)


class AudioPatchEncoder(nn.Module):
    """
    Transforms 30s Audio Mel-Spectrogram (128 mel bins x ~3000 frames) into 60 temporal tokens.
    Uses 2D Conv layers + GELU + MaxPool.
    Output: [batch_size, 60_tokens, 512_dim]
    """
    def __init__(self, in_channels: int = 1, embed_dim: int = 512):
        super().__init__()
        self.conv_layers = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=(5, 5), stride=(2, 2), padding=(2, 2)),
            nn.BatchNorm2d(32),
            nn.GELU(),
            nn.Conv2d(32, 64, kernel_size=(5, 5), stride=(2, 2), padding=(2, 2)),
            nn.BatchNorm2d(64),
            nn.GELU(),
            nn.Conv2d(64, 128, kernel_size=(3, 5), stride=(2, 3), padding=(1, 2)),
            nn.BatchNorm2d(128),
            nn.GELU(),
            nn.AdaptiveAvgPool2d((1, 60)) # Compress frequency axis to 1, time axis to 60 tokens
        )
        self.proj = nn.Linear(128, embed_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: [batch, 1, 128, n_frames] or [batch, 128, n_frames]
        if x.dim() == 3:
            x = x.unsqueeze(1)
        feat = self.conv_layers(x) # [batch, 128, 1, 60]
        feat = feat.squeeze(2).transpose(1, 2) # [batch, 60, 128]
        return self.proj(feat)


class MultimodalTransformerLayer(nn.Module):
    """
    Self-Attention & Cross-Attention block with Pre-LayerNorm and GELU Feed-Forward network.
    """
    def __init__(self, d_model: int = 512, nhead: int = 8, dim_feedforward: int = 1024, dropout: float = 0.1):
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.self_attn = nn.MultiheadAttention(d_model, nhead, dropout=dropout, batch_first=True)
        self.dropout1 = nn.Dropout(dropout)
        
        self.norm2 = nn.LayerNorm(d_model)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, dim_feedforward),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(dim_feedforward, d_model),
            nn.Dropout(dropout)
        )

    def forward(self, x: torch.Tensor, attn_mask: Optional[torch.Tensor] = None) -> torch.Tensor:
        norm_x = self.norm1(x)
        attn_out, _ = self.self_attn(norm_x, norm_x, norm_x, attn_mask=attn_mask)
        x = x + self.dropout1(attn_out)
        x = x + self.ffn(self.norm2(x))
        return x


class LifeMultimodalTransformer(nn.Module):
    """
    Complete Multimodal Foundation Architecture:
    1. ECG & Audio Token Encoders
    2. Rotary Positional Embeddings
    3. Multimodal Transformer Backbone (Shared Latent Space)
    4. CLS / Global Pooling -> 512-dim Respiratory/Physiological Window Embedding
    """
    def __init__(self, d_model: int = 512, nhead: int = 8, num_layers: int = 3, num_tokens: int = 60):
        super().__init__()
        self.d_model = d_model
        self.num_tokens = num_tokens
        
        # Patch Encoders
        self.ecg_encoder = EcgPatchEncoder(in_channels=1, embed_dim=d_model)
        self.audio_encoder = AudioPatchEncoder(in_channels=1, embed_dim=d_model)
        
        # Positional Encoding
        self.rope = RotaryPositionalEmbedding(dim=d_model, max_seq_len=num_tokens * 2 + 2)
        
        # Modality Type Embeddings (ECG vs Audio identifier)
        self.modality_ecg = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.modality_audio = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.cls_token = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        
        # Transformer Layers
        self.layers = nn.ModuleList([
            MultimodalTransformerLayer(d_model=d_model, nhead=nhead)
            for _ in range(num_layers)
        ])
        
        self.norm = nn.LayerNorm(d_model)
        
        # Projection heads for downstream tasks
        self.respiration_pred_head = nn.Linear(d_model, 1) # Estimated breathing rate
        self.snore_pred_head = nn.Linear(d_model, 1)       # Snore probability

    def forward(
        self,
        ecg_raw: Optional[torch.Tensor] = None,
        audio_mel: Optional[torch.Tensor] = None,
        mask_ratio: float = 0.0
    ) -> Dict[str, torch.Tensor]:
        """
        Forward pass.
        Returns:
            - window_embedding: [batch, 512] (Consolidated multimodal window embedding)
            - ecg_tokens: [batch, 60, 512]
            - audio_tokens: [batch, 60, 512]
            - full_tokens: [batch, 121, 512]
            - pred_resp_rate: [batch, 1]
            - pred_snore: [batch, 1]
        """
        batch_size = ecg_raw.shape[0] if ecg_raw is not None else audio_mel.shape[0]
        device = ecg_raw.device if ecg_raw is not None else audio_mel.device
        
        tokens_list = []
        
        # 1. Encode ECG
        if ecg_raw is not None:
            ecg_tokens = self.ecg_encoder(ecg_raw) + self.modality_ecg # [batch, 60, 512]
            tokens_list.append(ecg_tokens)
        else:
            ecg_tokens = torch.zeros(batch_size, self.num_tokens, self.d_model, device=device)
            tokens_list.append(ecg_tokens)
            
        # 2. Encode Audio
        if audio_mel is not None:
            audio_tokens = self.audio_encoder(audio_mel) + self.modality_audio # [batch, 60, 512]
            tokens_list.append(audio_tokens)
        else:
            audio_tokens = torch.zeros(batch_size, self.num_tokens, self.d_model, device=device)
            tokens_list.append(audio_tokens)
            
        # Concatenate tokens: [CLS, ECG_1..60, Audio_1..60]
        cls_tokens = self.cls_token.expand(batch_size, -1, -1)
        combined_tokens = torch.cat([cls_tokens] + tokens_list, dim=1) # [batch, 121, 512]
        
        # 3. Apply Rotary Positional Encoding
        seq_len = combined_tokens.shape[1]
        combined_tokens = self.rope(combined_tokens)
        
        # 4. Multimodal Transformer Blocks
        hidden = combined_tokens
        for layer in self.layers:
            hidden = layer(hidden)
            
        hidden = self.norm(hidden)
        
        # Extract CLS token as Window Representation (512-dim)
        window_embedding = hidden[:, 0, :] # [batch, 512]
        
        # Auxiliary heads
        pred_resp = F.relu(self.respiration_pred_head(window_embedding)) + 5.0 # Breathing rate in RPM
        pred_snore = torch.sigmoid(self.snore_pred_head(window_embedding))
        
        return {
            "window_embedding": window_embedding,
            "ecg_tokens": hidden[:, 1:1+self.num_tokens, :],
            "audio_tokens": hidden[:, 1+self.num_tokens:, :],
            "all_tokens": hidden,
            "pred_resp_rate": pred_resp,
            "pred_snore": pred_snore
        }
