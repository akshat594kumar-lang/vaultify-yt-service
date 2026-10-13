const express = require('express');
const { Innertube } = require('youtubei.js');

const app = express();
const PORT = process.env.PORT || 3000;

let yt = null;

async function initYT() {
  if (!yt) {
    yt = await Innertube.create({
      lang: 'en',
      location: 'IN',
      retrieve_player: false
    });
  }
  return yt;
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'vaultify-yt' });
});

app.get('/yt-search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = parseInt(req.query.limit) || 25;
    if (!q) return res.json({ results: [] });

    const youtube = await initYT();
    const search = await youtube.music.search(q, { type: 'song' });

    const tracks = [];
    if (search.songs && search.songs.contents) {
      for (const item of search.songs.contents.slice(0, limit)) {
        if (!item.id) continue;
        tracks.push({
          id: 'yt_' + item.id,
          ytId: item.id,
          title: item.title || 'Unknown',
          artist: item.artists?.map(a => a.name).join(', ') || item.author?.name || 'YouTube',
          cover: item.thumbnail?.contents?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`,
          duration: item.duration?.seconds || 0,
          source: 'youtube'
        });
      }
    }

    res.json({ results: tracks });
  } catch (e) {
    console.error('Search error:', e.message);
    res.json({ results: [], error: e.message });
  }
});

app.get('/yt-stream', async (req, res) => {
  try {
    const videoId = req.query.id;
    if (!videoId) return res.json({ url: null, error: 'No video ID' });

    const youtube = await initYT();
    const info = await youtube.getInfo(videoId);

    const format = info.chooseFormat({
      type: 'audio',
      quality: 'best'
    });

    if (format && format.url) {
      res.json({ url: format.url, source: 'youtube', format: format.mime_type });
    } else {
      // Fallback — decipher
      const stream = await info.download({
        type: 'audio',
        quality: 'best',
        format: 'mp4'
      });
      res.json({ url: null, error: 'No direct URL, stream unavailable' });
    }
  } catch (e) {
    console.error('Stream error:', e.message);
    res.json({ url: null, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Vaultify YT service running on port ${PORT}`);
});
