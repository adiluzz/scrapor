"""Few-shot learning context from human feedback."""

from __future__ import annotations

from typing import Any


def build_learning_context(examples: list[dict[str, Any]]) -> str:
    if not examples:
        return (
            "No prior training examples yet. Be conservative — only report detections "
            "when the action is clearly visible in moving video. "
            "Skip ads, sponsor cards, full-screen promos, still images, and frozen frames. "
            "Each detection should be 5–10 seconds long, from a non-overlapping time range. "
            "Spread picks across the video when building a highlight reel."
        )

    approved = [e for e in examples if e.get("approved")]
    rejected = [e for e in examples if not e.get("approved")]

    def fmt(e: dict[str, Any]) -> str:
        tag = "APPROVED" if e.get("approved") else "REJECTED"
        line = (
            f'- {tag} "{e["label"]}" at {e["startSec"]:.1f}s–{e["endSec"]:.1f}s'
        )
        if e.get("screenX") is not None:
            line += (
                f' region=({e["screenX"]*100:.0f}%,{e["screenY"]*100:.0f}% '
                f'{e["screenW"]*100:.0f}%×{e["screenH"]*100:.0f}%)'
            )
        ctx = e.get("contextPrompt") or ""
        if ctx:
            line += f' context="{ctx[:80]}"'
        return line

    text = "Learn from prior human feedback:\n"
    if approved:
        text += "\nApproved detections (look for similar):\n" + "\n".join(fmt(e) for e in approved[:10])
    if rejected:
        text += "\nRejected detections (avoid false positives like these):\n" + "\n".join(
            fmt(e) for e in rejected[:10]
        )
    return text
