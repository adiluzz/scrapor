"""ThePornDB GraphQL client for worker-side pornstar enrichment."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import storage

log = logging.getLogger("worker.tpdb")

TPDB_ENDPOINT = os.environ.get("TPDB_API_URL") or "https://theporndb.net/graphql"
TPDB_API_KEY = (os.environ.get("TPDB_API_KEY") or "").strip()

_PERFORMER_FIELDS = """
  id
  name
  disambiguation
  aliases
  gender
  birth_date
  death_date
  ethnicity
  country
  eye_color
  hair_color
  height
  measurements { band_size cup_size waist hip }
  breast_type
  career_start_year
  career_end_year
  tattoos { location description }
  piercings { location description }
  urls { url type }
  images { id url width height }
"""


def configured() -> bool:
    return bool(TPDB_API_KEY)


def _graphql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    if not TPDB_API_KEY:
        raise RuntimeError("TPDB_API_KEY not configured")
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = Request(
        TPDB_ENDPOINT,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TPDB_API_KEY}",
            "User-Agent": "pisster-worker/1.0",
        },
        method="POST",
    )
    with urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("errors"):
        raise RuntimeError(payload["errors"][0].get("message") or "ThePornDB GraphQL error")
    data = payload.get("data")
    if not data:
        raise RuntimeError("ThePornDB returned no data")
    return data


def search_performers(term: str) -> list[dict[str, Any]]:
    term = (term or "").strip()
    if len(term) < 2:
        return []
    data = _graphql(
        f"query SearchPerformer($term: String!) {{ searchPerformer(term: $term) {{ {_PERFORMER_FIELDS} }} }}",
        {"term": term},
    )
    return data.get("searchPerformer") or []


def find_performer(tpdb_id: str) -> dict[str, Any] | None:
    data = _graphql(
        f"query FindPerformer($id: ID!) {{ findPerformer(id: $id) {{ {_PERFORMER_FIELDS} }} }}",
        {"id": tpdb_id},
    )
    return data.get("findPerformer")


def resolve_performer(name: str, tpdb_id: str | None = None) -> dict[str, Any] | None:
    if tpdb_id:
        found = find_performer(tpdb_id)
        if found:
            return found
    matches = search_performers(name)
    exact = next((p for p in matches if (p.get("name") or "").lower() == name.lower()), None)
    return exact or (matches[0] if matches else None)


def pick_best_image(images: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    if not images:
        return None

    def score(img: dict[str, Any]) -> float:
        w = img.get("width") or 0
        h = img.get("height") or 0
        ar = (h / w) if w else 1.5
        return abs(ar - 1.5) + h / 10000

    return sorted(images, key=score)[0]


def _format_measurements(m: dict[str, Any] | None) -> str | None:
    if not m:
        return None
    parts: list[str] = []
    band, cup = m.get("band_size"), m.get("cup_size")
    if band is not None and cup:
        parts.append(f"{band}{cup}")
    elif cup:
        parts.append(str(cup))
    if m.get("waist") is not None:
        parts.append(str(m["waist"]))
    if m.get("hip") is not None:
        parts.append(str(m["hip"]))
    return "-".join(parts) if parts else None


def _json_or_none(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list) and len(value) == 0:
        return None
    return json.dumps(value)


def _str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def download_image(url: str) -> tuple[bytes, str]:
    req = Request(url, headers={"User-Agent": "pisster-worker/1.0"})
    with urlopen(req, timeout=60) as resp:
        content_type = resp.headers.get("Content-Type") or "image/jpeg"
        data = resp.read()
    if not content_type.startswith("image/"):
        raise RuntimeError("URL did not return an image")
    if len(data) < 500:
        raise RuntimeError("Downloaded image is too small")
    if len(data) > 8 * 1024 * 1024:
        raise RuntimeError("Image exceeds 8MB limit")
    return data, content_type.split(";")[0].strip()


def apply_performer_to_db(conn, pornstar_id: str, performer: dict[str, Any]) -> None:
    measurements = performer.get("measurements")
    measurements_payload = None
    if measurements:
        measurements_payload = {
            **measurements,
            "display": _format_measurements(measurements),
        }
    with conn.cursor() as cur:
        cur.execute(
            '''
            UPDATE "Pornstar" SET
              "tpdbId"=%s,
              disambiguation=%s,
              aliases=%s,
              gender=%s,
              "birthDate"=%s,
              "deathDate"=%s,
              ethnicity=%s,
              country=%s,
              "eyeColor"=%s,
              "hairColor"=%s,
              "heightCm"=%s,
              measurements=%s,
              "breastType"=%s,
              "careerStartYear"=%s,
              "careerEndYear"=%s,
              tattoos=%s,
              piercings=%s,
              urls=%s,
              "tpdbSyncedAt"=NOW()
            WHERE id=%s
            ''',
            (
                performer.get("id"),
                _str_or_none(performer.get("disambiguation")),
                _json_or_none(performer.get("aliases")),
                _str_or_none(performer.get("gender")),
                _str_or_none(performer.get("birth_date")),
                _str_or_none(performer.get("death_date")),
                _str_or_none(performer.get("ethnicity")),
                _str_or_none(performer.get("country")),
                _str_or_none(performer.get("eye_color")),
                _str_or_none(performer.get("hair_color")),
                performer.get("height"),
                _json_or_none(measurements_payload),
                _str_or_none(performer.get("breast_type")),
                performer.get("career_start_year"),
                performer.get("career_end_year"),
                _json_or_none(performer.get("tattoos")),
                _json_or_none(performer.get("piercings")),
                _json_or_none(performer.get("urls")),
                pornstar_id,
            ),
        )
    conn.commit()


def save_image(conn, site_id: str, pornstar_id: str, image_bytes: bytes, content_type: str) -> str | None:
    if not storage.configured():
        return None
    key = storage.key_pornstar_image(site_id, pornstar_id)
    suffix = ".jpg"
    if "png" in content_type:
        suffix = ".png"
    elif "webp" in content_type:
        suffix = ".webp"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(image_bytes)
        tmp.flush()
        storage.upload(tmp.name, key, content_type)
    with conn.cursor() as cur:
        cur.execute('UPDATE "Pornstar" SET "s3Image"=%s WHERE id=%s', (key, pornstar_id))
    conn.commit()
    return key


def enrich_pornstar(conn, pornstar_id: str) -> dict[str, Any]:
    """Fetch TPDB data for a pornstar id. Returns a status dict."""
    if not configured():
        return {"ok": False, "error": "TPDB_API_KEY not configured"}

    with conn.cursor() as cur:
        cur.execute(
            'SELECT id,"siteId",name,"tpdbId" FROM "Pornstar" WHERE id=%s',
            (pornstar_id,),
        )
        row = cur.fetchone()
    if not row:
        return {"ok": False, "error": "not found"}

    _id, site_id, name, existing_tpdb = row
    try:
        performer = resolve_performer(name, existing_tpdb)
    except (HTTPError, URLError, RuntimeError, TimeoutError, json.JSONDecodeError) as e:
        return {"ok": False, "error": str(e)[:300]}

    if not performer:
        return {"ok": False, "error": f'no TPDB match for "{name}"'}

    apply_performer_to_db(conn, pornstar_id, performer)

    image_saved = False
    image = pick_best_image(performer.get("images") or [])
    if image and image.get("url"):
        try:
            data, content_type = download_image(image["url"])
            if save_image(conn, site_id, pornstar_id, data, content_type):
                image_saved = True
        except Exception as e:  # noqa: BLE001
            log.warning("tpdb image failed for %s: %s", pornstar_id, e)

    return {
        "ok": True,
        "tpdbId": performer.get("id"),
        "tpdbName": performer.get("name"),
        "imageSaved": image_saved,
    }


def list_pornstars_without_data(conn, limit: int | None = None) -> list[tuple[str, str]]:
    sql = (
        'SELECT id, name FROM "Pornstar" '
        'WHERE "tpdbId" IS NULL AND "tpdbSyncedAt" IS NULL '
        "ORDER BY name ASC"
    )
    params: tuple[Any, ...] = ()
    if limit is not None:
        sql += " LIMIT %s"
        params = (limit,)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [(r[0], r[1]) for r in cur.fetchall()]
