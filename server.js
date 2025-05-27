const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { downloadInstagramVideo } = require('./instagram');

require('dotenv').config();

const app = express();

// Log environment variables for debugging
console.log('Environment Variables:', {
  RENDER_UPLOAD_URL: process.env.RENDER_UPLOAD_URL,
  YTDL_NO_UPDATE: process.env.YTDL_NO_UPDATE,
  YOUTUBE_COOKIES: process.env.YOUTUBE_COOKIES,
  INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME,
  INSTAGRAM_PASSWORD: !!process.env.INSTAGRAM_PASSWORD
});

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

// Rate limit and bot detection backoff
let lastRateLimit = 0;
const RATE_LIMIT_BACKOFF_MS = 20 * 60 * 1000; // 20 minutes

// Retry function with bot detection handling
async function withRetry(fn, retries = 5, initialDelay = 10000) {
  if (Date.now() - lastRateLimit < RATE_LIMIT_BACKOFF_MS) {
    const waitTime = Math.ceil((RATE_LIMIT_BACKOFF_MS - (Date.now() - lastRateLimit)) / 1000);
    throw new Error(Rate limit or bot detection backoff active. Please wait  seconds.);
  }

  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isBotError = error.message.includes('Sign in to confirm you’re not a bot') || error.statusCode === 429;
      if (isBotError && i < retries - 1) {
        console.log(Error , retrying in ms...);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        if (isBotError) {
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

    videoPath = path.join(uploadDir, 	emp-video-.mp4);
    audioPath = path.join(uploadDir, 	emp-audio-.mp3);

    // Check disk space
    try {
      const stats = fs.statfsSync(uploadDir);
      const freeMB = (stats.bavail * stats.bsize) / (1024 * 1024);
      if (freeMB < 100) {
        console.warn(Low disk space:  MB available);
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
        let cookies = [];
        try {
          if (process.env.YOUTUBE_COOKIES) {
            cookies = JSON.parse(process.env.YOUTUBE_COOKIES).map(cookie => ({
              name: cookie.key,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              expires: cookie.expires,
              httpOnly: cookie.httpOnly,
              secure: cookie.secure
            }));
            if (!Array.isArray(cookies)) {
              throw new Error('Cookies must be an array');
            }
            console.log('Using YouTube cookies:', cookies.map(c => c.name));
          } else {
            console.warn('No YOUTUBE_COOKIES provided');
          }
        } catch (error) {
          console.error('Invalid YOUTUBE_COOKIES:', error.message);
          throw error;
        }

        const agent = ytdl.createAgent({
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          cookies: cookies.length > 0 ? cookies : undefined
        });

        const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', requestOptions: { agent } });
        const fileStream = fs.createWriteStream(videoPath);
        stream.pipe(fileStream);

        await new Promise((resolve, reject) => {
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
          stream.on('error', (err) => reject(err));
        });
      });

      // Convert to MP3
      console.log('Converting to MP3:', videoPath);
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .output(audioPath)
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    } else if (url.includes('instagram.com')) {
      // Instagram
      console.log('Processing Instagram URL:', url);
      if (!process.env.INSTAGRAM_USERNAME || !process.env.INSTAGRAM_PASSWORD) {
        throw new Error('Instagram credentials missing in environment variables');
      }

      await withRetry(async () => {
        try {
          await downloadInstagramVideo(url, videoPath);

          // Convert to MP3
          console.log('Converting to MP3:', videoPath);
          await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
              .output(audioPath)
              .audioCodec('libmp3lame')
              .audioBitrate('192k')
              .on('end', resolve)
              .on('error', reject)
              .run();
          });
        } catch (error) {
          throw new Error(Instagram processing failed: );
        }
      });
    } else {
      return res.status(400).json({ error: 'Unsupported URL. Only YouTube and Instagram are supported.' });
    }

    // Verify MP3
    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      throw new Error('MP3 file is missing or empty');
    }

    // Check MP3 size
    const fileSizeMB = fs.statSync(audioPath).size / (1024 * 1024);
    if (fileSizeMB > 5) {
      throw new Error(MP3 exceeds 5MB limit: MB);
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
    if (error.message.includes('Sign in to confirm you’re not a bot') || error.statusCode === 429) {
      return res.status(429).json({ error: 'YouTube bot detection or rate limit exceeded. Please try again later.' });
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
  console.log(Server running on port );
});

module.exports = app;
