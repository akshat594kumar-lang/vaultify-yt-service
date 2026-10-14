const express = require('express');
const youtubedl = require('youtube-dl-exec');
const { Readable } = require('stream');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

/* CORS */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

/* Health check */
app.get('/', (req, res) => res.send('✅ Vaultify YT Server running'));

/* ═══ Get stream info ═══ */
app.get('/api/yt', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const url = `https://www.youtube.com/watch?v=${id}`;
    const info = await youtubedl(url, {
      format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      rmCacheDir: true,
    });

    const formats = (info.formats || [])
      .filter(f => f.acodec && f.acodec !== 'none' && (f.vcodec === 'none' || !f.vcodec) && f.url)
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));

    if (!formats.length) return res.status(404).json({ error: 'No audio format' });

    const chosen = formats[0];
    const host = `${req.protocol}://${req.get('host')}`;

    res.json({
      directUrl: chosen.url,
      proxyUrl: `${host}/api/proxy?url=${encodeURIComponent(chosen.url)}`,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      ext: chosen.ext || 'm4a',
      abr: chosen.abr || 128,
    });
  } catch (e) {
    console.error('YT error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ═══ Proxy stream (CORS + IP bypass) ═══ */
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const decoded = decodeURIComponent(url);
    const range = req.headers.range;

    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
    if (range) headers['Range'] = range;

    const resp = await fetch(decoded, { headers });

    res.status(resp.status);
    const ct = resp.headers.get('content-type');
    const cl = resp.headers.get('content-length');
    const cr = resp.headers.get('content-range');
    if (ct) res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (resp.body) {
      Readable.fromWeb(resp.body).pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).send('Proxy error');
  }
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));