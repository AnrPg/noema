"""
HLR Sidecar — Half-Life Regression Microservice

Thin, stateless FastAPI wrapper around Duolingo's Half-Life Regression (HLR)
algorithm. Receives feature vectors and returns half-life / recall predictions.

This service does NOT own any persistence. The scheduler-service is the system
of record for schedules. Agents orchestrate calls to this sidecar as one of
several scheduling signals.

Reference implementation: third-party/halflife-regression/experiment.py
Paper: Settles & Meeder (2016) — "A Trainable Spaced Repetition Model for
       Language Learning" (ACL 2016)
"""

from __future__ import annotations

import math
import os
from collections import defaultdict
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

logger = structlog.get_logger()


class Settings(BaseSettings):
    """Service configuration via environment variables."""

    host: str = "0.0.0.0"
    port: int = 8020
    log_level: str = "info"
    # Default HLR hyper-parameters (from Settles & Meeder 2016)
    hlr_learning_rate: float = 0.001
    hlr_hl_weight: float = 0.01
    hlr_l2_weight: float = 0.1
    hlr_sigma: float = 1.0
    hlr_omit_h_term: bool = False

    model_config = {"env_prefix": "HLR_"}


settings = Settings()


# ---------------------------------------------------------------------------
# HLR Core Algorithm (adapted from third-party/halflife-regression)
# ---------------------------------------------------------------------------

MIN_HALF_LIFE = 15.0 / (24 * 60)  # 15 minutes in days
MAX_HALF_LIFE = 274.0  # ~9 months in days
LN2 = math.log(2.0)


def pclip(p: float) -> float:
    """Bound min/max model predictions."""
    return min(max(p, 0.0001), 0.9999)


def hclip(h: float) -> float:
    """Bound min/max half-life."""
    return min(max(h, MIN_HALF_LIFE), MAX_HALF_LIFE)


class HLRModel:
    """
    Half-Life Regression model.

    Maintains trained weights and can:
    - predict recall probability and half-life given features
    - update weights from a single training instance (online learning)
    """

    def __init__(
        self,
        initial_weights: dict[str, float] | None = None,
        omit_h_term: bool = False,
        lrate: float = 0.001,
        hlwt: float = 0.01,
        l2wt: float = 0.1,
        sigma: float = 1.0,
    ) -> None:
        self.omit_h_term = omit_h_term
        self.weights: dict[str, float] = defaultdict(float)
        if initial_weights is not None:
            self.weights.update(initial_weights)
        self.fcounts: dict[str, int] = defaultdict(int)
        self.lrate = lrate
        self.hlwt = hlwt
        self.l2wt = l2wt
        self.sigma = sigma

    def halflife(self, features: list[tuple[str, float]], base: float = 2.0) -> float:
        """Compute half-life from feature vector."""
        try:
            dp = sum(self.weights[k] * x_k for k, x_k in features)
            return hclip(base**dp)
        except (OverflowError, ValueError):
            return MAX_HALF_LIFE

    def predict(
        self, features: list[tuple[str, float]], delta_days: float, base: float = 2.0
    ) -> tuple[float, float]:
        """
        Predict recall probability and half-life.

        Args:
            features: List of (feature_name, value) tuples.
            delta_days: Time since last review in days.
            base: Logarithmic base for half-life computation.

        Returns:
            (recall_probability, half_life_days)
        """
        h = self.halflife(features, base)
        p = 2.0 ** (-delta_days / h)
        return pclip(p), h

    def train_update(
        self,
        features: list[tuple[str, float]],
        delta_days: float,
        actual_recall: float,
        actual_half_life: float | None = None,
    ) -> None:
        """
        Online weight update from a single observation.

        Args:
            features: Feature vector.
            delta_days: Time since last review in days.
            actual_recall: Observed recall proportion [0, 1].
            actual_half_life: Observed half-life (optional, estimated if None).
        """
        base = 2.0
        p, h = self.predict(features, delta_days, base)

        if actual_half_life is None:
            # Estimate half-life from actual recall and delta
            if actual_recall > 0.0001 and delta_days > 0:
                actual_half_life = hclip(-delta_days / math.log2(actual_recall))
            else:
                actual_half_life = h

        dlp_dw = 2.0 * (p - actual_recall) * (LN2**2) * p * (delta_days / h)
        dlh_dw = 2.0 * (h - actual_half_life) * LN2 * h

        for k, x_k in features:
            rate = (
                (1.0 / (1.0 + actual_recall))
                * self.lrate
                / math.sqrt(1 + self.fcounts[k])
            )
            # sl(p) update
            self.weights[k] -= rate * dlp_dw * x_k
            # sl(h) update
            if not self.omit_h_term:
                self.weights[k] -= rate * self.hlwt * dlh_dw * x_k
            # L2 regularization update
            self.weights[k] -= rate * self.l2wt * self.weights[k] / self.sigma**2
            self.fcounts[k] += 1

    def get_weights(self) -> dict[str, float]:
        """Return current model weights."""
        return dict(self.weights)

    def load_weights(self, weights: dict[str, float]) -> None:
        """Load model weights."""
        self.weights = defaultdict(float)
        self.weights.update(weights)


# ---------------------------------------------------------------------------
# Global model instance
# ---------------------------------------------------------------------------

_model: HLRModel | None = None


