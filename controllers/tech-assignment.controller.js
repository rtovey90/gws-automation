const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Tech Assignment Controllers - Assign techs to leads
 */

/**
 * Show tech assignment form with editable message
 * GET /assign-tech/:leadId
 */
exports.showAssignmentForm = async (req, res) => {
  try {
    const engagementId = req.params.leadId;

    console.log(`👷 Opening tech assignment form for engagement: ${engagementId}`);

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
    const lead = engagement; // For backward compatibility

    // Get client info from customer
    const clientFirstName = (customer && customer.fields['First Name']) || lead.fields['First Name (from Customer)'] || 'Unknown';
    const clientLastName = (customer && customer.fields['Last Name']) || lead.fields['Last Name (from Customer)'] || '';
    const clientFullName = [clientFirstName, clientLastName].filter(Boolean).join(' ') || 'Unknown';
    const clientPhone = (customer && (customer.fields['Mobile Phone'] || customer.fields.Phone)) || lead.fields['Mobile Phone (from Customer)'] || lead.fields['Phone (from Customer)'] || '';
    const clientAddress = (customer && customer.fields.Address) || lead.fields['Address (from Customer)'] || '';
    const scope = lead.fields['Job Scope'] || lead.fields['Client intake info'] || 'Service requested';

    // Handle System Type - could be string (single select) or array (multiple select)
    const systemTypeField = lead.fields['System Type'];
    const systemType = systemTypeField
      ? (Array.isArray(systemTypeField) ? systemTypeField.join(', ') : systemTypeField)
      : 'System';

    // Get all techs
    const techs = await airtableService.getAllTechs();

    // Build tech dropdown options
    const techOptions = techs.map(tech => {
      const techName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || 'Unknown';
      const location = tech.fields['Home Location'] || 'Unknown location';
      const skills = tech.fields.Skills ? tech.fields.Skills.join(', ') : 'No skills';
      const availability = tech.fields['Availability Status'] || 'Unknown';
      return `<option value="${tech.id}">${techName} (${location}) - ${availability} - ${skills}</option>`;
    }).join('');

    // Message templates
    const calendarLink = `${process.env.SHORT_LINK_DOMAIN || 'book.greatwhitesecurity.com'}/s/${engagementId}`;

    const defaultMessage = `Hey [TECH_NAME],

Here are the details for the confirmed booking:

Client: ${clientFirstName}
Phone: ${clientPhone}
Address: ${clientAddress}

System: ${systemType}

Scope:
${scope}

Next steps:

1. Call ${clientFirstName} **within 24 hours** to schedule a time to attend within the next week
2. Update Calendar: ${calendarLink}

Feel free to call if you have any questions!

Cheers,

Ricky (Great White Security)`;

    const emergencyMessage = `Hey [TECH_NAME],

Here are the details for the confirmed service call (today):

Client: ${clientFirstName}
Phone: ${clientPhone}
Address: ${clientAddress}

System: ${systemType}

Scope:
${scope}

Pay: $250 + GST for 1st hour
$150 + GST for additional hours

Next steps:

1. Call ${clientFirstName} **ASAP** to confirm ETA
2. Update Calendar: ${calendarLink}

Feel free to call if you have any questions!

Cheers,

Ricky (Great White Security)`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Assign Tech - Great White Security</title>
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
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 {
            color: #333;
            font-size: 28px;
            margin-bottom: 10px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
          }
          .client-info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
          }
          .info-row {
            display: flex;
            margin-bottom: 10px;
          }
          .info-label {
            font-weight: 600;
            color: #666;
            width: 100px;
          }
          .info-value {
            color: #333;
            flex: 1;
          }
          label {
            display: block;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
            font-size: 16px;
          }
          select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 25px;
            font-family: inherit;
          }
          select:focus {
            outline: none;
            border-color: #667eea;
          }
          textarea {
            width: 100%;
            min-height: 400px;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 15px;
            font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
            line-height: 1.6;
            resize: vertical;
            margin-bottom: 20px;
          }
          textarea:focus {
            outline: none;
            border-color: #667eea;
          }
          .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 15px 40px;
            font-size: 18px;
            border-radius: 8px;
            cursor: pointer;
            width: 100%;
            font-weight: 600;
            transition: background 0.2s;
          }
          .btn:hover {
            background: #5568d3;
          }
          .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .loading {
            display: none;
            text-align: center;
            color: #667eea;
            font-weight: 600;
            margin-top: 20px;
          }
          .preview-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .preview-title {
            font-size: 16px;
            font-weight: 600;
            color: #666;
            margin-bottom: 15px;
          }
          .preview-message {
            background: white;
            border-radius: 8px;
            padding: 15px;
            white-space: pre-wrap;
            font-family: inherit;
            color: #333;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>👷 Assign Tech</h1>
          <p class="subtitle">Select technician and review message before sending</p>

          <div class="client-info">
            <div class="info-row">
              <div class="info-label">Client:</div>
              <div class="info-value">${clientFirstName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Phone:</div>
              <div class="info-value">${clientPhone}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Address:</div>
              <div class="info-value">${clientAddress}</div>
            </div>
          </div>

          <form id="assignmentForm">
            <input type="hidden" name="leadId" value="${engagementId}">

            <label for="techId">📱 Select Technician:</label>
            <select name="techId" id="techId" required>
              <option value="">-- Select a tech --</option>
              ${techOptions}
            </select>

            <label for="template">📋 Message Template:</label>
            <select id="template" name="template" style="margin-bottom: 16px;">
              <option value="standard" selected>Standard Callout</option>
              <option value="emergency">Emergency Callout</option>
              <option value="custom">Custom (keep current text)</option>
            </select>

            <label for="message">📝 Edit Message:</label>
            <textarea name="message" id="message" required>${defaultMessage}</textarea>

            <div class="preview-section">
              <div class="preview-title">👁️ Preview (what tech will receive):</div>
              <div class="preview-message" id="preview"></div>
            </div>

            <button type="submit" class="btn">Send SMS to Tech</button>
            <div class="loading" id="loading">Sending...</div>
          </form>
        </div>

        <script>
          const techSelect = document.getElementById('techId');
          const messageTextarea = document.getElementById('message');
          const previewDiv = document.getElementById('preview');
          const templateSelect = document.getElementById('template');

          // Templates injected from server
          const templates = {
            standard: ${JSON.stringify(defaultMessage)},
            emergency: ${JSON.stringify(emergencyMessage)},
          };

          // Store tech data (use first name only for greeting)
          const techData = ${JSON.stringify(techs.map(t => ({
            id: t.id,
            name: t.fields['First Name'] || 'Unknown'
          })))};

          function updatePreview() {
            const selectedTechId = techSelect.value;
            const selectedTech = techData.find(t => t.id === selectedTechId);
            const techName = selectedTech ? selectedTech.name : '[TECH_NAME]';

            let message = messageTextarea.value;
            message = message.replace(/\\[TECH_NAME\\]/g, techName);

            previewDiv.textContent = message;
          }

          // Handle template change
          templateSelect.addEventListener('change', function() {
            if (templateSelect.value === 'custom') return;
            messageTextarea.value = templates[templateSelect.value];
            updatePreview();
          });

          techSelect.addEventListener('change', updatePreview);
          messageTextarea.addEventListener('input', updatePreview);

          // Initial preview
          updatePreview();

          document.getElementById('assignmentForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const data = {
              leadId: formData.get('leadId'),
              techId: formData.get('techId'),
              message: formData.get('message'),
            };

            // Disable button and show loading
            const btn = e.target.querySelector('.btn');
            btn.disabled = true;
            document.getElementById('loading').style.display = 'block';

            try {
              const response = await fetch('/api/assign-tech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });

              const result = await response.json();

              if (result.success) {
                document.querySelector('.container').innerHTML = \`
                  <div style="text-align: center; padding: 40px 0;">
                    <div style="font-size: 72px; margin-bottom: 20px;">✅</div>
                    <h1 style="color: #28a745; margin-bottom: 20px;">Tech Assigned!</h1>
                    <p style="color: #666; font-size: 18px;">SMS sent to technician.</p>
                    <p style="color: #999; margin-top: 20px;">You can close this window.</p>
                  </div>
                \`;
              } else {
                alert('Error: ' + result.error);
                btn.disabled = false;
                document.getElementById('loading').style.display = 'none';
              }
            } catch (error) {
              alert('Error assigning tech: ' + error.message);
              btn.disabled = false;
              document.getElementById('loading').style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing tech assignment form:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Assign tech to lead and send SMS
 * POST /api/assign-tech
 */
exports.assignTech = async (req, res) => {
  try {
    const engagementId = req.body.leadId;
    const { techId, message } = req.body;

    if (!engagementId || !techId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`👷 Assigning tech ${techId} to engagement ${engagementId}`);

    // Get engagement and tech details
    const engagement = await airtableService.getEngagement(engagementId);
    const lead = engagement; // For backward compatibility
    const tech = await airtableService.getTech(techId);

    if (!engagement || !tech) {
      return res.status(404).json({ error: 'Engagement or tech not found' });
    }

    // Replace [TECH_NAME] placeholder in message (use first name only)
    const techFirstName = tech.fields['First Name'] || 'there';
    const finalMessage = message.replace(/\[TECH_NAME\]/g, techFirstName);

    // Update engagement with assigned tech and status
    await airtableService.updateEngagement(engagementId, {
      'Assigned Tech Name': [techId],
      Status: 'Tech Assigned 👷',
      'Tech Assigned At': new Date().toISOString(),
    });

    console.log(`✓ Engagement updated with assigned tech`);

    // Send SMS to tech
    await twilioService.sendSMS(
      tech.fields.Phone,
      finalMessage,
      { leadId: engagementId, techId, type: 'tech_assignment' }
    );

    console.log(`✓ SMS sent to tech: ${techFirstName}`);

    // Log message
    await airtableService.logMessage({
      engagementId: engagementId,
      direction: 'Outbound',
      type: 'SMS',
      to: tech.fields.Phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: finalMessage,
      status: 'Sent',
    });

    // Log activity
    const techFullName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || techFirstName;
    airtableService.logActivity(engagementId, `Tech ${techFullName} assigned`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error assigning tech:', error);
    res.status(500).json({ error: 'Failed to assign tech' });
  }
};

module.exports = exports;
