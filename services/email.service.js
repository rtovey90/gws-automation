const Imap = require('imap');
const { simpleParser } = require('mailparser');
const OpenAI = require('openai');
const airtableService = require('./airtable.service');

// Track processed emails to avoid duplicates
const processedEmails = new Set();

// Initialize OpenAI client lazily (only when needed)
let openai = null;
function getOpenAI() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// Helper to normalize email addresses
function normalizeEmail(email) {
  return email ? email.toLowerCase().trim() : null;
}

// Helper to normalize phone from email signature
function extractPhoneFromText(text) {
  // Look for Australian phone numbers in text
  const phoneRegex = /(\+61|0)\s*[2-478]\s*\d{4}\s*\d{4}|\(\d{2}\)\s*\d{4}\s*\d{4}/g;
  const matches = text.match(phoneRegex);
  return matches ? matches[0] : null;
}

// Connect to IMAP inbox
function createImapConnection(folder = 'INBOX') {
  return new Imap({
    user: 'hello@greatwhitesecurity.com',
    password: process.env.EMAIL_IMAP_PASS || 'your-password-here',
    host: 'mail.privateemail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });
}

// Process a single email
async function processEmail(mail, direction = 'Inbound') {
  try {
    const fromEmail = normalizeEmail(mail.from?.value?.[0]?.address);
    const toEmail = normalizeEmail(mail.to?.value?.[0]?.address);
    const subject = mail.subject || '(no subject)';
    const textBody = mail.text || mail.html || '';
    const messageId = mail.messageId;

    // Skip if already processed
    if (processedEmails.has(messageId)) {
      return;
    }
    processedEmails.add(messageId);

    console.log(`📧 Processing ${direction} email: ${subject} from ${fromEmail}`);

    // Determine contact email (opposite of our email)
    const ourEmail = normalizeEmail('hello@greatwhitesecurity.com');
    const contactEmail = direction === 'Inbound' ? fromEmail : toEmail;
    const contactName = direction === 'Inbound'
      ? mail.from?.value?.[0]?.name || fromEmail
      : mail.to?.value?.[0]?.name || toEmail;

    // Check if this email belongs to an existing customer
    const allCustomers = await airtableService.getAllCustomers();
    let existingCustomer = allCustomers.find(c =>
      normalizeEmail(c.fields.Email) === contactEmail
    );

    let engagementId = null;
    let customerId = null;

    if (existingCustomer) {
      console.log(`✓ Found existing customer: ${existingCustomer.fields['First Name']} ${existingCustomer.fields['Last Name']}`);
      customerId = existingCustomer.id;

      // Try to find most recent engagement for this customer
      // We'll just link to customer for now, could enhance to find specific engagement
    } else if (direction === 'Inbound') {
      // New inbound email - check if it's a lead
      console.log(`🔍 New email from ${contactEmail} - analyzing for lead...`);

      const leadAnalysis = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a lead detection assistant for a security systems company (CCTV, alarms, intercoms, access control).

Analyze the email and determine if this is a potential new customer inquiry.

Return JSON with:
{
  "isLead": true/false,
  "name": "sender name or 'Unknown'",
  "location": "any address/suburb mentioned or 'Not provided'",
  "phone": "any phone number found or 'Not provided'",
  "serviceType": "CCTV|Alarm|Access Control|Intercom|Complete Package|Other",
  "leadType": "Service Call|Project",
  "notes": "summary of what they need, urgency, key details"
}

Examples of LEADS:
- Inquiries about installation, service, quotes
- Problems with existing systems
- Questions about products/services

Examples of NOT LEADS:
- Spam, newsletters, marketing emails
- Unsubscribe requests
- Payment receipts
- Automated notifications`
          },
          {
            role: 'user',
            content: `Subject: ${subject}\n\nFrom: ${contactName} <${contactEmail}>\n\nBody:\n${textBody.substring(0, 2000)}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(leadAnalysis.choices[0].message.content);
      console.log(`📊 Lead analysis:`, analysis);

      if (analysis.isLead) {
        // Create customer and engagement
        const phone = analysis.phone !== 'Not provided' ? analysis.phone : extractPhoneFromText(textBody) || '';

        const leadData = {
          name: analysis.name || contactName,
          email: contactEmail,
          phone: phone,
          address: analysis.location !== 'Not provided' ? analysis.location : '',
          source: 'Email',
          systemType: analysis.serviceType || 'Other',
          leadType: analysis.leadType || 'Service Call',
          notes: analysis.notes,
          rawData: `Subject: ${subject}\n\nFrom: ${contactEmail}\n\n${textBody.substring(0, 1000)}`
        };

        // Split name into first/last
        const nameParts = leadData.name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || '';

        // Create customer
        const customer = await airtableService.createCustomer({
          firstName: firstName,
          lastName: lastName,
          email: contactEmail,
          phone: phone,
          mobilePhone: phone,
          notes: analysis.notes
        });

        customerId = customer.id;

        // Create engagement
        const engagement = await airtableService.createEngagement({
          customerId: customer.id,
          status: 'New Lead',
          source: 'Email',
          leadType: analysis.leadType || 'Service Call',
          systemType: analysis.serviceType ? [analysis.serviceType] : ['Other'],
          notes: analysis.notes,
          rawData: leadData.rawData,
          business: 'Great White Security'
        });

        engagementId = engagement.id;

        console.log(`✓ Created new customer & engagement from email: ${customer.id} / ${engagement.id}`);

        // Send notification
        try {
          const twilioService = require('./twilio.service');
          await twilioService.sendSMS(
            process.env.ADMIN_PHONE,
            `🆕 NEW LEAD from email!\n\nName: ${leadData.name}\nEmail: ${contactEmail}\nPhone: ${phone || 'N/A'}\n\n${analysis.notes.substring(0, 150)}...\n\nView in Airtable`,
            { leadId: engagement.id }
          );
        } catch (smsError) {
          console.error('Error sending notification:', smsError);
        }
      }
    }

    // Log email to Messages table
    const emailContent = `Subject: ${subject}\n\n${textBody.substring(0, 2000)}${textBody.length > 2000 ? '...' : ''}`;

    await airtableService.logMessage({
      direction: direction,
      type: 'Email',
      from: fromEmail,
      to: toEmail,
      content: emailContent,
      status: 'Received',
      engagementId: engagementId,
      customerId: customerId
    });

    console.log(`✓ Email logged to Messages table`);

  } catch (error) {
    console.error('Error processing email:', error);
  }
}

// Check inbox for new emails
function checkInbox() {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection('INBOX');

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        // Search for unseen emails from last 7 days
        const searchCriteria = ['UNSEEN', ['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]];
        const fetchOptions = {
          bodies: '',
          markSeen: true
        };

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          if (results.length === 0) {
            console.log('📬 No new emails');
            imap.end();
            resolve(0);
            return;
          }

          console.log(`📬 Found ${results.length} new email(s)`);

          const fetch = imap.fetch(results, fetchOptions);

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, mail) => {
                if (err) {
                  console.error('Error parsing email:', err);
                  return;
                }
                await processEmail(mail, 'Inbound');
              });
            });
          });

          fetch.once('error', (err) => {
            console.error('Fetch error:', err);
            imap.end();
            reject(err);
          });

          fetch.once('end', () => {
            imap.end();
            resolve(results.length);
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error('IMAP error:', err);
      reject(err);
    });

    imap.connect();
  });
}

