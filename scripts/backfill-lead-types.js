/**
 * One-time backfill: sets Lead Type based on which confirmation checkbox is ticked.
 * Usage: node scripts/backfill-lead-types.js
 */
require('dotenv').config();
const airtableService = require('../services/airtable.service');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function backfill() {
  console.log('Fetching all engagements...');
  const allEngagements = await airtableService.getAllEngagements();
  console.log(`Total engagements: ${allEngagements.length}`);

  let fixed = 0;
  for (const e of allEngagements) {
    const f = e.fields;
    const isSC = !!f['Confirmed Service Call Lead'];
    const isPR = !!f['Confirmed Project Lead'];

    if (!isSC && !isPR) continue;

    const correctType = isSC ? 'Service Call' : 'Project';
    if (f['Lead Type'] === correctType) continue;

    const name = f['Customer Name'] || f['First Name'] || 'Unknown';
    console.log(`  ${name}: "${f['Lead Type'] || '(empty)'}" -> "${correctType}"`);

    await airtableService.updateEngagement(e.id, { 'Lead Type': correctType });
    fixed++;
    await sleep(250);
  }

  console.log(`\nDone! Fixed ${fixed} lead types.`);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
