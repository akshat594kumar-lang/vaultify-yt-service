const express = require('express');
const { initializeNewPipe, searchYoutube, extractStreamInfo, getBestAudioStream } = require('newpipe-extractor-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize NewPipe
initializeNewPipe();

// Search endpoint
app.get('/yt-search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = parseInt(req.query.limit) || 25;

    const searchResults = await searchYoutube(q, ['videos']);
    const tracks = searchResults.items.slice(0, limit).map(item => {
      const videoId = item.url.split('v=')[1]?.split('&')[0];
      return {
        id: 'yt_' + videoId,
        ytId: videoId,
        title: item.name || 'Unknown',
        artist: item.uploaderName || 'YouTube',
        cover: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        duration: item.duration || 0,
        source: 'youtube'
      };
    }).filter(t => t.ytId);

    res.json({ results: tracks });
  } catch (e) {
    res.json({ results: [], error: e.message });
  }
});

// Stream endpoint
app.get('/yt-stream', async (req, res) => {
  try {
    const videoId = req.query.id;
    if (!videoId) return res.json({ url: null, error: 'No video ID' });

    const streamInfo = await extractStreamInfo('https://www.youtube.com/watch?v=' + videoId);
    const bestAudio = getBestAudioStream(streamInfo);

    if (bestAudio && bestAudio.url) {
      res.json({ url: bestAudio.url, source: 'youtube', format: bestAudio.format });
    } else {
      res.json({ url: null, error: 'No audio stream found' });
    }
  } catch (e) {
    res.json({ url: null, error: e.message });
  }
});

// Health check (Render ke liye)
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'vaultify-yt' });
});

app.listen(PORT, () => {
  console.log(`Vaultify YT service running on port ${PORT}`);
});
