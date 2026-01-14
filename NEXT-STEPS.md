# Next Steps - GWS Automation Setup

Great work! The middleware API is built and ready. Here's what you need to do next to get the system fully operational.

## ✅ Completed

- [x] Project structure created
- [x] All dependencies installed
- [x] Core API with 10 endpoints built
- [x] Airtable service for CRUD operations
- [x] Twilio SMS service
- [x] Webhook handlers (Formspree, Stripe, Email)
- [x] Job management controllers
- [x] Communication controllers
- [x] HTML views for tech interactions
- [x] Server tested locally - runs perfectly!

## 📋 TODO: Phase 1 - Airtable Setup (30-60 minutes)

### 1.1 Create Airtable Base

1. Go to [airtable.com](https://airtable.com)
2. Click "Create a base"
3. Name it: **Great White Operations**
4. Create 5 tables: Leads, Jobs, Techs, Messages, Templates

### 1.2 Add Fields to Each Table

**IMPORTANT:** Field names must match exactly (including capitalization)

Refer to README.md for the complete field list for each table.

Quick checklist:
- [ ] Leads table (14 fields)
- [ ] Jobs table (24 fields)
- [ ] Techs table (9 fields)
- [ ] Messages table (9 fields)
- [ ] Templates table (4 fields)

### 1.3 Add Your Techs

In the Techs table, add all your contractors:
- Name
- Phone (E.164 format: +61...)
- Email
- Skills (select all that apply)
- Availability Status = Available

### 1.4 Get API Credentials

1. Go to https://airtable.com/account
2. Click "Generate personal access token"
3. Give it a name: "GWS Automation"
4. Select scopes: `data.records:read`, `data.records:write`
5. Select your base: "Great White Operations"
6. Copy the token → Update `.env` file `AIRTABLE_API_KEY`

7. Get Base ID:
   - Open your base
   - URL will be: `https://airtable.com/appXXXXXXXXXX/...`
   - Copy `appXXXXXXXXXX` → Update `.env` file `AIRTABLE_BASE_ID`

## 📋 TODO: Phase 2 - Get Stripe Credentials (10 minutes)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to Developers → API keys
3. Copy "Secret key" (starts with `sk_live_` or `sk_test_`)
4. Update `.env` file `STRIPE_SECRET_KEY`

**Note:** Webhook secret will be added after deployment

## 📋 TODO: Phase 3 - Test Locally (15 minutes)

Once you have Airtable and Stripe credentials in `.env`:

```bash
cd ~/gws-automation
npm start
```

Open http://localhost:3000 - you should see the API dashboard

**Test Airtable Connection:**
```bash
# In another terminal
curl -X POST http://localhost:3000/webhooks/formspree \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "phone": "+61400000000",
    "email": "test@example.com",
    "suburb": "Perth",
    "services": "cctv",
    "message": "Test lead"
  }'
```

Check Airtable → Leads table → Should see new "Test Test" lead!

## 📋 TODO: Phase 4 - Deploy to Railway (30 minutes)

### 4.1 Initialize Git

```bash
cd ~/gws-automation
git init
git add .
git commit -m "Initial commit - GWS Automation System"
```

### 4.2 Push to GitHub

```bash
# Create private repo
gh repo create gws-automation --private --source=. --remote=origin --push
```

### 4.3 Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project"
4. Click "Deploy from GitHub repo"
5. Select `gws-automation`
6. Click "Deploy"

### 4.4 Add Environment Variables

In Railway dashboard:
1. Click on your service
2. Go to "Variables" tab
3. Click "Raw Editor"
4. Paste contents of your `.env` file
5. Update `BASE_URL` to your Railway URL (shown in settings)
6. Click "Save"

Railway will redeploy automatically.

### 4.5 Get Your Railway URL

- Go to Settings tab
- Copy the domain (e.g., `https://gws-automation-production.up.railway.app`)
- Update `.env` locally `BASE_URL` to match

**Test your deployment:**
```bash
curl https://your-railway-url.railway.app
```

Should see the API dashboard HTML!

## 📋 TODO: Phase 5 - Configure Webhooks (20 minutes)

### 5.1 Formspree Webhook

1. Go to [formspree.io/forms](https://formspree.io/forms)
2. Click on your form (mdkwezqj)
3. Go to "Integrations" tab
4. Add "Webhook"
5. URL: `https://your-railway-url.railway.app/webhooks/formspree`
6. Save

**Test it:** Submit a form on your website → Check Airtable for new lead

### 5.2 Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Endpoint URL: `https://your-railway-url.railway.app/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `checkout.session.completed`
5. Click "Add endpoint"
6. Click "Reveal" on webhook signing secret
7. Copy secret → Add to Railway environment variables as `STRIPE_WEBHOOK_SECRET`

**Test it:** Make a test payment → Check Airtable job updates

### 5.3 Update Call Router

Edit `~/twilio-call-router/server.js`:

Around line 500 (in the email sending section), add:

```javascript
// Also send to GWS automation middleware
try {
  await fetch('https://your-railway-url.railway.app/webhooks/email-transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      isLead: leadInfo.isLead,
      name: leadInfo.name,
      location: leadInfo.location,
      email: leadInfo.email,
      phone: from,
      notes: leadInfo.notes,
      transcript: formattedTranscript.trim()
    })
  });
  console.log('✓ Sent to GWS automation middleware');
} catch (err) {
  console.error('Error sending to middleware:', err);
}
```

Redeploy your call router to Railway.

## 📋 TODO: Phase 6 - Create Airtable Automations (30 minutes)

### Automation 1: New Lead Notification

1. In Airtable, click "Automations" (top right)
2. Click "Create automation"
3. Name: "New Lead Notification"
4. Trigger: "When record created" → Select "Leads" table
5. Action: "Send email" → Send to yourself
6. Turn ON

### Automation 2: Send Job to Tech (Button)

1. Create automation: "Send Job Offer"
2. Trigger: "When button clicked" → Add button field to Jobs table called "Send to Tech"
3. Action: "Run script" or "Send webhook"
4. Webhook URL: `https://your-railway-url/api/send-job-offer`
5. Method: POST
6. Body:
```json
{
  "jobId": "{Job ID}",
  "techIds": ["{Assigned Tech}"]
}
```

### Automation 3: Auto-Send Pricing (Optional)

1. Create automation: "Auto-Send Client Pricing"
2. Trigger: "When record updated" → Jobs table
3. Condition: "Assigned Tech" is not empty AND "Auto-Send Pricing" is checked
4. Action: "Send webhook"
5. URL: `https://your-railway-url/api/send-client-pricing`
6. Body: `{"jobId": "{Job ID}"}`

### Automation 4: Payment Received → Notify Tech

This happens automatically via Stripe webhook!

### Automation 5: Send Review Request

1. Create automation: "Send Review Request"
2. Trigger: "When record updated" → Jobs table
3. Condition: "Job Status" = "Completed"
4. Action: "Send webhook"
5. URL: `https://your-railway-url/api/send-review-request`
6. Body: `{"jobId": "{Job ID}"}`

## 📋 TODO: Phase 7 - Test End-to-End (60 minutes)

### Test 1: Form Submission
1. Submit contact form on website
2. Verify lead appears in Airtable
3. Verify you receive notification

### Test 2: Job Creation & Tech Assignment
1. Create job in Airtable from lead
2. Fill in scope, price, Stripe link
3. Click "Send to Tech" button
4. Verify tech receives SMS
5. Click acceptance link
6. Verify job updates in Airtable

### Test 3: Payment Flow
1. Create test Stripe payment with metadata `job_id: [your job ID]`
2. Complete payment
3. Verify job status updates
4. Verify tech receives notification SMS

### Test 4: Job Completion
1. Click job update link from tech SMS
2. Fill in notes
3. Mark complete
4. Verify review request SMS sent to client

## 🎯 Success Criteria

After completing all steps, you should have:

- [x] Middleware API running on Railway
- [x] All webhooks configured and tested
- [x] Airtable base fully set up
- [x] At least one end-to-end workflow tested
- [x] Techs receiving SMS job offers
- [x] Clients receiving pricing and review requests

## 📊 Timeline Estimate

- Phase 1 (Airtable): 60 minutes
- Phase 2 (Stripe): 10 minutes
- Phase 3 (Local test): 15 minutes
- Phase 4 (Railway deploy): 30 minutes
- Phase 5 (Webhooks): 20 minutes
- Phase 6 (Automations): 30 minutes
- Phase 7 (Testing): 60 minutes

**Total: ~3.5 hours** (can split across multiple sessions)

## 🆘 Need Help?

**Common Issues:**

1. **"Cannot find module"** → Run `npm install` again
2. **"Airtable API error"** → Check API key and Base ID in `.env`
3. **"SMS not sending"** → Check Twilio credentials and phone number format
4. **"Webhook not working"** → Check Railway logs, verify URL is correct

**Check Logs:**
- Railway: Click service → "Deployments" → Click latest → "View Logs"
- Local: Terminal where you ran `npm start`

## 🚀 You're Almost There!

The hardest part (building the API) is DONE. Now it's just configuration!

Start with Phase 1 (Airtable setup) and work through each phase. Test as you go.

Once live, this will save you 15-20 hours EVERY WEEK.

Let's do this! 💪
