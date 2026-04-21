// Vercel serverless function — proxies requests to Google Apps Script
// Paste your values directly below — these stay server-side, never exposed to the browser.

const GAS_URL = 'https://script.google.com/macros/s/AKfycbw7x3V1dsrpZDVNyEwv1xflFEx2bOqDpL-gw5ZQnwAQxOywz0d3PD1WntJxrlS0EFC5/exec';
const GAS_API_KEY = '181049d1-b062-448a-a267-64824f1ef054';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!GAS_URL) return res.status(500).json({ ok: false, error: 'GAS_URL not configured in Vercel environment variables' });
  if (!GAS_API_KEY) return res.status(500).json({ ok: false, error: 'GAS_API_KEY not configured in Vercel environment variables' });

  try {
    if (req.method === 'GET') {
      // Build URL — inject the API key server-side, strip any key the browser sent
      const params = new URLSearchParams(req.query);
      params.set('key', GAS_API_KEY); // always use server-side key
      const url = `${GAS_URL}?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow',
      });
      const text = await response.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);

    } else if (req.method === 'POST') {
      // Parse the body, inject the API key, forward to GAS
      let body = {};
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch(e) {}
      body.key = GAS_API_KEY; // always use server-side key
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // GAS requires text/plain for doPost
        body: JSON.stringify(body),
        redirect: 'follow',
      });
      const text = await response.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({ ok: false, error: 'Proxy error: ' + err.message });
  }
}
