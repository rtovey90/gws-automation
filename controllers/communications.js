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
    const engagementId = req.params.leadId || req.body?.leadId;

    if (!engagementId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    console.log(`💵 Sending pricing SMS for engagement: ${engagementId}`);

    // Get engagement details
    const lead = await airtableService.getEngagement(engagementId);

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
      { leadId: engagementId, productId, type: 'pricing' }
    );

    // Log message
    await airtableService.logMessage({
      engagementId: engagementId,
      direction: 'Outbound',
      type: 'SMS',
      to: lead.fields.Phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: message,
      status: 'Sent',
    });

    // Update engagement status and pricing sent checkbox
    const engUpdate = {
      Status: 'Payment Link Sent',
      'Pricing Sent': true,
    };
    if (!lead.fields['Quote Sent At']) {
      engUpdate['Quote Sent At'] = new Date().toISOString();
    }
    await airtableService.updateEngagement(engagementId, engUpdate);

    // Log activity
    airtableService.logActivity(engagementId, 'Payment link sent');

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
    const engagementId = req.query.leadId;
    const { type } = req.query;

    if (!engagementId || !type) {
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

    console.log(`📨 Sending message: ${type} for engagement: ${engagementId}`);

    // Get engagement from Airtable
    const lead = await airtableService.getEngagement(engagementId);

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
          <p>Engagement not found: ${engagementId}</p>
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
      { leadId: engagementId, messageType: type }
    );

    // Mark as sent in Airtable
    await airtableService.updateEngagement(engagementId, {
      [sentField]: true,
    });

    // Log the message in Messages table
    try {
      await airtableService.logMessage({
        engagementId: engagementId,
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

/**
 * Show review request form (with editable message)
 * GET /api/send-review-request/:leadId
 */
exports.sendEngagementReviewRequest = async (req, res) => {
  try {
    const engagementId = req.params.leadId;

    if (!engagementId) {
      return res.status(400).send('<h1>Error: Missing engagement ID</h1>');
    }

    console.log(`⭐ Opening review request form for engagement: ${engagementId}`);

    // Get engagement details
    const engagement = await airtableService.getEngagement(engagementId);

    if (!engagement) {
      return res.status(404).send('<h1>Error: Engagement not found</h1>');
    }

    // Get customer phone from lookup fields
    let customerPhone = engagement.fields['Mobile Phone (from Customer)'] || engagement.fields['Phone (from Customer)'];
    if (Array.isArray(customerPhone)) customerPhone = customerPhone[0];
    customerPhone = String(customerPhone || '').trim();

    if (!customerPhone) {
      return res.status(400).send('<h1>Error: Customer has no phone number</h1>');
    }

    // Get customer first name
    let firstName = engagement.fields['First Name (from Customer)'];
    let lastName = engagement.fields['Last Name (from Customer)'];
    if (Array.isArray(firstName)) firstName = firstName[0];
    if (Array.isArray(lastName)) lastName = lastName[0];
    firstName = firstName || 'there';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Client';

    // Get system type for personalized follow-up
    const systemTypes = engagement.fields['System Type'] || [];
    let systemSuggestion = '';
    if (systemTypes.length > 0) {
      // Suggest complementary systems
      const hasAlarm = systemTypes.some(s => s.toLowerCase().includes('alarm'));
      const hasCCTV = systemTypes.some(s => s.toLowerCase().includes('cctv'));
      const hasIntercom = systemTypes.some(s => s.toLowerCase().includes('intercom'));

      if (!hasCCTV) systemSuggestion = 'CCTV';
      else if (!hasAlarm) systemSuggestion = 'an alarm system';
      else if (!hasIntercom) systemSuggestion = 'an intercom';
      else systemSuggestion = 'additional security';
    } else {
      systemSuggestion = 'additional security';
    }

    const reviewLink = 'https://g.page/r/CWLImL52RIBEEBM/review';

    const defaultMessage = `Hey ${firstName}, thanks again for trusting Great White Security.

If you feel you received 5-star service, we'd really appreciate a quick Google review. It helps us get found and only takes about 20 seconds :)

Here's the link: ${reviewLink}

If you're interested in looking at potentially having ${systemSuggestion} installed, or need anything else, feel free to reach out anytime!

Kind regards,
Ricky (Great White Security)`;

    // Show editable form
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Send Review Request - ${fullName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 {
            color: #667eea;
            font-size: 28px;
            margin-bottom: 10px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .info-box {
            background: #f0f7ff;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
          }
          .info-box strong {
            color: #667eea;
          }
          label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
            color: #333;
          }
          textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.5;
            resize: vertical;
            min-height: 300px;
            transition: border-color 0.3s;
          }
          textarea:focus {
            outline: none;
            border-color: #667eea;
          }
          .preview-section {
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .preview-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 18px;
          }
          .preview-content {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border: 2px solid #e0e0e0;
            white-space: pre-wrap;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
          }
          .btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            margin-top: 20px;
          }
          .btn-primary {
            background: #667eea;
            color: white;
          }
          .btn-primary:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }
          .btn-primary:active {
            transform: translateY(0);
          }
          .btn-primary:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }
          .loading {
            display: none;
            text-align: center;
            padding: 40px;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⭐ Send Review Request</h1>
          <p class="subtitle">Review and edit the message before sending</p>

          <div class="info-box">
            <strong>Client:</strong> ${fullName}<br>
            <strong>Phone:</strong> ${customerPhone}
          </div>

          <form id="reviewForm">
            <label for="message">📝 Edit Message:</label>
            <textarea id="message" name="message">${defaultMessage}</textarea>

            <div class="preview-section">
              <h3>👁️ Preview (what ${firstName} will receive):</h3>
              <div class="preview-content" id="preview"></div>
            </div>

            <button type="submit" class="btn btn-primary">
              📤 Send Review Request to ${firstName}
            </button>
          </form>

          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Sending message...</p>
          </div>
        </div>

        <script>
          const form = document.getElementById('reviewForm');
          const messageTextarea = document.getElementById('message');
          const preview = document.getElementById('preview');
          const loading = document.getElementById('loading');

          // Update preview when message changes
          function updatePreview() {
            preview.textContent = messageTextarea.value;
          }

          messageTextarea.addEventListener('input', updatePreview);
          updatePreview(); // Initial preview

          // Handle form submission
          form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const message = messageTextarea.value.trim();

            if (!message) {
              alert('Please enter a message');
              return;
            }

            // Show loading
            form.style.display = 'none';
            loading.style.display = 'block';

            try {
              const response = await fetch('/api/submit-review-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  engagementId: '${engagementId}',
                  message: message
                }),
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to send message');
              }

              // Success!
              document.querySelector('.container').innerHTML = \`
                <div style="text-align: center; padding: 50px;">
                  <div style="font-size: 80px; margin-bottom: 20px;">⭐</div>
                  <h1 style="color: #667eea; margin-bottom: 15px;">Review Request Sent!</h1>
                  <p style="color: #666; font-size: 18px;">SMS sent to ${firstName} at ${customerPhone}</p>
                  <p style="margin-top: 20px; color: #999; font-size: 14px;">You can close this window.</p>
                </div>
              \`;

              setTimeout(() => window.close(), 3000);
            } catch (error) {
              alert('Error sending message: ' + error.message);
              form.style.display = 'block';
              loading.style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing review request form:', error);
    res.status(500).send(`<h1>Error: ${error.message}</h1>`);
  }
};

/**
 * Actually send the review request SMS
 * POST /api/submit-review-request
 */
exports.submitReviewRequest = async (req, res) => {
  try {
    const { engagementId, message } = req.body;

    if (!engagementId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`⭐ Sending review request for engagement: ${engagementId}`);

    // Get engagement details
    const engagement = await airtableService.getEngagement(engagementId);

    if (!engagement) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    // Get customer phone from lookup fields
    let customerPhone = engagement.fields['Mobile Phone (from Customer)'] || engagement.fields['Phone (from Customer)'];
    if (Array.isArray(customerPhone)) customerPhone = customerPhone[0];
    customerPhone = String(customerPhone || '').trim();

    if (!customerPhone) {
      return res.status(400).json({ error: 'Customer has no phone number' });
    }

    // Send SMS
    await twilioService.sendSMS(
      customerPhone,
      message,
      { leadId: engagementId, type: 'review_request' }
    );

    // Log message
    await airtableService.logMessage({
      engagementId: engagementId,
      direction: 'Outbound',
      type: 'SMS',
      to: customerPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: message,
      status: 'Sent',
    });

    // Update engagement
    await airtableService.updateEngagement(engagementId, {
      'Review Requested': true,
      'Status': 'Review Requested',
    });

    console.log(`✓ Review request sent to ${customerPhone}`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending review request:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * Show Job Summary form (GET /send-job-summary/:leadId)
 * Airtable button opens this page to compose and send a job summary to the client
 */
exports.showJobSummaryForm = async (req, res) => {
  try {
    const engagementId = req.params.leadId;

    if (!engagementId) {
      return res.status(400).send('<h1>Error: Missing engagement ID</h1>');
    }

    console.log(`📋 Opening job summary form for engagement: ${engagementId}`);

    const engagement = await airtableService.getEngagement(engagementId);

    if (!engagement) {
      return res.status(404).send('<h1>Error: Engagement not found</h1>');
    }

    let customerPhone = engagement.fields['Mobile Phone (from Customer)'] || engagement.fields['Phone (from Customer)'];
    if (Array.isArray(customerPhone)) customerPhone = customerPhone[0];
    customerPhone = String(customerPhone || '').trim();

    if (!customerPhone) {
      return res.status(400).send('<h1>Error: Customer has no phone number</h1>');
    }

    let firstName = engagement.fields['First Name (from Customer)'];
    let lastName = engagement.fields['Last Name (from Customer)'];
    if (Array.isArray(firstName)) firstName = firstName[0];
    if (Array.isArray(lastName)) lastName = lastName[0];
    firstName = firstName || 'there';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Client';

    const templateNoBalance = `Hi ${firstName},

Here's a summary from the technician's attendance today:

Attendance
[DESCRIBE ATTENDANCE DETAILS]

Findings & Work Completed
[DESCRIBE FINDINGS AND WORK]

Codes
[LIST ANY CODES]

Outstanding Issues
[DESCRIBE ANY REMAINING ISSUES]

Recommendation
[DESCRIBE RECOMMENDED NEXT STEPS]

Billing
No additional charges — everything was covered within the call-out fee.

If you'd like us to provide a quote for the recommended next steps, we can arrange this during the week.

Kind regards,
Ricky
Great White Security`;

    const templateBalanceDue = `Hi ${firstName},

Just a summary from our attendance and the proposed next steps:

[DESCRIBE WHAT WAS DONE AND FINDINGS]

Next steps:
[DESCRIBE WHAT NEEDS TO HAPPEN NEXT]

Regarding billing:
There is a remaining balance of $[AMOUNT] from the first visit (additional time beyond the included 30 minutes).

For the follow-up visit, the standard $247 call-out will apply to secure the booking (this covers the first 30 minutes on site). Additional labour is billed at $147 per hour.

[PAYMENT LINK OR INSTRUCTIONS]

Kind regards,
Ricky
Great White Security`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Send Job Summary - ${fullName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #0a0e27 0%, #1a2040 100%);
            padding: 20px;
            min-height: 100vh;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 { color: #0a0e27; font-size: 28px; margin-bottom: 10px; }
          .subtitle { color: #666; margin-bottom: 30px; font-size: 16px; }
          .info-box {
            background: #f0f7ff;
            border-left: 4px solid #3dbfe0;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
          }
          .info-box strong { color: #0a0e27; }
          .template-selector {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
          }
          .template-selector button {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #ddd;
            border-radius: 8px;
            background: #f8f9fa;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
          }
          .template-selector button.active {
            border-color: #3dbfe0;
            background: #e8f8fd;
            color: #0a0e27;
          }
          .template-selector button:hover:not(.active) {
            border-color: #aaa;
          }
          label { display: block; font-weight: 600; margin-bottom: 8px; color: #333; }
          textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.5;
            resize: vertical;
            min-height: 350px;
            transition: border-color 0.3s;
          }
          textarea:focus { outline: none; border-color: #3dbfe0; }
          .preview-section {
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .preview-section h3 { color: #333; margin-bottom: 15px; font-size: 18px; }
          .preview-content {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border: 2px solid #e0e0e0;
            white-space: pre-wrap;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
          }
          .btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            margin-top: 20px;
          }
          .btn-primary { background: #0a0e27; color: white; }
          .btn-primary:hover {
            background: #1a2040;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(10, 14, 39, 0.4);
          }
          .btn-primary:active { transform: translateY(0); }
          .btn-primary:disabled { background: #ccc; cursor: not-allowed; transform: none; }
          .loading { display: none; text-align: center; padding: 40px; }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3dbfe0;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📋 Send Job Summary</h1>
          <p class="subtitle">Choose a template, edit the details, then send to ${firstName}</p>

          <div class="info-box">
            <strong>Client:</strong> ${fullName}<br>
            <strong>Phone:</strong> ${customerPhone}
          </div>

          <label>Choose Template:</label>
          <div class="template-selector">
            <button id="btnNoBalance" class="active" onclick="selectTemplate('noBalance')">No Extra Charge</button>
            <button id="btnBalanceDue" onclick="selectTemplate('balanceDue')">Balance Due</button>
          </div>

          <form id="summaryForm">
            <label for="message">Edit Message:</label>
            <textarea id="message" name="message">${templateNoBalance}</textarea>

            <div class="preview-section">
              <h3>Preview (what ${firstName} will receive):</h3>
              <div class="preview-content" id="preview"></div>
            </div>

            <button type="submit" class="btn btn-primary">
              Send Job Summary to ${firstName}
            </button>
          </form>

          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Sending message...</p>
          </div>
        </div>

        <script>
          const templates = {
            noBalance: ${JSON.stringify(templateNoBalance)},
            balanceDue: ${JSON.stringify(templateBalanceDue)}
          };

          const messageTextarea = document.getElementById('message');
          const preview = document.getElementById('preview');
          const form = document.getElementById('summaryForm');
          const loading = document.getElementById('loading');

          function selectTemplate(key) {
            messageTextarea.value = templates[key];
            document.getElementById('btnNoBalance').className = key === 'noBalance' ? 'active' : '';
            document.getElementById('btnBalanceDue').className = key === 'balanceDue' ? 'active' : '';
            updatePreview();
          }

          function updatePreview() {
            preview.textContent = messageTextarea.value;
          }

          messageTextarea.addEventListener('input', updatePreview);
          updatePreview();

          form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const message = messageTextarea.value.trim();
            if (!message) { alert('Please enter a message'); return; }

            form.style.display = 'none';
            loading.style.display = 'block';

            try {
              const response = await fetch('/api/submit-job-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  engagementId: '${engagementId}',
                  message: message
                }),
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to send message');
              }

              document.querySelector('.container').innerHTML = \`
                <div style="text-align: center; padding: 50px;">
                  <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
                  <h1 style="color: #0a0e27;">Job Summary Sent!</h1>
                  <p style="color: #666; font-size: 18px; margin-top: 10px;">Message sent to ${firstName} successfully.</p>
                  <p style="color: #999; margin-top: 20px;">You can close this window.</p>
                </div>
              \`;
            } catch (error) {
              form.style.display = 'block';
              loading.style.display = 'none';
              alert('Error: ' + error.message);
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing job summary form:', error);
    res.status(500).send('<h1>Error loading form</h1>');
  }
};

/**
 * Submit Job Summary (POST /api/submit-job-summary)
 */
exports.submitJobSummary = async (req, res) => {
  try {
    const { engagementId, message } = req.body;

    if (!engagementId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`📋 Sending job summary for engagement: ${engagementId}`);

    const engagement = await airtableService.getEngagement(engagementId);

    if (!engagement) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    let customerPhone = engagement.fields['Mobile Phone (from Customer)'] || engagement.fields['Phone (from Customer)'];
    if (Array.isArray(customerPhone)) customerPhone = customerPhone[0];
    customerPhone = String(customerPhone || '').trim();

    if (!customerPhone) {
      return res.status(400).json({ error: 'Customer has no phone number' });
    }

    // Send SMS (handles long message splitting internally)
    await twilioService.sendSMS(
      customerPhone,
      message,
      { leadId: engagementId, type: 'job_summary' }
    );

    console.log(`✓ Job summary sent to ${customerPhone}`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending job summary:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

module.exports = exports;
