const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';

async function notify(title, message) {
  const token = process.env.PUSHOVER_API_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;

  if (!token || !user) {
    console.warn('Pushover not configured — skipping push notification');
    return;
  }

  try {
    const res = await fetch(PUSHOVER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, user, title, message }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Pushover error:', res.status, text);
    }
  } catch (error) {
    console.error('Pushover send failed:', error.message);
  }
}

module.exports = { notify };
