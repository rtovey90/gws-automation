const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');
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
      actualLead: true, // Form/Call submissions are real leads
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

    // Proposal payment workflow
    if (paymentObject.metadata?.type === 'proposal') {
      const proposalId = paymentObject.metadata.proposal_id;
      const projectNumber = paymentObject.metadata.project_number;
      console.log(`✓ Proposal payment received: #${projectNumber} (${proposalId})`);

      try {
        await airtableService.updateProposal(proposalId, {
          Status: 'Paid',
          'Paid At': new Date().toISOString(),
        });
        console.log('✓ Proposal status updated to Paid');

        // Notify admin
        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `💰 PROPOSAL PAID! Project #${projectNumber}\n\nCustomer: ${paymentObject.metadata.customer_name || 'Unknown'}\nAmount: $${(paymentObject.amount_total || 0) / 100}\n\nTime to order equipment!`
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
        // Notify admin
        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `🎉 OTO UPGRADE PURCHASED!\n\nProject #${projectNumber}\nType: ${otoType}\nAmount: $${(paymentObject.amount_total || 0) / 100}`
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

      // Update engagement status to Payment Received
      await airtableService.updateEngagement(engagementId, {
        Status: 'Payment Received ✅'
      });
      console.log(`✓ Engagement status updated to Payment Received (Payment ID: ${paymentId})`);

      // Log activity
      airtableService.logActivity(engagementId, 'Payment received via Stripe');

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

    const { isLead, name, location, email, phone, mentionedPhone, notes, transcript, callDirection } = req.body;

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
            content: `Call transcript:\n\n${transcript || notes || 'No transcript available'}`,
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
          content: `Call transcript:\n\n${transcript || notes || 'No transcript available'}`,
          status: 'Received',
          engagementId: engagement.id,
          customerId: customer.id
        });
        console.log(`✓ ${direction} call logged to Messages table`);
      } catch (logError) {
        console.error('Error logging call to Messages:', logError);
      }

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
            content: `Call transcript:\n\n${transcript}`,
            status: 'Received',
            customerId: customer ? customer.id : null
          });
          console.log(`✓ Non-lead ${direction} call logged to Messages table`);
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
          await twilioService.sendSMS(
            process.env.ADMIN_PHONE,
            `📋 ${techName} replied ${bodyLower.toUpperCase()} to availability check.${engagementId ? '' : '\n\nNote: Could not find which engagement this is for — check manually.'}`,
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

      // Unknown number - message is already logged to Messages table
      // User will see it in Messages inbox even without a customer match
      console.log('✓ Message from unknown number logged - visible in Messages inbox');

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

    // Send notification to admin
    try {
      const photoCount = cloudinaryAttachments.length || mediaUrls.length;
      const photoText = photoCount > 0 ? `\n📷 ${photoCount} photo(s) saved to engagement` : '';

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
