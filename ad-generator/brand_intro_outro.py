"""Animated brand logo intro/outro segments."""

from __future__ import annotations

import logging
import os
import re
import subprocess
from pathlib import Path

from config import CONFIG
from media import run_ffmpeg

log = logging.getLogger("ad-generator.brand")


def _ffmpeg_drawtext_escape(text: str) -> str:
    """Escape text for ffmpeg drawtext filter."""
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "%%")
    )


def _tagline_slug(tagline: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", tagline.lower()).strip("-")
    return slug[:48] or "site"


def ensure_brand_assets(tagline_domain: str | None = None) -> None:
    """Build intro/outro MP4 templates if missing."""
    assets_dir = Path(CONFIG.intro_path).parent
    assets_dir.mkdir(parents=True, exist_ok=True)
    lockup = Path(CONFIG.brand_lockup_path)
    svg_fallback = lockup.with_suffix(".svg")
    if not svg_fallback.exists():
        svg_fallback = lockup.parent / "pisster-lockup.svg"

    png_path = lockup if lockup.suffix.lower() == ".png" else assets_dir / lockup.with_suffix(".png").name
    if not png_path.exists():
        if lockup.suffix.lower() == ".svg" and lockup.exists():
            _svg_to_png(lockup, png_path)
        elif svg_fallback.exists():
            _svg_to_png(svg_fallback, png_path)
        else:
            log.warning("brand_lockup_missing path=%s svg=%s", lockup, svg_fallback)
            return
    elif lockup.suffix.lower() == ".png" and lockup.exists():
        png_path = lockup

    if not Path(CONFIG.intro_path).exists():
        _render_intro(png_path, Path(CONFIG.intro_path))
    if not Path(CONFIG.outro_path).exists():
        _render_outro(png_path, Path(CONFIG.outro_path), show_tagline=False)

    tagline = (
        (tagline_domain or "").strip()
        or os.environ.get("PROMO_AD_TAGLINE_DOMAIN")
        or os.environ.get("PRIMARY_DOMAIN")
        or ""
    ).strip()

    outro_base = Path(CONFIG.outro_path).parent
    notag_path = outro_base / "outro_notagline_1080p.mp4"
    if not notag_path.exists():
        _render_outro(png_path, notag_path, show_tagline=False)

    if tagline:
        tagline_path = outro_base / f"outro_tagline_{_tagline_slug(tagline)}_1080p.mp4"
        if not tagline_path.exists():
            _render_outro(png_path, tagline_path, show_tagline=True, tagline_text=tagline)


def _svg_to_png(svg_path: Path, png_path: Path) -> None:
    try:
        subprocess.run(
            ["rsvg-convert", "-w", "640", "-h", "200", "-o", str(png_path), str(svg_path)],
            check=True,
            capture_output=True,
            timeout=30,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Fallback: ffmpeg direct from SVG (needs librsvg)
        run_ffmpeg(["-i", str(svg_path), "-frames:v", "1", str(png_path)], timeout=30)


def _render_intro(png_path: Path, out_path: Path) -> None:
    """2.5s: black background, logo zoom-in + fade."""
    run_ffmpeg([
        "-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=2.5:r=24",
        "-i", str(png_path),
        "-filter_complex",
        "[1:v]scale=800:-1,format=rgba,"
        "fade=t=in:st=0:d=0.8:alpha=1,"
        "zoompan=z='min(zoom+0.002,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        "d=60:s=1920x1080:fps=24[logo];"
        "[0:v][logo]overlay=(W-w)/2:(H-h)/2-40:format=auto,format=yuv420p",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an",
        "-movflags", "+faststart",
        str(out_path),
    ])


def _render_outro(
    png_path: Path,
    out_path: Path,
    show_tagline: bool = True,
    tagline_text: str = "",
) -> None:
    """2.5s: logo hold + fade to black + optional site-domain tagline."""
    text = (tagline_text or "").strip()
    tagline = ""
    if show_tagline and text:
        esc = _ffmpeg_drawtext_escape(text)
        tagline = (
            f"drawtext=text='{esc}':fontsize=36:fontcolor=0xD4AF37:"
            "x=(w-text_w)/2:y=h-180:alpha='if(lt(t,1.5),0,if(lt(t,2.2),(t-1.5)/0.7,1))',"
        )
    run_ffmpeg([
        "-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=2.5:r=24",
        "-i", str(png_path),
        "-filter_complex",
        "[1:v]scale=700:-1,format=rgba,"
        "fade=t=out:st=1.8:d=0.7:alpha=1[logo];"
        f"[0:v][logo]overlay=(W-w)/2:(H-h)/2-60:format=auto,"
        f"{tagline}"
        "format=yuv420p",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an",
        "-movflags", "+faststart",
        str(out_path),
    ])


def intro_outro_paths(
    show_tagline: bool = True,
    tagline_domain: str | None = None,
) -> tuple[Path, Path]:
    ensure_brand_assets(tagline_domain=tagline_domain)
    intro = Path(CONFIG.intro_path)
    outro_base = Path(CONFIG.outro_path).parent
    if show_tagline:
        tagline = (
            (tagline_domain or "").strip()
            or os.environ.get("PROMO_AD_TAGLINE_DOMAIN")
            or os.environ.get("PRIMARY_DOMAIN")
            or ""
        ).strip()
        if tagline:
            outro = outro_base / f"outro_tagline_{_tagline_slug(tagline)}_1080p.mp4"
        else:
            outro = outro_base / "outro_notagline_1080p.mp4"
    else:
        outro = outro_base / "outro_notagline_1080p.mp4"
    return intro, outro
