# ─── Stage 1: Build Frontend ───────────────────────────────────────────
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy dependencies manifest and install
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Production Runner (Python) ──────────────────────────────
FROM python:3.12-slim AS runner

# Create a non-root user
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/sh -m appuser

WORKDIR /app

# Install system dependencies (needed for PostgreSQL connections)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000

# Copy backend dependencies manifest and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend/ ./backend/
WORKDIR /app/backend

# Copy built frontend assets
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Ensure appuser owns the uploads and logs directory
RUN mkdir -p /app/backend/uploads /app/backend/logs && \
    chown -R appuser:appgroup /app/backend

# Switch to non-root user
USER appuser

# Expose port and start
EXPOSE 5000
CMD ["gunicorn", "-w", "1", "--threads", "100", "-k", "gthread", "--bind", "[::]:5000", "app:app"]
