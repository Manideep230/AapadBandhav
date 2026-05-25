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
WORKDIR /app

# Install system dependencies (needed for certain python packages)
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

# Copy built frontend assets to the path expected by backend app.py
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose port and start
EXPOSE 5000
CMD ["python", "app.py"]
