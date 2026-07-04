FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg librsvg2-bin fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ad-generator/requirements.txt ./ad-generator/requirements.txt
RUN pip install --no-cache-dir -r ad-generator/requirements.txt

COPY ad-generator ./ad-generator
COPY public/brand ./public/brand

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/ad-generator
ENV AD_GENERATOR_ASSETS_DIR=/app/ad-generator/assets
ENV PROMO_AD_BRAND_LOCKUP=/app/public/brand/pisster-lockup.png

RUN mkdir -p /app/ad-generator/assets \
    && python -c "from brand_intro_outro import ensure_brand_assets; ensure_brand_assets()" \
    || true

CMD ["python", "ad-generator/main.py"]
