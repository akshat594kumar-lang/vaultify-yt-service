const express = require('express');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.get('/', (req, res) => res.send('✅ Vaultify YT Server running'));

/* Diagnostic — test karo */
app.get('/api/test', async (req, res) => {
  try {
    const info = await youtubedl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      format: 'bestaudio',
      dumpSingleJson: true,
      noWarnings: true,
    });
    res.json({ ok: true, title: info.title, duration: info.duration });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/* Get stream info */
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

/* Proxy stream — FIXED: native fetch (Node 18+) */
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const decoded = decodeURIComponent(url);
    const range = req.headers.range;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    if (range) headers['Range'] = range;

    // Native fetch — Web ReadableStream deta hai
    const resp = await fetch(decoded, { headers, redirect: 'follow' });

    res.status(resp.status);
    const ct = resp.headers.get('content-type') || 'audio/mp4';
    const cl = resp.headers.get('content-length');
    const cr = resp.headers.get('content-range');
    const ar = resp.headers.get('accept-ranges');

    res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    res.setHeader('Accept-Ranges', ar || 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (!resp.body) return res.end();

    // Stream Web ReadableStream → Express response
    const reader = resp.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise(r => res.once('drain', r));
          }
        }
      } catch (err) {
        // client aborted — ignore
      } finally {
        try { res.end(); } catch (_) {}
      }
    };
    pump();
  } catch (e) {
    console.error('Proxy error:', e.message);
    if (!res.headersSent) res.status(500).send('Proxy error: ' + e.message);
  }
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));