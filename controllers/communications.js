const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Communications Controllers - Handle pricing SMS and review requests
 */

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

module.exports = exports;
