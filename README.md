# نور · Nour — Backend FFmpeg

Serveur Node.js pour le rendu vidéo coranique avec FFmpeg.

## Stack
- **Node.js** 20
- **FFmpeg** (via ffmpeg-static + système)
- **Express** — API REST
- **Supabase** — stockage des vidéos générées
- **Firebase Admin** — notifications push FCM

---

## Déploiement sur Railway (5 minutes)

### Étape 1 — Préparer GitHub
1. Crée un repo GitHub (ex: `nour-backend`)
2. Uploade ces 4 fichiers :
   - `server.js`
   - `package.json`
   - `Dockerfile`
   - `.env.example` (renomme-le `.env` en local, ne push jamais le `.env` réel)

### Étape 2 — Créer le projet Railway
1. Va sur `railway.app`
2. **New Project** → **Deploy from GitHub repo**
3. Sélectionne ton repo `nour-backend`
4. Railway détecte automatiquement le Dockerfile ✓

### Étape 3 — Variables d'environnement
Dans Railway → ton projet → **Variables**, ajoute :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | `https://nqpekglmkgckasfeoeth.supabase.co` |
| `SUPABASE_KEY` | Ta `service_role` key (Supabase → Settings → API) |
| `NODE_ENV` | `production` |

### Étape 4 — Déployer
Railway lance automatiquement le build et le déploiement.
Tu obtiendras une URL comme : `https://nour-backend-production.up.railway.app`

### Étape 5 — Connecter l'app frontend
Dans ton fichier `quran-video-app.html`, remplace :
```javascript
const BACKEND_URL = 'https://nour-backend-production.up.railway.app';
```

---

## Endpoints API

### `GET /`
Health check — vérifie que le serveur tourne.

### `GET /status`
Statut détaillé : mémoire, uptime, version FFmpeg.

### `POST /render`
Génère une vidéo MP4.

**Body JSON :**
```json
{
  "audio_url":   "https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3",
  "video_url":   "https://videos.pexels.com/...",
  "text_ar":     "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "text_fr":     "Au nom d'Allah, le Tout Miséricordieux",
  "format":      "9:16",
  "surah_name":  "Al-Fatiha",
  "ayah_number": 1,
  "user_id":     "uuid-optionnel"
}
```

**Réponse :** fichier `video/mp4` en téléchargement direct.

### `POST /notify`
Envoie une notification push FCM.

**Body JSON :**
```json
{
  "fcm_token": "token_de_l_utilisateur",
  "title":     "🎬 Vidéo prête !",
  "body":      "Ta vidéo Al-Fatiha est prête à télécharger."
}
```

---

## Test local

```bash
npm install
node server.js
# Serveur sur http://localhost:3000

# Test render :
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "audio_url": "https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3",
    "text_ar": "بِسْمِ اللَّهِ",
    "format": "9:16",
    "surah_name": "Al-Fatiha"
  }' \
  --output test-output.mp4
```

---

## Coût estimé sur Railway
- Plan Hobby : **~$5/mois**
- 1 render vidéo ≈ 10-30 secondes de CPU
- 500 vidéos/mois ≈ $5-8/mois
