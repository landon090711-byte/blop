const express = require('express');
const { chromium } = require('playwright-core');
const sites = require('./sites');

const app = express();
app.use(express.json());

// Stop handlers
const stops = {};

app.get('/api/stream', async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let browser = null;
  let stopped = false;
  stops[phone] = () => { stopped = true; };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let success = 0, failed = 0;

    for (const site of sites) {
      if (stopped) break;
      const page = await browser.newPage();
      try {
        await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector(site.selectors.phone, { timeout: 10000 });
        await page.type(site.selectors.phone, phone);
        await page.click(site.selectors.submit);
        await page.waitForTimeout(2000);
        success++;
        res.write('data: ' + JSON.stringify({ type: 'result', result: { site: site.name, status: 'success' } }) + '\n\n');
      } catch (error) {
        failed++;
        res.write('data: ' + JSON.stringify({ type: 'result', result: { site: site.name, status: 'failed', error: error.message } }) + '\n\n');
      } finally {
        await page.close();
      }
    }

    res.write('data: ' + JSON.stringify({ type: 'complete', results: { success, failed } }) + '\n\n');
  } catch (error) {
    res.write('data: ' + JSON.stringify({ type: 'error', error: error.message }) + '\n\n');
  } finally {
    if (browser) await browser.close();
    res.end();
    delete stops[phone];
  }
});

app.post('/api/stop', (req, res) => {
  const phone = req.query.phone;
  if (phone && stops[phone]) stops[phone]();
  res.json({ status: 'stopped' });
});

module.exports = app;
