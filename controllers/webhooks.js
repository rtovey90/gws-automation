const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const airtableService = require('../services/airtable.service');
const stripeService = require('../services/stripe.service');
const twilioService = require('../services/twilio.service');
const pushover = require('../services/pushover.service');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (same pattern as uploads.js)
const cloudinaryUrl = process.env.CLOUDINARY_URL;
let cloudinaryConfig = null;

if (cloudinaryUrl) {
  try {
    const parsed = new URL(cloudinaryUrl);
    cloudinaryConfig = {
      cloud_name: parsed.hostname,
      api_key: decodeURIComponent(parsed.username),
      api_secret: decodeURIComponent(parsed.password),
      secure: true,
    };
  } catch (error) {
    console.error('Invalid CLOUDINARY_URL format. Falling back to discrete variables.');
  }
}

if (!cloudinaryConfig) {
  cloudinaryConfig = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  };
}

cloudinary.config(cloudinaryConfig);

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
    // Skip lead creation for internal/known numbers
    if (data.phone) {
      const normalized = normalizePhone(data.phone);
      const adminPhone = normalizePhone(process.env.ADMIN_PHONE);
      const twilioPhone = normalizePhone(process.env.TWILIO_PHONE_NUMBER);

      // Never create leads for admin or Twilio number
      if (normalized === adminPhone || normalized === twilioPhone) {
        console.log(`⛔ Skipping lead creation — internal number: ${data.phone}`);
        return null;
      }

      // Never create leads for known techs
      try {
        const tech = await airtableService.getTechByPhone(normalized);
        if (tech) {
          const techName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || 'Tech';
          console.log(`⛔ Skipping lead creation — known tech: ${techName} (${data.phone})`);
          return null;
        }
      } catch (err) {
        console.error('Error checking tech phone:', err);
      }
    }

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
      console.log(`🔍 Checking for existing customer with phone: ${data.phone}`);
      customer = await airtableService.getCustomerByPhone(data.phone);
    } else {
      console.warn('⚠️ WARNING: No phone number provided in lead data!');
    }

    // If customer doesn't exist, create them
    if (!customer) {
      console.log('🆕 Creating new customer');

      // Helper to detect phone type
      const detectPhoneType = (phoneNum) => {
        if (!phoneNum) return { isMobile: false, isLandline: false };
        const normalized = phoneNum.replace(/[\s\-\(\)]/g, '');
        // Mobile: starts with 04 or +614
        const isMobile = normalized.startsWith('04') || normalized.startsWith('+614');
        // Landline: starts with 02, 03, 07, 08 or +612, +613, +617, +618
        const isLandline = /^(0[2378]|\+61[2378])/.test(normalized);
        return { isMobile, isLandline, normalized };
      };

      // Detect type of primary phone (caller's number)
      const primaryType = detectPhoneType(data.phone);
      console.log(`📱 Primary phone: ${data.phone} - ${primaryType.isMobile ? 'MOBILE' : primaryType.isLandline ? 'LANDLINE' : 'UNKNOWN'}`);

      // Detect type of mentioned phone (number said during call)
      const mentionedType = detectPhoneType(data.mentionedPhone);
      if (data.mentionedPhone) {
        console.log(`📱 Mentioned phone: ${data.mentionedPhone} - ${mentionedType.isMobile ? 'MOBILE' : mentionedType.isLandline ? 'LANDLINE' : 'UNKNOWN'}`);
      }

      // Determine which phone goes where
      // Priority: Put caller's number in appropriate field, then fill in mentioned number if different type
      let phoneField = ''; // Landline field
      let mobileField = ''; // Mobile field

      // First, assign primary phone to its appropriate field
      if (primaryType.isMobile) {
        mobileField = data.phone;
      } else if (primaryType.isLandline) {
        phoneField = data.phone;
      } else if (data.phone) {
        // Unknown type - assume mobile (most common for leads)
        mobileField = data.phone;
      }

      // Then, if mentioned phone exists and is different type, add it
      if (data.mentionedPhone && data.mentionedPhone !== data.phone) {
        if (mentionedType.isMobile && !mobileField) {
          mobileField = data.mentionedPhone;
        } else if (mentionedType.isLandline && !phoneField) {
          phoneField = data.mentionedPhone;
        } else if (!mobileField && !phoneField) {
          // Both empty, put mentioned in mobile
          mobileField = data.mentionedPhone;
        }
      }

      if (!data.phone && !data.mentionedPhone) {
        console.error('❌ ERROR: Cannot create customer - no phone number provided!');
      }

      console.log(`📞 Final assignment: Phone (landline)=${phoneField || 'empty'}, Mobile=${mobileField || 'empty'}`);

      const customerData = {
        firstName: firstName,
        lastName: lastName,
        phone: phoneField,
        mobilePhone: mobileField,
        email: data.email || '',
        address: data.address || data.location || '',
        notes: '',
      };

      console.log(`💾 Creating customer with data:`, JSON.stringify({
        ...customerData,
        phone: customerData.phone ? 'SET' : 'EMPTY',
        mobilePhone: customerData.mobilePhone ? 'SET' : 'EMPTY'
      }));

      customer = await airtableService.createCustomer(customerData);

      console.log(`✓ Customer created: ${customer.id} with ${mobileField ? 'mobile' : ''} ${phoneField ? 'landline' : ''} ${!mobileField && !phoneField ? 'NO' : ''} number(s)`);

      // Verify phone was actually saved
      const verifyPhone = customer.fields['Mobile Phone'] || customer.fields.Phone;
      if (!verifyPhone) {
        console.error(`❌ CRITICAL: Customer ${customer.id} created but phone number NOT saved!`);
      } else {
        console.log(`✓ Verified: Phone ${verifyPhone} saved to Airtable`);
      }
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
      actualLead: false, // Admin manually marks as Actual Lead from Airtable
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
    const result = await createCustomerAndEngagement(leadData);

    if (!result) {
      return res.status(200).json({ success: true, skipped: true, reason: 'Internal/known number' });
    }

    const { customer, engagement } = result;

    console.log(`✓ Customer & Engagement created: ${engagement.id} - ${leadData.name}`);

    // Send push notification to admin
    const notePreview = leadData.notes ? `\nMessage: ${leadData.notes.substring(0, 100)}${leadData.notes.length > 100 ? '...' : ''}` : '';
    pushover.notify(
      'New Lead — Website Form',
      `Name: ${leadData.name}\nPhone: ${leadData.phone}\nEmail: ${leadData.email || 'N/A'}\nAddress: ${leadData.address || 'N/A'}\nService: ${leadData.systemType || 'Other'}${notePreview}`
    );

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

    // Proposal payment workflow
    if (paymentObject.metadata?.type === 'proposal') {
      const proposalId = paymentObject.metadata.proposal_id;
      const projectNumber = paymentObject.metadata.project_number;
      console.log(`✓ Proposal payment received: #${projectNumber} (${proposalId})`);

      try {
        const proposalAmount = (paymentObject.amount_total || 0) / 100;

        await airtableService.updateProposal(proposalId, {
          Status: 'Paid',
          'Paid At': new Date().toISOString(),
        });
        console.log('✓ Proposal status updated to Paid');

        // Write payment amount to linked Engagement
        try {
          const proposal = await airtableService.getProposal(proposalId);
          const engagementIds = proposal.fields['Engagement'];
          if (engagementIds && engagementIds.length > 0) {
            const chargeId = paymentObject.payment_intent || paymentObject.id || '';
            const engUpdate = {
              'Total Invoiced': proposalAmount,
              Status: 'Payment Received ✅',
              'Payment Date': new Date().toISOString().split('T')[0],
              'Stripe Charge ID': chargeId,
            };
            // Get Stripe fee
            try {
              if (chargeId) {
                const fee = await stripeService.getStripeFee(chargeId);
                if (fee > 0) engUpdate['Stripe Fee'] = fee;
              }
            } catch (feeErr) { console.error('Fee fetch error:', feeErr); }

            await airtableService.updateEngagement(engagementIds[0], engUpdate);
            airtableService.logActivity(engagementIds[0], `Proposal #${projectNumber} paid: $${proposalAmount.toFixed(2)}`);
            console.log(`✓ Engagement ${engagementIds[0]} updated with $${proposalAmount}`);
          }
        } catch (engErr) {
          console.error('Error updating engagement after proposal payment:', engErr);
        }

        // Notify admin
        pushover.notify(
          `Proposal Paid — #${projectNumber}`,
          `Customer: ${paymentObject.metadata.customer_name || 'Unknown'}\nAmount: $${proposalAmount}\n\nTime to order equipment!`
        );
      } catch (err) {
        console.error('Error updating proposal after payment:', err);
      }

      return;
    }

    // OTO (post-purchase upgrade) payment workflow
    if (paymentObject.metadata?.type === 'oto') {
      const proposalId = paymentObject.metadata.proposal_id;
      const otoType = paymentObject.metadata.oto_type;
      const projectNumber = paymentObject.metadata.project_number;
      console.log(`✓ OTO payment received: ${otoType} for #${projectNumber}`);

      try {
        const otoAmount = (paymentObject.amount_total || paymentObject.amount || 0) / 100;

        // Add OTO amount to linked Engagement's Total Invoiced
        try {
          const proposal = await airtableService.getProposal(proposalId);
          const engagementIds = proposal.fields['Engagement'];
          if (engagementIds && engagementIds.length > 0) {
            const engagement = await airtableService.getEngagement(engagementIds[0]);
            const existingInvoiced = parseFloat(engagement.fields['Total Invoiced']) || 0;
            const existingFee = parseFloat(engagement.fields['Stripe Fee']) || 0;
            const chargeId = paymentObject.payment_intent || paymentObject.id || '';
            const engUpdate = {
              'Total Invoiced': existingInvoiced + otoAmount,
            };
            // Get OTO Stripe fee and add to existing
            try {
              if (chargeId) {
                const fee = await stripeService.getStripeFee(chargeId);
                if (fee > 0) engUpdate['Stripe Fee'] = existingFee + fee;
              }
            } catch (feeErr) { console.error('OTO fee fetch error:', feeErr); }

            await airtableService.updateEngagement(engagementIds[0], engUpdate);
            airtableService.logActivity(engagementIds[0], `OTO upgrade paid (${otoType}): $${otoAmount.toFixed(2)}`);
            console.log(`✓ Engagement ${engagementIds[0]} Total Invoiced updated: $${existingInvoiced} + $${otoAmount}`);
          }
        } catch (engErr) {
          console.error('Error updating engagement after OTO payment:', engErr);
        }

        // Notify admin
        pushover.notify(
          `OTO Upgrade — #${projectNumber}`,
          `Type: ${otoType}\nAmount: $${otoAmount}`
        );
      } catch (err) {
        console.error('Error handling OTO payment:', err);
      }

      return;
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

      // Update engagement status and record payment amount
      const paymentAmount = (paymentObject.amount_total || paymentObject.amount || 0) / 100;
      const chargeId = paymentId || '';
      const paymentDate = new Date().toISOString().split('T')[0];

      // Build payment log entry
      let payments = [];
      try { payments = JSON.parse(engagement.fields['Payment Log'] || '[]'); } catch (e) { payments = []; }
      const existingInvoiced = parseFloat(engagement.fields['Total Invoiced']) || 0;

      // Determine payment type
      const isFirstPayment = payments.length === 0 && existingInvoiced === 0;
      const paymentEntry = {
        type: isFirstPayment ? 'Initial Callout' : 'Additional Work',
        amount: paymentAmount,
        date: paymentDate,
        chargeId: chargeId,
        notes: '',
      };
      payments.push(paymentEntry);
      const newTotal = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

      const engUpdate = {
        Status: 'Payment Received ✅',
        'Total Invoiced': newTotal,
        'Payment Date': paymentDate,
        'Stripe Charge ID': chargeId,
        'Payment Log': JSON.stringify(payments),
      };
      // Get Stripe fee
      let fee = 0;
      try {
        if (chargeId) {
          fee = await stripeService.getStripeFee(chargeId);
          if (fee > 0) {
            const existingFee = parseFloat(engagement.fields['Stripe Fee']) || 0;
            engUpdate['Stripe Fee'] = existingFee + fee;
          }
        }
      } catch (feeErr) { console.error('Fee fetch error:', feeErr); }

      await airtableService.updateEngagement(engagementId, engUpdate);
      console.log(`✓ Engagement updated: Payment Received, $${paymentAmount} (Payment ID: ${paymentId})`);

      // Log activity
      airtableService.logActivity(engagementId, `Payment received via Stripe: $${paymentAmount.toFixed(2)}`);

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

    const { isLead, name, location, email, phone, mentionedPhone, notes, transcript, callDirection, handledBy } = req.body;

    // Log phone numbers explicitly
    if (phone) {
      console.log(`📞 CALLER PHONE NUMBER: ${phone}`);
    } else {
      console.error(`❌ ERROR: NO PHONE NUMBER in webhook payload!`);
    }
    if (mentionedPhone) {
      console.log(`📱 MENTIONED PHONE NUMBER: ${mentionedPhone}`);
    }

    // Only create lead if flagged as new lead
    if (isLead) {
      const leadData = {
        name: name || 'Unknown',
        phone: phone || '',
        mentionedPhone: mentionedPhone || '', // Additional phone mentioned during call
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
      const result = await createCustomerAndEngagement(leadData);

      if (!result) {
        // Still log the call even though we skipped lead creation
        try {
          const direction = callDirection || 'Inbound';
          const ourNumber = process.env.TWILIO_PHONE_NUMBER || '+61485001498';
          await airtableService.logMessage({
            direction: direction,
            type: 'Call',
            from: direction === 'Inbound' ? phone : ourNumber,
            to: direction === 'Inbound' ? ourNumber : phone,
            content: `[Handled by ${handledBy || 'Unknown'}]\n\nCall transcript:\n\n${transcript || notes || 'No transcript available'}`,
            status: 'Received',
          });
        } catch (logError) {
          console.error('Error logging skipped call:', logError);
        }
        return res.status(200).json({ success: true, skipped: true, reason: 'Internal/known number' });
      }

      const { customer, engagement } = result;

      console.log(`✓ Customer & Engagement created from call: ${engagement.id} - ${leadData.name}`);

      // Log call to Messages table
      try {
        const direction = callDirection || 'Inbound'; // Default to Inbound if not specified
        const ourNumber = process.env.TWILIO_PHONE_NUMBER || '+61485001498';

        await airtableService.logMessage({
          direction: direction,
          type: 'Call',
          from: direction === 'Inbound' ? phone : ourNumber,
          to: direction === 'Inbound' ? ourNumber : phone,
          content: `[Handled by ${handledBy || 'Unknown'}]\n\nCall transcript:\n\n${transcript || notes || 'No transcript available'}`,
          status: 'Received',
          engagementId: engagement.id,
          customerId: customer.id
        });
        console.log(`✓ ${direction} call logged to Messages table (handled by ${handledBy || 'Unknown'})`);
      } catch (logError) {
        console.error('Error logging call to Messages:', logError);
      }

      // Send push notification to admin
      const callNotesPreview = leadData.notes ? `\n${leadData.notes.substring(0, 250)}${leadData.notes.length > 250 ? '...' : ''}` : '';
      pushover.notify(
        `New Lead — Phone Call (${handledBy || 'Unknown'})`,
        `Name: ${leadData.name}\nPhone: ${leadData.phone}\nHandled by: ${handledBy || 'Unknown'}\nLocation: ${leadData.location || 'N/A'}${callNotesPreview}`
      );

      res.status(200).json({ success: true, leadId: engagement.id, customerId: customer.id });
    } else {
      console.log('ℹ️ Call transcript received but not flagged as lead');

      // Still log the call even if not a lead
      if (phone && transcript) {
        try {
          // Check if phone belongs to existing customer
          const normalizedPhone = normalizePhone(phone);
          const customer = await airtableService.getCustomerByPhone(normalizedPhone);

          const direction = callDirection || 'Inbound';
          const ourNumber = process.env.TWILIO_PHONE_NUMBER || '+61485001498';

          await airtableService.logMessage({
            direction: direction,
            type: 'Call',
            from: direction === 'Inbound' ? phone : ourNumber,
            to: direction === 'Inbound' ? ourNumber : phone,
            content: `[Handled by ${handledBy || 'Unknown'}]\n\nCall transcript:\n\n${transcript}`,
            status: 'Received',
            customerId: customer ? customer.id : null
          });
          console.log(`✓ Non-lead ${direction} call logged to Messages table (handled by ${handledBy || 'Unknown'})`);
        } catch (logError) {
          console.error('Error logging call to Messages:', logError);
        }
      }

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
          const techName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || 'Unknown Tech';
          console.log(`📋 Tech ${techName} responded: ${bodyLower.toUpperCase()}`);

          // Find which engagement this tech was sent an availability check for
          const recentMessage = await airtableService.getRecentOutboundMessageForTech(tech.id);
          const engagementId = recentMessage?.fields?.['Related Lead']?.[0];

          if (engagementId) {
            // Update engagement exactly like the link-click handler does
            const engagement = await airtableService.getEngagement(engagementId);
            if (engagement) {
              const currentResponses = engagement.fields['Tech Availability Responses'] || '';
              const updatedResponses = currentResponses
                ? `${currentResponses}\n${techName} - ${bodyLower.toUpperCase()} (${new Date().toLocaleString()})`
                : `${techName} - ${bodyLower.toUpperCase()} (${new Date().toLocaleString()})`;

              const updateFields = {
                'Tech Availability Responses': updatedResponses,
                'Status': 'Tech Availability Check',
              };

              if (bodyLower === 'yes') {
                const currentAvailableTechs = engagement.fields['Available Techs'] || [];
                updateFields['Available Techs'] = [...currentAvailableTechs, tech.id];
              } else {
                const currentAvailableTechs = engagement.fields['Available Techs'] || [];
                updateFields['Available Techs'] = currentAvailableTechs.filter(id => id !== tech.id);
              }

              await airtableService.updateEngagement(engagementId, updateFields);
              console.log(`✓ Recorded ${bodyLower.toUpperCase()} response from ${techName} for engagement ${engagementId}`);
            }
          }

          // Notify admin
          pushover.notify(
            `Tech Reply — ${techName}`,
            `${techName} replied ${bodyLower.toUpperCase()} to availability check.${engagementId ? '' : '\n\nNote: Could not find which engagement this is for.'}`
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
        const engagementIds = customer.fields['Engagements 2'] || customer.fields.Engagements;
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

      // Check if sender is a tech (even if not a customer)
      let tech = null;
      try {
        tech = await airtableService.getTechByPhone(clientPhone);
      } catch (error) {
        console.log('No tech match for phone:', clientPhone);
      }

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
          customerId: null,
          techId: tech ? tech.id : null,
        });
        console.log('✓ Message logged (no customer match)');
      } catch (messageError) {
        console.error('Error logging message:', messageError);
      }

      // Notify admin of unknown number message
      pushover.notify(
        `SMS — Unknown Number`,
        `From: ${clientPhone}\n\n${Body || '(media only)'}`
      );

      // Respond to Twilio (required to prevent retries)
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Handle media (photos) if present
    const mediaUrls = [];
    const cloudinaryAttachments = [];
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

      // Download from Twilio and upload to Cloudinary for permanent URLs
      const twilioAuth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const engagementFolder = engagement ? engagement.id : 'unmatched';

      for (let i = 0; i < mediaUrls.length; i++) {
        try {
          console.log(`📥 Downloading media ${i + 1} from Twilio...`);
          const response = await fetch(mediaUrls[i].url, {
            headers: { Authorization: `Basic ${twilioAuth}` },
          });

          if (!response.ok) {
            console.error(`❌ Failed to download media ${i + 1}: ${response.status}`);
            continue;
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          const base64Data = `data:${mediaUrls[i].contentType};base64,${buffer.toString('base64')}`;

          console.log(`📤 Uploading media ${i + 1} to Cloudinary (${(buffer.length / 1024 / 1024).toFixed(2)}MB)...`);
          const uploadResult = await cloudinary.uploader.upload(base64Data, {
            folder: `gws-leads/${engagementFolder}`,
            resource_type: 'auto',
            public_id: `mms-${Date.now()}-${i}`,
          });

          console.log(`✓ Uploaded to Cloudinary: ${uploadResult.secure_url}`);
          cloudinaryAttachments.push({ url: uploadResult.secure_url });
        } catch (uploadError) {
          console.error(`❌ Failed to process media ${i + 1}:`, uploadError.message);
        }
      }

      // Save to engagement if we have photos and an engagement
      if (engagement && cloudinaryAttachments.length > 0) {
        try {
          const existingPhotos = engagement.fields.Photos || [];
          await airtableService.updateEngagement(engagement.id, {
            Photos: [...existingPhotos, ...cloudinaryAttachments],
          });
          console.log(`✓ ${cloudinaryAttachments.length} photo(s) saved to engagement`);
        } catch (photoError) {
          console.error('Error saving photos to engagement:', photoError);
        }
      }
    }

    // Log the message in Messages table
    try {
      // Check if sender is also a tech (some customers might be techs too)
      let tech = null;
      try {
        tech = await airtableService.getTechByPhone(clientPhone);
      } catch (error) {
        console.log('No tech match for phone:', clientPhone);
      }

      // Build content with Cloudinary URLs for display (or Twilio URLs as fallback)
      let messageContent = Body || '';
      if (cloudinaryAttachments.length > 0) {
        const mediaLinks = cloudinaryAttachments.map(m => m.url).join('\n');
        messageContent = messageContent ? `${messageContent}\n\n[Media]\n${mediaLinks}` : `[Media]\n${mediaLinks}`;
      } else if (mediaUrls.length > 0) {
        const mediaLinks = mediaUrls.map(m => m.url).join('\n');
        messageContent = messageContent ? `${messageContent}\n\n[Media]\n${mediaLinks}` : `[Media]\n${mediaLinks}`;
      }

      await airtableService.logMessage({
        engagementId: engagement ? engagement.id : null,
        direction: 'Inbound',
        type: 'SMS',
        from: clientPhone,
        to: twilioNumber,
        content: messageContent || '(media only)',
        status: 'Received',
        customerId: customer ? customer.id : null,
        techId: tech ? tech.id : null,
      });

      console.log('✓ Message logged in Messages table');
    } catch (messageError) {
      console.error('Error logging message:', messageError);
    }

    // Send push notification to admin
    const photoCount = cloudinaryAttachments.length || mediaUrls.length;
    const photoText = photoCount > 0 ? `\n${photoCount} photo(s) saved` : '';
    pushover.notify(
      `Reply — ${customerName}`,
      `${Body || '(no text)'}${photoText}`
    );

    // Respond to Twilio with empty TwiML (required)
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Error handling Twilio SMS webhook:', error);
    // Still respond to Twilio to prevent retries
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
};

// POST /webhooks/engagement-confirmed — Airtable automation fires when lead is confirmed
exports.handleConfirmationWebhook = async (req, res) => {
  try {
    const { engagementId, type } = req.body;
    if (!engagementId || !type) {
      return res.status(400).json({ error: 'Missing engagementId or type' });
    }

    // Set Lead Type based on confirmation type
    const leadType = type === 'sc' ? 'Service Call' : 'Project';
    await airtableService.updateEngagement(engagementId, { 'Lead Type': leadType });

    const engNumber = await airtableService.assignEngagementNumber(engagementId, type);
    console.log(`Airtable automation: assigned ${engNumber} to ${engagementId}`);

    res.json({ ok: true, engagementNumber: engNumber });
  } catch (error) {
    console.error('Confirmation webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = exports;
