const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');
const { generateShortCode } = require('./tech-availability-short.controller');
const shortLinkService = require('../services/shortlink.service');

/**
 * Message Form Controllers - Show editable message forms before sending
 */

/**
 * Show message form with pre-filled template
 * GET /send-message-form/:leadId/:messageType
 */
exports.showMessageForm = async (req, res) => {
  try {
    const engagementId = req.params.leadId;
    const { messageType } = req.params;

    console.log(`📝 Opening message form: ${messageType} for engagement: ${engagementId}`);

    // Get engagement and customer details
    const result = await airtableService.getEngagementWithCustomer(engagementId);

    if (!result || !result.engagement) {
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
          <p>Engagement not found</p>
        </body>
        </html>
      `);
    }

    const { engagement, customer } = result;
    const lead = engagement; // For backward compatibility with existing code

    // Determine template name and field mappings based on message type
    let templateName;
    let sentField;
    let pageTitle;

    switch (messageType) {
      case 'request-photos':
        templateName = 'Request Photos from Client';
        sentField = 'Photos Requested';
        pageTitle = 'Request Photos';
        break;
      case 'checking-availability':
        templateName = 'Checking Availability Message';
        sentField = 'Tech Availability Requested';
        pageTitle = 'Checking Availability';
        break;
      case 'payment-received':
        templateName = 'Payment Received Confirmation';
        sentField = 'Payment Received Sent';
        pageTitle = 'Payment Received';
        break;
      default:
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <h1>❌ Unknown message type</h1>
          </body>
          </html>
        `);
    }

    // Get template from Templates table
    const template = await airtableService.getTemplate(templateName);

    if (!template) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <h1>❌ Template "${templateName}" not found</h1>
          <p>Please add this template to your Templates table in Airtable</p>
        </body>
        </html>
      `);
    }

    // Get template content and replace variables
    let messageContent = template.fields.Content || '';
    // Get first name from customer if available, fallback to engagement
    const firstName = (customer && customer.fields['First Name']) || lead.fields['First Name (from Customer)'] || 'there';
    const uploadLink = `${process.env.BASE_URL}/upload-photos/${engagementId}`;

    // Get customer phone for disabled checks
    const customerPhone = (customer && (customer.fields['Mobile Phone'] || customer.fields.Phone)) ||
                          lead.fields['Mobile Phone (from Customer)'] ||
                          lead.fields['Phone (from Customer)'];

    messageContent = messageContent
      .replace(/{{FIRST_NAME}}/g, firstName)
      .replace(/{{UPLOAD_LINK}}/g, uploadLink)
      .replace(/{{NAME}}/g, firstName);

    // Show the form
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${pageTitle} - ${firstName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container {
            max-width: 700px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: #4CAF50;
            color: white;
            padding: 25px;
            text-align: center;
          }
          .header h1 {
            font-size: 24px;
            margin-bottom: 8px;
          }
          .header .subtitle {
            opacity: 0.9;
            font-size: 16px;
          }
          .content {
            padding: 30px;
          }
          .lead-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
          }
          .lead-info p {
            margin: 5px 0;
            color: #555;
          }
          .lead-info strong {
            color: #333;
          }
          label {
            display: block;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
            font-size: 15px;
          }
          textarea {
            width: 100%;
            min-height: 300px;
            padding: 15px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.6;
            resize: vertical;
            transition: border-color 0.2s;
          }
          textarea:focus {
            outline: none;
            border-color: #4CAF50;
          }
          .character-count {
            text-align: right;
            margin-top: 8px;
            color: #666;
            font-size: 13px;
          }
          .buttons {
            display: flex;
            gap: 15px;
            margin-top: 25px;
          }
          button {
            flex: 1;
            padding: 15px 30px;
            font-size: 16px;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn-send {
            background: #4CAF50;
            color: white;
          }
          .btn-send:hover {
            background: #45a049;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          }
          .btn-send:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }
          .btn-cancel {
            background: #f8f9fa;
            color: #666;
            border: 2px solid #ddd;
          }
          .btn-cancel:hover {
            background: #e9ecef;
          }
          .loading {
            display: none;
            text-align: center;
            margin-top: 20px;
          }
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #4CAF50;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .warning {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            color: #856404;
          }
          .preview-section {
            margin-top: 25px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .preview-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 18px;
            font-weight: 600;
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
            min-height: 100px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📱 ${pageTitle}</h1>
            <div class="subtitle">Edit message and send to client</div>
          </div>

          <div class="content">
            <div class="lead-info">
              <p><strong>To:</strong> ${firstName}</p>
              <p><strong>Phone:</strong> ${(customer && (customer.fields['Mobile Phone'] || customer.fields.Phone)) || lead.fields['Mobile Phone (from Customer)'] || lead.fields['Phone (from Customer)'] || 'No phone number'}</p>
              <p><strong>Address:</strong> ${(customer && customer.fields.Address) || lead.fields['Address (from Customer)'] || 'N/A'}</p>
            </div>

            ${!(customer && (customer.fields['Mobile Phone'] || customer.fields.Phone)) && !lead.fields['Mobile Phone (from Customer)'] && !lead.fields['Phone (from Customer)'] ? '<div class="warning">⚠️ Warning: This lead has no phone number!</div>' : ''}

            <form id="messageForm">
              <label for="message">Message (edit as needed):</label>
              <textarea
                id="message"
                name="message"
                required
                ${!customerPhone ? 'disabled' : ''}
              >${messageContent}</textarea>
              <div class="character-count">
                <span id="charCount">${messageContent.length}</span> characters
                <span id="smsCount"></span>
              </div>

              <div class="preview-section">
                <h3>👁️ Preview (what ${firstName} will receive):</h3>
                <div class="preview-content" id="preview"></div>
              </div>

              <div class="buttons">
                <button type="button" class="btn-cancel" onclick="window.close()">
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn-send"
                  id="sendBtn"
                  ${!customerPhone ? 'disabled' : ''}
                >
                  📤 Send SMS
                </button>
              </div>
            </form>

            <div class="loading" id="loading">
              <div class="spinner"></div>
              <p>Sending message...</p>
            </div>
          </div>
        </div>

        <script>
          const textarea = document.getElementById('message');
          const charCount = document.getElementById('charCount');
          const smsCount = document.getElementById('smsCount');
          const form = document.getElementById('messageForm');
          const sendBtn = document.getElementById('sendBtn');
          const loading = document.getElementById('loading');
          const preview = document.getElementById('preview');

          // Update preview
          function updatePreview() {
            preview.textContent = textarea.value;
          }

          // Update character count and preview
          textarea.addEventListener('input', () => {
            const length = textarea.value.length;
            charCount.textContent = length;

            // Calculate SMS segments (160 chars per SMS)
            const segments = Math.ceil(length / 160);
            smsCount.textContent = segments > 1 ? \`(\${segments} SMS messages)\` : '';

            // Update preview
            updatePreview();
          });

          // Initial preview
          updatePreview();

          // Handle form submission
          form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const message = textarea.value;

            if (!message.trim()) {
              alert('Please enter a message');
              return;
            }

            // Disable button and show loading
            sendBtn.disabled = true;
            form.style.display = 'none';
            loading.style.display = 'block';

            try {
              const response = await fetch('/api/send-message-form', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  leadId: '${engagementId}',
                  messageType: '${messageType}',
                  message: message,
                  sentField: '${sentField}'
                }),
              });

              const result = await response.json();

              if (response.ok) {
                // Success! Show confirmation and close
                document.querySelector('.container').innerHTML = \`
                  <div class="header" style="background: #4CAF50;">
                    <h1>✅ Message Sent!</h1>
                  </div>
                  <div class="content" style="text-align: center; padding: 50px;">
                    <p style="font-size: 18px; margin-bottom: 20px;">Message successfully sent to ${firstName}</p>
                    <button onclick="window.close()" class="btn-send">Close Window</button>
                  </div>
                \`;
              } else {
                throw new Error(result.error || 'Failed to send message');
              }
            } catch (error) {
              alert('Error sending message: ' + error.message);
              sendBtn.disabled = false;
              form.style.display = 'block';
              loading.style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing message form:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body>
        <h1>❌ Error</h1>
        <p>${error.message}</p>
      </body>
      </html>
    `);
  }
};

