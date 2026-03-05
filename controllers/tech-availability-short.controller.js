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

// Shared page styles
const pageStyles = `
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
  .confirm-btn {
    display: inline-block;
    padding: 16px 48px;
    border: none;
    border-radius: 12px;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    color: #fff;
    margin-top: 8px;
  }
  .confirm-btn.yes { background: #27ae60; }
  .confirm-btn.yes:hover { background: #219a52; }
  .confirm-btn.no { background: #e67e22; }
  .confirm-btn.no:hover { background: #cf6d17; }
`;

/**
 * Tech clicks YES link — show confirmation page (GET)
 * GET /ty/:code
 */
exports.techYes = async (req, res) => {
  try {
    const { code } = req.params;
    const decoded = decodeShortCode(code);

    if (!decoded) {
      return res.status(400).send(`
        <!DOCTYPE html><html><head><title>Invalid Link</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        </head><body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>Invalid Link</h1><p>This link appears to be malformed.</p></body></html>
      `);
    }

    const { engagementId, techId } = decoded;

    const tech = await airtableService.getTech(techId);
    const firstName = tech ? tech.fields['First Name'] || 'there' : 'there';

    // Show confirmation page — does NOT record anything yet
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Confirm Availability</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${pageStyles}</style>
      </head>
      <body>
        <div class="card">
          <div class="card-header">
            <img src="/gws-logo.webp" alt="Great White Security">
            <h1>Confirm Availability</h1>
            <p>Great White Security</p>
          </div>
          <div class="card-body">
            <div class="status-icon">&#128075;</div>
            <div class="status-title" style="color:#27ae60">Hey ${firstName}!</div>
            <div class="status-subtitle">Tap the button below to confirm you're <strong>available</strong> for this job.</div>
            <form method="POST" action="/ty/${code}" style="margin-top:24px">
              <button type="submit" class="confirm-btn yes">Yes, I'm Available</button>
            </form>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing tech YES page:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Tech confirms YES — record the response (POST)
 * POST /ty/:code
 */
exports.techYesConfirm = async (req, res) => {
  try {
    const { code } = req.params;
    const decoded = decodeShortCode(code);

    if (!decoded) {
      return res.status(400).send('Invalid link');
    }

    const { engagementId, techId } = decoded;

    console.log(`✅ Tech ${techId} CONFIRMED YES for engagement ${engagementId}`);

    const engagement = await airtableService.getEngagement(engagementId);
    const tech = await airtableService.getTech(techId);

    if (!engagement || !tech) {
      return res.status(404).send(`
        <!DOCTYPE html><html><head><title>Not Found</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        </head><body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>Not Found</h1><p>Engagement or tech not found.</p></body></html>
      `);
    }

    const techName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ');

    // Update tech availability responses
    const currentResponses = engagement.fields['Tech Availability Responses'] || '';
    const updatedResponses = currentResponses
      ? `${currentResponses}\n${techName} - YES (${new Date().toLocaleString()})`
      : `${techName} - YES (${new Date().toLocaleString()})`;

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
        <style>${pageStyles}</style>
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
            <div class="status-title" style="color:#27ae60">Thanks ${tech.fields['First Name']}!</div>
            <div class="status-subtitle">We've recorded your <strong>YES</strong> response. We'll be in touch with more details if this job goes ahead.</div>
            <div class="close-msg">You can close this window.</div>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error recording tech YES response:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Tech clicks NO link — show confirmation page (GET)
 * GET /tn/:code
 */
exports.techNo = async (req, res) => {
  try {
    const { code } = req.params;
    const decoded = decodeShortCode(code);

    if (!decoded) {
      return res.status(400).send(`
        <!DOCTYPE html><html><head><title>Invalid Link</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        </head><body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>Invalid Link</h1><p>This link appears to be malformed.</p></body></html>
      `);
    }

    const { engagementId, techId } = decoded;

    const tech = await airtableService.getTech(techId);
    const firstName = tech ? tech.fields['First Name'] || 'there' : 'there';

    // Show confirmation page — does NOT record anything yet
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Confirm Response</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${pageStyles}</style>
      </head>
      <body>
        <div class="card">
          <div class="card-header">
            <img src="/gws-logo.webp" alt="Great White Security">
            <h1>Confirm Response</h1>
            <p>Great White Security</p>
          </div>
          <div class="card-body">
            <div class="status-icon">&#128075;</div>
            <div class="status-title" style="color:#e67e22">Hey ${firstName}!</div>
            <div class="status-subtitle">Tap the button below to confirm you're <strong>not available</strong> for this job.</div>
            <form method="POST" action="/tn/${code}" style="margin-top:24px">
              <button type="submit" class="confirm-btn no">Not Available</button>
            </form>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing tech NO page:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Tech confirms NO — record the response (POST)
 * POST /tn/:code
 */
exports.techNoConfirm = async (req, res) => {
  try {
    const { code } = req.params;
    const decoded = decodeShortCode(code);

    if (!decoded) {
      return res.status(400).send('Invalid link');
    }

    const { engagementId, techId } = decoded;

    console.log(`❌ Tech ${techId} CONFIRMED NO for engagement ${engagementId}`);

    const engagement = await airtableService.getEngagement(engagementId);
    const tech = await airtableService.getTech(techId);

    if (!engagement || !tech) {
      return res.status(404).send(`
        <!DOCTYPE html><html><head><title>Not Found</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        </head><body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>Not Found</h1><p>Engagement or tech not found.</p></body></html>
      `);
    }

    const techName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ');

    // Update tech availability responses
    const currentResponses = engagement.fields['Tech Availability Responses'] || '';
    const updatedResponses = currentResponses
      ? `${currentResponses}\n${techName} - NO (${new Date().toLocaleString()})`
      : `${techName} - NO (${new Date().toLocaleString()})`;

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
        <style>${pageStyles}</style>
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
            <div class="status-title" style="color:#e67e22">Thanks ${tech.fields['First Name']}</div>
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
    console.error('Error recording tech NO response:', error);
    res.status(500).send('Internal server error');
  }
};

// Export the helper functions for use in other controllers
exports.generateShortCode = generateShortCode;
exports.decodeShortCode = decodeShortCode;

module.exports = exports;
