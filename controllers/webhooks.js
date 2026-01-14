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

    console.log('Form data received:', JSON.stringify(formData, null, 2));

    // Map service types to match exact Airtable options
    const serviceTypeMap = {
      cctv: 'CCTV System',
      alarms: 'Alarm System',
      'access-control': 'Access Control System',
      intercom: 'Intercom System',
      complete: 'Other', // Map complete package to Other since it's not a specific option
      'not-sure': 'Other',
    };

    // Create lead in Airtable
    // Support both old form structure (firstName/suburb) and new form (firstName/propertyAddress)
    const leadData = {
      name: formData.firstName || formData.name || 'Unknown',
      phone: formData.phone,
      email: formData.email,
      address: formData.propertyAddress || (formData.suburb ? `${formData.suburb}, Perth` : ''),
      location: formData.propertyAddress || formData.suburb || '',
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

/**
 * Handle incoming SMS/MMS from Twilio
 * POST /webhooks/twilio-sms
 */
exports.handleTwilioSMS = async (req, res) => {
  try {
    console.log('📨 Twilio SMS webhook received');

    const { From, To, Body, NumMedia, MessageSid } = req.body;

    // Clean phone number format (Twilio sends +61...)
    const clientPhone = From;
    const twilioNumber = To;

    console.log(`📱 Incoming message from ${clientPhone}`);
    console.log(`📝 Message: ${Body || '(media only)'}`);
    console.log(`📎 Media count: ${NumMedia || 0}`);

    // Find lead by phone number
    let lead = null;
    try {
      const records = await airtableService.getLeadByPhone(clientPhone);
      lead = records;
    } catch (error) {
      console.error('Error finding lead by phone:', error);
    }

    if (!lead) {
      console.log(`⚠️ No lead found for phone number: ${clientPhone}`);

      // Send notification to admin about unknown number
      try {
        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `📨 NEW MESSAGE from unknown number:\n\nFrom: ${clientPhone}\nMessage: ${Body || '(media only)'}\n\nNo matching lead found - may be a new inquiry.`,
          { from: clientPhone }
        );
      } catch (smsError) {
        console.error('Error sending admin notification:', smsError);
      }

      // Respond to Twilio (required to prevent retries)
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    console.log(`✓ Found lead: ${lead.fields['First Name']} (${lead.id})`);

    // Handle media (photos) if present
    const mediaUrls = [];
    if (NumMedia && parseInt(NumMedia) > 0) {
      console.log(`📷 Processing ${NumMedia} media attachments...`);

      for (let i = 0; i < parseInt(NumMedia); i++) {
        const mediaUrl = req.body[`MediaUrl${i}`];
        const mediaContentType = req.body[`MediaContentType${i}`];

        if (mediaUrl) {
          console.log(`  - Media ${i + 1}: ${mediaContentType} - ${mediaUrl}`);
          mediaUrls.push({
            url: mediaUrl,
            contentType: mediaContentType,
          });
        }
      }

      // Add Twilio auth to media URLs for Airtable to download
      const authenticatedUrls = mediaUrls.map(media => ({
        url: `${media.url}?auth=${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
      }));

      // Update lead with photos
      try {
        // Get existing photos
        const existingPhotos = lead.fields.Photos || [];

        // Append new photos
        const updatedPhotos = [
          ...existingPhotos,
          ...authenticatedUrls,
        ];

        await airtableService.updateLead(lead.id, {
          Photos: updatedPhotos,
        });

        console.log(`✓ ${mediaUrls.length} photo(s) saved to lead`);
      } catch (photoError) {
        console.error('Error saving photos to lead:', photoError);
      }
    }

    // Log the message in Messages table
    try {
      await airtableService.logMessage({
        leadId: lead.id,
        direction: 'Inbound',
        type: 'SMS',
        from: clientPhone,
        to: twilioNumber,
        content: Body || '(media only)',
        status: 'Received',
      });

      console.log('✓ Message logged in Messages table');
    } catch (messageError) {
      console.error('Error logging message:', messageError);
    }

    // Send notification to admin
    try {
      const photoText = mediaUrls.length > 0 ? `\n📷 ${mediaUrls.length} photo(s) attached` : '';

      await twilioService.sendSMS(
        process.env.ADMIN_PHONE,
        `📨 NEW REPLY from ${lead.fields['First Name']}:\n\n${Body || '(no text)'}${photoText}\n\nView lead in Airtable`,
        { leadId: lead.id, from: clientPhone }
      );

      console.log('✓ Admin notification sent');
    } catch (smsError) {
      console.error('Error sending admin notification:', smsError);
    }

    // Respond to Twilio with empty TwiML (required)
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Error handling Twilio SMS webhook:', error);
    // Still respond to Twilio to prevent retries
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
};

module.exports = exports;