/**
 * Actually send the message after editing
 * POST /api/send-message-form
 */
exports.sendMessage = async (req, res) => {
  try {
    const engagementId = req.body.leadId;
    const { messageType, message, sentField } = req.body;

    console.log(`📤 Sending ${messageType} message for engagement: ${engagementId}`);

    // Get engagement and customer
    const result = await airtableService.getEngagementWithCustomer(engagementId);

    if (!result || !result.engagement) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    const { engagement, customer } = result;
    const lead = engagement; // For backward compatibility

    // Get phone from customer (handle arrays from lookups)
    let customerPhone = null;

    if (customer) {
      customerPhone = customer.fields['Mobile Phone'] || customer.fields.Phone;
    }

    // Try lookup fields if no direct customer phone
    if (!customerPhone) {
      const lookupMobile = lead.fields['Mobile Phone (from Customer)'];
      const lookupPhone = lead.fields['Phone (from Customer)'];

      customerPhone = Array.isArray(lookupMobile) ? lookupMobile[0] : lookupMobile;
      if (!customerPhone) {
        customerPhone = Array.isArray(lookupPhone) ? lookupPhone[0] : lookupPhone;
      }
    }

    // Ensure we have a valid phone number
    if (!customerPhone || (typeof customerPhone !== 'string') || customerPhone.trim() === '') {
      return res.status(400).json({ error: 'Customer has no phone number. Please add a phone number to the customer record in Airtable.' });
    }

    // Send SMS
    await twilioService.sendSMS(
      customerPhone,
      message,
      { leadId: engagementId, messageType }
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

    // Mark as sent in Airtable and update status
    const updates = {
      [sentField]: true,
    };

    // Update status based on message type
    if (messageType === 'request-photos') {
      updates.Status = 'Photos Requested';
    }
    if (messageType === 'payment-received') {
      updates.Status = 'Payment Received ✅';
    }

    await airtableService.updateEngagement(engagementId, updates);

    console.log(`✓ ${messageType} sent to ${lead.fields['First Name']}`);

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * Show tech availability form with tech selection
 * GET /send-tech-availability-form/:leadId
 */
exports.showTechAvailabilityForm = async (req, res) => {
  try {
    const engagementId = req.params.leadId;

    console.log(`📋 Opening tech availability form for engagement: ${engagementId}`);

    // Get engagement details
    const lead = await airtableService.getEngagement(engagementId);

    if (!lead) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <h1>❌ Lead not found</h1>
        </body>
        </html>
      `);
    }

    // Get all techs
    const techs = await airtableService.getAllTechs();

    if (techs.length === 0) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>No Available Techs</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .warning { color: #ff9800; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="warning">⚠️ No Available Techs</h1>
          <p>There are no techs marked as "Available" in the Techs table.</p>
          <p>Please update tech availability status in Airtable first.</p>
        </body>
        </html>
      `);
    }

    // Get job description from lead
    const jobDescription = lead.fields['Job Scope'] || lead.fields['Client intake info'] || lead.fields.Notes || 'No details provided yet';

    // Build default message (will be editable)
    const techName = '{{TECH_NAME}}';
    const defaultMessage = `Hey ${techName}, got a service call this week if you're available!

Location: ${lead.fields['Address (from Customer)'] || 'TBD'}

Scope:
${jobDescription.length > 200 ? jobDescription.substring(0, 200) + '...' : jobDescription}

Please make your selection:

👍 YES: {{YES_LINK}}

👎 NO: {{NO_LINK}}

I'll be in touch with more info once it's confirmed.

Thanks,

Ricky (Great White Security)`;

    // Build tech list HTML
    const techListHTML = techs.map(tech => {
      const displayName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || tech.fields.Name;
      const phone = tech.fields.Phone || 'No phone';
      return `
        <div class="tech-item">
          <input type="checkbox" id="tech-${tech.id}" name="techs" value="${tech.id}" checked data-name="${displayName}" data-phone="${phone}">
          <label for="tech-${tech.id}">
            <strong>${displayName}</strong>
            <span class="tech-phone">${phone}</span>
          </label>
        </div>
      `;
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Check Tech Availability - ${lead.fields['First Name (from Customer)'] || 'Lead'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: #4CAF50;
            color: white;
            padding: 25px;
            text-align: center;
          }
          .header h1 {
            font-size: 24px;
            margin-bottom: 8px;
          }
          .header .subtitle {
            opacity: 0.9;
            font-size: 16px;
          }
          .content {
            padding: 30px;
          }
          .section {
            margin-bottom: 30px;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .lead-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
          }
          .lead-info p {
            margin: 5px 0;
            color: #555;
          }
          .lead-info strong {
            color: #333;
          }
          .tech-selection {
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            background: #fafafa;
          }
          .tech-item {
            display: flex;
            align-items: center;
            padding: 12px;
            background: white;
            border-radius: 6px;
            margin-bottom: 10px;
            border: 1px solid #e0e0e0;
            transition: all 0.2s;
          }
          .tech-item:hover {
            border-color: #4CAF50;
            box-shadow: 0 2px 4px rgba(76, 175, 80, 0.1);
          }
          .tech-item input[type="checkbox"] {
            width: 20px;
            height: 20px;
            margin-right: 12px;
            cursor: pointer;
          }
          .tech-item label {
            flex: 1;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .tech-phone {
            color: #666;
            font-size: 14px;
          }
          .select-all {
            margin-bottom: 15px;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .select-all input {
            width: 18px;
            height: 18px;
          }
          .selected-count {
            background: #4CAF50;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
          }
          label.message-label {
            display: block;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
            font-size: 15px;
          }
          textarea {
            width: 100%;
            min-height: 300px;
            padding: 15px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.6;
            resize: vertical;
            transition: border-color 0.2s;
          }
          textarea:focus {
            outline: none;
            border-color: #4CAF50;
          }
          .help-text {
            font-size: 13px;
            color: #666;
            margin-top: 8px;
            padding: 10px;
            background: #fff3cd;
            border-radius: 6px;
            border-left: 3px solid #ffc107;
          }
          .preview-box {
            background: #f8f9fa;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            padding: 20px;
            min-height: 200px;
          }
          .preview-content {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
            white-space: pre-wrap;
            background: white;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
          }
          .preview-link {
            color: #1a73e8;
            text-decoration: underline;
          }
          .buttons {
            display: flex;
            gap: 15px;
            margin-top: 25px;
          }
          button {
            flex: 1;
            padding: 15px 30px;
            font-size: 16px;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn-send {
            background: #4CAF50;
            color: white;
          }
          .btn-send:hover:not(:disabled) {
            background: #45a049;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          }
          .btn-send:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }
          .btn-cancel {
            background: #f8f9fa;
            color: #666;
            border: 2px solid #ddd;
          }
          .btn-cancel:hover {
            background: #e9ecef;
          }
          .loading {
            display: none;
            text-align: center;
            margin-top: 20px;
          }
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #4CAF50;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Check Tech Availability</h1>
            <div class="subtitle">Select techs and customize message</div>
          </div>

          <div class="content">
            <div class="lead-info">
              <p><strong>Lead:</strong> ${lead.fields['First Name (from Customer)'] || 'Unknown'}</p>
              <p><strong>Location:</strong> ${lead.fields['Address (from Customer)'] || 'N/A'}</p>
            </div>

            <form id="techForm">
              <!-- Tech Selection -->
              <div class="section">
                <div class="section-title">
                  🔧 Select Techs
                  <span class="selected-count" id="selectedCount">${techs.length} selected</span>
                </div>

                <div class="tech-selection">
                  <div class="select-all">
                    <input type="checkbox" id="selectAll" checked>
                    <label for="selectAll"><strong>Select/Deselect All</strong></label>
                  </div>

                  ${techListHTML}
                </div>
              </div>

              <!-- Message Template -->
              <div class="section">
                <label class="message-label" for="message">📝 Message Template (edit as needed):</label>
                <textarea id="message" name="message" required>${defaultMessage}</textarea>
                <div class="help-text">
                  💡 Use {{TECH_NAME}}, {{YES_LINK}}, and {{NO_LINK}} - they'll be replaced for each tech
                </div>
              </div>

              <!-- Message Preview -->
              <div class="section">
                <div class="section-title" id="previewTitle">👁️ Preview</div>
                <div class="preview-box" id="previewBox">
                  <div class="preview-content" id="previewContent"></div>
                </div>
              </div>

              <div class="buttons">
                <button type="button" class="btn-cancel" onclick="window.close()">
                  Cancel
                </button>
                <button type="submit" class="btn-send" id="sendBtn">
                  📤 Send to <span id="sendCount">${techs.length}</span> Tech(s)
                </button>
              </div>
            </form>

            <div class="loading" id="loading">
              <div class="spinner"></div>
              <p>Sending messages...</p>
            </div>
          </div>
        </div>

        <script>
          // Server-injected variables
          const BASE_URL = '${process.env.BASE_URL}';
          const engagementId = '${engagementId}';

          const checkboxes = document.querySelectorAll('input[name="techs"]');
          const selectAll = document.getElementById('selectAll');
          const selectedCount = document.getElementById('selectedCount');
          const sendCount = document.getElementById('sendCount');
          const form = document.getElementById('techForm');
          const sendBtn = document.getElementById('sendBtn');
          const loading = document.getElementById('loading');
          const messageTextarea = document.getElementById('message');
          const previewContent = document.getElementById('previewContent');
          const previewTitle = document.getElementById('previewTitle');

          // Update preview
          function updatePreview() {
            const firstChecked = document.querySelector('input[name="techs"]:checked');
            if (!firstChecked) {
              previewTitle.textContent = '👁️ Preview';
              previewContent.innerHTML = '<em style="color: #999;">Select at least one tech to see preview</em>';
              return;
            }

            const techFullName = firstChecked.dataset.name;
            const techName = techFullName.split(' ')[0]; // First name only
            previewTitle.textContent = \`👁️ Preview (what \${techFullName} will receive):\`;

            const message = messageTextarea.value;

            // Replace placeholders with example values (actual codes generated server-side)
            const yesLink = \`\${BASE_URL}/ty/abc123\`;
            const noLink = \`\${BASE_URL}/tn/abc123\`;

            const preview = message
              .replace(/{{TECH_NAME}}/g, techName)
              .replace(/{{YES_LINK}}/g, '<span class="preview-link">' + yesLink + '</span>')
              .replace(/{{NO_LINK}}/g, '<span class="preview-link">' + noLink + '</span>');

            previewContent.innerHTML = preview;
          }

          // Update counts
          function updateCounts() {
            const checked = document.querySelectorAll('input[name="techs"]:checked').length;
            selectedCount.textContent = checked + ' selected';
            sendCount.textContent = checked;
            sendBtn.disabled = checked === 0;
            updatePreview();
          }

          // Update preview when message changes
          messageTextarea.addEventListener('input', updatePreview);

          // Initial preview
          updatePreview();

          // Select all toggle
          selectAll.addEventListener('change', () => {
            checkboxes.forEach(cb => cb.checked = selectAll.checked);
            updateCounts();
          });

          // Individual checkbox
          checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
              selectAll.checked = document.querySelectorAll('input[name="techs"]:checked').length === checkboxes.length;
              updateCounts();
            });
          });

          // Handle form submission
          form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const message = document.getElementById('message').value;
            const selectedTechs = Array.from(document.querySelectorAll('input[name="techs"]:checked'))
              .map(cb => ({
                id: cb.value,
                name: cb.dataset.name,
                phone: cb.dataset.phone
              }));

            if (selectedTechs.length === 0) {
              alert('Please select at least one tech');
              return;
            }

            if (!confirm(\`Send availability check to \${selectedTechs.length} tech(s)?\`)) {
              return;
            }

            // Disable button and show loading
            sendBtn.disabled = true;
            form.style.display = 'none';
            loading.style.display = 'block';

            try {
              const response = await fetch('/api/send-tech-availability', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  leadId: '${engagementId}',
                  selectedTechs: selectedTechs,
                  messageTemplate: message
                }),
              });

              const result = await response.json();

              if (response.ok) {
                // Success!
                document.querySelector('.container').innerHTML = \`
                  <div class="header" style="background: #4CAF50;">
                    <h1>✅ Messages Sent!</h1>
                  </div>
                  <div class="content" style="text-align: center; padding: 50px;">
                    <p style="font-size: 18px; margin-bottom: 20px;">
                      Availability check sent to \${result.techsContacted} tech(s)
                    </p>
                    <button onclick="window.close()" class="btn-send">Close Window</button>
                  </div>
                \`;
              } else {
                throw new Error(result.error || 'Failed to send messages');
              }
            } catch (error) {
              alert('Error sending messages: ' + error.message);
              sendBtn.disabled = false;
              form.style.display = 'block';
              loading.style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing tech availability form:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body>
        <h1>❌ Error</h1>
        <p>${error.message}</p>
      </body>
      </html>
    `);
  }
};

/**
 * Send tech availability messages to selected techs
 * POST /api/send-tech-availability
 */
exports.sendTechAvailability = async (req, res) => {
  try {
    const engagementId = req.body.leadId;
    const { selectedTechs, messageTemplate } = req.body;

    console.log(`📤 Sending tech availability to ${selectedTechs.length} techs for engagement: ${engagementId}`);

    const results = [];

    // Send to each selected tech
    for (const tech of selectedTechs) {
      try {
        // Generate short codes for YES/NO links
        const shortCode = generateShortCode(engagementId, tech.id);
        const yesLink = `${process.env.BASE_URL}/ty/${shortCode}`;
        const noLink = `${process.env.BASE_URL}/tn/${shortCode}`;

        // Replace variables in template
        const message = messageTemplate
          .replace(/{{TECH_NAME}}/g, tech.name.split(' ')[0]) // Use first name only
          .replace(/{{YES_LINK}}/g, yesLink)
          .replace(/{{NO_LINK}}/g, noLink);

        await twilioService.sendSMS(
          tech.phone,
          message,
          { leadId: engagementId, techId: tech.id, type: 'availability_check' }
        );

        results.push({ techId: tech.id, tech: tech.name, status: 'sent' });
        console.log(`  ✓ Sent to ${tech.name}`);
      } catch (error) {
        console.error(`  ✗ Failed to send to tech ${tech.id}:`, error.message);
        results.push({ techId: tech.id, status: 'failed', error: error.message });
      }
    }

    // Update engagement to mark availability requested
    await airtableService.updateEngagement(engagementId, {
      'Tech Availability Requested': true,
      'Tech Availability Responses': `Availability check sent to ${selectedTechs.length} techs at ${new Date().toISOString()}`
    });

    res.status(200).json({
      success: true,
      leadId: engagementId,
      techsContacted: selectedTechs.length,
      results,
    });
  } catch (error) {
    console.error('Error sending tech availability:', error);
    res.status(500).json({ error: 'Failed to send messages' });
  }
};

/**
 * Show pricing message form with selected product
 * GET /send-pricing-form/:leadId
 */
exports.showPricingForm = async (req, res) => {
  try {
    const engagementId = req.params.leadId;

    console.log(`💵 Opening pricing form for engagement: ${engagementId}`);

    // Get engagement details
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
          <p>Lead not found</p>
        </body>
        </html>
      `);
    }

    // Get all active products
    const products = await airtableService.getActiveProducts();

    if (!products || products.length === 0) {
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
          <p>No products available. Please sync Stripe products first.</p>
        </body>
        </html>
      `);
    }

    // Get selected product if exists
    const selectedProductId = lead.fields['Selected Product'] ? lead.fields['Selected Product'][0] : null;
    const selectedProduct = selectedProductId ? products.find(p => p.id === selectedProductId) : products[0];

    // Build client name from Customer lookup fields
    const clientName = lead.fields['First Name (from Customer)'] || 'there';
    const leadFullName = [lead.fields['First Name (from Customer)'], lead.fields['Last Name (from Customer)']].filter(Boolean).join(' ') || 'Client';

    const productName = selectedProduct.fields['Product Name'];
    const paymentLink = selectedProduct.fields['Stripe Payment Link'];
    const price = selectedProduct.fields.Price || 247;

    // Get system type from engagement (multiple select field)
    const systemTypes = lead.fields['System Type'] || [];
    let systemTypeText = 'alarm system';
    if (systemTypes.length > 0) {
      const typesLowercase = systemTypes.map(s => s.toLowerCase());
      if (systemTypes.length === 1) {
        systemTypeText = typesLowercase[0] + ' system';
      } else {
        systemTypeText = typesLowercase.join(' and ') + ' systems';
      }
    }

    const defaultMessage = `Hi ${clientName}, thanks for sending those through.

Good news — I can have one of our technicians attend this week (or early next week) to troubleshoot your ${systemTypeText}.

The call-out is just $${price} inc. GST, which includes travel and up to 30 minutes on site.

If more time is needed, additional labour is billed at $147 per hour inc. GST.

To secure the booking, please make payment here:
${paymentLink}

Once payment is through, the technician will reach out to confirm a suitable time.

Thanks,
Ricky
Great White Security`;

    // Show form
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Send Payment Link - ${lead.fields.Name}</title>
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
            color: #1a73e8;
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
            border-left: 4px solid #1a73e8;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
          }
          .info-box strong {
            color: #1a73e8;
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
            border-color: #1a73e8;
          }
          select {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            background: white;
            cursor: pointer;
            transition: border-color 0.3s;
            margin-bottom: 20px;
          }
          select:focus {
            outline: none;
            border-color: #1a73e8;
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
            background: #1a73e8;
            color: white;
          }
          .btn-primary:hover {
            background: #1557b0;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(26, 115, 232, 0.4);
          }
          .btn-primary:active {
            transform: translateY(0);
          }
          .loading {
            display: none;
            text-align: center;
            padding: 40px;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #1a73e8;
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
          .success {
            display: none;
            text-align: center;
            padding: 40px;
          }
          .success-icon {
            font-size: 72px;
            margin-bottom: 20px;
          }
          .stripe-link {
            display: inline-block;
            margin-top: 8px;
            margin-bottom: 20px;
            padding: 8px 16px;
            background: #f0f7ff;
            border: 2px solid #1a73e8;
            border-radius: 6px;
            color: #1a73e8;
            text-decoration: none;
            font-size: 13px;
            transition: all 0.3s;
          }
          .stripe-link:hover {
            background: #1a73e8;
            color: white;
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>💳 Send Payment Link</h1>
          <p class="subtitle">Review and edit the pricing message before sending</p>

          <div class="info-box">
            <strong>Client:</strong> ${leadFullName}<br>
            <strong>Phone:</strong> ${lead.fields['Mobile Phone (from Customer)'] || lead.fields['Phone (from Customer)']}
          </div>

          <form id="pricingForm">
            <label for="product">📦 Select Product:</label>
            <select id="product" name="product">
              ${products.map(p => `
                <option value="${p.id}" data-name="${p.fields['Product Name']}" data-link="${p.fields['Stripe Payment Link']}" data-price="${p.fields.Price || 247}" ${p.id === selectedProduct.id ? 'selected' : ''}>
                  ${p.fields['Product Name']}
                </option>
              `).join('')}
            </select>
            <div>
              <button type="button" class="stripe-link" id="openCheckoutBtn">
                💳 Open Payment Page
              </button>
            </div>

            <label for="message">📝 Edit Message:</label>
            <textarea id="message" name="message">${defaultMessage}</textarea>

            <div class="preview-section">
              <h3>👁️ Preview (what ${clientName} will receive):</h3>
              <div class="preview-content" id="preview"></div>
            </div>

            <button type="submit" class="btn btn-primary">
              📤 Send Pricing to ${clientName}
            </button>
          </form>

          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Sending message...</p>
          </div>

          <div class="success" id="success">
            <div class="success-icon">✅</div>
            <h2>Pricing Sent Successfully!</h2>
            <p style="margin-top: 15px; color: #666;">The pricing message has been sent to ${clientName}</p>
          </div>
        </div>

        <script>
          const form = document.getElementById('pricingForm');
          const productSelect = document.getElementById('product');
          const messageTextarea = document.getElementById('message');
          const preview = document.getElementById('preview');
          const loading = document.getElementById('loading');
          const success = document.getElementById('success');
          const openCheckoutBtn = document.getElementById('openCheckoutBtn');
          const clientName = '${clientName}';
          const systemTypeText = '${systemTypeText}';

          // Update preview when message changes
          function updatePreview() {
            preview.textContent = messageTextarea.value;
          }

          // Open checkout page for selected product
          async function openCheckout() {
            const selectedProductId = productSelect.value;
            openCheckoutBtn.disabled = true;
            openCheckoutBtn.textContent = '⏳ Creating payment page...';

            try {
              const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  leadId: '${engagementId}',
                  productId: selectedProductId,
                }),
              });

              if (!response.ok) throw new Error('Failed to create checkout session');

              const data = await response.json();
              window.open(data.checkoutUrl, '_blank');

              openCheckoutBtn.disabled = false;
              openCheckoutBtn.textContent = '💳 Open Payment Page';
            } catch (error) {
              console.error(error);
              alert('Failed to open payment page. Please try again.');
              openCheckoutBtn.disabled = false;
              openCheckoutBtn.textContent = '💳 Open Payment Page';
            }
          }

          openCheckoutBtn.addEventListener('click', openCheckout);

          // Update message when product changes
          function updateMessage() {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            const paymentLink = selectedOption.dataset.link;
            const price = selectedOption.dataset.price;

            const newMessage = \`Hi \${clientName}, thanks for sending those through.

Good news — I can have one of our technicians attend this week (or early next week) to troubleshoot your \${systemTypeText}.

The call-out is $\${price} inc. GST, which includes travel and up to 30 minutes on site.

If more time is needed, additional labour is billed at $147 per hour inc. GST, with a maximum of 2 hours total on site. If the issue can't be resolved within this time, work will stop and I'll contact you to discuss next steps or alternative options. The technician will not remain on site beyond 2 hours without a new booking being arranged.

To secure the booking, please make payment here:
\${paymentLink}

Once payment is through, the technician will reach out to confirm a suitable time.

Just to set expectations upfront — based on the age of your system, it's considered end-of-life and parts are no longer supported. We're happy to attempt troubleshooting, however there are no guarantees the system can be restored to full functionality.

If you're considering replacing it with a newer, more reliable setup (including smartphone app control and optional monitoring), we have interest-free packages starting from $97/month over 24 months:
https://www.greatwhitesecurity.com/alarm-packages/

Thanks,
Ricky
Great White Security\`;

            messageTextarea.value = newMessage;
            updatePreview();
          }

          productSelect.addEventListener('change', updateMessage);
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

            if (!confirm('Send this pricing message to ${clientName}?')) {
              return;
            }

            // Show loading
            form.style.display = 'none';
            loading.style.display = 'block';

            try {
              const response = await fetch('/api/send-pricing-form', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  leadId: '${engagementId}',
                  message: message,
                  productId: productSelect.value,
                }),
              });

              if (!response.ok) {
                throw new Error('Failed to send message');
              }

              // Show success
              loading.style.display = 'none';
              success.style.display = 'block';

              // Close window after 3 seconds
              setTimeout(() => {
                window.close();
              }, 3000);
            } catch (error) {
              loading.style.display = 'none';
              form.style.display = 'block';
              alert('Failed to send message. Please try again.');
              console.error(error);
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing pricing form:', error);
    res.status(500).send('Error loading form');
  }
};

/**
 * Send pricing message (from form submission)
 * POST /api/send-pricing-form
 */
exports.sendPricingForm = async (req, res) => {
  try {
    const engagementId = req.body.leadId;
    const { message, productId } = req.body;

    if (!engagementId || !message || !productId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`💵 Sending pricing message for engagement: ${engagementId}`);

    // Get engagement details
    const lead = await airtableService.getEngagement(engagementId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Verify phone number exists (from Customer lookup fields)
    // Lookup fields can return arrays, so we need to extract the first element
    let customerPhone = lead.fields['Mobile Phone (from Customer)'] || lead.fields['Phone (from Customer)'];

    // If it's an array, get first element
    if (Array.isArray(customerPhone)) {
      customerPhone = customerPhone[0];
    }

    // Ensure it's a string
    customerPhone = String(customerPhone || '').trim();

    if (!customerPhone) {
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    // Get product from Airtable
    const product = await airtableService.getProduct(productId);
    if (!product || !product.fields['Stripe Product ID']) {
      return res.status(400).json({ error: 'Invalid product' });
    }

    // Create unique checkout session with metadata
    const stripeService = require('../services/stripe.service');
    const price = await stripeService.getPriceForProduct(product.fields['Stripe Product ID']);

    // Get customer name from lookup fields (may be arrays)
    let firstName = lead.fields['First Name (from Customer)'];
    let lastName = lead.fields['Last Name (from Customer)'];

    // Extract from arrays if needed
    if (Array.isArray(firstName)) firstName = firstName[0];
    if (Array.isArray(lastName)) lastName = lastName[0];

    const leadName = [firstName, lastName].filter(Boolean).join(' ') || 'Client';

    const session = await stripeService.createCheckoutSession({
      leadId: engagementId,
      productId: productId,
      priceId: price.id,
      leadName: leadName,
      leadPhone: customerPhone,
      successUrl: `${process.env.BASE_URL}/payment-success.html`,
      cancelUrl: `${process.env.BASE_URL}/send-pricing-form/${engagementId}`,
    });

    console.log(`✓ Checkout session created: ${session.id}`);

    // Create short link for the checkout URL
    const shortCode = shortLinkService.createShortLink(session.url, engagementId);
    const shortUrl = `https://${process.env.SHORT_LINK_DOMAIN || 'book.greatwhitesecurity.com'}/${shortCode}`;

    // Replace payment link placeholder with short URL
    const finalMessage = message.replace(/https:\/\/buy\.stripe\.com\/[^\s]+/g, shortUrl);

    // Send SMS via Twilio with short URL
    await twilioService.sendSMS(
      customerPhone,
      finalMessage,
      { leadId: engagementId, type: 'pricing', checkoutSessionId: session.id, shortCode }
    );

    // Log message with actual checkout URL
    await airtableService.logMessage({
      engagementId: engagementId,
      direction: 'Outbound',
      type: 'SMS',
      to: customerPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: finalMessage,
      status: 'Sent',
    });

    // Update engagement with selected product, status, and pricing sent checkbox
    const engUpdate = {
      'Selected Product': [productId],
      'Status': 'Payment Link Sent',
      'Pricing Sent': true,
    };
    // Only stamp Quote Sent At on the first send (don't overwrite on re-sends)
    if (!lead.fields['Quote Sent At']) {
      engUpdate['Quote Sent At'] = new Date().toISOString();
    }
    await airtableService.updateEngagement(engagementId, engUpdate);

    // Log activity
    airtableService.logActivity(engagementId, 'Payment link sent');

    console.log(`✓ Pricing SMS sent to ${leadName}`);

    res.status(200).json({
      success: true,
      message: 'Pricing sent successfully',
    });
  } catch (error) {
    console.error('Error sending pricing:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * Create Stripe Checkout Session with lead metadata
 * POST /api/create-checkout-session
 */
exports.createCheckoutSession = async (req, res) => {
  try {
    const engagementId = req.body.leadId;
    const { productId } = req.body;

    if (!engagementId || !productId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`💳 Creating checkout session for engagement: ${engagementId}, product: ${productId}`);

    // Get engagement details
    const lead = await airtableService.getEngagement(engagementId);
    if (!lead) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    // Get product from Airtable (which has Stripe Product ID)
    const product = await airtableService.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stripeProductId = product.fields['Stripe Product ID'];
    if (!stripeProductId) {
      return res.status(400).json({ error: 'Product missing Stripe Product ID' });
    }

    // Get price from Stripe
    const stripeService = require('../services/stripe.service');
    const price = await stripeService.getPriceForProduct(stripeProductId);

    const leadName = [lead.fields['First Name'], lead.fields['Last Name']].filter(Boolean).join(' ') || 'Client';

    // Create checkout session with metadata
    const session = await stripeService.createCheckoutSession({
      leadId: engagementId,
      productId: productId,
      priceId: price.id,
      leadName: leadName,
      leadPhone: lead.fields.Phone || '',
      successUrl: `${process.env.BASE_URL}/payment-success.html`,
      cancelUrl: `${process.env.BASE_URL}/send-pricing-form/${engagementId}`,
    });

    console.log(`✓ Checkout session created: ${session.id}`);

    // Create short link for the checkout URL
    const shortCode = shortLinkService.createShortLink(session.url, engagementId);
    const shortUrl = `https://${process.env.SHORT_LINK_DOMAIN || 'book.greatwhitesecurity.com'}/${shortCode}`;

    res.status(200).json({
      success: true,
      checkoutUrl: shortUrl,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

/**
 * Generate short link for message form
 * GET /api/message-form-link/:leadId/:messageType
 */
exports.generateMessageFormLink = async (req, res) => {
  try {
    const engagementId = req.params.leadId;
    const { messageType } = req.params;

    console.log(`🔗 Generating short link for ${messageType} form: ${engagementId}`);

    // Verify engagement exists
    const result = await airtableService.getEngagementWithCustomer(engagementId);
    if (!result || !result.engagement) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    // Create the full message form URL
    const fullUrl = `/send-message-form/${engagementId}/${messageType}`;

    // Create short link
    const shortCode = shortLinkService.createShortLink(fullUrl, engagementId);
    const shortUrl = `https://${process.env.SHORT_LINK_DOMAIN || 'book.greatwhitesecurity.com'}/${shortCode}`;

    console.log(`✓ Short link created: ${shortUrl}`);

    res.status(200).json({
      success: true,
      shortUrl: shortUrl,
      shortCode: shortCode,
      fullUrl: `${process.env.BASE_URL}${fullUrl}`
    });
  } catch (error) {
    console.error('Error generating message form link:', error);
    res.status(500).json({ error: 'Failed to generate short link' });
  }
};

/**
 * Show send completion form (admin page opened from Airtable button)
 * GET /send-completion-form/:leadId
 */
exports.showSendCompletionForm = async (req, res) => {
  try {
    const engagementId = req.params.leadId;

    console.log(`📋 Opening send completion form for engagement: ${engagementId}`);

    // Get engagement details
    const lead = await airtableService.getEngagement(engagementId);

    if (!lead) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <h1>❌ Engagement not found</h1>
        </body>
        </html>
      `);
    }

    // Get all techs
    const techs = await airtableService.getAllTechs();

    if (techs.length === 0) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>No Available Techs</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .warning { color: #ff9800; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="warning">⚠️ No Available Techs</h1>
          <p>There are no techs marked as "Available" in the Techs table.</p>
        </body>
        </html>
      `);
    }

    const clientName = lead.fields['First Name (from Customer)'] || 'Client';
    const clientAddress = lead.fields['Address (from Customer)'] || 'TBD';
    const alreadySent = lead.fields['Completion Form Sent'] || false;
    const completionLink = `${process.env.BASE_URL}/c/${engagementId}`;

    // Try to find the assigned tech
    const assignedTechName = lead.fields['Assigned Tech'] || lead.fields['Tech Name'] || null;

    // Default message template
    const defaultMessage = `Hey {{TECH_NAME}}, here's the completion form for the ${clientName} job at ${clientAddress}.

Please fill it in once you're done on site:
{{LINK}}

Thanks,
Ricky (Great White Security)`;

    // Build tech radio list HTML — auto-select assigned tech if found
    const techListHTML = techs.map(tech => {
      const displayName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || tech.fields.Name;
      const phone = tech.fields.Phone || 'No phone';
      const isAssigned = assignedTechName && displayName.toLowerCase().includes(assignedTechName.toString().toLowerCase());
      return `
        <div class="tech-item">
          <input type="radio" id="tech-${tech.id}" name="selectedTech" value="${tech.id}" ${isAssigned ? 'checked' : ''} data-name="${displayName}" data-phone="${phone}">
          <label for="tech-${tech.id}">
            <strong>${displayName}</strong>
            <span class="tech-phone">${phone}</span>
          </label>
        </div>
      `;
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Send Completion Form - ${clientName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: #4CAF50;
            color: white;
            padding: 25px;
            text-align: center;
          }
          .header h1 {
            font-size: 24px;
            margin-bottom: 8px;
          }
          .header .subtitle {
            opacity: 0.9;
            font-size: 16px;
          }
          .content {
            padding: 30px;
          }
          .section {
            margin-bottom: 30px;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .lead-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
          }
          .lead-info p {
            margin: 5px 0;
            color: #555;
          }
          .lead-info strong {
            color: #333;
          }
          .already-sent {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            color: #155724;
          }
          .tech-selection {
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            background: #fafafa;
          }
          .tech-item {
            display: flex;
            align-items: center;
            padding: 12px;
            background: white;
            border-radius: 6px;
            margin-bottom: 10px;
            border: 1px solid #e0e0e0;
            transition: all 0.2s;
          }
          .tech-item:hover {
            border-color: #4CAF50;
            box-shadow: 0 2px 4px rgba(76, 175, 80, 0.1);
          }
          .tech-item input[type="radio"] {
            width: 20px;
            height: 20px;
            margin-right: 12px;
            cursor: pointer;
          }
          .tech-item label {
            flex: 1;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .tech-phone {
            color: #666;
            font-size: 14px;
          }
          label.message-label {
            display: block;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
            font-size: 15px;
          }
          textarea {
            width: 100%;
            min-height: 250px;
            padding: 15px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.6;
            resize: vertical;
            transition: border-color 0.2s;
          }
          textarea:focus {
            outline: none;
            border-color: #4CAF50;
          }
          .help-text {
            font-size: 13px;
            color: #666;
            margin-top: 8px;
            padding: 10px;
            background: #fff3cd;
            border-radius: 6px;
            border-left: 3px solid #ffc107;
          }
          .preview-box {
            background: #f8f9fa;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            padding: 20px;
            min-height: 150px;
          }
          .preview-content {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
            white-space: pre-wrap;
            background: white;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
          }
          .buttons {
            display: flex;
            gap: 15px;
            margin-top: 25px;
          }
          button {
            flex: 1;
            padding: 15px 30px;
            font-size: 16px;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn-send {
            background: #4CAF50;
            color: white;
          }
          .btn-send:hover:not(:disabled) {
            background: #45a049;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          }
          .btn-send:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }
          .btn-cancel {
            background: #f8f9fa;
            color: #666;
            border: 2px solid #ddd;
          }
          .btn-cancel:hover {
            background: #e9ecef;
          }
          .loading {
            display: none;
            text-align: center;
            margin-top: 20px;
          }
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #4CAF50;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Send Completion Form</h1>
            <div class="subtitle">Send completion form link to tech via SMS</div>
          </div>

          <div class="content">
            <div class="lead-info">
              <p><strong>Client:</strong> ${clientName}</p>
              <p><strong>Address:</strong> ${clientAddress}</p>
            </div>

            ${alreadySent ? '<div class="already-sent">✅ Completion form has already been sent for this job.</div>' : ''}

            <form id="completionSendForm">
              <!-- Tech Selection -->
              <div class="section">
                <div class="section-title">🔧 Select Tech to Send To</div>
                <div class="tech-selection">
                  ${techListHTML}
                </div>
              </div>

              <!-- Message Template -->
              <div class="section">
                <label class="message-label" for="message">📝 Message Template (edit as needed):</label>
                <textarea id="message" name="message" required>${defaultMessage}</textarea>
                <div class="help-text">
                  💡 Use {{TECH_NAME}} and {{LINK}} — they'll be replaced when sending
                </div>
              </div>

              <!-- Message Preview -->
              <div class="section">
                <div class="section-title" id="previewTitle">👁️ Preview</div>
                <div class="preview-box" id="previewBox">
                  <div class="preview-content" id="previewContent"></div>
                </div>
              </div>

              <div class="buttons">
                <button type="button" class="btn-cancel" onclick="window.close()">
                  Cancel
                </button>
                <button type="submit" class="btn-send" id="sendBtn">
                  📤 Send Completion Form
                </button>
              </div>
            </form>

            <div class="loading" id="loading">
              <div class="spinner"></div>
              <p>Sending message...</p>
            </div>
          </div>
        </div>

        <script>
          const BASE_URL = '${process.env.BASE_URL}';
          const engagementId = '${engagementId}';
          const baseCompletionLink = '${completionLink}';

          const radios = document.querySelectorAll('input[name="selectedTech"]');
          const form = document.getElementById('completionSendForm');
          const sendBtn = document.getElementById('sendBtn');
          const loading = document.getElementById('loading');
          const messageTextarea = document.getElementById('message');
          const previewContent = document.getElementById('previewContent');
          const previewTitle = document.getElementById('previewTitle');

          function updatePreview() {
            const selected = document.querySelector('input[name="selectedTech"]:checked');
            if (!selected) {
              previewTitle.textContent = '👁️ Preview';
              previewContent.innerHTML = '<em style="color: #999;">Select a tech to see preview</em>';
              return;
            }

            const techFullName = selected.dataset.name;
            const techName = techFullName.split(' ')[0];
            const completionLink = baseCompletionLink + '?tech=' + encodeURIComponent(techFullName);
            previewTitle.textContent = '👁️ Preview (what ' + techFullName + ' will receive):';

            const preview = messageTextarea.value
              .replace(/{{TECH_NAME}}/g, techName)
              .replace(/{{LINK}}/g, completionLink);

            previewContent.textContent = preview;
          }

          radios.forEach(r => r.addEventListener('change', updatePreview));
          messageTextarea.addEventListener('input', updatePreview);
          updatePreview();

          form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const selected = document.querySelector('input[name="selectedTech"]:checked');
            if (!selected) {
              alert('Please select a tech');
              return;
            }

            sendBtn.disabled = true;
            form.style.display = 'none';
            loading.style.display = 'block';

            try {
              const response = await fetch('/api/send-completion-form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  leadId: engagementId,
                  techId: selected.value,
                  techName: selected.dataset.name,
                  techPhone: selected.dataset.phone,
                  messageTemplate: messageTextarea.value
                }),
              });

              const result = await response.json();

              if (response.ok) {
                document.querySelector('.container').innerHTML = \`
                  <div class="header" style="background: #4CAF50;">
                    <h1>✅ Message Sent!</h1>
                  </div>
                  <div class="content" style="text-align: center; padding: 50px;">
                    <p style="font-size: 18px; margin-bottom: 20px;">
                      Completion form sent to \${selected.dataset.name}
                    </p>
                    <button onclick="window.close()" class="btn-send">Close Window</button>
                  </div>
                \`;
              } else {
                throw new Error(result.error || 'Failed to send message');
              }
            } catch (error) {
              alert('Error sending message: ' + error.message);
              sendBtn.disabled = false;
              form.style.display = 'block';
              loading.style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing send completion form:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body>
        <h1>❌ Error</h1>
        <p>${error.message}</p>
      </body>
      </html>
    `);
  }
};

/**
 * Send completion form SMS to selected tech
 * POST /api/send-completion-form
 */
exports.sendCompletionForm = async (req, res) => {
  try {
    const { leadId, techId, techName, techPhone, messageTemplate } = req.body;

    if (!leadId || !techId || !techPhone || !messageTemplate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`📤 Sending completion form to ${techName} for engagement: ${leadId}`);

    const completionLink = `${process.env.BASE_URL}/c/${leadId}?tech=${encodeURIComponent(techName)}`;
    const firstName = techName.split(' ')[0];

    // Replace placeholders
    const message = messageTemplate
      .replace(/{{TECH_NAME}}/g, firstName)
      .replace(/{{LINK}}/g, completionLink);

    // Send SMS
    await twilioService.sendSMS(
      techPhone,
      message,
      { leadId, techId, type: 'completion_form' }
    );

    // Log message
    await airtableService.logMessage({
      engagementId: leadId,
      direction: 'Outbound',
      type: 'SMS',
      to: techPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: message,
      status: 'Sent',
    });

    // Mark as sent in Airtable (non-blocking — field may not exist yet)
    try {
      await airtableService.updateEngagement(leadId, {
        'Completion Form Sent': true,
      });
    } catch (updateErr) {
      console.warn('⚠️ Could not update Completion Form Sent field:', updateErr.message);
    }

    console.log(`✓ Completion form sent to ${techName}`);

    res.status(200).json({
      success: true,
      message: 'Completion form sent successfully',
    });
  } catch (error) {
    console.error('Error sending completion form:', error);
    res.status(500).json({ error: 'Failed to send completion form' });
  }
};

module.exports = exports;
