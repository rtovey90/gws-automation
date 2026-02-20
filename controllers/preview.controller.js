/**
 * Preview Controller - Renders tech-facing pages with dummy data for design testing.
 * No Airtable reads or writes. All routes behind requireAuth.
 */

const techPageStyles = `
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
    padding: 28px 24px;
  }
  .status-icon {
    text-align: center;
    font-size: 56px;
    margin-bottom: 16px;
  }
  .status-title {
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .status-subtitle {
    text-align: center;
    color: #666;
    font-size: 15px;
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .card-footer {
    text-align: center;
    padding: 0 24px 28px;
    color: #999;
    font-size: 13px;
    line-height: 1.5;
  }
  .card-footer a {
    color: #78e4ff;
    text-decoration: none;
  }
  .close-msg {
    text-align: center;
    color: #aaa;
    font-size: 13px;
    margin-top: 16px;
  }

  /* Success variant */
  .success .status-title { color: #27ae60; }

  /* Decline variant */
  .decline .status-title { color: #e67e22; }

  .preview-banner {
    background: #ff6b35;
    color: white;
    text-align: center;
    padding: 8px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
`;

exports.availabilityYes = (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preview - Availability Yes</title>
  <style>${techPageStyles}</style>
</head>
<body>
  <div class="card">
    <div class="preview-banner">Design Preview — No Real Data</div>
    <div class="card-header">
      <img src="/gws-logo.webp" alt="Great White Security">
      <h1>Response Recorded</h1>
      <p>Great White Security</p>
    </div>
    <div class="card-body success">
      <div class="status-icon">&#10003;</div>
      <div class="status-title">Thanks Lee!</div>
      <div class="status-subtitle">We've recorded your <strong>YES</strong> response. We'll be in touch with more details if this job goes ahead.</div>
      <div class="close-msg">You can close this window.</div>
    </div>
  </div>
</body>
</html>`);
};

exports.availabilityNo = (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preview - Availability No</title>
  <style>${techPageStyles}</style>
</head>
<body>
  <div class="card">
    <div class="preview-banner">Design Preview — No Real Data</div>
    <div class="card-header">
      <img src="/gws-logo.webp" alt="Great White Security">
      <h1>Response Recorded</h1>
      <p>Great White Security</p>
    </div>
    <div class="card-body decline">
      <div class="status-icon">&#128078;</div>
      <div class="status-title">Thanks Lee</div>
      <div class="status-subtitle">We've recorded your <strong>NO</strong> response. No worries — if your circumstances change, reach out anytime.</div>
      <div class="close-msg">You can close this window.</div>
    </div>
    <div class="card-footer">
      <a href="tel:0413346978">Call Ricky — 0413 346 978</a>
    </div>
  </div>
</body>
</html>`);
};

module.exports = exports;
