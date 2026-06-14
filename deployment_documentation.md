# AapadBandhav Platform - Deployment & Operations Guide

This guide provides setup, operation, and maintenance instructions for deploying the containerized AapadBandhav platform.

---

## 🏗️ Docker Compose Architecture

The platform runs as a 5-container architecture managed via `docker-compose.yml`:

- **`nginx`**: Handles reverse proxying, SSL termination, and static asset delivery.
- **`app`**: Python Flask + Gunicorn web server running under a non-root `appuser`.
- **`db`**: PostgreSQL 16 database storing production relational records.
- **`redis`**: Caching server backing Flask-SocketIO multi-worker socket syncing.
- **`mqtt-broker`**: Eclipse Mosquitto instance handling private telemetry node subscriptions.

---

## 🚀 Deployment Instructions

### Option 1: Standard VPS Deployment (Ubuntu / Docker Compose)

#### 1. Clone Code and Prepare Environment
```bash
# Clone the repository
git clone https://github.com/Manideep230/AapadBandhav.git /opt/aapadbandhav
cd /opt/aapadbandhav

# Create production env file
cp .env.example .env.production
```

#### 2. Edit Configuration
Update `.env.production` with secure credentials:
- Set a strong `DB_PASSWORD`.
- Set secure `MQTT_PASSWORD` and `MQTT_NODE_PASSWORD`.
- Set a random 64-character `JWT_SECRET`.

#### 3. Run One-Click Deploy Script
The deployment script builds images, starts containers, waits for health checks to pass, and seeds baseline data:
```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

---

### Option 2: Coolify Deployment (One-Click Git Ops)

Coolify supports git-based web deployments natively using the repository's `docker-compose.yml` file.

1. **Add Resources**: In the Coolify Dashboard, click **New Resource** -> **Application from Git Repository**.
2. **Configure Build Pack**: Select **Docker Compose** as the build pack.
3. **Environment Variables**: Coolify will automatically parse `.env.example` and ask you to input values. Input production secrets (PostgreSQL passwords, JWT key, MQTT credentials).
4. **Volumes Mapping**: Coolify will automatically map the persistent volumes declared in `docker-compose.yml` (`pg_data`, `app_uploads`, etc.) to secure directories on the host VPS.
5. **Deploy**: Click **Deploy**. Coolify will compile, run database migrations, and handle Let's Encrypt SSL certificates automatically.

---

## 🛡️ Database Maintenance & Operations

### 1. Database Backups
A cron-ready database backup script is located at `scripts/backup.sh`. It creates compressed gzip SQL dumps and automatically deletes backups older than 7 days.

To schedule daily backups at 2 AM, run `crontab -e` and add:
```cron
0 2 * * * cd /opt/aapadbandhav && ./scripts/backup.sh >> ./backups/backup.log 2>&1
```

To run a manual backup:
```bash
./scripts/backup.sh
```

### 2. Database Restoration
To restore the PostgreSQL database from a backup file:
```bash
./scripts/restore.sh ./backups/aapadbandhav_backup_YYYYMMDD_HHMMSS.sql.gz
```

---

## 📊 Platform Monitoring & Health Checks

We added dedicated HTTP health endpoints to the web routing container for uptime monitoring:

- **General Health**: `http://localhost/health`
  - Returns a unified status (`healthy` / `degraded`) along with sub-checks.
- **Database Status**: `http://localhost/health/db`
  - Verifies read/write query transactions.
- **MQTT Broker Connection**: `http://localhost/health/mqtt`
  - Asserts that the Flask background loop maintains an active MQTT socket.
- **Redis Queue Check**: `http://localhost/health/redis`
  - Pings the message broker to ensure websocket message propagation.
