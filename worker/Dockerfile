FROM python:3.12-slim

# ffmpeg/ffprobe for media generation, wget for direct CDN downloads.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY worker/requirements.txt ./worker/requirements.txt
RUN pip install --no-cache-dir -r worker/requirements.txt

COPY worker ./worker
COPY scripts/site_searchers.py ./scripts/site_searchers.py
COPY scripts/scrape_search.py ./scripts/scrape_search.py

ENV PYTHONUNBUFFERED=1

CMD ["python", "worker/worker.py"]
