# Use Node.js 18 alpine image as base
FROM node:18-alpine

# Install openssl and other dependencies needed for Prisma and native builds
RUN apk add --no-cache openssl libc6-compat

# Set working directory
WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY tsconfig.json ./

# Copy frontend package manifests
COPY frontend/package*.json ./frontend/

# Install dependencies for root and frontend
RUN npm install
RUN cd frontend && npm install

# Copy application source
COPY . .

# Generate Prisma Client and Swagger documentation, then build frontend
RUN npm run prisma:generate
RUN npx ts-node backend/api/swagger/generate.ts
RUN npm run build:frontend

# Expose local server port
EXPOSE 5000

# Set default env variables
ENV PORT=5000
ENV NODE_ENV=production

# Start backend server
CMD ["npm", "run", "dev:backend"]
