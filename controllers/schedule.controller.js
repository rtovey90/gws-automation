const airtableService = require('../services/airtable.service');

/**
 * Schedule Controllers - Tech schedules job date/time
 */

/**
 * Show schedule form for tech
 * GET /s/:leadId
 */
exports.showScheduleForm = async (req, res) => {
  try {
    const { leadId } = req.params;

    console.log(`📅 Opening schedule form for lead: ${leadId}`);

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
          <p>Job not found</p>
        </body>
        </html>
      `);
    }

    const clientName = lead.fields['First Name'] || 'Client';
    const clientAddress = lead.fields['Address/Location'] || '';
    const scope = lead.fields.Notes || '';

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
          input[type="datetime-local"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 25px;
            font-family: inherit;
          }
          input:focus {
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
            <input type="hidden" name="leadId" value="${leadId}">

            <label for="scheduledDate">📆 Scheduled Date & Time:</label>
            <input type="datetime-local" name="scheduledDate" id="scheduledDate" required>

            <button type="submit" class="btn">Confirm Schedule</button>
            <div class="loading" id="loading">Updating...</div>
          </form>
        </div>

        <script>
          // Set minimum date to today
          const dateInput = document.getElementById('scheduledDate');
          const now = new Date();
          now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
          dateInput.min = now.toISOString().slice(0, 16);

          document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const data = {
              leadId: formData.get('leadId'),
              scheduledDate: formData.get('scheduledDate'),
            };

            // Disable button and show loading
            const btn = e.target.querySelector('.btn');
            btn.disabled = true;
            document.getElementById('loading').style.display = 'block';

            try {
              const response = await fetch('/api/schedule-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });

              const result = await response.json();

              if (result.success) {
                document.querySelector('.container').innerHTML = \`
                  <div style="text-align: center; padding: 40px 0;">
                    <div style="font-size: 72px; margin-bottom: 20px;">✅</div>
                    <h1 style="color: #28a745; margin-bottom: 20px;">Job Scheduled!</h1>
                    <p style="color: #666; font-size: 18px;">The booking has been updated in the calendar.</p>
                    <p style="color: #999; margin-top: 20px;">You can close this window.</p>
                  </div>
                \`;
              } else {
                alert('Error: ' + result.error);
                btn.disabled = false;
                document.getElementById('loading').style.display = 'none';
              }
            } catch (error) {
              alert('Error scheduling job: ' + error.message);
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
    const { leadId, scheduledDate } = req.body;

    if (!leadId || !scheduledDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`📅 Scheduling job for lead ${leadId} on ${scheduledDate}`);

    // Convert datetime-local format to ISO 8601 for Airtable
    // Input: "2026-01-22T10:40" -> Output: "2026-01-22T10:40:00.000Z"
    const isoDate = new Date(scheduledDate).toISOString();
    console.log(`📅 Converted date to ISO: ${isoDate}`);

    // Update lead with scheduled date and status
    await airtableService.updateLead(leadId, {
      'Scheduled Date': isoDate,
      Status: 'Scheduled 📅',
    });

    console.log(`✓ Lead scheduled successfully`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error scheduling job:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to schedule job', details: error.message });
  }
};

module.exports = exports;
