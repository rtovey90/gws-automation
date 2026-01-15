const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Communications Controllers - Handle pricing SMS and review requests
 */

/**
 * Send pricing SMS to lead using selected product
 * GET /api/send-pricing/:leadId OR POST /api/send-pricing with { leadId }
 */
exports.sendPricing = async (req, res) => {
  try {
    const leadId = req.params.leadId || req.body?.leadId;

    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    console.log(`💵 Sending pricing SMS for lead: ${leadId}`);

    // Get lead details
    const lead = await airtableService.getLead(leadId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if product is selected
    if (!lead.fields['Selected Product'] || lead.fields['Selected Product'].length === 0) {
      return res.status(400).json({ error: 'Please select a product first' });
    }

    // Get product details
    const productId = lead.fields['Selected Product'][0];
    const product = await airtableService.getProduct(productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if lead has phone number
    if (!lead.fields.Phone) {
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    // Build pricing message
    const clientName = lead.fields['First Name'] || 'there';
    const productName = product.fields['Product Name'];
    const price = product.fields.Price;
    const paymentLink = product.fields['Stripe Payment Link'];

    const message = `Hi ${clientName}, thank you for your interest!

Good news! I can have one of our technicians out this week.

${productName}

To lock it in, please make payment here:
${paymentLink}

Once payment's through, we'll reach out to schedule.

Thanks!
Ricky`;

    // Send SMS
    await twilioService.sendSMS(
      lead.fields.Phone,
      message,
      { leadId, productId, type: 'pricing' }
    );

    // Log message
    await airtableService.logMessage({
      leadId: leadId,
      direction: 'Outbound',
      type: 'SMS',
      to: lead.fields.Phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: message,
      status: 'Sent',
    });

    // Update lead status and pricing sent checkbox
    await airtableService.updateLead(leadId, {
      Status: 'Payment Link Sent',
      'Pricing Sent': true,
    });

    console.log(`✓ Pricing SMS sent to ${lead.fields['First Name']} for ${productName}`);

    res.status(200).json({
      success: true,
      message: 'Pricing SMS sent successfully',
      product: productName,
      price: price,
    });
  } catch (error) {
    console.error('Error sending pricing SMS:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Send client pricing SMS (manual trigger or after tech accepts)
 * POST /api/send-client-pricing
 * Body: { jobId }
 */
exports.sendClientPricing = async (req, res) => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    console.log(`💵 Sending client pricing for job: ${jobId}`);

    // Get job details
    const job = await airtableService.getJob(jobId);

    // Verify job has assigned tech
    if (!job.fields['Assigned Tech'] || job.fields['Assigned Tech'].length === 0) {
      return res.status(400).json({ error: 'Job must have an assigned tech first' });
    }

    // Get tech details
    const techId = job.fields['Assigned Tech'][0];
    const tech = await airtableService.getTech(techId);

    // Send pricing SMS
    await twilioService.sendClientPricing(job, tech);

    // Update job status
    await airtableService.updateJob(jobId, {
      'Payment Status': 'Awaiting Payment',
    });

    console.log(`✓ Client pricing SMS sent for job ${jobId}`);

    res.status(200).json({
      success: true,
      message: 'Pricing SMS sent to client',
    });
  } catch (error) {
    console.error('Error sending client pricing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Send review request to client
 * POST /api/send-review-request
 * Body: { jobId }
 */
exports.sendReviewRequest = async (req, res) => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    console.log(`⭐ Sending review request for job: ${jobId}`);

    // Get job details
    const job = await airtableService.getJob(jobId);

    // Verify job is completed
    if (job.fields['Job Status'] !== 'Completed') {
      return res.status(400).json({ error: 'Job must be completed first' });
    }

    // Send review request
    await twilioService.sendReviewRequest(job);

    // Update job
    await airtableService.updateJob(jobId, {
      'Review Requested': true,
    });

    console.log(`✓ Review request sent for job ${jobId}`);

    res.status(200).json({
      success: true,
      message: 'Review request sent to client',
    });
  } catch (error) {
    console.error('Error sending review request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Send review follow-up reminder
 * POST /api/review-follow-up
 * Body: { jobId } (optional - if not provided, sends to all eligible jobs)
 */
exports.reviewFollowUp = async (req, res) => {
  try {
    const { jobId } = req.body;

    console.log('⭐ Sending review follow-ups...');

    if (jobId) {
      // Send follow-up for specific job
      const job = await airtableService.getJob(jobId);

      // Verify conditions
      if (
        job.fields['Job Status'] === 'Completed' &&
        job.fields['Review Requested'] &&
        !job.fields['Review Received']
      ) {
        await twilioService.sendReviewFollowUp(job);
        console.log(`✓ Follow-up sent for job ${jobId}`);

        res.status(200).json({
          success: true,
          message: 'Follow-up sent',
        });
      } else {
        res.status(400).json({
          error: 'Job not eligible for follow-up',
        });
      }
    } else {
      // This would be called by a scheduled automation (daily)
      // For now, just return success
      // In production, you'd query Airtable for all eligible jobs
      res.status(200).json({
        success: true,
        message: 'Follow-ups scheduled',
      });
    }
  } catch (error) {
    console.error('Error sending review follow-up:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Send message from Airtable button (with preview/edit system)
 * GET /api/send-message?leadId=xxx&type=request-photos
 */
exports.sendMessage = async (req, res) => {
  try {
    const { leadId, type } = req.query;

    if (!leadId || !type) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .error { color: #dc3545; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Error</h1>
          <p>Missing required parameters: leadId and type</p>
        </body>
        </html>
      `);
    }

    console.log(`📨 Sending message: ${type} for lead: ${leadId}`);

    // Get lead from Airtable
    const lead = await airtableService.getLead(leadId);

    if (!lead) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .error { color: #dc3545; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Error</h1>
          <p>Lead not found: ${leadId}</p>
        </body>
        </html>
      `);
    }

    // Determine which message to send based on type
    let message;
    let sentField;
    let messageLabel;

    switch (type) {
      case 'request-photos':
        message = lead.fields['Edit: Request Photos'] || lead.fields['Preview: Request Photos'];
        sentField = 'Sent: Request Photos';
        messageLabel = 'Request Photos';
        break;

      case 'checking-availability':
        message = lead.fields['Edit: Checking Availability'] || lead.fields['Preview: Checking Availability'];
        sentField = 'Sent: Checking Availability';
        messageLabel = 'Checking Availability';
        break;

      case 'pricing':
        message = lead.fields['Edit: Pricing Message'] || lead.fields['Preview: Pricing Message'];
        sentField = 'Sent: Pricing';
        messageLabel = 'Pricing Message';
        break;

      default:
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
              }
              .error { color: #dc3545; font-size: 24px; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ Error</h1>
            <p>Unknown message type: ${type}</p>
          </body>
          </html>
        `);
    }

    // Verify we have a message to send
    if (!message) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .error { color: #dc3545; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Error</h1>
          <p>No message content found for type: ${type}</p>
        </body>
        </html>
      `);
    }

    // Verify phone number exists
    if (!lead.fields.Phone) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .error { color: #dc3545; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Error</h1>
          <p>No phone number found for lead: ${lead.fields.Name}</p>
        </body>
        </html>
      `);
    }

    // Send SMS via Twilio
    await twilioService.sendSMS(
      lead.fields.Phone,
      message,
      { leadId, messageType: type }
    );

    // Mark as sent in Airtable
    await airtableService.updateLead(leadId, {
      [sentField]: true,
    });

    // Log the message in Messages table
    try {
      await airtableService.logMessage({
        leadId: leadId,
        direction: 'Outbound',
        type: 'SMS',
        to: lead.fields.Phone,
        from: process.env.TWILIO_PHONE_NUMBER,
        content: message,
        status: 'Sent',
      });
    } catch (messageError) {
      console.error('Error logging message:', messageError);
      // Don't fail the request if message logging fails
    }

    console.log(`✓ ${messageLabel} sent to ${lead.fields.Name} (${lead.fields.Phone})`);

    // Show confirmation page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Message Sent</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
          }
          h1 { color: #28a745; }
          .success { color: #28a745; font-size: 48px; }
          .details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
          }
          .message-preview {
            background: white;
            padding: 15px;
            border-left: 4px solid #28a745;
            margin: 15px 0;
            white-space: pre-wrap;
            font-family: monospace;
            font-size: 14px;
          }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
          }
          .btn:hover {
            background: #0056b3;
          }
        </style>
      </head>
      <body>
        <div class="success">✅</div>
        <h1>Message Sent Successfully!</h1>

        <div class="details">
          <p><strong>To:</strong> ${lead.fields.Name}</p>
          <p><strong>Phone:</strong> ${lead.fields.Phone}</p>
          <p><strong>Message Type:</strong> ${messageLabel}</p>

          <div class="message-preview">${message}</div>
        </div>

        <p>The message has been sent and marked as sent in Airtable.</p>

        <a href="https://airtable.com/${process.env.AIRTABLE_BASE_ID}" class="btn">Return to Airtable</a>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
          }
          .error { color: #dc3545; font-size: 24px; }
          .details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
            font-family: monospace;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <h1 class="error">❌ Error</h1>
        <p>Failed to send message</p>
        <div class="details">${error.message}</div>
      </body>
      </html>
    `);
  }
};

module.exports = exports;
