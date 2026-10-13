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
      retrieve_player: true
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
    const info = await youtube.getBasicInfo(videoId);

    // Get streaming data with proper deciphering
    const format = info.chooseFormat({
      type: 'audio',
      quality: 'best'
    });

    let streamUrl = null;

    if (format) {
      // Try decipher method first
      try {
        streamUrl = format.decipher(youtube.session.player);
      } catch (e) {
        console.log('Decipher failed:', e.message);
      }
      
      // Fallback to direct url
      if (!streamUrl && format.url) {
        streamUrl = format.url;
      }
    }

    if (streamUrl) {
      res.json({ url: streamUrl, source: 'youtube', mime: format.mime_type });
    } else {
      res.json({ url: null, error: 'No stream URL available' });
    }
  } catch (e) {
    console.error('Stream error:', e.message);
    res.json({ url: null, error: e.message });
  }
});

// Direct proxy — streams the audio through Render (avoids 403)
app.get('/yt-proxy', async (req, res) => {
  try {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).json({ error: 'No video ID' });

    const youtube = await initYT();
    const stream = await youtube.download(videoId, {
      type: 'audio',
      quality: 'best',
      format: 'mp4'
    });

    // Stream directly to client
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    
    const reader = stream.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      pump();
    };
    pump();
  } catch (e) {
    console.error('Proxy error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Vaultify YT service running on port ${PORT}`);
});
