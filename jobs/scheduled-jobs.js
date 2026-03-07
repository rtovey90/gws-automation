const cron = require('node-cron');
const { tables } = require('../config/airtable');
const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');
const pushover = require('../services/pushover.service');

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

          const engNumber = record.fields['Engagement Number'] || '';
          const refLine = engNumber ? `(${engNumber}) ` : '';
          const message = `Hey ${techFirstName}, just checking in — we haven't seen the schedule updated yet for ${refLine}${clientFirstName}.\n\nCan you give them a call today to lock in a time?\n\n${clientFirstName}: ${clientPhone}\nUpdate schedule: ${scheduleLink}\n\nCheers,\nRicky (Great White Security)`;

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

/**
 * Proposal follow-up reminders.
 * Runs 8:30am Perth time, Monday–Friday.
 *
 * Cadence (days since proposal sent):
 *   Day 1  — Warm intro call / walk-through offer
 *   Day 3  — Haven't-opened nudge (or value-add if viewed)
 *   Day 7  — Social proof + scarcity
 *   Day 14 — Direct ask + urgency
 *   Day 21 — Breakup text — last chance before file closed
 */
function startProposalFollowUpJob() {
  const followUps = [
    {
      day: 1,
      title: 'Day 1 Follow-up',
      message: (p) =>
        `Call ${p.name} and offer to walk them through the proposal. ` +
        `"Hey ${p.firstName}, just wanted to make sure you received the proposal and see if you had any questions. Happy to jump on a quick call to walk you through it."`
    },
    {
      day: 3,
      title: 'Day 3 Follow-up',
      message: (p) => p.viewCount > 0
        ? `${p.name} has viewed the proposal ${p.viewCount} time(s) — they're interested but haven't committed. ` +
          `Call and ask: "Hey ${p.firstName}, noticed you've had a look at the proposal — was there anything you wanted me to clarify or adjust?"`
        : `${p.name} hasn't opened the proposal yet. Call or text: ` +
          `"Hey ${p.firstName}, just checking the proposal came through OK — sometimes they land in spam. Want me to resend or talk you through it over the phone?"`
    },
    {
      day: 7,
      title: 'Day 7 Follow-up',
      message: (p) =>
        `Text ${p.name}: "Hey ${p.firstName}, just finished a similar install in your area — turned out great. ` +
        `Happy to share some photos if you're interested. Also worth mentioning our suppliers have flagged some lead time changes coming, ` +
        `so sooner is better if you'd like to lock in current pricing."`
    },
    {
      day: 14,
      title: 'Day 14 Follow-up',
      message: (p) =>
        `Call ${p.name} — be direct: "Hey ${p.firstName}, wanted to check in on the security proposal. ` +
        `We've got availability in the next couple of weeks which is rare — if you'd like to go ahead, ` +
        `I can lock that in for you. Is there anything holding you back that I can help with?"`
    },
    {
      day: 21,
      title: 'Final Follow-up',
      message: (p) =>
        `Last chance — text ${p.name}: "Hey ${p.firstName}, haven't heard back so I'll assume the timing isn't right ` +
        `and close off your file for now. If anything changes down the track, feel free to reach out — ` +
        `happy to put together a fresh quote. All the best!"\n\n` +
        `(The breakup text often gets a reply — people don't like losing the option.)`
    },
  ];

  cron.schedule('30 8 * * 1-5', async () => {
    try {
      console.log('📊 Checking proposals for follow-up reminders...');

      const proposals = await airtableService.getAllProposals();
      const now = new Date();
      let sent = 0;

      for (const p of proposals) {
        const f = p.fields;
        if (f.Status !== 'Sent' && f.Status !== 'Viewed') continue;

        const sentAt = f['Sent At'] ? new Date(f['Sent At']) : null;
        if (!sentAt) continue;

        const daysAgo = Math.floor((now - sentAt) / (1000 * 60 * 60 * 24));
        const clientName = f['Client Name'] || 'Unknown';
        const firstName = clientName.split(/[\s&,]/)[0];
        const price = Number(f['Base Price'] || 0);
        const viewCount = f['View Count'] || 0;

        // Check if today matches any follow-up day (allow +/- 0 days for exact match)
        const match = followUps.find(fu => daysAgo === fu.day);
        if (!match) continue;

        const ctx = { name: clientName, firstName, price, viewCount };
        pushover.notify(
          `${match.title} — ${clientName} ($${price.toLocaleString()})`,
          `#${f['Project Number']} — sent ${daysAgo}d ago | ${viewCount} view(s)\n\n${match.message(ctx)}`
        );
        sent++;
        console.log(`📊 ${match.title}: ${clientName} #${f['Project Number']}`);
      }

      if (sent > 0) {
        console.log(`✓ Sent ${sent} proposal follow-up reminder(s)`);
      } else {
        console.log('✓ No proposal follow-ups due today');
      }
    } catch (error) {
      console.error('Proposal follow-up error:', error);
    }
  }, {
    timezone: 'Australia/Perth',
  });

  console.log('Proposal follow-up job started (8:30am Perth, Mon-Fri)');
}

module.exports = {
  startScheduledJobChecker,
  startScheduleReminderJob,
  startEngagementNumberCheck,
  startProposalFollowUpJob,
};
