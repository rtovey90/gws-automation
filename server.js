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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
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
});

module.exports = app;
