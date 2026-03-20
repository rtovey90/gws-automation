const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';

async function sendPush(userKey, title, message) {
  const token = process.env.PUSHOVER_API_TOKEN;
  if (!token || !userKey) return;

  try {
    const res = await fetch(PUSHOVER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, user: userKey, title, message }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Pushover error:', res.status, text);
    }
  } catch (error) {
    console.error('Pushover send failed:', error.message);
  }
}

// Owner — project/sales notifications
function notifyOwner(title, message) {
  return sendPush(process.env.PUSHOVER_USER_KEY, title, message);
}

// VA — service/operations notifications
function notifyVA(title, message) {
  return sendPush(process.env.PUSHOVER_VA_USER_KEY, title, message);
}

// Both
function notifyAll(title, message) {
  return Promise.all([notifyOwner(title, message), notifyVA(title, message)]);
}

// Legacy — defaults to owner
function notify(title, message) {
  return notifyOwner(title, message);
}

module.exports = { notify, notifyOwner, notifyVA, notifyAll };
