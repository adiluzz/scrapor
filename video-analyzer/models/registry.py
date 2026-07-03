"""Model catalog and factory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from media import MediaSource


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    provider: str
    supports_bbox: bool
    bedrock_model_id: str | None = None
    is_twelvelabs_direct: bool = False


MODEL_CATALOG: list[ModelSpec] = [
    ModelSpec("pegasus-1-5", "Pegasus 1.5 (segmentation)", "TwelveLabs direct", False, is_twelvelabs_direct=True),
    ModelSpec("pegasus-1-2", "Pegasus 1.2 (Bedrock)", "Amazon Bedrock", False, "us.twelvelabs.pegasus-1-2-v1:0"),
    ModelSpec("nova-2-lite", "Nova 2 Lite", "Amazon Bedrock", True, "amazon.nova-2-lite-v1:0"),
    ModelSpec("nova-pro", "Nova Pro", "Amazon Bedrock", True, "amazon.nova-pro-v1:0"),
    ModelSpec("nova-lite", "Nova Lite", "Amazon Bedrock", True, "amazon.nova-lite-v1:0"),
    ModelSpec("nova-premier", "Nova Premier", "Amazon Bedrock", True, "amazon.nova-premier-v1:0"),
]


def get_model_spec(model_id: str) -> ModelSpec:
    for spec in MODEL_CATALOG:
        if spec.id == model_id:
            return spec
    return MODEL_CATALOG[0]


@dataclass
class Detection:
    label: str
    start_sec: float
    end_sec: float
    confidence: float | None = None
    screen_x: float | None = None
    screen_y: float | None = None
    screen_w: float | None = None
    screen_h: float | None = None
    frame_sec: float | None = None


class VideoAnalyzer(Protocol):
    def analyze(
        self,
        media: MediaSource,
        targets: list[str],
        learning_context: str,
    ) -> list[Detection]: ...


def create_analyzer(model_id: str) -> VideoAnalyzer:
    spec = get_model_spec(model_id)
    if spec.is_twelvelabs_direct:
        from models.pegasus_direct import PegasusDirectAnalyzer
        return PegasusDirectAnalyzer()
    if spec.id == "pegasus-1-2":
        from models.pegasus_bedrock import PegasusBedrockAnalyzer
        return PegasusBedrockAnalyzer(spec.bedrock_model_id or "us.twelvelabs.pegasus-1-2-v1:0")
    from models.nova_bedrock import NovaBedrockAnalyzer
    return NovaBedrockAnalyzer(spec.bedrock_model_id or "amazon.nova-lite-v1:0", spec.supports_bbox)
