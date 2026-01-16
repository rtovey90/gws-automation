const cron = require('node-cron');
const { tables } = require('../config/airtable');

/**
 * Scheduled Jobs - Background tasks that run on a schedule
 */

/**
 * Check for scheduled jobs that should now be in progress
 * Runs every 15 minutes
 */
function startScheduledJobChecker() {
  // Run every 15 minutes: at 0, 15, 30, 45 minutes past each hour
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('🔄 Checking for scheduled jobs that should move to In Progress...');

      // Get all leads with Status = "Scheduled 📅"
      const records = await tables.leads
        .select({
          filterByFormula: `{Status} = 'Scheduled 📅'`,
        })
        .all();

      console.log(`📋 Found ${records.length} scheduled lead(s) to check`);

      const now = new Date();
      let movedCount = 0;

      for (const record of records) {
        const scheduledDate = record.fields['Scheduled 📅'];

        if (!scheduledDate) {
          console.log(`⚠️ Lead ${record.id} has no scheduled date, skipping`);
          continue;
        }

        const scheduledTime = new Date(scheduledDate);

        // Check if scheduled time has passed
        if (scheduledTime <= now) {
          console.log(`✅ Moving lead ${record.id} to In Progress 🔧 (scheduled for ${scheduledTime.toISOString()})`);

          // Update status to In Progress
          await tables.leads.update(record.id, {
            Status: 'In Progress 🔧',
          });

          movedCount++;
        }
      }

      if (movedCount > 0) {
        console.log(`✓ Moved ${movedCount} lead(s) to In Progress`);
      } else {
        console.log(`✓ No leads ready to move yet`);
      }
    } catch (error) {
      console.error('❌ Error checking scheduled jobs:', error);
    }
  });

  console.log('✅ Scheduled job checker started (runs every 15 minutes)');
}

module.exports = {
  startScheduledJobChecker,
};
