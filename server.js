require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Import auth middleware
const { sessionMiddleware, requireAuth } = require('./middleware/auth');
const authController = require('./controllers/auth.controller');

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
const dashboardController = require('./controllers/dashboard.controller');
const timelineController = require('./controllers/timeline.controller');
const estimatorController = require('./controllers/estimator.controller');
const estimatorApiController = require('./controllers/estimator-api.controller');
const proposalsController = require('./controllers/proposals.controller');
const previewController = require('./controllers/preview.controller');
const { startScheduledJobChecker, startScheduleReminderJob } = require('./jobs/scheduled-jobs');

const app = express();

// Trust proxy for Railway (required for secure session cookies behind proxy)
app.set('trust proxy', 1);

// Middleware
app.use(cors());

// Stripe webhook needs raw body for signature verification
// This MUST come before bodyParser.json()
app.post('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }), webhooksController.handleStripe);

// Estimator PDF parse needs larger body limit (base64 PDFs can be 20MB+)
app.post('/api/estimator/parse-invoice', bodyParser.json({ limit: '50mb' }), sessionMiddleware, requireAuth, estimatorApiController.parseInvoice);

// Parse JSON for all other routes
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session middleware (after body parsers, before routes)
app.use(sessionMiddleware);

// Auth routes (public)
app.get('/login', authController.showLogin);
app.post('/login', authController.handleLogin);
app.get('/logout', authController.handleLogout);

// Root redirect
app.get('/', (req, res) => res.redirect('/dashboard'));

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
app.get('/api/send-review-request/:leadId', communicationsController.sendEngagementReviewRequest); // Show review request form
app.post('/api/submit-review-request', communicationsController.submitReviewRequest); // Submit review request

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
app.get('/send-completion-form/:leadId', messageFormsController.showSendCompletionForm);
app.post('/api/send-completion-form', messageFormsController.sendCompletionForm);
app.get('/c/:leadId', completionController.showCompletionForm);
app.post('/api/complete-job', completionController.uploadMiddleware, completionController.completeJob);

// ── Admin routes (require login) ──
app.get('/messages', requireAuth, messagesController.showInbox);
app.get('/messages/:phone', requireAuth, messagesController.showConversation);
app.get('/api/messages/:phone', requireAuth, messagesController.getConversationMessages);
app.post('/api/send-sms-conversation', requireAuth, messagesController.sendSMS);
app.post('/api/create-test-contact', requireAuth, messagesController.createTestContact);

// Engagement routes
app.get('/api/create-engagement', engagementsController.createEngagement);
// Dashboard route
app.get('/dashboard', requireAuth, dashboardController.showDashboard);

// Engagement timeline routes
app.get('/engagement/:id', requireAuth, timelineController.showTimeline);
app.post('/api/engagement/:id/note', requireAuth, timelineController.addNote);

// Design preview routes (dummy data, no Airtable writes)
app.get('/preview/availability-yes', requireAuth, previewController.availabilityYes);
app.get('/preview/availability-no', requireAuth, previewController.availabilityNo);

// Estimator routes
app.get('/estimator', requireAuth, estimatorController.showEstimator);
app.post('/api/estimator/ai-pricing', requireAuth, estimatorApiController.aiPricing);
app.get('/api/estimator/engagements', requireAuth, estimatorApiController.listEngagements);
app.post('/api/estimator/save-quote', requireAuth, estimatorApiController.saveQuote);
app.get('/api/estimator/load-quote/:engagementId', requireAuth, estimatorApiController.loadQuote);
// Note: /api/estimator/parse-invoice is defined earlier (before bodyParser) for larger body limit

// Proposal routes - PUBLIC (no auth)
app.get('/proposals/:projectNumber', proposalsController.showProposal);
app.get('/offers/:projectNumber', proposalsController.showOTO);
app.get('/offers/:projectNumber/thank-you', proposalsController.showOTOThankYou);
app.post('/api/proposals/:projectNumber/track-view', proposalsController.trackProposalView);
app.post('/api/proposals/:projectNumber/checkout', proposalsController.createProposalCheckout);
app.post('/api/proposals/:projectNumber/oto-charge', proposalsController.chargeOTODirect);

// Proposal routes - ADMIN (require auth)
app.get('/admin/proposals', requireAuth, proposalsController.listProposals);
app.get('/admin/proposals/new', requireAuth, proposalsController.showCreateForm);
app.get('/admin/proposals/new/:engagementId', requireAuth, proposalsController.showCreateFormForEngagement);
app.get('/admin/proposals/clone/:proposalId', requireAuth, proposalsController.showCloneForm);
app.get('/admin/proposals/edit/:proposalId', requireAuth, proposalsController.showEditForm);
app.post('/api/admin/proposals', requireAuth, proposalsController.createProposal);
app.put('/api/admin/proposals/:proposalId', requireAuth, proposalsController.updateProposal);
app.post('/api/admin/proposals/upload-photos', requireAuth, proposalsController.uploadMiddleware, proposalsController.uploadProposalPhotos);
app.post('/api/admin/proposals/:proposalId/send', requireAuth, proposalsController.sendProposal);
app.post('/api/admin/proposals/:proposalId/preview-checkout', requireAuth, proposalsController.previewCheckout);
app.post('/api/admin/proposals/:proposalId/toggle-pause', requireAuth, proposalsController.togglePause);
app.get('/api/admin/proposals/check-number', requireAuth, proposalsController.checkProjectNumber);
app.get('/api/admin/proposals/next-number', requireAuth, proposalsController.getNextProjectNumber);
app.get('/api/admin/customers', requireAuth, proposalsController.listCustomers);
app.get('/api/admin/customers/:customerId/engagements', requireAuth, proposalsController.getCustomerEngagements);

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
  startScheduleReminderJob();

  // Start email monitoring (lazy-load to avoid build-time env var access)
  if (process.env.EMAIL_IMAP_PASS) {
    const { startEmailMonitoring } = require('./services/email.service');
    startEmailMonitoring();
    console.log('📧 Email monitoring enabled');
  } else {
    console.log('⚠️  Email monitoring disabled (missing IMAP password)');
  }
});

module.exports = app;
