# Use lightweight official Python runtime
FROM python:3.11-slim

# Install system dependencies needed for scientific libraries & C++ extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Cloud Run injects PORT (defaults to 8080)
ENV PORT=8080 \
    PYTHONUNBUFFERED=1

# Install Python dependencies first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application files
COPY . .

# Expose container port
EXPOSE 8080

# Use shell form so $PORT is evaluated dynamically by Cloud Run
CMD exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 300 app:app
