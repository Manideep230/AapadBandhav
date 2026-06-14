#!/usr/bin/env bash
set -euo pipefail

echo "=== Initializing AapadBandhav Deployment ==="

# 1. Environment variables check
if [ ! -f .env.production ]; then
    echo "Warning: .env.production not found. Creating from .env.example..."
    cp .env.example .env.production
    echo "Please edit .env.production to configure production credentials."
fi

# 2. Build and bootstrap containers
echo "Building and starting Docker Compose services in daemon mode..."
docker compose up -d --build

# 3. Wait for database and redis healthchecks
echo "Waiting for services to become healthy..."
until [ "$(docker inspect --format='{{json .State.Health.Status}}' aapadbandhav_db)" == "\"healthy\"" ]; do
    echo "Waiting for Database container..."
    sleep 3
done

until [ "$(docker inspect --format='{{json .State.Health.Status}}' aapadbandhav_redis)" == "\"healthy\"" ]; do
    echo "Waiting for Redis container..."
    sleep 3
done

echo "Database and Redis services are healthy."

# 4. Run database seeding
echo "Seeding default platforms datasets inside the application container..."
docker exec -t aapadbandhav_app python seed.py
docker exec -t aapadbandhav_app python seed_vijayawada.py

echo "=== Deployment Successfully Finalized ==="
echo "Web Portal: http://localhost"
echo "API Sockets: ws://localhost/socket.io/"
echo "MQTT Broker: localhost:1883"
