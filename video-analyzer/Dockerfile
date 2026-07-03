FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY video-analyzer/requirements.txt ./video-analyzer/requirements.txt
RUN pip install --no-cache-dir -r video-analyzer/requirements.txt

COPY video-analyzer ./video-analyzer

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/video-analyzer

CMD ["python", "video-analyzer/main.py"]
