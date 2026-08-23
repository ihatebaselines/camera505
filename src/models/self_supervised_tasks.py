"""
LIFE Platform - Self-Supervised Learning Tasks Engine
Implements the 4 Foundation Pre-Training Tasks:
1. Masked Token Reconstruction (MAE/BERT-style, 40% masking, MSE loss)
2. Cross-Modal Contrastive Learning (InfoNCE / Similarity Matrix alignment)
3. Future Window Prediction (Embedding t -> t+1 dynamics loss)
4. Temporal Consistency Regularization (Adjacent window smoothness)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, Tuple, Optional


class MaskedTokenReconstructionLoss(nn.Module):
    """
    Task 1: Masked Token Modeling.
    Randomly masks a fraction (default 40%) of the patch tokens and trains
    the decoder head to reconstruct the missing latent representations.
    """
    def __init__(self, d_model: int = 512, mask_ratio: float = 0.40):
        super().__init__()
        self.d_model = d_model
        self.mask_ratio = mask_ratio
        self.mask_token = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.decoder = nn.Sequential(
            nn.Linear(d_model, d_model),
            nn.GELU(),
            nn.Linear(d_model, d_model)
        )

    def mask_tokens(self, tokens: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        # tokens: [batch, seq_len, d_model]
        batch, seq_len, _ = tokens.shape
        num_masked = int(seq_len * self.mask_ratio)
        
        # Random permutation per sample
        rand_indices = torch.rand(batch, seq_len, device=tokens.device).argsort(dim=1)
        mask_indices = rand_indices[:, :num_masked]
        
        mask_matrix = torch.zeros(batch, seq_len, dtype=torch.bool, device=tokens.device)
        mask_matrix.scatter_(1, mask_indices, True)
        
        # Replace masked positions with learnable mask token
        masked_tokens = tokens.clone()
        masked_tokens[mask_matrix] = self.mask_token.expand(batch, seq_len, -1)[mask_matrix]
        
        return masked_tokens, mask_matrix

    def forward(self, reconstructed_tokens: torch.Tensor, target_tokens: torch.Tensor, mask_matrix: torch.Tensor) -> torch.Tensor:
        # Reconstruct only at masked positions
        pred = self.decoder(reconstructed_tokens)
        loss = F.mse_loss(pred[mask_matrix], target_tokens[mask_matrix])
        return loss


class CrossModalContrastiveLoss(nn.Module):
    """
    Task 2: Cross-Modal Contrastive Learning (CLIP / InfoNCE).
    Aligns paired ECG and Audio embeddings from the same 30s window
    while pushing apart embeddings from different windows or nights.
    """
    def __init__(self, d_model: int = 512, temperature: float = 0.07):
        super().__init__()
        self.temperature = temperature
        self.ecg_proj = nn.Linear(d_model, d_model)
        self.audio_proj = nn.Linear(d_model, d_model)

    def forward(self, ecg_embeds: torch.Tensor, audio_embeds: torch.Tensor) -> torch.Tensor:
        # ecg_embeds, audio_embeds: [batch_size, d_model]
        batch_size = ecg_embeds.shape[0]
        if batch_size < 2:
            return torch.tensor(0.0, device=ecg_embeds.device, requires_grad=True)
            
        z_ecg = F.normalize(self.ecg_proj(ecg_embeds), dim=-1)
        z_audio = F.normalize(self.audio_proj(audio_embeds), dim=-1)
        
        # Cosine similarity matrix: [batch, batch]
        sim_matrix = torch.matmul(z_ecg, z_audio.T) / self.temperature
        
        # Target: diagonal indices (i == j) are the positive pairs
        targets = torch.arange(batch_size, device=ecg_embeds.device)
        
        loss_e2a = F.cross_entropy(sim_matrix, targets)
        loss_a2e = F.cross_entropy(sim_matrix.T, targets)
        
        return 0.5 * (loss_e2a + loss_a2e)


class FutureWindowPredictionLoss(nn.Module):
    """
    Task 3: Future Window Dynamic Modeling.
    Predicts the 512-dim embedding of window t+1 given window t.
    Loss: alpha * (1 - cosine_similarity) + (1 - alpha) * MSE
    """
    def __init__(self, d_model: int = 512, alpha: float = 0.5):
        super().__init__()
        self.alpha = alpha
        self.predictor = nn.Sequential(
            nn.Linear(d_model, d_model),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(d_model, d_model)
        )

    def forward(self, current_embeddings: torch.Tensor, next_embeddings: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        # current_embeddings: [batch-1, d_model] (window 0 .. T-1)
        # next_embeddings: [batch-1, d_model] (window 1 .. T)
        pred_next = self.predictor(current_embeddings)
        
        # 1. Cosine similarity component
        cos_sim = F.cosine_similarity(pred_next, next_embeddings, dim=-1)
        cos_loss = torch.mean(1.0 - cos_sim)
        
        # 2. MSE component
        mse_loss = F.mse_loss(pred_next, next_embeddings)
        
        total_loss = self.alpha * cos_loss + (1.0 - self.alpha) * mse_loss
        return total_loss, pred_next


class TemporalConsistencyLoss(nn.Module):
    """
    Task 4: Temporal Continuity Regularization.
    Penalizes erratic discontinuous spikes between consecutive 30-sec windows in the same session.
    """
    def __init__(self):
        super().__init__()

    def forward(self, sequence_embeddings: torch.Tensor) -> torch.Tensor:
        # sequence_embeddings: [batch, d_model] ordered chronologically
        if sequence_embeddings.shape[0] < 2:
            return torch.tensor(0.0, device=sequence_embeddings.device, requires_grad=True)
            
        diffs = sequence_embeddings[1:] - sequence_embeddings[:-1]
        loss = torch.mean(torch.norm(diffs, p=2, dim=-1))
        return loss


class LifeSelfSupervisedEngine(nn.Module):
    """
    Unified Multitask Pre-Training Engine.
    Combines all 4 self-supervised objectives:
    L_total = lambda_mask * L_mask + lambda_contrast * L_contrast + lambda_future * L_future + lambda_cons * L_cons
    """
    def __init__(
        self,
        d_model: int = 512,
        lambda_mask: float = 1.0,
        lambda_contrast: float = 1.0,
        lambda_future: float = 0.8,
        lambda_cons: float = 0.2
    ):
        super().__init__()
        self.lambda_mask = lambda_mask
        self.lambda_contrast = lambda_contrast
        self.lambda_future = lambda_future
        self.lambda_cons = lambda_cons
        
        self.mask_task = MaskedTokenReconstructionLoss(d_model=d_model)
        self.contrast_task = CrossModalContrastiveLoss(d_model=d_model)
        self.future_task = FutureWindowPredictionLoss(d_model=d_model)
        self.cons_task = TemporalConsistencyLoss()

    def compute_losses(
        self,
        window_embeddings: torch.Tensor,
        ecg_tokens: torch.Tensor,
        audio_tokens: torch.Tensor
    ) -> Dict[str, torch.Tensor]:
        """
        Computes composite loss on a chronological batch of 30s windows.
        """
        losses = {}
        batch_size = window_embeddings.shape[0]
        
        # 1. Masked Reconstruction on ECG & Audio tokens
        masked_ecg, mask_m_ecg = self.mask_task.mask_tokens(ecg_tokens)
        l_mask_ecg = self.mask_task(masked_ecg, ecg_tokens, mask_m_ecg)
        
        masked_aud, mask_m_aud = self.mask_task.mask_tokens(audio_tokens)
        l_mask_aud = self.mask_task(masked_aud, audio_tokens, mask_m_aud)
        
        l_mask = 0.5 * (l_mask_ecg + l_mask_aud)
        losses["loss_mask"] = l_mask
        
        # 2. Contrastive Alignment between ECG and Audio token pools
        mean_ecg = torch.mean(ecg_tokens, dim=1) # [batch, 512]
        mean_aud = torch.mean(audio_tokens, dim=1) # [batch, 512]
        l_contrast = self.contrast_task(mean_ecg, mean_aud)
        losses["loss_contrastive"] = l_contrast
        
        # 3. Future Window Prediction (if batch >= 2)
        if batch_size >= 2:
            l_future, _ = self.future_task(window_embeddings[:-1], window_embeddings[1:])
            l_cons = self.cons_task(window_embeddings)
        else:
            l_future = torch.tensor(0.0, device=window_embeddings.device)
            l_cons = torch.tensor(0.0, device=window_embeddings.device)
            
        losses["loss_future"] = l_future
        losses["loss_consistency"] = l_cons
        
        # Total composite loss
        l_total = (
            self.lambda_mask * l_mask +
            self.lambda_contrast * l_contrast +
            self.lambda_future * l_future +
            self.lambda_cons * l_cons
        )
        losses["loss_total"] = l_total
        
        return losses
