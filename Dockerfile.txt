# ══════════════════════════════════════
#  Nour Backend — Dockerfile pour Railway
# ══════════════════════════════════════

FROM node:20-slim

# Installer FFmpeg système (plus stable que ffmpeg-static sur Railway)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fontconfig \
    fonts-dejavu \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Dossier de travail
WORKDIR /app

# Copier les dépendances d'abord (cache Docker)
COPY package*.json ./
RUN npm install --production

# Copier le reste du code
COPY . .

# Port exposé (Railway utilise la variable PORT)
EXPOSE 3000

# Démarrage
CMD ["node", "server.js"]
