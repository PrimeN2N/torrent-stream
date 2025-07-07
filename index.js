import express from 'express';
import puppeteer from 'puppeteer';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

// Function to get a free proxy (optional, can be skipped if not needed)
async function getFreeProxy() {
  try {
    const response = await axios.get('https://www.sslproxies.org/');
    const proxyMatch = response.data.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
    if (proxyMatch) {
      return `${proxyMatch[1]}:${proxyMatch[2]}`;
    }
  } catch (error) {
    console.log('Could not fetch proxy:', error.message);
  }
  return null;
}

app.get('/api/stream', async (req, res) => {
  const { embedUrl } = req.query;
  if (!embedUrl) return res.status(400).json({ error: 'Missing embedUrl' });

  try {
    const proxy = await getFreeProxy();
    console.log('Using proxy:', proxy || 'None');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: puppeteer.executablePath(),   // ✅ FIX: Use bundled Chromium
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        ...(proxy ? [`--proxy-server=http://${proxy}`] : [])
      ],
    });

    const page = await browser.newPage();
    await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForTimeout(5000);  // Wait for JS to possibly load video

    const content = await page.content();
    const m3u8Match = content.match(/https?:\/\/[^"']+\.m3u8[^"']*/);

    let m3u8FromNetwork = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.m3u8')) {
        m3u8FromNetwork = url;
      }
    });

    await page.waitForTimeout(5000);
    await browser.close();

    const finalLink = m3u8FromNetwork || (m3u8Match ? m3u8Match[0] : null);

    if (finalLink) {
      return res.json({ stream: finalLink });
    } else {
      return res.status(404).json({ error: 'Stream not found' });
    }

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to fetch embed page' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
