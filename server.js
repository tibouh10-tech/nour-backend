const express    = require('express');
const cors       = require('cors');
const ffmpeg     = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { createClient } = require('@supabase/supabase-js');

// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
ffmpeg.setFfmpegPath(ffmpegPath);

const app  = express();
const PORT = process.env.PORT || 3000;

// Supabase (pour sauvegarder les vidéos générées)
const sb = createClient(
  process.env.SUPABASE_URL  || 'https://nqpekglmkgckasfeoeth.supabase.co',
  process.env.SUPABASE_KEY  || ''   // ← service_role key (privée, jamais dans le frontend)
);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ══════════════════════════════════════
//  HELPER — Télécharger un fichier distant
// ══════════════════════════════════════
async function downloadFile(url, destPath) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  fs.writeFileSync(destPath, Buffer.from(res.data));
}

// ══════════════════════════════════════
//  HELPER — Télécharger police arabe
// ══════════════════════════════════════
async function ensureArabicFont() {
  const fontPath = path.join(os.tmpdir(), 'Amiri-Regular.ttf');
  if (!fs.existsSync(fontPath)) {
    await downloadFile(
      'https://github.com/alif-type/amiri/raw/master/Amiri-Regular.ttf',
      fontPath
    );
  }
  return fontPath;
}

// ══════════════════════════════════════
//  ROUTE — Health check
// ══════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Nour Video Backend',
    version: '1.0.0',
    ffmpeg: ffmpegPath ? 'available' : 'missing',
    timestamp: new Date().toISOString()
  });
});

