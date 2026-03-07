/**
 * One-time backfill script: assigns engagement numbers to all confirmed engagements
 * that don't have one yet, in chronological order.
 *
 * Usage: node scripts/backfill-engagement-numbers.js
 */
require('dotenv').config();
const airtableService = require('../services/airtable.service');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function backfill() {
  console.log('Fetching all engagements...');
  const allEngagements = await airtableService.getAllEngagements();
  console.log(`Total engagements: ${allEngagements.length}`);

  // Filter to confirmed leads without a number, sorted chronologically
  const needsNumber = allEngagements
    .filter(e => {
      const f = e.fields;
      return !f['Engagement Number'] && (f['Confirmed Service Call Lead'] || f['Confirmed Project Lead']);
    })
    .sort((a, b) => {
      const aTime = new Date(a._rawJson?.createdTime || 0);
      const bTime = new Date(b._rawJson?.createdTime || 0);
      return aTime - bTime;
    });

  console.log(`Confirmed engagements needing numbers: ${needsNumber.length}`);

  if (needsNumber.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  // Find existing max numbers to continue from
  let scMax = 0;
  let prMax = 0;
  for (const e of allEngagements) {
    const num = e.fields['Engagement Number'];
    if (!num) continue;
    const scMatch = num.match(/^SC-(\d+)$/);
    const prMatch = num.match(/^PR-(\d+)$/);
    if (scMatch) scMax = Math.max(scMax, parseInt(scMatch[1], 10));
    if (prMatch) prMax = Math.max(prMax, parseInt(prMatch[1], 10));
  }

  console.log(`Starting from SC-${String(scMax + 1).padStart(4, '0')}, PR-${String(prMax + 1).padStart(4, '0')}`);

  let assigned = 0;
  for (const e of needsNumber) {
    const f = e.fields;
    const isSC = !!f['Confirmed Service Call Lead'];
    let number;

    if (isSC) {
      scMax++;
      number = `SC-${String(scMax).padStart(4, '0')}`;
    } else {
      prMax++;
      number = `PR-${String(prMax).padStart(4, '0')}`;
    }

    const name = f['Customer Name'] || f['First Name'] || 'Unknown';
    console.log(`  ${number} -> ${name} (${e.id})`);

    await airtableService.updateEngagement(e.id, { 'Engagement Number': number });
    assigned++;

    // Rate limit: Airtable allows 5 req/sec
    await sleep(250);
  }

  console.log(`\nDone! Assigned ${assigned} engagement numbers.`);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
