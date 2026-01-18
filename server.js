require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Import controllers
const webhooksController = require('./controllers/webhooks');
const jobsController = require('./controllers/jobs');
const communicationsController = require('./controllers/communications');
const uploadsController = require('./controllers/uploads');
const leadsController = require('./controllers/leads');
const productsController = require('./controllers/products');
const messageFormsController = require('./controllers/message-forms');
const shortLinkController = require('./controllers/shortlink.controller');
const techAssignmentController = require('./controllers/tech-assignment.controller');
const scheduleController = require('./controllers/schedule.controller');
const completionController = require('./controllers/completion.controller');
const messagesController = require('./controllers/messages.controller');
const engagementsController = require('./controllers/engagements.controller');
const techAvailabilityShortController = require('./controllers/tech-availability-short.controller');
const { startScheduledJobChecker } = require('./jobs/scheduled-jobs');

const app = express();

// Middleware
app.use(cors());

// Stripe webhook needs raw body for signature verification
// This MUST come before bodyParser.json()
app.post('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }), webhooksController.handleStripe);

// Parse JSON for all other routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>GWS Automation API</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
        }
        h1 { color: #28a745; }
        .status { color: #28a745; font-size: 24px; }
        ul { line-height: 2; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>✅ GWS Automation API Running</h1>
      <p class="status">Status: Operational</p>

      <h2>Available Endpoints:</h2>
      <ul>
        <li><strong>Webhooks:</strong>
          <ul>
            <li><code>POST /webhooks/formspree</code> - Form submissions</li>
            <li><code>POST /webhooks/stripe</code> - Payment notifications</li>
            <li><code>POST /webhooks/email-transcript</code> - Call transcripts</li>
            <li><code>POST /webhooks/twilio-sms</code> - Inbound SMS</li>
          </ul>
        </li>
        <li><strong>Lead Management:</strong>
          <ul>
            <li><code>GET /api/check-tech-availability/:leadId</code> - Check tech availability</li>
            <li><code>GET /tech-availability/:leadId/:techId/:response</code> - Tech responds</li>
            <li><code>GET /api/send-pricing/:leadId</code> - Send pricing SMS</li>
          </ul>
        </li>
        <li><strong>Products:</strong>
          <ul>
            <li><code>GET /api/sync-stripe-products</code> - Sync Stripe products</li>
          </ul>
        </li>
        <li><strong>Job Management:</strong>
          <ul>
            <li><code>POST /api/send-job-offer</code> - Send job to techs</li>
            <li><code>GET /accept-job/:jobId/:techId</code> - Tech accepts job</li>
            <li><code>GET /job-update/:jobId/:techId</code> - Job update form</li>
            <li><code>POST /api/update-job</code> - Submit job updates</li>
          </ul>
        </li>
        <li><strong>Communications:</strong>
          <ul>
            <li><code>POST /api/send-client-pricing</code> - Send pricing SMS</li>
            <li><code>POST /api/send-review-request</code> - Request review</li>
            <li><code>POST /api/review-follow-up</code> - Review reminder</li>
            <li><code>GET /api/send-message</code> - Send custom message</li>
          </ul>
        </li>
        <li><strong>Photo Uploads:</strong>
          <ul>
            <li><code>GET /upload-photos/:leadId</code> - Photo upload form</li>
            <li><code>POST /api/upload-photos/:leadId</code> - Upload photos</li>
          </ul>
        </li>
      </ul>

      <p><em>Great White Security - Lead Management System</em></p>
    </body>
    </html>
  `);
});

// Webhook routes
app.post('/webhooks/formspree', webhooksController.handleFormspree);
// Note: /webhooks/stripe is defined earlier before bodyParser.json() for raw body access
app.post('/webhooks/email-transcript', webhooksController.handleEmailTranscript);
app.post('/webhooks/twilio-sms', webhooksController.handleTwilioSMS);

// Debug endpoint to check last webhook
let lastWebhookData = { timestamp: null, data: null };
app.post('/webhooks/twilio-sms-debug', (req, res) => {
  lastWebhookData = {
    timestamp: new Date().toISOString(),
    data: req.body
  };
  console.log('DEBUG webhook called:', lastWebhookData);
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

// Simple test endpoint that accepts both GET and POST
app.all('/test-webhook', (req, res) => {
  const data = {
    timestamp: new Date().toISOString(),
    method: req.method,
    body: req.body,
    query: req.query,
    headers: req.headers
  };
  lastWebhookData = data;
  console.log('TEST WEBHOOK CALLED:', JSON.stringify(data, null, 2));
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Webhook received!</Message></Response>');
});

app.get('/api/last-webhook', (req, res) => {
  res.json(lastWebhookData);
});

// Debug endpoint to check Messages table
app.get('/api/debug-messages', async (req, res) => {
  try {
    const airtableService = require('./services/airtable.service');
    const messages = await airtableService.getAllMessages();
    res.json({
      count: messages.length,
      latest10: messages.slice(0, 10).map(m => ({
        id: m.id,
        from: m.fields.From,
        to: m.fields.To,
        content: m.fields.Content,
        direction: m.fields.Direction,
        created: m.fields.Created || m._rawJson?.createdTime
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Job management routes
app.post('/api/send-job-offer', jobsController.sendJobOffer);
app.get('/accept-job/:jobId/:techId', jobsController.acceptJob);
app.get('/job-update/:jobId/:techId', jobsController.showUpdateForm);
app.post('/api/update-job', jobsController.updateJob);

// Communication routes
app.post('/api/send-client-pricing', communicationsController.sendClientPricing);
app.post('/api/send-review-request', communicationsController.sendReviewRequest);
app.post('/api/review-follow-up', communicationsController.reviewFollowUp);
app.get('/api/send-message', communicationsController.sendMessage); // Button-triggered messages from Airtable

// Photo upload routes
app.get('/upload-photos/:leadId', uploadsController.showUploadForm);
app.post('/api/upload-photos/:leadId', uploadsController.uploadMiddleware, uploadsController.handleUpload);

// Lead management routes
app.post('/api/check-tech-availability', leadsController.checkTechAvailability);
app.get('/api/check-tech-availability/:leadId', leadsController.checkTechAvailability); // GET version for Airtable buttons
app.get('/tech-availability/:leadId/:techId/:response', leadsController.handleAvailabilityResponse);

// Product routes
app.get('/api/sync-stripe-products', productsController.syncStripeProducts);

// Pricing routes
app.get('/api/send-pricing/:leadId', communicationsController.sendPricing); // GET version for Airtable buttons
app.post('/api/send-pricing', communicationsController.sendPricing);

// Message form routes
app.get('/send-message-form/:leadId/:messageType', messageFormsController.showMessageForm);
app.post('/api/send-message-form', messageFormsController.sendMessage);
app.get('/api/message-form-link/:leadId/:messageType', messageFormsController.generateMessageFormLink);

// Tech availability form routes
app.get('/send-tech-availability-form/:leadId', messageFormsController.showTechAvailabilityForm);
app.post('/api/send-tech-availability', messageFormsController.sendTechAvailability);

// Pricing form routes
app.get('/send-pricing-form/:leadId', messageFormsController.showPricingForm);
app.post('/api/send-pricing-form', messageFormsController.sendPricingForm);
app.post('/api/create-checkout-session', messageFormsController.createCheckoutSession);

// Tech assignment routes
app.get('/assign-tech/:leadId', techAssignmentController.showAssignmentForm);
app.post('/api/assign-tech', techAssignmentController.assignTech);

// Schedule routes
app.get('/s/:leadId', scheduleController.showScheduleForm);
app.post('/api/schedule-job', scheduleController.scheduleJob);

// Completion routes
app.get('/c/:leadId', completionController.showCompletionForm);
app.post('/api/complete-job', completionController.uploadMiddleware, completionController.completeJob);

// Messages routes
app.get('/messages', messagesController.showInbox);
app.get('/messages/:phone', messagesController.showConversation);
app.post('/api/send-sms-conversation', messagesController.sendSMS);

// Engagement routes
app.get('/api/create-engagement', engagementsController.createEngagement);

// Tech availability short link routes (must come before /:code catch-all)
app.get('/ty/:code', techAvailabilityShortController.techYes);
app.get('/tn/:code', techAvailabilityShortController.techNo);

// Short link routes
app.get('/api/shortlinks/stats', shortLinkController.getStats); // Debug stats
app.get('/:code', shortLinkController.redirect); // Must be last - catch-all redirect

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Handle Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large. Maximum file size is 100MB.'
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'Too many files. Maximum 10 files allowed.'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Unexpected file upload.'
    });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🚀 GWS Automation API Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server: http://localhost:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
✅ All systems operational
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Endpoints ready:
  📨 Webhooks: /webhooks/*
  💼 Jobs: /api/*
  📱 Communications: /api/*

Press Ctrl+C to stop
  `);

  // Start scheduled jobs
  startScheduledJobChecker();
});

module.exports = app;
