# Great White Security - Automation System

Lead management and workflow automation system for Great White Security. Automates lead capture, tech assignment, payment tracking, and review requests.

## 🚀 Features

- **Automated Lead Capture** - From website forms, phone calls, and emails
- **Smart Tech Assignment** - SMS job offers with one-click acceptance
- **Payment Detection** - Automatic Stripe webhook integration
- **Tech Updates** - Simple mobile-friendly forms for job completion
- **Review Automation** - Automatic review requests and follow-ups
- **Complete Audit Trail** - Track every status change and communication

## 📋 Prerequisites

- Node.js v16+ installed
- Airtable account (Plus plan for automations)
- Twilio account (for SMS)
- Stripe account (for payments)
- Railway account (for deployment)

## 🛠️ Setup Instructions

### Step 1: Airtable Setup

1. Go to [airtable.com](https://airtable.com) and create a new base called "Great White Operations"

2. Create these 5 tables with the following fields:

**Table 1: Leads**
- Name (Single line text)
- Phone (Phone number)
- Email (Email)
- Address/Location (Single line text)
- Source (Single select: Call, Form, Email, Referral)
- Status (Single select: New, Contacted, Quoted, Won, Lost)
- Service Type (Single select: CCTV, Alarm, Access Control, Intercom, Complete Package, Other)
- Notes (Long text)
- Original Transcript/Form Data (Long text)
- Created Date (Created time)
- Business (Single select: Great White Security, The Alarm Guy, Great White Electrical)
- Linked Jobs (Link to Jobs table)
- Previous Jobs Count (Rollup: COUNT from Linked Jobs)
- Client Notes (Long text)

**Table 2: Jobs**
- Lead (Link to Leads)
- Client Name (Lookup from Lead → Name)
- Client Phone (Lookup from Lead → Phone)
- Client Email (Lookup from Lead → Email)
- Client Address (Single line text)
- Job Status (Single select: Draft, Awaiting Tech, Tech Assigned, Awaiting Payment, Payment Received, Scheduled, In Progress, Completed, Needs Follow-up)
- Assigned Tech (Link to Techs)
- Scope of Work (Long text)
- Quoted Price (Currency)
- Payment Status (Single select: Not Sent, Awaiting Payment, Paid)
- Stripe Payment Link (URL)
- Stripe Payment ID (Single line text)
- Auto-Send Pricing (Checkbox)
- Scheduled Date (Date)
- Completion Date (Date)
- Tech Notes (Long text)
- Photos (Attachments)
- Activity Log (Long text)
- Parts Used (Long text)
- Parts Cost (Currency)
- Review Requested (Checkbox)
- Review Received (Checkbox)
- Created Date (Created time)
- Last Modified (Last modified time)

**Table 3: Techs**
- Name (Single line text)
- Phone (Phone number)
- Email (Email)
- Skills (Multiple select: Bosch Alarms, Dahua CCTV, Hikvision CCTV, Intercoms, Access Control, etc.)
- Availability Status (Single select: Available, Busy, Unavailable)
- Active Jobs (Link to Jobs)
- Completed Jobs Count (Rollup: COUNT from Active Jobs where Status = Completed)
- Rating (Number)
- Notes (Long text)

**Table 4: Messages**
- Related Job (Link to Jobs)
- Related Lead (Link to Leads)
- Direction (Single select: Outbound, Inbound)
- Type (Single select: SMS, Email, Call)
- To (Single line text)
- From (Single line text)
- Content (Long text)
- Status (Single select: Sent, Delivered, Failed)
- Timestamp (Created time)

**Table 5: Templates**
- Name (Single line text)
- Type (Single select: SMS to Tech, SMS to Client, Email)
- Content (Long text)
- Active (Checkbox)

3. Get your Airtable API key:
   - Go to https://airtable.com/account
   - Generate a personal access token
   - Copy the token

4. Get your Base ID:
   - Open your base
   - Look at the URL: `https://airtable.com/appXXXXXXXXXX/...`
   - The part after `/app` is your Base ID

### Step 2: Configure Environment

1. Copy `.env.example` to `.env`
2. Fill in your credentials:
   - `AIRTABLE_API_KEY` - From step 1.3 above
   - `AIRTABLE_BASE_ID` - From step 1.4 above
   - `TWILIO_*` - Already configured (from existing call router)
   - `STRIPE_SECRET_KEY` - From Stripe dashboard → Developers → API keys
   - `GOOGLE_REVIEW_LINK` - Your Google Business review link

### Step 3: Test Locally

```bash
npm start
```

Open http://localhost:3000 - you should see "GWS Automation API Running"

### Step 4: Deploy to Railway

1. Initialize git:
```bash
git init
git add .
git commit -m "Initial commit - GWS Automation"
```

2. Push to GitHub:
```bash
gh repo create gws-automation --private
git remote add origin https://github.com/YOUR_USERNAME/gws-automation.git
git push -u origin main
```

3. Deploy to Railway:
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `gws-automation` repository
   - Add environment variables from your `.env` file
   - Deploy

4. Copy your Railway URL (e.g., `https://gws-automation-production.up.railway.app`)

### Step 5: Configure Webhooks

**Formspree:**
1. Go to Formspree dashboard
2. Click on your form
3. Go to Settings → Integrations
4. Add webhook: `https://your-railway-url.railway.app/webhooks/formspree`

**Stripe:**
1. Go to Stripe dashboard → Developers → Webhooks
2. Add endpoint: `https://your-railway-url.railway.app/webhooks/stripe`
3. Select events: `payment_intent.succeeded`, `checkout.session.completed`
4. Copy webhook signing secret to `.env` as `STRIPE_WEBHOOK_SECRET`

**Call Router:**
Update your existing `twilio-call-router/server.js` to POST to:
`https://your-railway-url.railway.app/webhooks/email-transcript`

### Step 6: Create Airtable Automations

Create these 6 automations in Airtable:

1. **New Lead Notification**
   - Trigger: When record created in Leads
   - Action: Send email to you

2. **Send Job to Tech** (Button automation)
   - Trigger: Button clicked in Jobs table
   - Action: Send webhook request to `/api/send-job-offer`

3. **Auto-send Pricing**
   - Trigger: When Assigned Tech is filled AND Auto-Send Pricing is checked
   - Action: Send webhook to `/api/send-client-pricing`

4. **Send Review Request**
   - Trigger: When Job Status changes to "Completed"
   - Action: Send webhook to `/api/send-review-request`

## 📱 Usage

### Creating a New Lead
Leads are automatically created from:
- Website form submissions (via Formspree)
- Phone calls (via Twilio call router)
- Manual entry in Airtable

### Assigning a Tech
1. Open job in Airtable
2. Review the scope and select suitable techs based on skills
3. Click "Send to Tech" button
4. Techs receive SMS with acceptance link
5. First to click gets the job

### After Tech Accepts
- If "Auto-Send Pricing" is checked, client receives pricing SMS automatically
- Otherwise, manually trigger pricing SMS

### Payment Detection
- When client pays via Stripe, job automatically updates
- Tech receives notification SMS with client details and update link

### Job Completion
- Tech clicks update link from SMS
- Fills in notes and photos
- Marks job complete
- Client automatically receives review request

## 📊 Monthly Costs

- Airtable: $20/month
- Twilio SMS: $50-100/month
- Railway: $5-20/month
- **Total: ~$75-140/month**

**Time saved: 15-20 hours/week = $750-1000/week value**

## 🔧 Troubleshooting

**"Airtable API error":**
- Check your API key is correct
- Ensure Base ID matches your base
- Verify table names match exactly (case-sensitive)

**"SMS not sending":**
- Check Twilio credentials
- Verify phone numbers are in E.164 format (+61...)
- Check Twilio account balance

**"Webhook not firing":**
- Check webhook URL is correct
- Test with curl or Postman
- Check Railway logs for errors

## 📝 Next Steps

1. Test end-to-end workflow with sample data
2. Train techs on new SMS acceptance process
3. Migrate existing Trello jobs to Airtable
4. Run parallel with Trello for 1 week
5. Fully migrate and archive Trello

## 🚀 Future Enhancements

- Calendar integration
- Supplier tracking
- Parts/inventory management
- Analytics dashboard
- Expand to The Alarm Guy and Great White Electrical

---

Built with ❤️ for Great White Security
