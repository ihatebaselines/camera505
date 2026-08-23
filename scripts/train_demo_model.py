"""
LIFE Platform - 24-Hour Pre-Training & Fine-Tuning Pipeline
Trains the Multimodal Foundation Transformer using:
- Task 1: Masked Token Reconstruction (BERT style)
- Task 2: Cross-Modal Contrastive Learning (CLIP / InfoNCE)
- Task 3: Future Window Prediction
- Task 4: Temporal Consistency Loss
Saves trained weights to data/checkpoints/life_transformer_best.pt
"""

import os
import sys
import time
import torch
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models.transformer_backbone import LifeMultimodalTransformer
from src.models.self_supervised_tasks import LifeSelfSupervisedEngine
from src.datasets.psg_audio_loader import PsgAudioDatasetHelper
from src.dsp.audio_dsp import extract_mel_spectrogram


def train_multimodal_foundation_model(epochs: int = 10, batch_size: int = 8, lr: float = 1e-3):
    print("=" * 70)
    print("  [AI] Starting Multimodal Foundation Model Pre-Training")
    print("=" * 70)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  Using Compute Device: {device}")
    
    # 1. Instantiate Model & Loss Engine
    model = LifeMultimodalTransformer(d_model=512, num_layers=3).to(device)
    loss_engine = LifeSelfSupervisedEngine(d_model=512).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    
    # 2. Prepare Training Data from PSG-Audio Synthetic Generator
    helper = PsgAudioDatasetHelper()
    print("  Generating paired 30-second training windows from PSG-Audio layout...")
    
    num_windows = 64
    ecg_windows = []
    mel_windows = []
    
    for i in range(num_windows):
        sample = helper.generate_demo_psg_sample(duration_sec=30)
        ecg_w = sample["ecg_signal"][:7500]
        if len(ecg_w) < 7500:
            ecg_w = np.pad(ecg_w, (0, 7500 - len(ecg_w)))
        ecg_windows.append(ecg_w)
        
        audio_w = sample["audio_signal"][:480000]
        if len(audio_w) < 480000:
            audio_w = np.pad(audio_w, (0, 480000 - len(audio_w)))
        mel_w = extract_mel_spectrogram(audio_w, fs=16000)
        mel_windows.append(mel_w)
        
    ecg_tensor = torch.tensor(np.array(ecg_windows), dtype=torch.float32) # [64, 7500]
    mel_tensor = torch.tensor(np.array(mel_windows), dtype=torch.float32) # [64, 128, frames]
    
    print(f"  Dataset Loaded: {num_windows} paired windows (ECG shape: {ecg_tensor.shape}, Mel shape: {mel_tensor.shape})")
    
    # 3. Training Loop
    checkpoint_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)
    best_loss = float("inf")
    
    t_start = time.time()
    for epoch in range(epochs):
        model.train()
        epoch_loss = 0.0
        num_batches = num_windows // batch_size
        
        # Shuffle indices
        perm = torch.randperm(num_windows)
        
        for b in range(num_batches):
            idx = perm[b * batch_size:(b + 1) * batch_size]
            b_ecg = ecg_tensor[idx].to(device)
            b_mel = mel_tensor[idx].to(device)
            
            optimizer.zero_grad()
            out = model(ecg_raw=b_ecg, audio_mel=b_mel)
            
            losses = loss_engine.compute_losses(
                window_embeddings=out["window_embedding"],
                ecg_tokens=out["ecg_tokens"],
                audio_tokens=out["audio_tokens"]
            )
            
            loss = losses["loss_total"]
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            
            epoch_loss += loss.item()
            
        scheduler.step()
        avg_loss = epoch_loss / num_batches
        print(f"  Epoch [{epoch+1:02d}/{epochs:02d}] - Loss: {avg_loss:.4f} (Mask: {losses['loss_mask']:.4f}, Contrastive: {losses['loss_contrastive']:.4f}, Future: {losses['loss_future']:.4f})")
        
        if avg_loss < best_loss:
            best_loss = avg_loss
            ckpt_path = os.path.join(checkpoint_dir, "life_transformer_best.pt")
            torch.save(model.state_dict(), ckpt_path)
            
    total_time = time.time() - t_start
    print(f"\n  [SUCCESS] Training Complete in {total_time:.2f}s! Best Model Checkpoint Saved to: {ckpt_path}")
    print("=" * 70)


if __name__ == "__main__":
    train_multimodal_foundation_model(epochs=8, batch_size=8)
