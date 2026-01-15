const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Message Form Controllers - Show editable message forms before sending
 */

/**
 * Show message form with pre-filled template
 * GET /send-message-form/:leadId/:messageType
 */
exports.showMessageForm = async (req, res) => {
  try {
    const { leadId, messageType } = req.params;

    console.log(`📝 Opening message form: ${messageType} for lead: ${leadId}`);

    // Get lead details
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
          <p>Lead not found</p>
        </body>
        </html>
      `);
    }

    // Determine template name and field mappings based on message type
    let templateName;
    let sentField;
    let pageTitle;

    switch (messageType) {
      case 'request-photos':
        templateName = 'Request Photos from Client';
        sentField = 'Sent: Request Photos';
        pageTitle = 'Request Photos';
        break;
      case 'checking-availability':
        templateName = 'Checking Availability Message';
        sentField = 'Sent: Checking Availability';
        pageTitle = 'Checking Availability';
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
    const firstName = lead.fields['First Name'] || 'there';
    const uploadLink = `${process.env.BASE_URL}/upload-photos/${leadId}`;

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
              <p><strong>Phone:</strong> ${lead.fields.Phone || 'No phone number'}</p>
              <p><strong>Address:</strong> ${lead.fields['Address/Location'] || 'N/A'}</p>
            </div>

            ${!lead.fields.Phone ? '<div class="warning">⚠️ Warning: This lead has no phone number!</div>' : ''}

            <form id="messageForm">
              <label for="message">Message (edit as needed):</label>
              <textarea
                id="message"
                name="message"
                required
                ${!lead.fields.Phone ? 'disabled' : ''}
              >${messageContent}</textarea>
              <div class="character-count">
                <span id="charCount">${messageContent.length}</span> characters
                <span id="smsCount"></span>
              </div>

              <div class="buttons">
                <button type="button" class="btn-cancel" onclick="window.close()">
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn-send"
                  id="sendBtn"
                  ${!lead.fields.Phone ? 'disabled' : ''}
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

          // Update character count
          textarea.addEventListener('input', () => {
            const length = textarea.value.length;
            charCount.textContent = length;

            // Calculate SMS segments (160 chars per SMS)
            const segments = Math.ceil(length / 160);
            smsCount.textContent = segments > 1 ? \`(\${segments} SMS messages)\` : '';
          });

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
                  leadId: '${leadId}',
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
    const { leadId, messageType, message, sentField } = req.body;

    console.log(`📤 Sending ${messageType} message for lead: ${leadId}`);

    // Get lead
    const lead = await airtableService.getLead(leadId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (!lead.fields.Phone) {
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    // Send SMS
    await twilioService.sendSMS(
      lead.fields.Phone,
      message,
      { leadId, messageType }
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

    // Mark as sent in Airtable
    await airtableService.updateLead(leadId, {
      [sentField]: true,
    });

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

module.exports = exports;
