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
      leadType: data.leadType || 'Service Call', // Service Call or Project
      systemType: data.systemType || 'Other', // CCTV, Alarm, Intercom, etc.
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

    // Map service types to match exact Airtable System Type options
    const systemTypeMap = {
      cctv: 'CCTV',
      alarms: 'Alarm',
      'access-control': 'Access Control',
      intercom: 'Intercom',
      complete: 'Other',
      'not-sure': 'Other',
    };

    // Prepare data for customer + engagement creation
    // Support both old form structure (firstName/suburb) and new form (firstName/propertyAddress)
    const leadData = {
      name: formData.firstName || formData.name || 'Unknown',
      phone: formData.phone,
      email: formData.email,
      businessName: formData.companyName || formData.company || '',
      address: formData.propertyAddress || (formData.suburb ? `${formData.suburb}, Perth` : ''),
      location: formData.propertyAddress || formData.suburb || '',
      source: 'Form',
      systemType: systemTypeMap[formData.services] || 'Other',
      leadType: 'Service Call', // Forms are typically service calls
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
        `🆕 NEW LEAD from website form!\n\nName: ${leadData.name}\nPhone: ${leadData.phone}\nEmail: ${leadData.email || 'N/A'}\nAddress: ${leadData.address || 'N/A'}\nService: ${leadData.systemType || 'Other'}${message}\n\nView in Airtable`,
        { leadId: engagement.id } // Keep as leadId for backwards compatibility with twilioService
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
    let engagementId, jobId, paymentId;

    if (eventType === 'session') {
      // For checkout sessions, metadata is directly on the object
      engagementId = paymentObject.metadata?.lead_id; // Still named lead_id in Stripe metadata for backwards compatibility
      jobId = paymentObject.metadata?.job_id;
      paymentId = paymentObject.payment_intent; // Session has payment_intent ID
      console.log(`Session metadata - lead_id: ${engagementId}, job_id: ${jobId}`);
    } else {
      // For payment intents, metadata is on the object (old workflow)
      engagementId = paymentObject.metadata?.lead_id; // Still named lead_id in Stripe metadata for backwards compatibility
      jobId = paymentObject.metadata?.job_id;
      paymentId = paymentObject.id;
      console.log(`PaymentIntent metadata - lead_id: ${engagementId}, job_id: ${jobId}`);
    }

    // New workflow: Payment for an Engagement → Update Engagement status (no Job creation)
    if (engagementId) {
      console.log(`✓ Payment received for engagement: ${engagementId}`);

      // Get the engagement
      const engagement = await airtableService.getEngagement(engagementId);

      if (!engagement) {
        console.error(`❌ Engagement not found: ${engagementId}`);
        return;
      }

      const customerName = engagement.fields['First Name (from Customer)'] || 'Unknown';
      console.log(`✓ Found engagement: ${customerName}`);

      // Update engagement status to Payment Received
      await airtableService.updateEngagement(engagementId, {
        Status: 'Payment Received ✅'
      });
      console.log(`✓ Engagement status updated to Payment Received (Payment ID: ${paymentId})`);

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
        systemType: 'Other', // Can't determine from call transcript
        leadType: 'Service Call', // Calls are typically service calls
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
          { leadId: engagement.id } // Keep as leadId for backwards compatibility with twilioService
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
 * Normalize phone number to E.164 format for comparison
 * Handles: 0456123456, +61456123456, 61456123456, 0456 123 456, etc.
 */
function normalizePhone(phone) {
  if (!phone) return null;

  // Remove all spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // If starts with 0, replace with +61
  if (cleaned.startsWith('0')) {
    cleaned = '+61' + cleaned.substring(1);
  }
  // If starts with 61 but no +, add it
  else if (cleaned.startsWith('61') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  // If doesn't start with +61, assume it's missing
  else if (!cleaned.startsWith('+')) {
    cleaned = '+61' + cleaned;
  }

  return cleaned;
}

/**
 * Handle incoming SMS/MMS from Twilio
 * POST /webhooks/twilio-sms
 */
exports.handleTwilioSMS = async (req, res) => {
  try {
    console.log('📨 Twilio SMS webhook received');
    console.log('Full webhook body:', JSON.stringify(req.body, null, 2));

    const { From, To, Body, NumMedia, MessageSid } = req.body;

    // Normalize phone numbers for matching
    const clientPhone = normalizePhone(From);
    const twilioNumber = To;

    console.log(`📱 Incoming message from ${From} (normalized: ${clientPhone})`);
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

    // Find customer by phone number, then get their most recent engagement
    let customer = null;
    let engagement = null;
    let customerName = 'Unknown';

    try {
      // Try normalized phone first
      console.log(`🔍 Looking up customer by phone: ${clientPhone}`);
      customer = await airtableService.getCustomerByPhone(clientPhone);

      // If not found and phone was in different format, try original
      if (!customer && From !== clientPhone) {
        console.log(`🔍 Trying original format: ${From}`);
        customer = await airtableService.getCustomerByPhone(From);
      }

      if (customer) {
        console.log(`✓ Found customer: ${customer.id}`);

        // Get customer name
        const firstName = customer.fields['First Name'] || '';
        const lastName = customer.fields['Last Name'] || '';
        customerName = [firstName, lastName].filter(Boolean).join(' ') || clientPhone;

        // Get most recent engagement for this customer
        const engagementIds = customer.fields.Engagements;
        if (engagementIds && engagementIds.length > 0) {
          // Get the first linked engagement (most recent)
          engagement = await airtableService.getEngagement(engagementIds[0]);
          console.log(`✓ Found engagement: ${engagement.id}`);
        } else {
          console.log(`⚠️ Customer found but no engagements linked`);
        }
      } else {
        console.log(`❌ No customer found for phone: ${clientPhone} or ${From}`);
      }
    } catch (error) {
      console.error('Error finding customer by phone:', error);
    }

    // Log the message even if customer not found
    if (!customer) {
      console.log(`⚠️ No customer found for phone number: ${clientPhone}`);

      // Still log the message to Messages table
      try {
        await airtableService.logMessage({
          engagementId: null,
          direction: 'Inbound',
          type: 'SMS',
          from: clientPhone,
          to: twilioNumber,
          content: Body || '(media only)',
          status: 'Received',
        });
        console.log('✓ Message logged (no customer match)');
      } catch (messageError) {
        console.error('Error logging message:', messageError);
      }

      // Send notification to admin about unknown number
      try {
        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `📨 NEW MESSAGE from unknown number:\n\nFrom: ${clientPhone}\nMessage: ${Body || '(media only)'}\n\nNo matching customer found - may be a new inquiry.`,
          { from: clientPhone }
        );
      } catch (smsError) {
        console.error('Error sending admin notification:', smsError);
      }

      // Respond to Twilio (required to prevent retries)
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

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

      // Add photos to engagement if it exists
      if (engagement) {
        // Add Twilio auth to media URLs for Airtable to download
        const authenticatedUrls = mediaUrls.map(media => ({
          url: `${media.url}?auth=${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
        }));

        // Update engagement with photos (client sent via SMS)
        try {
          // Get existing photos
          const existingPhotos = engagement.fields.Photos || [];

          // Append new photos
          const updatedPhotos = [
            ...existingPhotos,
            ...authenticatedUrls,
          ];

          await airtableService.updateEngagement(engagement.id, {
            Photos: updatedPhotos,
          });

          console.log(`✓ ${mediaUrls.length} photo(s) saved to engagement`);
        } catch (photoError) {
          console.error('Error saving photos to engagement:', photoError);
        }
      }
    }

    // Log the message in Messages table
    try {
      await airtableService.logMessage({
        engagementId: engagement ? engagement.id : null,
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
        `📨 NEW REPLY from ${customerName}:\n\n${Body || '(no text)'}${photoText}\n\nView in Airtable`,
        { leadId: engagement ? engagement.id : null, from: clientPhone } // Keep as leadId for backwards compatibility with twilioService
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