// ══════════════════════════════════════
//  ROUTE — Render Video
//  POST /render
//  Body: {
//    audio_url   : string (MP3 depuis AlQuran.cloud)
//    video_url   : string (MP4 depuis Pexels)
//    text_ar     : string (texte arabe du verset)
//    text_fr     : string (traduction française)
//    format      : '9:16' | '1:1' | '16:9'
//    surah_name  : string
//    ayah_number : number
//    user_id     : string (optionnel, pour sauvegarder dans Supabase)
//  }
// ══════════════════════════════════════
app.post('/render', async (req, res) => {
  const {
    audio_url, video_url, text_ar, text_fr,
    format = '9:16', surah_name = '', ayah_number = 1, user_id
  } = req.body;

  // Validation
  if (!audio_url) return res.status(400).json({ error: 'audio_url requis' });

  // Dimensions selon format
  const FORMATS = {
    '9:16': { w: 1080, h: 1920 },
    '1:1':  { w: 1080, h: 1080 },
    '16:9': { w: 1920, h: 1080 },
  };
  const dim = FORMATS[format] || FORMATS['9:16'];

  // Dossier temporaire unique pour ce rendu
  const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'nour-'));
  const audioPath = path.join(tmpDir, 'audio.mp3');
  const videoPath = path.join(tmpDir, 'bg.mp4');
  const outPath   = path.join(tmpDir, 'output.mp4');

  console.log(`[RENDER] Démarrage — ${surah_name} verset ${ayah_number} — format ${format}`);

  try {
    // ── 1. Télécharger l'audio ──────────────────
    console.log('[RENDER] Téléchargement audio...');
    await downloadFile(audio_url, audioPath);

    // ── 2. Télécharger la vidéo de fond ─────────
    let bgFilter = `color=black:s=${dim.w}x${dim.h}:d=30`; // fond noir par défaut
    let hasVideo = false;

    if (video_url) {
      try {
        console.log('[RENDER] Téléchargement vidéo de fond...');
        await downloadFile(video_url, videoPath);
        hasVideo = true;
      } catch {
        console.warn('[RENDER] Vidéo de fond indisponible, fond noir utilisé');
      }
    }

    // ── 3. Police arabe ──────────────────────────
    console.log('[RENDER] Chargement police arabe...');
    const fontPath = await ensureArabicFont();

    // ── 4. Préparer le texte (échapper les caractères spéciaux FFmpeg) ──
    const safeAr = (text_ar || 'بِسْمِ اللَّهِ')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    const safeFr = (text_fr || '')
      .substring(0, 80)
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:');

    // ── 5. Construire la commande FFmpeg ─────────
    console.log('[RENDER] Assemblage FFmpeg...');

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg();

      // Input 1 : vidéo de fond ou fond noir
      if (hasVideo) {
        cmd.input(videoPath);
      } else {
        cmd.input(`color=black:s=${dim.w}x${dim.h}:d=30`).inputOptions(['-f', 'lavfi']);
      }

      // Input 2 : audio
      cmd.input(audioPath);

      // Filtres vidéo
      const vfFilters = [
        // Redimensionner et recadrer selon le format
        `scale=${dim.w}:${dim.h}:force_original_aspect_ratio=increase`,
        `crop=${dim.w}:${dim.h}`,
        // Voile sombre semi-transparent
        'colorchannelmixer=aa=0.6',
        // Texte arabe centré (grande taille)
        `drawtext=fontfile=${fontPath}:text='${safeAr}':fontcolor=gold:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2-60:shadowcolor=black:shadowx=3:shadowy=3`,
        // Traduction française en dessous
        ...(safeFr ? [`drawtext=fontfile=${fontPath}:text='${safeFr}':fontcolor=white@0.7:fontsize=32:x=(w-text_w)/2:y=(h/2)+60:shadowcolor=black:shadowx=2:shadowy=2`] : []),
        // Watermark Nour (version gratuite)
        `drawtext=text='نور · Nour':fontcolor=white@0.4:fontsize=24:x=20:y=20`,
      ].join(',');

      cmd
        .outputOptions([
          '-vf', vfFilters,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',          // durée = durée de l'audio
          '-movflags', '+faststart', // streaming optimisé
          '-y',
        ])
        .output(outPath)
        .on('start', cmd => console.log('[FFMPEG] Commande:', cmd))
        .on('progress', p => console.log(`[FFMPEG] Progression: ${Math.round(p.percent||0)}%`))
        .on('end',   ()  => resolve())
        .on('error', err => reject(err))
        .run();
    });

    console.log('[RENDER] ✓ Rendu terminé !');

    // ── 6. Lire le fichier de sortie ─────────────
    const outputBuffer = fs.readFileSync(outPath);
    const fileSizeKB   = Math.round(outputBuffer.length / 1024);
    console.log(`[RENDER] Taille fichier: ${fileSizeKB} KB`);

    // ── 7. Optionnel : sauvegarder dans Supabase Storage ──
    if (user_id && process.env.SUPABASE_KEY) {
      try {
        const fileName = `${user_id}/${surah_name}-${ayah_number}-${Date.now()}.mp4`;
        await sb.storage.from('videos').upload(fileName, outputBuffer, {
          contentType: 'video/mp4',
          upsert: true
        });
        console.log('[SUPABASE] Vidéo uploadée:', fileName);
      } catch(e) {
        console.warn('[SUPABASE] Upload échoué (non bloquant):', e.message);
      }
    }

    // ── 8. Renvoyer le MP4 ───────────────────────
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="nour-${surah_name}-${ayah_number}.mp4"`);
    res.setHeader('Content-Length', outputBuffer.length);
    res.send(outputBuffer);

  } catch (err) {
    console.error('[RENDER] Erreur:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Nettoyer les fichiers temporaires
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// ══════════════════════════════════════
//  ROUTE — Envoyer notification FCM
//  POST /notify
//  Body: { fcm_token, title, body }
// ══════════════════════════════════════
app.post('/notify', async (req, res) => {
  const { fcm_token, title, body } = req.body;
  if (!fcm_token) return res.status(400).json({ error: 'fcm_token requis' });

  try {
    // Firebase Admin SDK pour envoyer la notif push
    const payload = {
      message: {
        token: fcm_token,
        notification: { title, body },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } }
      }
    };

    // En prod, utilise firebase-admin :
    // const admin = require('firebase-admin');
    // await admin.messaging().send(payload.message);

    console.log('[FCM] Notification envoyée:', title, '→', fcm_token.substring(0,20)+'...');
    res.json({ success: true, message: 'Notification envoyée' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
//  ROUTE — Statut du serveur
// ══════════════════════════════════════
app.get('/status', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'running',
    uptime: Math.round(process.uptime()) + 's',
    memory: {
      used:  Math.round(mem.heapUsed  / 1024 / 1024) + 'MB',
      total: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
    },
    ffmpeg: ffmpegPath || 'non trouvé',
    node: process.version,
  });
});

// ══════════════════════════════════════
//  DÉMARRAGE
// ══════════════════════════════════════
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   نور · Nour Backend — v1.0.0       ║
║   Port     : ${PORT}                      ║
║   FFmpeg   : ${ffmpegPath ? '✓ disponible' : '✗ manquant'}         ║
║   Supabase : ${process.env.SUPABASE_URL ? '✓ configuré' : '⚠ non configuré'}      ║
╚══════════════════════════════════════╝
  `);
});
