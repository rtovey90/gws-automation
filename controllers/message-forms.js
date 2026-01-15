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

/**
 * Show tech availability form with tech selection
 * GET /send-tech-availability-form/:leadId
 */
exports.showTechAvailabilityForm = async (req, res) => {
  try {
    const { leadId } = req.params;

    console.log(`📋 Opening tech availability form for lead: ${leadId}`);

    // Get lead details
    const lead = await airtableService.getLead(leadId);

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

    // Get all available techs
    const techs = await airtableService.getAvailableTechs();

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
    const jobDescription = lead.fields['Client intake info'] || lead.fields.Notes || 'No details provided yet';

    // Build default message (will be editable)
    const techName = '{{TECH_NAME}}';
    const defaultMessage = `Hey ${techName}, got a service call this week if you're available!

Location: ${lead.fields['Address/Location'] || 'TBD'}
Service: ${lead.fields['Lead Type'] || 'Security work'}

Scope:
${jobDescription.length > 200 ? jobDescription.substring(0, 200) + '...' : jobDescription}

Please make your selection:

👍 YES: {{YES_LINK}}

👎 NO: {{NO_LINK}}

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
        <title>Check Tech Availability - ${lead.fields['First Name']}</title>
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
              <p><strong>Lead:</strong> ${lead.fields['First Name'] || 'Unknown'}</p>
              <p><strong>Location:</strong> ${lead.fields['Address/Location'] || 'N/A'}</p>
              <p><strong>Service:</strong> ${lead.fields['Lead Type'] || 'N/A'}</p>
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

            // Replace placeholders with example values
            const yesLink = \`https://gws-automation-production.up.railway.app/tech-availability/${leadId}/\${firstChecked.value}/yes\`;
            const noLink = \`https://gws-automation-production.up.railway.app/tech-availability/${leadId}/\${firstChecked.value}/no\`;

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
                  leadId: '${leadId}',
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
    const { leadId, selectedTechs, messageTemplate } = req.body;

    console.log(`📤 Sending tech availability to ${selectedTechs.length} techs for lead: ${leadId}`);

    const results = [];

    // Send to each selected tech
    for (const tech of selectedTechs) {
      try {
        const yesLink = `${process.env.BASE_URL}/tech-availability/${leadId}/${tech.id}/yes`;
        const noLink = `${process.env.BASE_URL}/tech-availability/${leadId}/${tech.id}/no`;

        // Replace variables in template
        const message = messageTemplate
          .replace(/{{TECH_NAME}}/g, tech.name.split(' ')[0]) // Use first name only
          .replace(/{{YES_LINK}}/g, yesLink)
          .replace(/{{NO_LINK}}/g, noLink);

        await twilioService.sendSMS(
          tech.phone,
          message,
          { leadId, techId: tech.id, type: 'availability_check' }
        );

        results.push({ techId: tech.id, tech: tech.name, status: 'sent' });
        console.log(`  ✓ Sent to ${tech.name}`);
      } catch (error) {
        console.error(`  ✗ Failed to send to tech ${tech.id}:`, error.message);
        results.push({ techId: tech.id, status: 'failed', error: error.message });
      }
    }

    // Update lead to mark availability requested
    await airtableService.updateLead(leadId, {
      'Tech Availability Requested': true,
      'Tech Availability Responses': `Availability check sent to ${selectedTechs.length} techs at ${new Date().toISOString()}`
    });

    res.status(200).json({
      success: true,
      leadId,
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
    const { leadId } = req.params;

    console.log(`💵 Opening pricing form for lead: ${leadId}`);

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

    // Build client name
    const clientName = lead.fields['First Name'] || 'there';
    const leadFullName = [lead.fields['First Name'], lead.fields['Last Name']].filter(Boolean).join(' ') || 'Client';

    const productName = selectedProduct.fields['Product Name'];
    const paymentLink = selectedProduct.fields['Stripe Payment Link'];

    const defaultMessage = `Hi ${clientName}, thank you for your interest!

Good news! I can have one of our technicians out this week.

${productName}

To lock it in, please make payment here:
${paymentLink}

Once payment's through, we'll reach out to schedule.

Thanks,

Ricky (Great White Security)`;

    // Show form
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Send Pricing - ${lead.fields.Name}</title>
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
        </style>
      </head>
      <body>
        <div class="container">
          <h1>💵 Send Pricing to Client</h1>
          <p class="subtitle">Review and edit the pricing message before sending</p>

          <div class="info-box">
            <strong>Client:</strong> ${leadFullName}<br>
            <strong>Phone:</strong> ${lead.fields.Phone}
          </div>

          <form id="pricingForm">
            <label for="product">📦 Select Product:</label>
            <select id="product" name="product">
              ${products.map(p => `
                <option value="${p.id}" data-name="${p.fields['Product Name']}" data-link="${p.fields['Stripe Payment Link']}" ${p.id === selectedProduct.id ? 'selected' : ''}>
                  ${p.fields['Product Name']}
                </option>
              `).join('')}
            </select>

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
          const clientName = '${clientName}';

          // Update preview when message changes
          function updatePreview() {
            preview.textContent = messageTextarea.value;
          }

          // Update message when product changes
          function updateMessage() {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            const productName = selectedOption.dataset.name;
            const paymentLink = selectedOption.dataset.link;

            const newMessage = \`Hi \${clientName}, thank you for your interest!

Good news! I can have one of our technicians out this week.

\${productName}

To lock it in, please make payment here:
\${paymentLink}

Once payment's through, we'll reach out to schedule.

Thanks,

Ricky (Great White Security)\`;

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
                  leadId: '${leadId}',
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
    const { leadId, message, productId } = req.body;

    if (!leadId || !message || !productId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`💵 Sending pricing message for lead: ${leadId}`);

    // Get lead details
    const lead = await airtableService.getLead(leadId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Verify phone number exists
    if (!lead.fields.Phone) {
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    // Send SMS via Twilio
    await twilioService.sendSMS(
      lead.fields.Phone,
      message,
      { leadId, type: 'pricing' }
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

    // Update lead with selected product and status
    await airtableService.updateLead(leadId, {
      'Selected Product': [productId],
      Status: 'Quoted',
    });

    console.log(`✓ Pricing SMS sent to ${lead.fields.Name}`);

    res.status(200).json({
      success: true,
      message: 'Pricing sent successfully',
    });
  } catch (error) {
    console.error('Error sending pricing:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

module.exports = exports;
