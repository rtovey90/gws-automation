const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Schedule Controllers - Tech schedules job date/time
 */

/**
 * Show schedule form for tech
 * GET /s/:leadId
 */
exports.showScheduleForm = async (req, res) => {
  try {
    const engagementId = req.params.leadId;

    console.log(`📅 Opening schedule form for engagement: ${engagementId}`);

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
          <p>Job not found</p>
        </body>
        </html>
      `);
    }

    const { engagement, customer } = result;
    const lead = engagement; // For backward compatibility

    const clientName = (customer && customer.fields['First Name']) || lead.fields['First Name (from Customer)'] || 'Client';
    const clientAddress = (customer && customer.fields.Address) || lead.fields['Address (from Customer)'] || '';
    const scope = lead.fields['Job Scope'] || lead.fields['Client intake info'] || '';

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Schedule Job - Great White Security</title>
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
            line-height: 1.5;
          }
          .job-details {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
          }
          .detail-row {
            margin-bottom: 10px;
          }
          .detail-label {
            font-weight: 600;
            color: #666;
            margin-bottom: 5px;
          }
          .detail-value {
            color: #333;
          }
          label {
            display: block;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
            font-size: 16px;
          }
          input[type="date"],
          select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 25px;
            font-family: inherit;
          }
          input:focus,
          select:focus {
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
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📅 Schedule Job</h1>
          <p class="subtitle">Please select the time and date you've scheduled to attend with ${clientName} so we can be available to support.</p>

          <div class="job-details">
            <div class="detail-row">
              <div class="detail-label">Client:</div>
              <div class="detail-value">${clientName}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Address:</div>
              <div class="detail-value">${clientAddress}</div>
            </div>
            ${scope ? `
            <div class="detail-row">
              <div class="detail-label">Scope:</div>
              <div class="detail-value">${scope}</div>
            </div>
            ` : ''}
          </div>

          <form id="scheduleForm">
            <input type="hidden" name="leadId" value="${engagementId}">

            <label for="scheduledDate">📆 Date:</label>
            <input type="date" name="scheduledDate" id="scheduledDate" required>

            <label for="scheduledTime">⏰ Time:</label>
            <select name="scheduledTime" id="scheduledTime" required>
              <option value="">-- Select time --</option>
              <option value="08:00">8:00 AM</option>
              <option value="08:30">8:30 AM</option>
              <option value="09:00">9:00 AM</option>
              <option value="09:30">9:30 AM</option>
              <option value="10:00">10:00 AM</option>
              <option value="10:30">10:30 AM</option>
              <option value="11:00">11:00 AM</option>
              <option value="11:30">11:30 AM</option>
              <option value="12:00">12:00 PM</option>
              <option value="12:30">12:30 PM</option>
              <option value="13:00">1:00 PM</option>
              <option value="13:30">1:30 PM</option>
              <option value="14:00">2:00 PM</option>
              <option value="14:30">2:30 PM</option>
              <option value="15:00">3:00 PM</option>
              <option value="15:30">3:30 PM</option>
              <option value="16:00">4:00 PM</option>
              <option value="16:30">4:30 PM</option>
              <option value="17:00">5:00 PM</option>
              <option value="17:30">5:30 PM</option>
              <option value="18:00">6:00 PM</option>
            </select>

            <button type="submit" class="btn">Confirm Schedule</button>
            <div class="loading" id="loading">Updating...</div>
          </form>
        </div>

        <script>
          // Set minimum date to today
          const dateInput = document.getElementById('scheduledDate');
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          dateInput.min = today;

          document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Form submit handler triggered');

            const formData = new FormData(e.target);

            // Combine date and time into datetime string
            const date = formData.get('scheduledDate');
            const time = formData.get('scheduledTime');
            const scheduledDate = date + 'T' + time;

            console.log('Submitting schedule:', date, time, scheduledDate);

            const data = {
              leadId: formData.get('leadId'),
              scheduledDate: scheduledDate,
            };

            // Disable button and show loading
            const btn = e.target.querySelector('.btn');
            btn.disabled = true;
            document.getElementById('loading').style.display = 'block';

            try {
              console.log('Sending request to /api/schedule-job');
              const response = await fetch('/api/schedule-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });

              console.log('Response status:', response.status);
              const result = await response.json();
              console.log('Response data:', result);

              if (result.success) {
                document.querySelector('.container').innerHTML =
                  '<div style="text-align: center; padding: 40px 0;">' +
                  '<div style="font-size: 72px; margin-bottom: 20px;">✅</div>' +
                  '<h1 style="color: #28a745; margin-bottom: 20px;">Job Scheduled!</h1>' +
                  '<p style="color: #666; font-size: 18px; margin-bottom: 20px;">The booking has been updated in the calendar.</p>' +
                  '<div style="background: #fff3cd; border: 2px solid #ffc107; padding: 20px; border-radius: 8px; margin: 20px 0;">' +
                  '<p style="color: #856404; font-weight: 600; margin-bottom: 10px;">📋 Important:</p>' +
                  '<p style="color: #856404; margin: 0;">Please fill out the completion form BEFORE leaving the site.</p>' +
                  '<p style="color: #856404; margin-top: 10px; font-size: 14px;">📱 A link will be sent via SMS</p>' +
                  '</div>' +
                  '<p style="color: #999; margin-top: 20px;">You can close this window.</p>' +
                  '</div>';
              } else {
                console.error('Schedule failed:', result);
                alert('Error: ' + (result.error || 'Failed to schedule job') + (result.details ? '\\n\\nDetails: ' + result.details : ''));
                btn.disabled = false;
                document.getElementById('loading').style.display = 'none';
              }
            } catch (error) {
              console.error('Schedule error:', error);
              alert('Error scheduling job: ' + error.message + '\\n\\nPlease check your internet connection and try again.');
              btn.disabled = false;
              document.getElementById('loading').style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing schedule form:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Update scheduled date
 * POST /api/schedule-job
 */
exports.scheduleJob = async (req, res) => {
  try {
    const engagementId = req.body.leadId;
    const { scheduledDate } = req.body;

    if (!engagementId || !scheduledDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`📅 Scheduling job for engagement ${engagementId} on ${scheduledDate}`);

    // Get engagement first to check if already scheduled
    const engagement = await airtableService.getEngagement(engagementId);
    const lead = engagement; // For backward compatibility
    const wasAlreadyScheduled = engagement.fields['Scheduled 📅']; // Check if already scheduled
    const clientFirstName = engagement.fields['First Name (from Customer)'] || 'the client';
    const assignedTechIds = engagement.fields['Assigned Tech Name'];

    // Convert datetime-local format to ISO 8601 for Airtable
    // Input: "2026-01-22T10:40" -> Output: "2026-01-22T10:40:00.000Z"
    const isoDate = new Date(scheduledDate).toISOString();
    console.log(`📅 Converted date to ISO: ${isoDate}`);

    // Update engagement with scheduled date and status
    await airtableService.updateEngagement(engagementId, {
      'Scheduled 📅': isoDate,
      Status: 'Scheduled 📅',
    });

    console.log(wasAlreadyScheduled ? `✓ Engagement re-scheduled successfully (no SMS sent)` : `✓ Engagement scheduled successfully`);

    // Create completion form URL (no short link needed - direct URL)
    const completionUrl = `${process.env.BASE_URL}/c/${engagementId}`;

    console.log(`🔗 Completion URL: ${completionUrl}`);

    // Only send SMS if this is the FIRST time scheduling (not a re-schedule)
    if (!wasAlreadyScheduled && assignedTechIds && assignedTechIds.length > 0) {
      const techId = assignedTechIds[0];
      const tech = await airtableService.getTech(techId);
      const techFirstName = tech.fields['First Name'] || 'there';
      const techPhone = tech.fields.Phone;

      if (techPhone) {
        // Send SMS to tech with completion link
        const message = `Hey ${techFirstName},

Thanks for scheduling the job with ${clientFirstName}.

Please fill out the completion form BEFORE leaving the site:

${completionUrl}

This helps us track system details, codes, and upgrade opportunities.

Cheers,
Ricky (Great White Security)`;

        await twilioService.sendSMS(
          techPhone,
          message,
          { leadId: engagementId, type: 'completion_reminder' }
        );

        console.log(`✓ Completion SMS sent to ${techFirstName}`);

        // Log the message
        await airtableService.logMessage({
          engagementId: engagementId,
          direction: 'Outbound',
          type: 'SMS',
          to: techPhone,
          from: process.env.TWILIO_PHONE_NUMBER,
          content: message,
          status: 'Sent',
        });
      }
    }

    res.status(200).json({ success: true, completionLink: completionUrl });
  } catch (error) {
    console.error('Error scheduling job:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to schedule job', details: error.message });
  }
};

module.exports = exports;
