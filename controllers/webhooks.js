const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Webhook Controllers - Handle incoming webhooks from external services
 */

/**
 * Handle Formspree contact form submissions
 * POST /webhooks/formspree
 */
exports.handleFormspree = async (req, res) => {
  try {
    console.log('📨 Formspree webhook received');

    const formData = req.body;

    // Map service types
    const serviceTypeMap = {
      cctv: 'CCTV',
      alarms: 'Alarm',
      'access-control': 'Access Control',
      intercom: 'Intercom',
      complete: 'Complete Package',
      'not-sure': 'Other',
    };

    // Create lead in Airtable
    const leadData = {
      name: `${formData.firstName || ''} ${formData.lastName || ''}`.trim() || formData.name || 'Unknown',
      phone: formData.phone,
      email: formData.email,
      address: formData.suburb ? `${formData.suburb}, Perth` : '',
      location: formData.suburb || '',
      source: 'Form',
      serviceType: serviceTypeMap[formData.services] || 'Other',
      notes: formData.message || '',
      rawData: JSON.stringify(formData, null, 2),
    };

    const lead = await airtableService.createLead(leadData);

    console.log(`✓ Lead created: ${lead.id} - ${leadData.name}`);

    // Send notification to admin
    try {
      await twilioService.sendSMS(
        process.env.ADMIN_PHONE,
        `🆕 NEW LEAD from website form!\n\nName: ${leadData.name}\nPhone: ${leadData.phone}\nService: ${leadData.serviceType}\n\nView in Airtable`,
        { leadId: lead.id }
      );
    } catch (smsError) {
      console.error('Error sending notification SMS:', smsError);
      // Don't fail the webhook if notification fails
    }

    res.status(200).json({ success: true, leadId: lead.id });
  } catch (error) {
    console.error('Error handling Formspree webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Handle Stripe payment webhooks
 * POST /webhooks/stripe
 */
exports.handleStripe = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Stripe webhook received: ${event.type}`);

  try {
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'checkout.session.completed':
        await handlePaymentSuccess(event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error handling Stripe webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(paymentObject) {
  try {
    const leadId = paymentObject.metadata?.lead_id;
    const jobId = paymentObject.metadata?.job_id;

    // New workflow: Payment for a Lead → Create Job
    if (leadId) {
      console.log(`✓ Payment received for lead: ${leadId}`);

      // Get the lead
      const lead = await airtableService.getLead(leadId);

      if (!lead) {
        console.error(`❌ Lead not found: ${leadId}`);
        return;
      }

      console.log(`✓ Found lead: ${lead.fields.Name}`);

      // Create a job from the lead
      const jobData = {
        leadId: leadId,
        clientAddress: lead.fields['Address/Location'] || '',
        status: 'Payment Received', // Start at Payment Received since they already paid
        scope: lead.fields.Notes || 'Service requested',
        quotedPrice: lead.fields['Service Call Amount'] || lead.fields['Project Value'] || 0,
        stripeLink: '', // Already paid
        autoSendPricing: false, // Already paid
      };

      const job = await airtableService.createJob(jobData);
      console.log(`✓ Job created from lead: ${job.id}`);

      // Update lead status to Won and add Stripe payment ID
      await airtableService.updateLead(leadId, {
        Status: 'Won',
        Notes: `${lead.fields.Notes || ''}\n\n[Payment Received: ${paymentObject.id}]`.trim()
      });
      console.log(`✓ Lead status updated to Won`);

      // Send notification to admin
      try {
        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `💰 PAYMENT RECEIVED!\n\nClient: ${lead.fields.Name}\nAmount: $${(paymentObject.amount / 100).toFixed(2)}\n\nJob created in Airtable - ready to assign tech!`,
          { jobId: job.id, leadId: leadId }
        );
      } catch (smsError) {
        console.error('Error sending notification SMS:', smsError);
      }

      return;
    }

    // Old workflow: Direct job payment (backward compatibility)
    if (jobId) {
      console.log(`✓ Payment received for job: ${jobId}`);

      // Update job in Airtable
      await airtableService.updateJobPayment(jobId, paymentObject.id);

      // Get job and tech details
      const job = await airtableService.getJob(jobId);
      const techId = job.fields['Assigned Tech']?.[0];

      if (techId) {
        const tech = await airtableService.getTech(techId);

        // Send notification to tech
        await twilioService.sendPaymentNotificationToTech(job, tech);

        console.log(`✓ Payment notification sent to tech: ${tech.fields.Name}`);
      }

      return;
    }

    console.warn('⚠️ Payment received but no lead_id or job_id in metadata');
  } catch (error) {
    console.error('Error handling payment success:', error);
    throw error;
  }
}

/**
 * Handle email transcript from call router
 * POST /webhooks/email-transcript
 */
exports.handleEmailTranscript = async (req, res) => {
  try {
    console.log('📨 Email transcript webhook received');

    const { isLead, name, location, email, phone, notes, transcript } = req.body;

    // Only create lead if flagged as new lead
    if (isLead) {
      const leadData = {
        name: name || 'Unknown',
        phone: phone || '',
        email: email || '',
        address: location || '',
        location: location || '',
        source: 'Call',
        serviceType: 'Other',
        notes: notes || '',
        rawData: transcript || '',
      };

      const lead = await airtableService.createLead(leadData);

      console.log(`✓ Lead created from call: ${lead.id} - ${leadData.name}`);

      // Send notification to admin
      try {
        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `🆕 NEW LEAD from phone call!\n\nName: ${leadData.name}\nPhone: ${leadData.phone}\n\nView in Airtable`,
          { leadId: lead.id }
        );
      } catch (smsError) {
        console.error('Error sending notification SMS:', smsError);
      }

      res.status(200).json({ success: true, leadId: lead.id });
    } else {
      console.log('ℹ️ Call transcript received but not flagged as lead');
      res.status(200).json({ success: true, message: 'Not a lead' });
    }
  } catch (error) {
    console.error('Error handling email transcript webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
