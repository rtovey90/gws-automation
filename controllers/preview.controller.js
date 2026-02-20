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
  .detail-box {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    border-left: 4px solid #78e4ff;
  }
  .detail-row {
    display: flex;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
  }
  .detail-row:last-child {
    border-bottom: none;
  }
  .detail-label {
    color: #666;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    width: 80px;
    flex-shrink: 0;
  }
  .detail-value {
    color: #1a202c;
    font-size: 14px;
    font-weight: 500;
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

  /* Form styles */
  .form-group { margin-bottom: 20px; }
  .form-group label {
    display: block;
    color: #333;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .form-group textarea {
    width: 100%;
    padding: 14px;
    border: 2px solid #e0e6ed;
    border-radius: 10px;
    font-size: 15px;
    font-family: inherit;
    resize: vertical;
    min-height: 120px;
    transition: border-color 0.3s;
  }
  .form-group textarea:focus {
    outline: none;
    border-color: #78e4ff;
  }
  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .radio-option {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    border: 2px solid #e0e6ed;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
    color: #333;
  }
  .radio-option:hover {
    border-color: #78e4ff;
    background: #f0fcff;
  }
  .radio-option input[type="radio"] {
    margin-right: 12px;
    width: 18px;
    height: 18px;
  }
  .submit-btn {
    width: 100%;
    padding: 16px;
    background: linear-gradient(135deg, #0a0e27 0%, #1a2332 100%);
    color: #78e4ff;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    letter-spacing: 0.5px;
  }
  .submit-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(120, 228, 255, 0.3);
  }

  /* Warning card variant */
  .warning .status-title { color: #e67e22; }
  .warning .detail-box { border-left-color: #e67e22; }

  /* Success variant */
  .success .status-title { color: #27ae60; }

  /* Decline variant */
  .decline .status-title { color: #c0392b; }

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

exports.acceptJob = (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preview - Job Accepted</title>
  <style>${techPageStyles}</style>
</head>
<body>
  <div class="card">
    <div class="preview-banner">Design Preview — No Real Data</div>
    <div class="card-header">
      <img src="/gws-logo.webp" alt="Great White Security">
      <h1>Job Accepted</h1>
      <p>Great White Security</p>
    </div>
    <div class="card-body success">
      <div class="status-icon">&#10003;</div>
      <div class="status-title">You're on the job!</div>
      <div class="status-subtitle">You've been assigned to this job. Details below.</div>
      <div class="detail-box">
        <div class="detail-row">
          <span class="detail-label">Client</span>
          <span class="detail-value">John Smith</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Address</span>
          <span class="detail-value">42 Example Street, Bentley WA 6102</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Scope</span>
          <span class="detail-value">Install 4x CCTV cameras, run cabling, configure NVR</span>
        </div>
      </div>
    </div>
    <div class="card-footer">
      You'll receive another SMS once payment is received with client contact details.
    </div>
  </div>
</body>
</html>`);
};

exports.jobAlreadyTaken = (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preview - Job Already Taken</title>
  <style>${techPageStyles}</style>
</head>
<body>
  <div class="card">
    <div class="preview-banner">Design Preview — No Real Data</div>
    <div class="card-header">
      <img src="/gws-logo.webp" alt="Great White Security">
      <h1>Job Unavailable</h1>
      <p>Great White Security</p>
    </div>
    <div class="card-body warning">
      <div class="status-icon">&#9888;</div>
      <div class="status-title">Already Taken</div>
      <div class="status-subtitle">Sorry, this job has already been accepted by another technician. Better luck next time!</div>
    </div>
    <div class="card-footer">
      <a href="tel:0413346978">Call Ricky — 0413 346 978</a>
    </div>
  </div>
</body>
</html>`);
};

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
      <div class="status-icon">&#128077;</div>
      <div class="status-title">Thanks Lee!</div>
      <div class="status-subtitle">We've recorded your <strong>YES</strong> response. We'll be in touch ASAP with more details if this job goes ahead.</div>
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

exports.jobUpdate = (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preview - Job Update</title>
  <style>${techPageStyles}</style>
</head>
<body>
  <div class="card">
    <div class="preview-banner">Design Preview — No Real Data</div>
    <div class="card-header">
      <img src="/gws-logo.webp" alt="Great White Security">
      <h1>Update Job Status</h1>
      <p>Great White Security</p>
    </div>
    <div class="card-body">
      <div class="detail-box">
        <div class="detail-row">
          <span class="detail-label">Client</span>
          <span class="detail-value">John Smith</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Address</span>
          <span class="detail-value">42 Example Street, Bentley WA 6102</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Scope</span>
          <span class="detail-value">Install 4x CCTV cameras, run cabling, configure NVR</span>
        </div>
      </div>

      <form onsubmit="event.preventDefault(); alert('This is a preview — nothing will be submitted.');">
        <div class="form-group">
          <label for="notes">Job Notes</label>
          <textarea id="notes" placeholder="Enter what you did, any issues found, parts used, etc..." required></textarea>
        </div>
        <div class="form-group">
          <label>Job Status</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="status" value="complete" required>
              <span>Job Complete — Ready for review request</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="status" value="needs_more_work">
              <span>Needs Follow-up — Notify Ricky</span>
            </label>
          </div>
        </div>
        <button type="submit" class="submit-btn">Submit Update</button>
      </form>
    </div>
  </div>
</body>
</html>`);
};

module.exports = exports;
