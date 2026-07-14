"""SEO text hygiene for scraped metadata.

Scraped descriptions often mention the source tube ("watch free on
en.paradisehill.cc", "PornOne", …). Those strings end up in meta descriptions,
JSON-LD and the video sitemap and tell Google our pages are copies of other
sites — so every description is cleaned at insert time.
"""

import re
from datetime import datetime, timezone

# Source-site names / domains that must never appear in our copy.
_SOURCE_PATTERNS = [
    r"(?:en\.)?paradisehill\.cc",
    r"paradise\s*hill",
    r"pornone(?:\.com)?",
    r"eporner(?:\.com)?",
    r"xhamster(?:\.com|\.desi)?",
    r"xnxx(?:\.com)?",
    r"abxxx(?:\.com)?",
    r"redtube(?:\.com)?",
    r"spankbang(?:\.com)?",
    r"youporn(?:\.com)?",
    r"hqporner(?:\.com)?",
    r"pornhub(?:\.com)?",
]

# Boilerplate sentences that only exist to funnel traffic to the source.
_BOILERPLATE_RES = [
    re.compile(
        r"[^.!?\n]*\b(?:watch|stream|download)[^.!?\n]*\b(?:free|now|online|full)\b[^.!?\n]*"
        r"\b(?:on|at)\s+(?:%s)[^.!?\n]*[.!?]?" % "|".join(_SOURCE_PATTERNS),
        re.IGNORECASE,
    ),
    re.compile(r"[^.!?\n]*\buploaded\s+(?:by|to|on)\b[^.!?\n]*[.!?]?", re.IGNORECASE),
    re.compile(r"[^.!?\n]*\bfor\s+free\s+(?:on|at)\s+(?:%s)[^.!?\n]*[.!?]?" % "|".join(_SOURCE_PATTERNS), re.IGNORECASE),
]

_SOURCE_RE = re.compile(r"(?:%s)" % "|".join(_SOURCE_PATTERNS), re.IGNORECASE)
_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)


def clean_description(text: str | None) -> str | None:
    """Strip source-site names, URLs, and traffic-funnel boilerplate."""
    if not text:
        return None
    out = str(text)
    for pattern in _BOILERPLATE_RES:
        out = pattern.sub(" ", out)
    out = _URL_RE.sub(" ", out)
    out = _SOURCE_RE.sub(" ", out)
    # Tidy leftovers: orphaned "on ." / "at ," fragments and repeated whitespace.
    out = re.sub(r"\b(?:on|at|from|via)\s*(?=[.,!?]|$)", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\s+([.,!?;:])", r"\1", out)
    out = re.sub(r"([.,!?;:])\1+", r"\1", out)
    out = re.sub(r"\s{2,}", " ", out).strip(" -–—,;:")
    out = out.strip()
    return out or None


def parse_upload_date(value) -> datetime | None:
    """Parse a source upload date (yt-dlp YYYYMMDD, ISO 8601, or datetime)."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).strip()
    if not s:
        return None
    if re.fullmatch(r"\d{8}", s):  # yt-dlp upload_date
        try:
            return datetime.strptime(s, "%Y%m%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None
