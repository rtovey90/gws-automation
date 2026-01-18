const airtableService = require('../services/airtable.service');

// In-memory storage for tech availability codes
// Structure: { code: { engagementId, techId, created: timestamp } }
const techAvailabilityCodes = new Map();

/**
 * Generate random 6-character code
 */
function generateRandomCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate short code and store mapping
 */
function generateShortCode(engagementId, techId) {
  // Generate unique code
  let code;
  do {
    code = generateRandomCode();
  } while (techAvailabilityCodes.has(code));

  // Store mapping
  techAvailabilityCodes.set(code, {
    engagementId,
    techId,
    created: Date.now()
  });

  console.log(`📝 Generated code ${code} for engagement ${engagementId}, tech ${techId}`);

  return code;
}

/**
 * Get engagement and tech IDs from code
 */
function decodeShortCode(code) {
  const data = techAvailabilityCodes.get(code);
  if (!data) return null;

  return {
    engagementId: data.engagementId,
    techId: data.techId
  };
}

/**
 * Clean up old codes (older than 30 days)
 */
function cleanupOldCodes() {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let cleaned = 0;

  for (const [code, data] of techAvailabilityCodes.entries()) {
    if (data.created < thirtyDaysAgo) {
      techAvailabilityCodes.delete(code);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} old tech availability codes`);
  }
}

// Run cleanup daily
setInterval(cleanupOldCodes, 24 * 60 * 60 * 1000);

/**
 * Tech responds YES via short link
 * GET /ty/:code
 */
exports.techYes = async (req, res) => {
  try {
    const { code } = req.params;
    const decoded = decodeShortCode(code);

    if (!decoded) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Link</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Invalid Link</h1>
          <p>This link appears to be malformed.</p>
        </body>
        </html>
      `);
    }

    const { engagementId, techId } = decoded;

    console.log(`✅ Tech ${techId} responded YES for engagement ${engagementId}`);

    // Get engagement and tech details
    const engagement = await airtableService.getEngagement(engagementId);
    const tech = await airtableService.getTech(techId);

    if (!engagement || !tech) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Not Found</h1>
          <p>Engagement or tech not found.</p>
        </body>
        </html>
      `);
    }

    const techName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ');

    // Update tech availability responses (long text field for logging)
    const currentResponses = engagement.fields['Tech Availability Responses'] || '';
    const updatedResponses = currentResponses
      ? `${currentResponses}\n${techName} - YES (${new Date().toLocaleString()})`
      : `${techName} - YES (${new Date().toLocaleString()})`;

    // Add tech to Available Techs linked field
    const currentAvailableTechs = engagement.fields['Available Techs'] || [];
    const updatedAvailableTechs = [...currentAvailableTechs, techId];

    await airtableService.updateEngagement(engagementId, {
      'Tech Availability Responses': updatedResponses,
      'Available Techs': updatedAvailableTechs,
      'Status': 'Tech Availability Check',
    });

    console.log(`✓ Recorded YES response from ${techName}`);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Response Recorded</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          .icon {
            font-size: 80px;
            margin-bottom: 20px;
          }
          h1 {
            color: #28a745;
            margin-bottom: 15px;
          }
          p {
            color: #666;
            font-size: 18px;
            line-height: 1.6;
          }
          .tech-name {
            font-weight: 600;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">👍</div>
          <h1>Thanks ${tech.fields['First Name']}!</h1>
          <p>We've recorded your <strong>YES</strong> response.</p>
          <p style="margin-top: 20px; color: #999; font-size: 14px;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error handling tech YES response:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Tech responds NO via short link
 * GET /tn/:code
 */
exports.techNo = async (req, res) => {
  try {
    const { code } = req.params;
    const decoded = decodeShortCode(code);

    if (!decoded) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Link</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Invalid Link</h1>
          <p>This link appears to be malformed.</p>
        </body>
        </html>
      `);
    }

    const { engagementId, techId } = decoded;

    console.log(`❌ Tech ${techId} responded NO for engagement ${engagementId}`);

    // Get engagement and tech details
    const engagement = await airtableService.getEngagement(engagementId);
    const tech = await airtableService.getTech(techId);

    if (!engagement || !tech) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Not Found</h1>
          <p>Engagement or tech not found.</p>
        </body>
        </html>
      `);
    }

    const techName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ');

    // Update tech availability responses (long text field for logging)
    const currentResponses = engagement.fields['Tech Availability Responses'] || '';
    const updatedResponses = currentResponses
      ? `${currentResponses}\n${techName} - NO (${new Date().toLocaleString()})`
      : `${techName} - NO (${new Date().toLocaleString()})`;

    await airtableService.updateEngagement(engagementId, {
      'Tech Availability Responses': updatedResponses,
      'Status': 'Tech Availability Check',
    });

    console.log(`✓ Recorded NO response from ${techName}`);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Response Recorded</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #dc3545 0%, #e35d6a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          .icon {
            font-size: 80px;
            margin-bottom: 20px;
          }
          h1 {
            color: #dc3545;
            margin-bottom: 15px;
          }
          p {
            color: #666;
            font-size: 18px;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">👎</div>
          <h1>Thanks ${tech.fields['First Name']}</h1>
          <p>We've recorded your <strong>NO</strong> response.</p>
          <p style="margin-top: 20px; color: #999; font-size: 14px;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error handling tech NO response:', error);
    res.status(500).send('Internal server error');
  }
};

// Export the helper functions for use in other controllers
exports.generateShortCode = generateShortCode;
exports.decodeShortCode = decodeShortCode;

module.exports = exports;