def get_model() -> HLRModel:
    """Get or create the global HLR model instance."""
    global _model
    if _model is None:
        _model = HLRModel(
            omit_h_term=settings.hlr_omit_h_term,
            lrate=settings.hlr_learning_rate,
            hlwt=settings.hlr_hl_weight,
            l2wt=settings.hlr_l2_weight,
            sigma=settings.hlr_sigma,
        )
    return _model


# ---------------------------------------------------------------------------
# API Schemas
# ---------------------------------------------------------------------------


class Feature(BaseModel):
    """A single feature in the feature vector."""

    name: str = Field(..., description="Feature name (e.g., 'right', 'wrong', 'bias')")
    value: float = Field(..., description="Feature value")


class PredictRequest(BaseModel):
    """Request to predict recall probability and half-life."""

    features: list[Feature] = Field(..., description="Feature vector for the item")
    delta_days: float = Field(
        ...,
        ge=0,
        description="Days since last review",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "features": [
                        {"name": "right", "value": 2.449},
                        {"name": "wrong", "value": 1.0},
                        {"name": "bias", "value": 1.0},
                    ],
                    "delta_days": 3.5,
                }
            ]
        }
    }


class PredictResponse(BaseModel):
    """Response with recall probability and half-life prediction."""

    recall_probability: float = Field(
        ..., ge=0, le=1, description="Predicted probability of recall [0, 1]"
    )
    half_life_days: float = Field(..., ge=0, description="Predicted half-life in days")


class TrainRequest(BaseModel):
    """Request to update model weights from an observation."""

    features: list[Feature] = Field(..., description="Feature vector for the item")
    delta_days: float = Field(..., ge=0, description="Days since last review")
    actual_recall: float = Field(
        ...,
        ge=0,
        le=1,
        description="Observed recall proportion [0, 1]",
    )
    actual_half_life: float | None = Field(
        None,
        ge=0,
        description="Observed half-life in days (estimated if omitted)",
    )


class TrainResponse(BaseModel):
    """Response after training update."""

    updated: bool = True
    recall_probability: float = Field(
        ..., description="Post-update predicted recall probability"
    )
    half_life_days: float = Field(..., description="Post-update predicted half-life")


class WeightsResponse(BaseModel):
    """Current model weights."""

    weights: dict[str, float]
    feature_counts: dict[str, int]


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    service: str = "hlr-sidecar"
    version: str = "0.1.0"


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — initialize model on startup."""
    logger.info("hlr_sidecar_starting", port=settings.port)
    get_model()  # Initialize model
    logger.info("hlr_model_initialized")
    yield
    logger.info("hlr_sidecar_shutting_down")


app = FastAPI(
    title="Noema HLR Sidecar",
    description=(
        "Stateless Half-Life Regression (HLR) microservice. "
        "Computes recall probability and half-life predictions for the "
        "Noema scheduling pipeline. Based on Settles & Meeder (2016)."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse()


@app.post("/predict", response_model=PredictResponse, tags=["hlr"])
async def predict_half_life(request: PredictRequest) -> PredictResponse:
    """
    Predict recall probability and half-life for an item.

    This is the primary endpoint called by agents during scheduling.
    It is stateless — pass the feature vector and time delta, receive a
    prediction.
    """
    model = get_model()
    features = [(f.name, f.value) for f in request.features]
    p, h = model.predict(features, request.delta_days)

    logger.debug(
        "hlr_predict",
        recall_probability=round(p, 4),
        half_life_days=round(h, 2),
        num_features=len(features),
        delta_days=request.delta_days,
    )

    return PredictResponse(recall_probability=p, half_life_days=h)


@app.post("/train", response_model=TrainResponse, tags=["hlr"])
async def train_update(request: TrainRequest) -> TrainResponse:
    """
    Update model weights from a single learning observation.

    Called after a review attempt to incrementally improve the model.
    This performs online gradient descent on the HLR loss function.
    """
    model = get_model()
    features = [(f.name, f.value) for f in request.features]

    model.train_update(
        features=features,
        delta_days=request.delta_days,
        actual_recall=request.actual_recall,
        actual_half_life=request.actual_half_life,
    )

    # Return post-update predictions
    p, h = model.predict(features, request.delta_days)

    logger.info(
        "hlr_train_update",
        actual_recall=request.actual_recall,
        post_update_p=round(p, 4),
        post_update_h=round(h, 2),
    )

    return TrainResponse(
        recall_probability=p,
        half_life_days=h,
    )


@app.get("/weights", response_model=WeightsResponse, tags=["hlr"])
async def get_weights() -> WeightsResponse:
    """
    Return current model weights (for inspection/debugging).

    Note: In production, weights should be persisted externally (e.g., in
    the scheduler-service database) and loaded on startup.
    """
    model = get_model()
    return WeightsResponse(
        weights=model.get_weights(),
        feature_counts=dict(model.fcounts),
    )


@app.put("/weights", tags=["hlr"])
async def load_weights(weights: dict[str, float]) -> dict[str, str]:
    """
    Load model weights (e.g., from a previously trained model).

    In production, agents or the scheduler-service would call this on
    startup to restore a trained model.
    """
    model = get_model()
    model.load_weights(weights)
    logger.info("hlr_weights_loaded", num_weights=len(weights))
    return {"status": "weights loaded", "count": str(len(weights))}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=os.getenv("HLR_RELOAD", "false").lower() == "true",
    )
