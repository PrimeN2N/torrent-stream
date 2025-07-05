import express from 'express';
import puppeteer from 'puppeteer';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

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

    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        ...(proxy ? [`--proxy-server=http://${proxy}`] : [])
      ],
    };

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForTimeout(5000);

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
