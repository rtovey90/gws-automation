const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Webhook Controllers - Handle incoming webhooks from external services
 */

/**
 * Helper function to create or get existing customer, then create engagement
 * @param {Object} data - Lead data from form/call/etc
 * @returns {Object} - { customer, engagement }
 */
async function createCustomerAndEngagement(data) {
  try {
    // Extract first and last names if we have a full name
    let firstName = data.name || '';
    let lastName = '';

    if (firstName && firstName.includes(' ')) {
      const nameParts = firstName.split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }

    // Check if customer already exists by phone
    let customer = null;
    if (data.phone) {
      customer = await airtableService.getCustomerByPhone(data.phone);
    }

    // If customer doesn't exist, create them
    if (!customer) {
      console.log('🆕 Creating new customer');

      // Determine if phone should go to Phone or Mobile Phone based on source
      const isFormOrCall = data.source === 'Form' || data.source === 'Call';

      customer = await airtableService.createCustomer({
        firstName: firstName,
        lastName: lastName,
        phone: isFormOrCall ? '' : (data.phone || ''), // Business phone for other sources
        mobilePhone: isFormOrCall ? (data.phone || '') : '', // Mobile for forms/calls
        email: data.email || '',
        address: data.address || data.location || '',
        notes: '',
      });
    } else {
      console.log('✓ Found existing customer:', customer.id);
    }

    // Create engagement linked to customer
    const engagement = await airtableService.createEngagement({
      customerId: customer.id,
      status: 'New Lead',
      leadType: data.serviceType || 'Other',
      source: data.source || 'Form',
      notes: data.notes || '',
      rawData: data.rawData || '',
      business: data.business || 'Great White Security',
      serviceCallAmount: data.serviceCallAmount,
      projectValue: data.projectValue,
    });

    return { customer, engagement };
  } catch (error) {
    console.error('Error creating customer and engagement:', error);
    throw error;
  }
}

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

    // Prepare data for customer + engagement creation
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

    // Create customer and engagement
    const { customer, engagement } = await createCustomerAndEngagement(leadData);

    console.log(`✓ Customer & Engagement created: ${engagement.id} - ${leadData.name}`);

    // Send notification to admin
    try {
      const message = leadData.notes ? `\nMessage: ${leadData.notes.substring(0, 100)}${leadData.notes.length > 100 ? '...' : ''}` : '';

      await twilioService.sendSMS(
        process.env.ADMIN_PHONE,
        `🆕 NEW LEAD from website form!\n\nName: ${leadData.name}\nPhone: ${leadData.phone}\nEmail: ${leadData.email || 'N/A'}\nAddress: ${leadData.address || 'N/A'}\nService: ${leadData.serviceType || 'Other'}${message}\n\nView in Airtable`,
        { leadId: engagement.id }
      );
    } catch (smsError) {
      console.error('Error sending notification SMS:', smsError);
      // Don't fail the webhook if notification fails
    }

    res.status(200).json({ success: true, leadId: engagement.id, customerId: customer.id });
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
        await handlePaymentSuccess(event.data.object, 'payment_intent');
        break;

      case 'checkout.session.completed':
        await handlePaymentSuccess(event.data.object, 'session');
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
 * @param {Object} paymentObject - Either a PaymentIntent or Session object
 * @param {String} eventType - Either 'payment_intent' or 'session'
 */
async function handlePaymentSuccess(paymentObject, eventType) {
  try {
    console.log(`Processing ${eventType} payment...`);

    // Extract metadata based on event type
    let leadId, jobId, paymentId;

    if (eventType === 'session') {
      // For checkout sessions, metadata is directly on the object
      leadId = paymentObject.metadata?.lead_id;
      jobId = paymentObject.metadata?.job_id;
      paymentId = paymentObject.payment_intent; // Session has payment_intent ID
      console.log(`Session metadata - lead_id: ${leadId}, job_id: ${jobId}`);
    } else {
      // For payment intents, metadata is on the object (old workflow)
      leadId = paymentObject.metadata?.lead_id;
      jobId = paymentObject.metadata?.job_id;
      paymentId = paymentObject.id;
      console.log(`PaymentIntent metadata - lead_id: ${leadId}, job_id: ${jobId}`);
    }

    // New workflow: Payment for a Lead → Update Lead status (no Job creation)
    if (leadId) {
      console.log(`✓ Payment received for lead: ${leadId}`);

      // Get the lead
      const lead = await airtableService.getLead(leadId);

      if (!lead) {
        console.error(`❌ Lead not found: ${leadId}`);
        return;
      }

      const leadName = [lead.fields['First Name'], lead.fields['Last Name']].filter(Boolean).join(' ') || 'Unknown';
      console.log(`✓ Found lead: ${leadName}`);

      // Update lead status to Payment Received (no Job creation - keeping everything in Leads table)
      await airtableService.updateLead(leadId, {
        Status: 'Payment Received ✅'
      });
      console.log(`✓ Lead status updated to Payment Received (Payment ID: ${paymentId})`);

      return;
    }

    // Old workflow: Direct job payment (backward compatibility)
    if (jobId) {
      console.log(`✓ Payment received for job: ${jobId}`);

      // Update job in Airtable
      await airtableService.updateJobPayment(jobId, paymentId);

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
    console.log('Webhook body:', JSON.stringify(req.body, null, 2));

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

      console.log('Lead data being created:', JSON.stringify(leadData, null, 2));

      // Create customer and engagement
      const { customer, engagement } = await createCustomerAndEngagement(leadData);

      console.log(`✓ Customer & Engagement created from call: ${engagement.id} - ${leadData.name}`);

      // Send notification to admin
      try {
        // Show more of the notes (250 chars instead of 150)
        const notesPreview = leadData.notes ? `\n${leadData.notes.substring(0, 250)}${leadData.notes.length > 250 ? '...' : ''}` : '';

        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `🆕 NEW LEAD from phone call!\n\nName: ${leadData.name}\nPhone: ${leadData.phone}\nLocation: ${leadData.location || 'N/A'}${notesPreview}\n\nView in Airtable`,
          { leadId: engagement.id }
        );
      } catch (smsError) {
        console.error('Error sending notification SMS:', smsError);
      }

      res.status(200).json({ success: true, leadId: engagement.id, customerId: customer.id });
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

    // Check if this is a YES/NO response from a tech
    const bodyLower = (Body || '').toLowerCase().trim();
    if (bodyLower === 'yes' || bodyLower === 'no') {
      // Try to find tech by phone
      try {
        const tech = await airtableService.getTechByPhone(clientPhone);
        if (tech) {
          console.log(`📋 Tech ${tech.fields.Name} responded: ${bodyLower.toUpperCase()}`);

          // Find the most recent lead with availability requested
          // For now, we'll notify admin - they can manually link it
          await twilioService.sendSMS(
            process.env.ADMIN_PHONE,
            `📋 ${tech.fields.Name} replied ${bodyLower.toUpperCase()} to availability check.\n\nNote: They replied via SMS instead of clicking the link. Check which lead this is for and update manually.`,
            { from: clientPhone }
          );

          // Respond to tech
          return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks! Your response has been recorded.</Message></Response>');
        }
      } catch (error) {
        console.error('Error checking for tech:', error);
      }
    }

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
        status: 'Delivered',
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
