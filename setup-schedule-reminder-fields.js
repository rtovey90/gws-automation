/**
 * Setup script: Add schedule reminder fields to the Engagements table.
 *
 * Creates two new fields:
 *   1. "Tech Assigned At" (dateTime) — set when a tech is assigned
 *   2. "Schedule Reminder Sent" (checkbox) — prevents double-sending reminders
 *
 * Before running, ensure your Personal Access Token includes
 * the "schema.bases:read" and "schema.bases:write" scopes:
 *   1. Go to https://airtable.com/create/tokens
 *   2. Edit your existing token (or create a new one)
 *   3. Add scopes: schema.bases:read, schema.bases:write
 *   4. Save, then run:  node setup-schedule-reminder-fields.js
 */
require('dotenv').config();
const https = require('https');

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_API_KEY;
const TABLE_NAME = process.env.AIRTABLE_ENGAGEMENTS_TABLE || 'Engagements';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.airtable.com',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => (responseBody += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseBody));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Looking up Engagements table ID...');

  // Step 1: Get table ID from base schema
  const schema = await request('GET', `/v0/meta/bases/${BASE_ID}/tables`);
  const table = schema.tables.find((t) => t.name === TABLE_NAME);
  if (!table) {
    console.error(`Table "${TABLE_NAME}" not found in base.`);
    process.exit(1);
  }
  const tableId = table.id;
  console.log(`Found table: ${TABLE_NAME} (${tableId})`);

  // Check which fields already exist
  const existingFields = table.fields.map((f) => f.name);

  // Step 2: Create fields
  const fieldsToCreate = [
    {
      name: 'Tech Assigned At',
      type: 'dateTime',
      options: {
        dateFormat: { name: 'local' },
        timeFormat: { name: '24hour' },
        timeZone: 'Australia/Perth',
      },
    },
    {
      name: 'Schedule Reminder Sent',
      type: 'checkbox',
      options: { icon: 'check', color: 'greenBright' },
    },
  ];

  for (const field of fieldsToCreate) {
    if (existingFields.includes(field.name)) {
      console.log(`  ⏭️  "${field.name}" already exists, skipping`);
      continue;
    }

    try {
      const result = await request(
        'POST',
        `/v0/meta/bases/${BASE_ID}/tables/${tableId}/fields`,
        field
      );
      console.log(`  ✅ Created "${result.name}" (${result.type})`);
    } catch (err) {
      console.error(`  ❌ Failed to create "${field.name}":`, err.message);
      if (err.message.includes('403')) {
        console.error(
          '\n  Your token needs the "schema.bases:write" scope.'
        );
        console.error('  Update at: https://airtable.com/create/tokens');
      }
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
