const express = require('express');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'vaultify-yt' });
});

// ═══════════ SEARCH ═══════════
app.get('/yt-search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = parseInt(req.query.limit) || 25;
    if (!q) return res.json({ results: [] });

    const result = await yts(q);
    const videos = result.videos.slice(0, limit);

    const tracks = videos.map(v => ({
      id: 'yt_' + v.videoId,
      ytId: v.videoId,
      title: v.title || 'Unknown',
      artist: v.author?.name || 'YouTube',
      cover: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      duration: v.seconds || 0,
      source: 'youtube'
    }));

    res.json({ results: tracks });
  } catch (e) {
    console.error('Search error:', e.message);
    res.json({ results: [], error: e.message });
  }
});

// ═══════════ STREAM URL ═══════════
app.get('/yt-stream', async (req, res) => {
  try {
    const videoId = req.query.id;
    if (!videoId) return res.json({ url: null, error: 'No video ID' });

    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=' + videoId);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });

    if (format && format.url) {
      res.json({ url: format.url, source: 'youtube', mime: format.mimeType });
    } else {
      res.json({ url: null, error: 'No audio format found' });
    }
  } catch (e) {
    console.error('Stream error:', e.message);
    res.json({ url: null, error: e.message });
  }
});

// ═══════════ STREAM PROXY (direct audio) ═══════════
app.get('/yt-proxy', async (req, res) => {
  try {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).json({ error: 'No video ID' });

    const stream = ytdl('https://www.youtube.com/watch?v=' + videoId, {
      quality: 'highestaudio',
      filter: 'audioonly'
    });

    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');
    stream.pipe(res);
  } catch (e) {
    console.error('Proxy error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Vaultify YT service running on port ${PORT}`);
});
