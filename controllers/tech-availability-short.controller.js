const airtableService = require('../services/airtable.service');

/**
 * Generate short code from engagement and tech IDs
 */
function generateShortCode(engagementId, techId) {
  const combined = `${engagementId}:${techId}`;
  return Buffer.from(combined).toString('base64url');
}

/**
 * Decode short code to get engagement and tech IDs
 */
function decodeShortCode(code) {
  try {
    const decoded = Buffer.from(code, 'base64url').toString('utf-8');
    const [engagementId, techId] = decoded.split(':');
    return { engagementId, techId };
  } catch (error) {
    return null;
  }
}

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

    // Update available techs list
    const currentAvailableTechs = engagement.fields['Available Techs'] || '';
    const updatedAvailableTechs = currentAvailableTechs
      ? `${currentAvailableTechs}\n${techName} - YES (${new Date().toISOString()})`
      : `${techName} - YES (${new Date().toISOString()})`;

    await airtableService.updateEngagement(engagementId, {
      'Available Techs': updatedAvailableTechs,
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

    // Update available techs list
    const currentAvailableTechs = engagement.fields['Available Techs'] || '';
    const updatedAvailableTechs = currentAvailableTechs
      ? `${currentAvailableTechs}\n${techName} - NO (${new Date().toISOString()})`
      : `${techName} - NO (${new Date().toISOString()})`;

    await airtableService.updateEngagement(engagementId, {
      'Available Techs': updatedAvailableTechs,
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
