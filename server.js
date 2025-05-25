const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const app = express();
ffmpeg.setFfmpegPath(ffmpegStatic);

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'Uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (error) {
  console.error('Failed to create uploads directory:', error);
  process.exit(1);
}

// Rate limit backoff
let lastRateLimit = 0;
const RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes

// Retry function
async function withRetry(fn, retries = 5, initialDelay = 10000) {
  if (Date.now() - lastRateLimit < RATE_LIMIT_BACKOFF_MS) {
    const waitTime = Math.ceil((RATE_LIMIT_BACKOFF_MS - (Date.now() - lastRateLimit)) / 1000);
    throw new Error(`Rate limit backoff active. Please wait ${waitTime} seconds.`);
  }

  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.statusCode === 429 && i < retries - 1) {
        console.log(`Error 429, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        if (error.statusCode === 429) {
          lastRateLimit = Date.now();
        }
        throw error;
      }
    }
  }
}

// Health check
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'SceneFinder cloud backend is running' });
});

// Process video endpoint
app.post('/api/process-video', async (req, res) => {
  let videoPath, audioPath;
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing URL' });
    }

    videoPath = path.join(uploadDir, `temp-video-${Date.now()}.mp4`);
    audioPath = path.join(uploadDir, `temp-audio-${Date.now()}.mp3`);

    // Check disk space
    try {
      const stats = fs.statfsSync(uploadDir);
      const freeMB = (stats.bavail * stats.bsize) / (1024 * 1024);
      if (freeMB < 100) {
        console.warn(`Low disk space: ${freeMB.toFixed(2)} MB available`);
        return res.status(500).json({ error: 'Insufficient disk space' });
      }
    } catch (error) {
      console.error('Failed to check disk space:', error);
    }

    // Identify platform
    if (ytdl.validateURL(url)) {
      // YouTube
      console.log('Processing YouTube URL:', url);
      await withRetry(async () => {
        const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
        const fileStream = fs.createWriteStream(audioPath);
        stream.pipe(fileStream);

        await new Promise((resolve, reject) => {
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
          stream.on('error', (err) => reject(err));
        });
      });
    } else if (url.includes('instagram.com')) {
      // Instagram (disabled)
      return res.status(503).json({ error: 'Instagram processing unavailable due to API restrictions' });
    } else {
      return res.status(400).json({ error: 'Unsupported URL. Only YouTube is supported.' });
    }

    // Verify MP3
    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      throw new Error('MP3 file is missing or empty');
    }

    // Check MP3 size
    const fileSizeMB = fs.statSync(audioPath).size / (1024 * 1024);
    if (fileSizeMB > 5) {
      throw new Error(`MP3 exceeds 5MB limit: ${fileSizeMB.toFixed(2)}MB`);
    }

    // Forward to Render
    console.log('Forwarding MP3 to Render:', audioPath);
    const form = new FormData();
    form.append('video', fs.createReadStream(audioPath), 'audio.mp3');
    const response = await axios.post(process.env.RENDER_UPLOAD_URL, form, {
      headers: form.getHeaders(),
      timeout: 60000,
    });

    res.status(200).json({
      success: true,
      renderResponse: response.data,
    });
  } catch (error) {
    console.error('Error processing video:', error);
    if (error.statusCode === 429 || error.message.includes('rate limit')) {
      return res.status(429).json({ error: error.message || 'Rate limit exceeded' });
    }
    return res.status(500).json({ error: error.message || 'Internal server error' });
  } finally {
    // Clean up
    for (const file of [videoPath, audioPath]) {
      if (file && fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          console.log('Cleaned up:', file);
        } catch (error) {
          console.error('Failed to delete:', file, error);
        }
      }
    }
  }
});

// Start server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;