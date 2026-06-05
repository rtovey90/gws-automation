const crypto = require('crypto');

const hash = (value) => {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
};

const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '61' + digits.slice(1);
  if (digits.startsWith('61')) return digits;
  return digits;
};

exports.addToProposalAudience = async ({ phone, firstName, lastName }) => {
  const audienceId = process.env.META_CUSTOM_AUDIENCE_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!audienceId || !accessToken) {
    console.warn('[Meta] META_CUSTOM_AUDIENCE_ID or META_ACCESS_TOKEN not set — skipping');
    return;
  }

  const schema = [];
  const row = [];

  if (phone) {
    schema.push('PHONE');
    row.push(hash(normalizePhone(phone)));
  }
  if (firstName) {
    schema.push('FN');
    row.push(hash(firstName));
  }
  if (lastName) {
    schema.push('LN');
    row.push(hash(lastName));
  }

  if (schema.length === 0) return;

  const url = `https://graph.facebook.com/v21.0/${audienceId}/users`;
  const body = {
    payload: { schema, data: [row] },
    access_token: accessToken,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error(`Meta API error: ${JSON.stringify(result.error || result)}`);
  }

  console.log(`[Meta] Added to audience: +${normalizePhone(phone)} (${result.num_received ?? 1} received)`);
};
