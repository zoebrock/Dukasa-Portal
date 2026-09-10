// Vercel serverless function — receives Invoice Ninja's webhook when an
// invoice is paid (configure in Invoice Ninja: Settings → Webhooks →
// event "Invoice Paid", target URL https://<this-domain>/api/invoiceninja-webhook?secret=...).
// On payment it marks the matching uniform_orders row as paid in Supabase
// and emails the manager via the existing GAS notification pathway.
//
// This is a defence-in-depth channel — the Manager Portal also lets a
// manager manually check/refresh an invoice's payment status via
// /api/invoiceninja-status, in case webhooks aren't available on the
// Invoice Ninja plan tier in use.

const WEBHOOK_SECRET = process.env.INVOICE_NINJA_WEBHOOK_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jfowikvmnqlebranlggf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_-x_b0RnXfUjoKML_cRYvjA_r2udt8PQ';

const GAS_URL =
  process.env.GAS_URL ||
  'https://script.google.com/macros/s/AKfycbw7x3V1dsrpZDVNyEwv1xflFEx2bOqDpL-gw5ZQnwAQxOywz0d3PD1WntJxrlS0EFC5/exec';
const GAS_API_KEY =
  process.env.GAS_API_KEY ||
  '181049d1-b062-448a-a267-64824f1ef054';

async function findOrderById(orderId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/uniform_orders?id=eq.${encodeURIComponent(orderId)}&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function markOrderPaid(orderId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/uniform_orders?id=eq.${encodeURIComponent(orderId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() })
    }
  );
  if (!r.ok) throw new Error(`Supabase update failed (${r.status})`);
}

async function notifyManagerPaid(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' },
      body: JSON.stringify({
        action: 'sendEmail',
        fn: 'sendUniformOrderPaid',
        key: GAS_API_KEY,
        payload: {
          empName: order.emp_name || '',
          empEmail: order.emp_email || '',
          items: items.map(i => `${i.notes || i.name || ''} x${i.qty || 1}`).join('; '),
          total: Number(order.total || 0).toFixed(2)
        }
      }),
      redirect: 'follow'
    });
  } catch (err) {
    console.warn('Uniform order paid — manager notification email failed:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (WEBHOOK_SECRET && req.query?.secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
  }

  try {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}

    // Invoice Ninja's webhook payload shape varies slightly by version — the
    // invoice entity may be the body itself, or nested under invoice/data.
    const invoice = body.invoice || body.data || body;
    const publicNotes = invoice?.public_notes || '';
    const match = /Uniform order (\S+)/.exec(publicNotes);
    const orderId = match?.[1];

    if (!orderId) {
      // Not a uniform-order invoice (or notes format didn't match) — nothing to do.
      return res.status(200).json({ ok: true, ignored: true });
    }

    const balance = Number(invoice.balance);
    const isPaid = String(invoice.status_id) === '4' || (!Number.isNaN(balance) && balance <= 0 && Number(invoice.amount) > 0);
    if (!isPaid) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'invoice not fully paid' });
    }

    const order = await findOrderById(orderId);
    if (!order) return res.status(200).json({ ok: true, ignored: true, reason: 'order not found' });
    if (order.status === 'paid') return res.status(200).json({ ok: true, alreadyPaid: true });

    await markOrderPaid(orderId);
    await notifyManagerPaid(order);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Invoice Ninja webhook error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
