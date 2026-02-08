/**
 * Setup script: Create the Proposals table in Airtable via Metadata API.
 *
 * Before running, update your Personal Access Token to include
 * the "schema.bases:write" scope:
 *   1. Go to https://airtable.com/create/tokens
 *   2. Edit your existing token (or create a new one)
 *   3. Add scope: schema.bases:write
 *   4. Save, then run:  node setup-proposals-table.js
 */
require('dotenv').config();
const https = require('https');

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_API_KEY;

const tableDefinition = {
  name: 'Proposals',
  fields: [
    { name: 'Project Number', type: 'singleLineText' },
    {
      name: 'Status',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Draft', color: 'grayLight2' },
          { name: 'Sent', color: 'blueLight2' },
          { name: 'Viewed', color: 'yellowLight2' },
          { name: 'Accepted', color: 'greenLight2' },
          { name: 'Paid', color: 'greenDark1' },
        ],
      },
    },
    { name: 'Date', type: 'date', options: { dateFormat: { name: 'local' } } },
    { name: 'Client Name', type: 'singleLineText' },
    { name: 'Client Address', type: 'singleLineText' },
    { name: 'Letter Note', type: 'multilineText' },
    { name: 'Scope Items', type: 'multilineText' },
    { name: 'Deliverables', type: 'multilineText' },
    { name: 'Cover Image URL', type: 'url' },
    { name: 'Site Photo URLs', type: 'multilineText' },
    { name: 'Package Name', type: 'singleLineText' },
    { name: 'Package Description', type: 'multilineText' },
    { name: 'Base Price', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Camera Options', type: 'multilineText' },
    { name: 'Clarifications', type: 'multilineText' },
    { name: 'OTO Bundle Price', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'OTO Alarm Price', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'OTO Alarm Was Price', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'OTO UPS Price', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'OTO UPS Was Price', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'OTO Care Monthly Price', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Stripe Session ID', type: 'singleLineText' },
    { name: 'Sent At', type: 'dateTime', options: { dateFormat: { name: 'local' }, timeFormat: { name: '24hour' }, timeZone: 'Australia/Perth' } },
    { name: 'Viewed At', type: 'dateTime', options: { dateFormat: { name: 'local' }, timeFormat: { name: '24hour' }, timeZone: 'Australia/Perth' } },
    { name: 'Accepted At', type: 'dateTime', options: { dateFormat: { name: 'local' }, timeFormat: { name: '24hour' }, timeZone: 'Australia/Perth' } },
    { name: 'Paid At', type: 'dateTime', options: { dateFormat: { name: 'local' }, timeFormat: { name: '24hour' }, timeZone: 'Australia/Perth' } },
  ],
};

const data = JSON.stringify(tableDefinition);

const options = {
  hostname: 'api.airtable.com',
  port: 443,
  path: `/v0/meta/bases/${BASE_ID}/tables`,
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

console.log('Creating Proposals table in Airtable...');

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    if (res.statusCode === 200) {
      const result = JSON.parse(body);
      console.log('Table created successfully!');
      console.log('Table ID:', result.id);
      console.log('\nNext step: Add the Engagement linked-record field manually in Airtable UI');
      console.log('(Link to Engagements table)');
    } else {
      console.error('Failed:', res.statusCode);
      console.error(body);
      if (res.statusCode === 403) {
        console.error('\nYour token needs the "schema.bases:write" scope.');
        console.error('Update at: https://airtable.com/create/tokens');
      }
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
