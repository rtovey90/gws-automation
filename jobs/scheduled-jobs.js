const cron = require('node-cron');
const { tables } = require('../config/airtable');
const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

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

/**
 * Get the previous business day from a given date.
 * Monday → Friday, Tuesday → Monday, etc.
 */
function getPreviousBusinessDay(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  let daysBack;
  switch (day) {
    case 1: daysBack = 3; break; // Monday → Friday
    case 0: daysBack = 2; break; // Sunday → Friday
    default: daysBack = 1; break; // Tue-Sat → previous day
  }
  d.setDate(d.getDate() - daysBack);
  return d;
}

/**
 * Auto-remind tech to schedule a job if they haven't updated the schedule
 * form after 1 business day.
 *
 * Runs 9am Perth time, Monday–Friday.
 */
function startScheduleReminderJob() {
  cron.schedule('0 9 * * 1-5', async () => {
    try {
      console.log('📞 Checking for techs who need a schedule reminder...');

      // Get all engagements with Status = "Tech Assigned 👷"
      const records = await tables.engagements
        .select({
          filterByFormula: `{Status} = 'Tech Assigned 👷'`,
        })
        .all();

      console.log(`📋 Found ${records.length} tech-assigned engagement(s) to check`);

      const now = new Date();
      const prevBizDay = getPreviousBusinessDay(now);
      // Set to end of that previous business day (23:59:59)
      prevBizDay.setHours(23, 59, 59, 999);

      let sentCount = 0;

      for (const record of records) {
        const techAssignedAt = record.fields['Tech Assigned At'];
        const scheduledDate = record.fields['Scheduled 📅'];
        const reminderSent = record.fields['Schedule Reminder Sent'];

        // Skip if missing assignment date, already scheduled, or already reminded
        if (!techAssignedAt || scheduledDate || reminderSent) {
          continue;
        }

        // Only remind if assigned on or before the previous business day
        const assignedDate = new Date(techAssignedAt);
        if (assignedDate > prevBizDay) {
          continue;
        }

        try {
          // Get tech details via linked field
          const techIds = record.fields['Assigned Tech Name'];
          if (!techIds || techIds.length === 0) {
            console.log(`⚠️ Engagement ${record.id} has no assigned tech, skipping`);
            continue;
          }

          const tech = await airtableService.getTech(techIds[0]);
          if (!tech || !tech.fields.Phone) {
            console.log(`⚠️ Tech for engagement ${record.id} has no phone, skipping`);
            continue;
          }

          // Get customer details
          const result = await airtableService.getEngagementWithCustomer(record.id);
          if (!result || !result.customer) {
            console.log(`⚠️ No customer found for engagement ${record.id}, skipping`);
            continue;
          }

          const { customer } = result;
          const techFirstName = tech.fields['First Name'] || 'there';
          const clientFirstName = customer.fields['First Name'] || 'the client';
          const clientPhone = customer.fields['Mobile Phone'] || customer.fields.Phone || '';
          const scheduleLink = `${process.env.BASE_URL}/s/${record.id}`;

          const message = `Hey ${techFirstName}, just checking in — we haven't seen the schedule updated yet for ${clientFirstName}.\n\nCan you give them a call today to lock in a time?\n\n${clientFirstName}: ${clientPhone}\nUpdate schedule: ${scheduleLink}\n\nCheers,\nRicky (Great White Security)`;

          // Send SMS to tech
          await twilioService.sendSMS(
            tech.fields.Phone,
            message,
            { leadId: record.id, type: 'schedule_reminder' }
          );

          // Mark reminder as sent
          await airtableService.updateEngagement(record.id, {
            'Schedule Reminder Sent': true,
          });

          console.log(`✅ Schedule reminder sent to ${techFirstName} for engagement ${record.id}`);
          sentCount++;
        } catch (innerError) {
          console.error(`❌ Error sending reminder for engagement ${record.id}:`, innerError.message);
        }
      }

      if (sentCount > 0) {
        console.log(`✓ Sent ${sentCount} schedule reminder(s)`);
      } else {
        console.log('✓ No schedule reminders needed');
      }
    } catch (error) {
      console.error('❌ Error checking schedule reminders:', error);
    }
  }, {
    timezone: 'Australia/Perth',
  });

  console.log('✅ Schedule reminder job started (9am Perth, Mon-Fri)');
}

/**
 * Assign engagement numbers to confirmed leads that don't have one yet
 * Safety net for cases where the Airtable webhook didn't fire
 * Runs every 5 minutes
 */
function startEngagementNumberCheck() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const engagements = await airtableService.getAllEngagements();
      for (const e of engagements) {
        const f = e.fields;
        if (f['Engagement Number']) continue;

        if (f['Confirmed Service Call Lead']) {
          if (f['Lead Type'] !== 'Service Call') {
            await airtableService.updateEngagement(e.id, { 'Lead Type': 'Service Call' });
          }
          const num = await airtableService.assignEngagementNumber(e.id, 'sc');
          console.log(`Backfill: assigned ${num} to ${e.id}`);
        } else if (f['Confirmed Project Lead']) {
          if (f['Lead Type'] !== 'Project') {
            await airtableService.updateEngagement(e.id, { 'Lead Type': 'Project' });
          }
          const num = await airtableService.assignEngagementNumber(e.id, 'project');
          console.log(`Backfill: assigned ${num} to ${e.id}`);
        }
      }
    } catch (error) {
      console.error('Engagement number check error:', error);
    }
  });
  console.log('Engagement number checker started (every 5 min)');
}

module.exports = {
  startScheduledJobChecker,
  startScheduleReminderJob,
  startEngagementNumberCheck,
};
