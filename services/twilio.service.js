const twilio = require('twilio');
const airtableService = require('./airtable.service');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Helper function to normalize Australian phone numbers
function normalizePhone(phone) {
  // Handle arrays from Airtable lookups
  if (Array.isArray(phone)) {
    phone = phone[0];
  }

  // Return null for empty/undefined values
  if (!phone || typeof phone !== 'string') return null;

  // Remove all spaces, hyphens, and parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // Convert Australian mobile numbers starting with 0 to +61
  if (cleaned.startsWith('0')) {
    cleaned = '+61' + cleaned.substring(1);
  }

  // Ensure +61 format
  if (cleaned.startsWith('61') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

/**
 * Twilio Service - Handles all SMS communication
 */
class TwilioService {
  /**
   * Send SMS message
   */
  async sendSMS(to, message, metadata = {}) {
    try {
      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to,
      });

      // Lookup customer and tech by phone number
      const normalizedPhone = normalizePhone(to);
      const customer = await airtableService.getCustomerByPhone(normalizedPhone);
      const tech = await airtableService.getTechByPhone(normalizedPhone);

      // Log message to Airtable with customer/tech links
      await airtableService.logMessage({
        direction: 'Outbound',
        type: 'SMS',
        to: to,
        from: process.env.TWILIO_PHONE_NUMBER,
        content: message,
        status: result.status === 'queued' || result.status === 'sent' ? 'Sent' : 'Failed',
        jobId: metadata.jobId,
        leadId: metadata.leadId,
        engagementId: metadata.leadId,
        customerId: customer ? customer.id : null,
        techId: tech ? tech.id : null,
      });

      console.log(`✓ SMS sent to ${to}: ${result.sid}`);
      return result;
    } catch (error) {
      console.error(`✗ Error sending SMS to ${to}:`, error.message);

      // Lookup customer and tech by phone number
      const normalizedPhone = normalizePhone(to);
      const customer = await airtableService.getCustomerByPhone(normalizedPhone);
      const tech = await airtableService.getTechByPhone(normalizedPhone);

      // Log failed message
      await airtableService.logMessage({
        direction: 'Outbound',
        type: 'SMS',
        to: to,
        from: process.env.TWILIO_PHONE_NUMBER,
        content: message,
        status: 'Failed',
        jobId: metadata.jobId,
        leadId: metadata.leadId,
        engagementId: metadata.leadId,
        customerId: customer ? customer.id : null,
        techId: tech ? tech.id : null,
      });

      throw error;
    }
  }

  /**
   * Send job offer SMS to tech
   */
  async sendJobOfferToTech(tech, job, acceptLink) {
    const message = `Hey ${tech.fields.Name}, Ricky here from Great White Security.

I have a job if you're interested:

${job.fields['Scope of Work']}

Location: ${job.fields['Client Address']}
Payment: $${job.fields['Quoted Price']} for first hour, paid same day.

Accept here: ${acceptLink}

First to accept gets it!`;

    return await this.sendSMS(tech.fields.Phone, message, { jobId: job.id });
  }

  /**
   * Send pricing SMS to client
   */
  async sendClientPricing(job, tech) {
    const clientPhone = job.fields['Client Phone'][0]; // Rollup field returns array
    const clientName = job.fields['Client Name'][0]; // Rollup field returns array
    const techName = tech.fields.Name;

    const message = `Hi ${clientName}, thank you for sending those over!

Good news! I can have one of our technicians out this week.

The call-out is $${job.fields['Quoted Price']} inc. GST, covering the first hour on-site.

To lock it in, please make payment here: ${job.fields['Stripe Payment Link']}

Once payment's through, ${techName} will reach out to schedule.

Thanks!
Ricky`;

    return await this.sendSMS(clientPhone, message, { jobId: job.id });
  }

  /**
   * Send payment received notification to tech
   */
  async sendPaymentNotificationToTech(job, tech) {
    const updateLink = `${process.env.BASE_URL}/job-update/${job.id}/${tech.id}`;
    const clientPhone = job.fields['Client Phone'][0];
    const clientName = job.fields['Client Name'][0];
    const clientAddress = job.fields['Client Address'];

    const message = `Hey ${tech.fields.Name}, payment received for your job!

Client: ${clientName}
Phone: ${clientPhone}
Address: ${clientAddress}

Scope: ${job.fields['Scope of Work']}

Please call client to schedule. When complete, update job here:
${updateLink}

Cheers, Ricky`;

    return await this.sendSMS(tech.fields.Phone, message, { jobId: job.id });
  }

  /**
   * Send review request to client
   */
  async sendReviewRequest(job) {
    const clientPhone = job.fields['Client Phone'][0];
    const clientName = job.fields['Client Name'][0];

    const message = `Hi ${clientName},

Thanks for choosing Great White Security!

Would you mind leaving us a quick 5-star review? It takes 30 seconds and helps us tremendously:

${process.env.GOOGLE_REVIEW_LINK}

Thanks!
Ricky`;

    return await this.sendSMS(clientPhone, message, { jobId: job.id });
  }

  /**
   * Send review follow-up reminder
   */
  async sendReviewFollowUp(job) {
    const clientPhone = job.fields['Client Phone'][0];
    const clientName = job.fields['Client Name'][0];

    const message = `Hi ${clientName},

Just following up on our review request. If you have a spare moment, we'd really appreciate your feedback:

${process.env.GOOGLE_REVIEW_LINK}

Thanks for your business!
Ricky`;

    return await this.sendSMS(clientPhone, message, { jobId: job.id });
  }
}

module.exports = new TwilioService();
