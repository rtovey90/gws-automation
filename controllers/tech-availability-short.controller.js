const airtableService = require('../services/airtable.service');

/**
 * Generate code by encoding IDs directly into the URL (stateless, survives deploys)
 */
function generateShortCode(engagementId, techId) {
  const code = Buffer.from(JSON.stringify({ e: engagementId, t: techId })).toString('base64url');
  console.log(`📝 Generated code ${code} for engagement ${engagementId}, tech ${techId}`);
  return code;
}

/**
 * Decode engagement and tech IDs from code
 */
function decodeShortCode(code) {
  try {
    const data = JSON.parse(Buffer.from(code, 'base64url').toString());
    if (!data.e || !data.t) return null;
    return { engagementId: data.e, techId: data.t };
  } catch {
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
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #0a0e27;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .card {
            background: #fff;
            border-radius: 20px;
            max-width: 500px;
            width: 100%;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          }
          .card-header {
            background: linear-gradient(135deg, #0a0e27 0%, #1a2332 100%);
            padding: 30px 24px;
            text-align: center;
          }
          .card-header img {
            width: 56px;
            height: 56px;
            object-fit: contain;
            margin-bottom: 12px;
          }
          .card-header h1 {
            color: #fff;
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 6px;
          }
          .card-header p {
            color: #78e4ff;
            font-size: 14px;
            font-weight: 500;
          }
          .card-body {
            padding: 36px 24px;
            text-align: center;
          }
          .status-icon {
            font-size: 56px;
            margin-bottom: 16px;
          }
          .status-title {
            font-size: 22px;
            font-weight: 700;
            color: #27ae60;
            margin-bottom: 8px;
          }
          .status-subtitle {
            color: #666;
            font-size: 15px;
            line-height: 1.5;
          }
          .close-msg {
            text-align: center;
            color: #aaa;
            font-size: 13px;
            margin-top: 24px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="card-header">
            <img src="/gws-logo.webp" alt="Great White Security">
            <h1>Response Recorded</h1>
            <p>Great White Security</p>
          </div>
          <div class="card-body">
            <div class="status-icon">&#10003;</div>
            <div class="status-title">Thanks ${tech.fields['First Name']}!</div>
            <div class="status-subtitle">We've recorded your <strong>YES</strong> response. We'll be in touch with more details if this job goes ahead.</div>
            <div class="close-msg">You can close this window.</div>
          </div>
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

    // Remove tech from Available Techs if they were previously added
    const currentAvailableTechs = engagement.fields['Available Techs'] || [];
    const updatedAvailableTechs = currentAvailableTechs.filter(id => id !== techId);

    await airtableService.updateEngagement(engagementId, {
      'Tech Availability Responses': updatedResponses,
      'Available Techs': updatedAvailableTechs,
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
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #0a0e27;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .card {
            background: #fff;
            border-radius: 20px;
            max-width: 500px;
            width: 100%;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          }
          .card-header {
            background: linear-gradient(135deg, #0a0e27 0%, #1a2332 100%);
            padding: 30px 24px;
            text-align: center;
          }
          .card-header img {
            width: 56px;
            height: 56px;
            object-fit: contain;
            margin-bottom: 12px;
          }
          .card-header h1 {
            color: #fff;
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 6px;
          }
          .card-header p {
            color: #78e4ff;
            font-size: 14px;
            font-weight: 500;
          }
          .card-body {
            padding: 36px 24px;
            text-align: center;
          }
          .status-icon {
            font-size: 56px;
            margin-bottom: 16px;
          }
          .status-title {
            font-size: 22px;
            font-weight: 700;
            color: #e67e22;
            margin-bottom: 8px;
          }
          .status-subtitle {
            color: #666;
            font-size: 15px;
            line-height: 1.5;
          }
          .close-msg {
            text-align: center;
            color: #aaa;
            font-size: 13px;
            margin-top: 24px;
          }
          .card-footer {
            text-align: center;
            padding: 0 24px 28px;
            color: #999;
            font-size: 13px;
          }
          .card-footer a {
            color: #78e4ff;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="card-header">
            <img src="/gws-logo.webp" alt="Great White Security">
            <h1>Response Recorded</h1>
            <p>Great White Security</p>
          </div>
          <div class="card-body">
            <div class="status-icon">&#128078;</div>
            <div class="status-title">Thanks ${tech.fields['First Name']}</div>
            <div class="status-subtitle">We've recorded your <strong>NO</strong> response. No worries — if your circumstances change, reach out anytime.</div>
            <div class="close-msg">You can close this window.</div>
          </div>
          <div class="card-footer">
            <a href="tel:0413346978">Call Ricky — 0413 346 978</a>
          </div>
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
