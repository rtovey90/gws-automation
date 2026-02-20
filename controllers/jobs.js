const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');
const path = require('path');
const fs = require('fs');

/**
 * Job Management Controllers - Handle job offers, acceptance, and updates
 */

/**
 * Send job offer to selected techs
 * POST /api/send-job-offer
 * Body: { jobId, techIds: [array of tech IDs] }
 */
exports.sendJobOffer = async (req, res) => {
  try {
    const { jobId, techIds } = req.body;

    if (!jobId || !techIds || techIds.length === 0) {
      return res.status(400).json({ error: 'jobId and techIds are required' });
    }

    console.log(`📤 Sending job offer for job: ${jobId} to ${techIds.length} techs`);

    // Get job details
    const job = await airtableService.getJob(jobId);

    // Send SMS to each tech
    const results = [];
    for (const techId of techIds) {
      try {
        const tech = await airtableService.getTech(techId);
        const acceptLink = `${process.env.BASE_URL}/accept-job/${jobId}/${techId}`;

        await twilioService.sendJobOfferToTech(tech, job, acceptLink);

        results.push({ techId, tech: tech.fields.Name, status: 'sent' });
        console.log(`  ✓ Sent to ${tech.fields.Name}`);
      } catch (error) {
        console.error(`  ✗ Failed to send to tech ${techId}:`, error.message);
        results.push({ techId, status: 'failed', error: error.message });
      }
    }

    // Update job status
    await airtableService.updateJob(jobId, {
      'Job Status': 'Awaiting Tech',
    });

    res.status(200).json({
      success: true,
      jobId,
      results,
    });
  } catch (error) {
    console.error('Error sending job offer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Tech accepts job (via SMS link)
 * GET /accept-job/:jobId/:techId
 */
exports.acceptJob = async (req, res) => {
  try {
    const { jobId, techId } = req.params;

    console.log(`📋 Tech ${techId} attempting to accept job ${jobId}`);

    // Get job details
    const job = await airtableService.getJob(jobId);

    // Check if job already has an assigned tech
    if (job.fields['Assigned Tech'] && job.fields['Assigned Tech'].length > 0) {
      // Job already taken
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Job Already Taken</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .message {
              background: #fff3cd;
              border: 2px solid #ffc107;
              padding: 30px;
              border-radius: 10px;
            }
            h1 { color: #856404; }
            p { font-size: 18px; color: #856404; }
          </style>
        </head>
        <body>
          <div class="message">
            <h1>⚠️ Job Already Taken</h1>
            <p>Sorry, this job has already been accepted by another technician.</p>
            <p>Better luck next time!</p>
          </div>
        </body>
        </html>
      `);
    }

    // Get tech details
    const tech = await airtableService.getTech(techId);

    // Assign tech to job
    await airtableService.assignTechToJob(jobId, techId);

    console.log(`✓ Job ${jobId} assigned to ${tech.fields.Name}`);

    // Check if auto-send pricing is enabled
    if (job.fields['Auto-Send Pricing']) {
      try {
        await twilioService.sendClientPricing(job, tech);
        await airtableService.updateJob(jobId, {
          'Payment Status': 'Awaiting Payment',
        });
        console.log('✓ Client pricing SMS sent automatically');
      } catch (error) {
        console.error('Error auto-sending pricing SMS:', error);
      }
    }

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Job Accepted</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
          }
          .success {
            background: #d4edda;
            border: 2px solid #28a745;
            padding: 30px;
            border-radius: 10px;
          }
          h1 { color: #155724; margin-bottom: 20px; }
          .details {
            text-align: left;
            background: white;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
          }
          .details p {
            margin: 10px 0;
            color: #333;
          }
          .details strong {
            color: #155724;
          }
        </style>
      </head>
      <body>
        <div class="success">
          <h1>✅ Job Accepted!</h1>
          <p style="font-size: 18px; color: #155724;">You've been assigned to this job.</p>

          <div class="details">
            <p><strong>Client:</strong> ${job.fields['Client Name'] ? job.fields['Client Name'][0] : 'N/A'}</p>
            <p><strong>Address:</strong> ${job.fields['Client Address']}</p>
            <p><strong>Scope:</strong> ${job.fields['Scope of Work']}</p>
          </div>

          <p style="color: #666;">You'll receive another SMS once payment is received with client contact details.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error accepting job:', error);
    res.status(500).send('Error accepting job. Please contact Ricky.');
  }
};

/**
 * Show job update form for tech
 * GET /job-update/:jobId/:techId
 */
exports.showUpdateForm = async (req, res) => {
  try {
    const { jobId, techId } = req.params;

    // Get job and tech details
    const job = await airtableService.getJob(jobId);
    const tech = await airtableService.getTech(techId);

    // Verify tech is assigned to this job
    if (!job.fields['Assigned Tech'] || job.fields['Assigned Tech'][0] !== techId) {
      return res.status(403).send('Unauthorized');
    }

    // Read and serve the job update HTML form
    const formPath = path.join(__dirname, '../views/job-update.html');
    let html = fs.readFileSync(formPath, 'utf8');

    // Replace placeholders
    html = html.replace('{{JOB_ID}}', jobId);
    html = html.replace('{{TECH_ID}}', techId);
    html = html.replace('{{CLIENT_NAME}}', job.fields['Client Name'] ? job.fields['Client Name'][0] : 'N/A');
    html = html.replace('{{CLIENT_ADDRESS}}', job.fields['Client Address']);
    html = html.replace('{{SCOPE}}', job.fields['Scope of Work']);

    res.send(html);
  } catch (error) {
    console.error('Error showing update form:', error);
    res.status(500).send('Error loading form. Please contact Ricky.');
  }
};

/**
 * Handle job update submission from tech
 * POST /api/update-job
 */
exports.updateJob = async (req, res) => {
  try {
    const { jobId, techId, notes, status, photos } = req.body;

    console.log(`📝 Job update received for ${jobId} from tech ${techId}`);

    // Verify tech is assigned to this job
    const job = await airtableService.getJob(jobId);
    if (!job.fields['Assigned Tech'] || job.fields['Assigned Tech'][0] !== techId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Handle photo uploads (if any)
    // Note: photos should be base64 encoded or URLs
    let photoAttachments = [];
    if (photos && photos.length > 0) {
      photoAttachments = photos.map((photo) => ({
        url: photo.url || photo, // Support both { url: '...' } and direct URL string
      }));
    }

    // Update job based on status
    if (status === 'complete') {
      await airtableService.completeJob(jobId, notes, photoAttachments);

      // Send review request
      try {
        await twilioService.sendReviewRequest(job);
        await airtableService.updateJob(jobId, {
          'Review Requested': true,
        });
        console.log('✓ Review request sent to client');
      } catch (error) {
        console.error('Error sending review request:', error);
      }

      res.status(200).json({
        success: true,
        message: 'Job marked as complete!',
      });
    } else if (status === 'needs_more_work') {
      await airtableService.updateJob(jobId, {
        'Job Status': 'Needs Follow-up',
        'Tech Notes': notes,
      });

      // Notify admin
      try {
        await twilioService.sendSMS(
          process.env.ADMIN_PHONE,
          `⚠️ Job ${jobId} needs follow-up:\n\n${notes}`,
          { jobId }
        );
      } catch (error) {
        console.error('Error notifying admin:', error);
      }

      res.status(200).json({
        success: true,
        message: 'Job status updated. Ricky will follow up.',
      });
    } else {
      // Just update notes
      await airtableService.updateJob(jobId, {
        'Tech Notes': notes,
      });

      res.status(200).json({
        success: true,
        message: 'Notes updated!',
      });
    }
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
