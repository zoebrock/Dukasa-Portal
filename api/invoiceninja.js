// Vercel serverless proxy — creates an Invoice Ninja client (if needed), an
// invoice with the submitted uniform order's line items, and emails it
// (which sends the client their payment link). INVOICE_NINJA_URL and
// INVOICE_NINJA_TOKEN are set in Vercel Environment Variables — the browser
// never sees the token, it's injected server-side only.

const INVOICE_NINJA_URL = (process.env.INVOICE_NINJA_URL || 'https://invoicing.co').replace(/\/+$/, '');
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN;

async function niFetch(path, options = {}) {
  const res = await fetch(`${INVOICE_NINJA_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'X-Api-Token': INVOICE_NINJA_TOKEN,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || `Invoice Ninja request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function findOrCreateClient(name, email) {
  if (email) {
    const found = await niFetch(`/clients?filter=${encodeURIComponent(email)}`);
    const existing = (found.data || []).find(c =>
      (c.contacts || []).some(ct => (ct.email || '').toLowerCase() === email.toLowerCase())
    );
    if (existing) return existing;
  }

  const created = await niFetch('/clients', {
    method: 'POST',
    body: JSON.stringify({
      name,
      contacts: [{ first_name: name, email: email || undefined }]
    })
  });
  return created.data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!INVOICE_NINJA_TOKEN) {
    return res.status(500).json({ ok: false, error: 'INVOICE_NINJA_TOKEN not set in Vercel environment variables' });
  }

  try {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}

    const { clientName, clientEmail, items, orderId } = body;

    if (!clientName || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: 'clientName and a non-empty items array are required' });
    }

    const client = await findOrCreateClient(clientName, clientEmail);

    const line_items = items.map(it => ({
      product_key: it.name,
      notes: it.notes || it.name,
      cost: Number(it.unitPrice) || 0,
      // Invoice Ninja's v5 API field is "quantity", not "qty" — the latter is
      // silently ignored and defaults to 0, which is why line/invoice totals
      // came back as $0.00 despite the correct unit cost showing.
      quantity: Number(it.qty) || 1
    }));

    const invoice = await niFetch('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id,
        line_items,
        public_notes: orderId ? `Uniform order ${orderId}` : 'Uniform order',
        auto_bill_enabled: false
      })
    });

    const invoiceId = invoice.data.id;

    // Emailing the invoice both sends it to the client and generates the
    // client-portal payment link (returned on the invitation object below).
    await niFetch('/invoices/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'email', ids: [invoiceId] })
    });

    const refreshed = await niFetch(`/invoices/${invoiceId}?include=invitations`);
    const invitation = (refreshed.data.invitations || [])[0];
    const invoiceUrl = invitation?.link || null;

    return res.status(200).json({
      ok: true,
      invoiceId,
      invoiceNumber: refreshed.data.number,
      invoiceUrl,
      clientId: client.id
    });

  } catch (err) {
    console.error('Invoice Ninja proxy error:', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
}
