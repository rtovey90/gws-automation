const airtableService = require('../services/airtable.service');

/**
 * Create new engagement for a customer (called from Airtable button)
 * GET /api/create-engagement?customerId={customerId}
 */
exports.createEngagement = async (req, res) => {
  try {
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).send(`
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
          <p>Missing customer ID</p>
        </body>
        </html>
      `);
    }

    console.log(`➕ Creating new engagement for customer: ${customerId}`);

    // Get customer details to show in confirmation
    const customer = await airtableService.getCustomer(customerId);

    if (!customer) {
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
          <p>Customer not found</p>
        </body>
        </html>
      `);
    }

    const customerName = [customer.fields['First Name'], customer.fields['Last Name']].filter(Boolean).join(' ');

    // Create new engagement
    const engagement = await airtableService.createEngagement({
      'Customer': [customerId], // Link to customer record
      'Status': 'New Lead',
    });

    console.log(`✓ Created engagement ${engagement.id} for ${customerName}`);

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Engagement Created</title>
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
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            max-width: 500px;
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
          }
          .success-icon {
            font-size: 72px;
            margin-bottom: 20px;
          }
          h1 {
            color: #28a745;
            font-size: 28px;
            margin-bottom: 15px;
          }
          .customer-name {
            color: #666;
            font-size: 18px;
            margin-bottom: 30px;
          }
          .info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            text-align: left;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
          }
          .info-label {
            font-weight: 600;
            color: #666;
          }
          .info-value {
            color: #333;
          }
          .message {
            color: #666;
            margin-top: 20px;
            font-size: 14px;
          }
          .engagement-id {
            font-family: monospace;
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Engagement Created!</h1>
          <p class="customer-name">For: ${customerName}</p>

          <div class="info">
            <div class="info-row">
              <span class="info-label">Engagement ID:</span>
              <span class="info-value engagement-id">${engagement.id}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Status:</span>
              <span class="info-value">New Lead</span>
            </div>
            <div class="info-row">
              <span class="info-label">Customer:</span>
              <span class="info-value">${customerName}</span>
            </div>
          </div>

          <p class="message">
            Go back to Airtable to add Job Scope and other details.
          </p>
          <p class="message" style="margin-top: 30px; color: #999;">
            You can close this window.
          </p>
        </div>

        <script>
          // Auto-close after 3 seconds
          setTimeout(() => {
            window.close();
          }, 3000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error creating engagement:', error);
    res.status(500).send(`
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
          .details {
            background: #f8f9fa;
            padding: 15px;
            margin-top: 20px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <h1 class="error">❌ Error</h1>
        <p>Failed to create engagement</p>
        <div class="details">${error.message}</div>
      </body>
      </html>
    `);
  }
};

module.exports = exports;
