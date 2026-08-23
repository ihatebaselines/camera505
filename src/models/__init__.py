"""Multimodal AI & Foundation Models Package."""
from .transformer_backbone import LifeMultimodalTransformer, EcgPatchEncoder, AudioPatchEncoder, RotaryPositionalEmbedding
from .self_supervised_tasks import (
    MaskedTokenReconstructionLoss,
    CrossModalContrastiveLoss,
    FutureWindowPredictionLoss,
    TemporalConsistencyLoss,
    LifeSelfSupervisedEngine
)
from .adaptive_baseline import PersonalizedAdaptiveBaseline
from .clinical_head import ClinicalScreeningHead, estimate_multimodal_risk_score

__all__ = [
    "LifeMultimodalTransformer",
    "EcgPatchEncoder",
    "AudioPatchEncoder",
    "RotaryPositionalEmbedding",
    "MaskedTokenReconstructionLoss",
    "CrossModalContrastiveLoss",
    "FutureWindowPredictionLoss",
    "TemporalConsistencyLoss",
    "LifeSelfSupervisedEngine",
    "PersonalizedAdaptiveBaseline",
    "ClinicalScreeningHead",
    "estimate_multimodal_risk_score"
]