// Check sent folder for outgoing emails
function checkSentFolder() {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection('Sent');

    imap.once('ready', () => {
      imap.openBox('Sent', false, (err, box) => {
        if (err) {
          // Sent folder might not exist or be named differently
          console.log('⚠️ Could not open Sent folder (might be named differently)');
          imap.end();
          resolve(0);
          return;
        }

        // Search for unseen emails from last 7 days
        const searchCriteria = ['UNSEEN', ['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]];
        const fetchOptions = {
          bodies: '',
          markSeen: true
        };

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          if (results.length === 0) {
            imap.end();
            resolve(0);
            return;
          }

          console.log(`📤 Found ${results.length} sent email(s)`);

          const fetch = imap.fetch(results, fetchOptions);

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, mail) => {
                if (err) {
                  console.error('Error parsing sent email:', err);
                  return;
                }
                await processEmail(mail, 'Outbound');
              });
            });
          });

          fetch.once('error', (err) => {
            console.error('Fetch error:', err);
            imap.end();
            reject(err);
          });

          fetch.once('end', () => {
            imap.end();
            resolve(results.length);
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error('IMAP Sent folder error:', err);
      imap.end();
      resolve(0); // Don't fail if sent folder doesn't work
    });

    imap.connect();
  });
}

// Start email monitoring (runs every 2 minutes)
function startEmailMonitoring() {
  console.log('📧 Starting email monitoring service...');

  // Check immediately on start
  checkBothFolders();

  // Then check every 2 minutes
  setInterval(checkBothFolders, 2 * 60 * 1000);
}

async function checkBothFolders() {
  try {
    await checkInbox();
    await checkSentFolder();
  } catch (error) {
    console.error('Error checking email:', error);
  }
}

module.exports = {
  startEmailMonitoring,
  checkInbox,
  checkSentFolder
};
