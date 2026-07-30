// Vercel serverless proxy — forwards SMS send requests to Cellcast.
// CELLCAST_API_KEY (and optionally CELLCAST_SENDER) are set in Vercel Environment
// Variables. The browser never sees the key — it's injected server-side only.

const CELLCAST_API_KEY = process.env.CELLCAST_API_KEY;
const CELLCAST_SENDER  = process.env.CELLCAST_SENDER || '#SharedNum#';
const CELLCAST_URL     = 'https://api.cellcast.com/api/v1/gateway';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!CELLCAST_API_KEY) return res.status(500).json({ ok: false, error: 'CELLCAST_API_KEY not set in Vercel environment variables' });

  try {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}

    const { to, message } = body;
    if (!to || !message) return res.status(400).json({ ok: false, error: 'Both "to" and "message" are required' });

    const contacts = Array.isArray(to) ? to : [to];

    const response = await fetch(CELLCAST_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CELLCAST_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ contacts, message, sender: CELLCAST_SENDER })
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { status: false, message: text }; }

    if (!response.ok || data.status === false) {
      return res.status(502).json({ ok: false, error: data.message || 'Cellcast request failed' });
    }

    return res.status(200).json({ ok: true, data });

  } catch (err) {
    console.error('Cellcast proxy error:', err.message);
    return res.status(502).json({ ok: false, error: 'Proxy error: ' + err.message });
  }
}
