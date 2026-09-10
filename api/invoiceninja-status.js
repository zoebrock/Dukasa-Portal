// Vercel serverless proxy — looks up an Invoice Ninja invoice's current
// payment status (paid / partially paid / unpaid) so the Manager Portal can
// check on demand, without exposing the API token to the browser.

const INVOICE_NINJA_URL = (process.env.INVOICE_NINJA_URL || 'https://invoicing.co').replace(/\/+$/, '');
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!INVOICE_NINJA_TOKEN) {
    return res.status(500).json({ ok: false, error: 'INVOICE_NINJA_TOKEN not set in Vercel environment variables' });
  }

  const invoiceId = req.query?.invoiceId;
  if (!invoiceId) return res.status(400).json({ ok: false, error: 'invoiceId is required' });

  try {
    const r = await fetch(`${INVOICE_NINJA_URL}/api/v1/invoices/${invoiceId}`, {
      headers: {
        'X-Api-Token': INVOICE_NINJA_TOKEN,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      }
    });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: data?.message || `Invoice Ninja request failed (${r.status})` });
    }

    const inv = data.data || {};
    // status_id: 1=draft, 2=sent, 3=partial, 4=paid, 5=cancelled
    const balance = Number(inv.balance);
    const paid = String(inv.status_id) === '4' || (!Number.isNaN(balance) && balance <= 0 && Number(inv.amount) > 0);

    return res.status(200).json({
      ok: true,
      paid,
      statusId: inv.status_id,
      balance: inv.balance,
      amount: inv.amount
    });
  } catch (err) {
    console.error('Invoice Ninja status proxy error:', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
}
