const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Tech Assignment Controllers - Assign techs to jobs
 */

/**
 * Show tech assignment form
 * GET /assign-tech/:jobId
 */
exports.showAssignmentForm = async (req, res) => {
  try {
    const { jobId } = req.params;

    console.log(`👷 Opening tech assignment form for job: ${jobId}`);

    // Get job details
    const job = await airtableService.getJob(jobId);

    if (!job) {
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

    // Get lead details
    const leadId = job.fields.Lead?.[0];
    let leadDetails = { name: 'Unknown', phone: '', address: '' };

    if (leadId) {
      const lead = await airtableService.getLead(leadId);
      if (lead) {
        leadDetails = {
          name: [lead.fields['First Name'], lead.fields['Last Name']].filter(Boolean).join(' ') || 'Unknown',
          phone: lead.fields.Phone || '',
          address: lead.fields['Address/Location'] || '',
        };
      }
    }

    // Get all techs
    const techs = await airtableService.getAllTechs();

    // Build tech list HTML
    const techOptions = techs.map(tech => {
      const skills = tech.fields.Skills ? tech.fields.Skills.join(', ') : 'No skills listed';
      const availability = tech.fields['Availability Status'] || 'Unknown';
      const availabilityColor = availability === 'Available' ? '#28a745' : availability === 'Busy' ? '#ffc107' : '#6c757d';

      return `
        <div class="tech-card" data-tech-id="${tech.id}">
          <input type="radio" name="techId" value="${tech.id}" id="tech-${tech.id}" required>
          <label for="tech-${tech.id}">
            <div class="tech-info">
              <div class="tech-name">${tech.fields.Name || 'Unknown'}</div>
              <div class="tech-status" style="color: ${availabilityColor};">● ${availability}</div>
            </div>
            <div class="tech-skills">${skills}</div>
            <div class="tech-phone">${tech.fields.Phone || 'No phone'}</div>
          </label>
        </div>
      `;
    }).join('');

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
            max-width: 800px;
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
          .job-details {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
          }
          .job-details h2 {
            font-size: 18px;
            color: #333;
            margin-bottom: 15px;
          }
          .detail-row {
            display: flex;
            margin-bottom: 10px;
          }
          .detail-label {
            font-weight: 600;
            color: #666;
            width: 120px;
          }
          .detail-value {
            color: #333;
            flex: 1;
          }
          .section-title {
            font-size: 20px;
            color: #333;
            margin-bottom: 20px;
            font-weight: 600;
          }
          .tech-card {
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
          }
          .tech-card:hover {
            border-color: #667eea;
            background: #f8f9ff;
          }
          .tech-card input[type="radio"] {
            position: absolute;
            opacity: 0;
          }
          .tech-card input[type="radio"]:checked + label {
            background: #f8f9ff;
          }
          .tech-card input[type="radio"]:checked ~ * {
            border-color: #667eea;
          }
          .tech-card label {
            cursor: pointer;
            display: block;
          }
          .tech-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          .tech-name {
            font-size: 18px;
            font-weight: 600;
            color: #333;
          }
          .tech-status {
            font-size: 14px;
            font-weight: 600;
          }
          .tech-skills {
            color: #666;
            font-size: 14px;
            margin-bottom: 5px;
          }
          .tech-phone {
            color: #999;
            font-size: 13px;
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
            margin-top: 20px;
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
          <h1>👷 Assign Tech to Job</h1>
          <p class="subtitle">Select a technician to assign to this job</p>

          <div class="job-details">
            <h2>📋 Job Details</h2>
            <div class="detail-row">
              <div class="detail-label">Client:</div>
              <div class="detail-value">${leadDetails.name}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Phone:</div>
              <div class="detail-value">${leadDetails.phone}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Address:</div>
              <div class="detail-value">${leadDetails.address}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Scope:</div>
              <div class="detail-value">${job.fields['Scope of Work'] || 'Not specified'}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Price:</div>
              <div class="detail-value">$${job.fields['Quoted Price'] || '0'}</div>
            </div>
          </div>

          <div class="section-title">👥 Select Technician</div>

          <form id="assignmentForm">
            <input type="hidden" name="jobId" value="${jobId}">

            ${techOptions}

            <button type="submit" class="btn">Assign Tech & Send SMS</button>
            <div class="loading" id="loading">Sending...</div>
          </form>
        </div>

        <script>
          document.getElementById('assignmentForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const data = {
              jobId: formData.get('jobId'),
              techId: formData.get('techId'),
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
                    <p style="color: #666; font-size: 18px;">SMS sent to technician with job details.</p>
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

          // Make entire card clickable
          document.querySelectorAll('.tech-card').forEach(card => {
            card.addEventListener('click', () => {
              const radio = card.querySelector('input[type="radio"]');
              radio.checked = true;
            });
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
 * Assign tech to job and send SMS
 * POST /api/assign-tech
 */
exports.assignTech = async (req, res) => {
  try {
    const { jobId, techId } = req.body;

    if (!jobId || !techId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`👷 Assigning tech ${techId} to job ${jobId}`);

    // Get job and tech details
    const job = await airtableService.getJob(jobId);
    const tech = await airtableService.getTech(techId);

    if (!job || !tech) {
      return res.status(404).json({ error: 'Job or tech not found' });
    }

    // Get lead details
    const leadId = job.fields.Lead?.[0];
    let clientName = 'Client';
    let clientPhone = '';
    let clientAddress = '';

    if (leadId) {
      const lead = await airtableService.getLead(leadId);
      if (lead) {
        clientName = [lead.fields['First Name'], lead.fields['Last Name']].filter(Boolean).join(' ') || 'Client';
        clientPhone = lead.fields.Phone || '';
        clientAddress = lead.fields['Address/Location'] || '';
      }
    }

    // Update job with assigned tech
    await airtableService.updateJob(jobId, {
      'Assigned Tech': [techId],
      Status: 'Tech Assigned 👷',
    });

    console.log(`✓ Job updated with assigned tech`);

    // Send SMS to tech
    const jobScope = job.fields['Scope of Work'] || 'Service call';
    const jobPrice = job.fields['Quoted Price'] || '0';

    const message = `Hi ${tech.fields.Name}, Ricky here from Great White Security.

New job assigned to you:

Client: ${clientName}
Phone: ${clientPhone}
Address: ${clientAddress}

Job: ${jobScope}
Payment: $${jobPrice} (already paid)

Client is expecting you to reach out to schedule the visit.

Thanks!`;

    await twilioService.sendSMS(
      tech.fields.Phone,
      message,
      { jobId, techId, type: 'job_assignment' }
    );

    console.log(`✓ SMS sent to tech: ${tech.fields.Name}`);

    // Log message
    await airtableService.logMessage({
      jobId: jobId,
      direction: 'Outbound',
      type: 'SMS',
      to: tech.fields.Phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: message,
      status: 'Sent',
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error assigning tech:', error);
    res.status(500).json({ error: 'Failed to assign tech' });
  }
};

module.exports = exports;
