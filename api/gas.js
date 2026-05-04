// Vercel serverless function — safely proxies Staff Portal requests to Google Apps Script.
// File path should be: /api/gas.js

const GAS_URL =
  process.env.GAS_URL ||
  'https://script.google.com/macros/s/AKfycbw7x3V1dsrpZDVNyEwv1xflFEx2bOqDpL-gw5ZQnwAQxOywz0d3PD1WntJxrlS0EFC5/exec';

const GAS_API_KEY =
  process.env.GAS_API_KEY ||
  '181049d1-b062-448a-a267-64824f1ef054';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!GAS_URL || !GAS_URL.includes('/exec')) {
    return res.status(500).json({
      ok: false,
      error: 'GAS_URL is missing or invalid. It must be your deployed Apps Script /exec URL.'
    });
  }

  if (!GAS_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'GAS_API_KEY is missing.'
    });
  }

  try {
    if (req.method === 'GET') {
      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(req.query || {})) {
        if (key !== 'key' && value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }

      params.set('key', GAS_API_KEY);

      const gasResponse = await fetch(`${GAS_URL}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'follow'
      });

      const text = await gasResponse.text();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      return res.status(gasResponse.ok ? 200 : gasResponse.status).send(text);
    }

    if (req.method === 'POST') {
      let body = {};

      if (typeof req.body === 'string') {
        try {
          body = JSON.parse(req.body);
        } catch {
          body = {};
        }
      } else if (req.body && typeof req.body === 'object') {
        body = { ...req.body };
      }

      delete body.key;
      body.key = GAS_API_KEY;

      const gasResponse = await fetch(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          Accept: 'application/json'
        },
        body: JSON.stringify(body),
        redirect: 'follow'
      });

      const text = await gasResponse.text();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      return res.status(gasResponse.ok ? 200 : gasResponse.status).send(text);
    }

    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  } catch (err) {
    console.error('GAS proxy error:', err);

    return res.status(502).json({
      ok: false,
      error: `GAS proxy error: ${err.message || err}`
    });
  }
}
