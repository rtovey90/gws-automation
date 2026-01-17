const airtableService = require('../services/airtable.service');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;

/**
 * Completion Controllers - Tech marks job complete and uploads photos
 */

// Configure Cloudinary (prefer CLOUDINARY_URL when available)
const cloudinaryUrl = process.env.CLOUDINARY_URL;
let cloudinaryConfig = null;

if (cloudinaryUrl) {
  try {
    const parsed = new URL(cloudinaryUrl);
    cloudinaryConfig = {
      cloud_name: parsed.hostname,
      api_key: decodeURIComponent(parsed.username),
      api_secret: decodeURIComponent(parsed.password),
      secure: true,
    };
  } catch (error) {
    console.error('Invalid CLOUDINARY_URL format. Falling back to discrete variables.');
  }
}

if (!cloudinaryConfig) {
  cloudinaryConfig = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  };
}

cloudinary.config(cloudinaryConfig);

// Configure multer for memory storage (upload to Cloudinary)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * Show completion form for tech
 * GET /c/:leadId
 */
exports.showCompletionForm = async (req, res) => {
  try {
    const { leadId } = req.params;

    console.log(`✅ Opening completion form for lead: ${leadId}`);

    // Get engagement and customer details
    const result = await airtableService.getEngagementWithCustomer(leadId);

    if (!result || !result.engagement) {
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
          <p>Job not found</p>
        </body>
        </html>
      `);
    }

    const { engagement, customer } = result;
    const lead = engagement; // For backward compatibility

    const clientName = (customer && customer.fields['First Name']) || lead.fields['First Name (from Customer)'] || 'Client';
    const clientAddress = (customer && customer.fields.Address) || lead.fields['Address (from Customer)'] || '';
    const scope = lead.fields['Job Scope'] || lead.fields['Client intake info'] || '';

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Complete Job - Great White Security</title>
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
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 {
            color: #333;
            font-size: 28px;
            margin-bottom: 10px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
            line-height: 1.5;
          }
          .job-details {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
          }
          .detail-row {
            margin-bottom: 10px;
          }
          .detail-label {
            font-weight: 600;
            color: #666;
            margin-bottom: 5px;
          }
          .detail-value {
            color: #333;
          }
          label {
            display: block;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
            font-size: 16px;
          }
          input[type="text"],
          input[type="password"],
          textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 20px;
            font-family: inherit;
          }
          textarea {
            min-height: 100px;
            resize: vertical;
          }
          input:focus,
          textarea:focus {
            outline: none;
            border-color: #667eea;
          }
          .radio-group {
            margin-bottom: 20px;
          }
          .radio-option {
            display: inline-block;
            margin-right: 20px;
            margin-bottom: 10px;
          }
          .radio-option input[type="radio"] {
            margin-right: 8px;
            width: auto;
          }
          .radio-option label {
            display: inline;
            font-weight: normal;
            margin: 0;
          }
          .conditional-field {
            display: none;
          }
          .section-title {
            font-size: 18px;
            font-weight: 700;
            color: #333;
            margin: 30px 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
          }
          .file-input-wrapper {
            position: relative;
            margin-bottom: 25px;
          }
          input[type="file"] {
            width: 100%;
            padding: 12px;
            border: 2px dashed #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
          }
          input[type="file"]:focus {
            outline: none;
            border-color: #667eea;
          }
          .file-note {
            color: #999;
            font-size: 14px;
            margin-top: 8px;
          }
          .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 15px 40px;
            font-size: 18px;
            border-radius: 8px;
            cursor: pointer;
            width: 100%;
            font-weight: 600;
            transition: background 0.2s;
          }
          .btn:hover {
            background: #5568d3;
          }
          .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .loading {
            display: none;
            text-align: center;
            color: #667eea;
            font-weight: 600;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Complete Job</h1>
          <p class="subtitle">Upload photos and add any notes about the completed work.</p>

          <div class="job-details">
            <div class="detail-row">
              <div class="detail-label">Client:</div>
              <div class="detail-value">${clientName}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Address:</div>
              <div class="detail-value">${clientAddress}</div>
            </div>
            ${scope ? `
            <div class="detail-row">
              <div class="detail-label">Scope:</div>
              <div class="detail-value">${scope}</div>
            </div>
            ` : ''}
          </div>

          <form id="completionForm" enctype="multipart/form-data">
            <input type="hidden" name="leadId" value="${leadId}">

            <label for="jobNotes">📝 Job Notes:</label>
            <textarea name="jobNotes" id="jobNotes" placeholder="Describe the work completed, parts used, etc." required></textarea>

            <label>Issue Resolved:</label>
            <div class="radio-group">
              <div class="radio-option">
                <input type="radio" name="issueResolved" id="resolvedYes" value="Yes" required>
                <label for="resolvedYes">Yes ✅</label>
              </div>
              <div class="radio-option">
                <input type="radio" name="issueResolved" id="resolvedNo" value="No">
                <label for="resolvedNo">No ❌</label>
              </div>
            </div>

            <div id="nextStepsField" class="conditional-field">
              <label for="nextSteps">Next Steps (Required if not resolved):</label>
              <textarea name="nextSteps" id="nextSteps" placeholder="What needs to be done to resolve the issue?"></textarea>
            </div>

            <label for="upgradeOpportunities">💡 Potential Upgrade Opportunities (Important!):</label>
            <textarea name="upgradeOpportunities" id="upgradeOpportunities" placeholder="Note any potential upgrades or additional services the client might need..." style="min-height: 120px;"></textarea>

            <div class="section-title">🔑 Access Codes (if used)</div>

            <label for="nvrLogin">NVR Login:</label>
            <input type="text" name="nvrLogin" id="nvrLogin" placeholder="Username">

            <label for="nvrPassword">NVR Password:</label>
            <input type="password" name="nvrPassword" id="nvrPassword" placeholder="Password">

            <label for="installerCode">Installer Code:</label>
            <input type="text" name="installerCode" id="installerCode" placeholder="Installer code">

            <label for="masterCode">Master Code:</label>
            <input type="text" name="masterCode" id="masterCode" placeholder="Master code">

            <label for="photos">📷 Please upload photos of site equipment:</label>
            <div class="file-input-wrapper">
              <input type="file" name="photos" id="photos" multiple accept="image/*">
              <div class="file-note">You can select multiple photos</div>
            </div>

            <button type="submit" class="btn">Mark as Complete</button>
            <div class="loading" id="loading">Uploading...</div>
          </form>
        </div>

        <script>
          // Show/hide next steps field based on issue resolved selection
          const resolvedYes = document.getElementById('resolvedYes');
          const resolvedNo = document.getElementById('resolvedNo');
          const nextStepsField = document.getElementById('nextStepsField');
          const nextStepsTextarea = document.getElementById('nextSteps');

          resolvedYes.addEventListener('change', () => {
            nextStepsField.style.display = 'none';
            nextStepsTextarea.required = false;
          });

          resolvedNo.addEventListener('change', () => {
            nextStepsField.style.display = 'block';
            nextStepsTextarea.required = true;
          });

          document.getElementById('completionForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);

            // Disable button and show loading
            const btn = e.target.querySelector('.btn');
            btn.disabled = true;
            document.getElementById('loading').style.display = 'block';

            try {
              const response = await fetch('/api/complete-job', {
                method: 'POST',
                body: formData,
              });

              const result = await response.json();

              if (result.success) {
                document.querySelector('.container').innerHTML = \`
                  <div style="text-align: center; padding: 40px 0;">
                    <div style="font-size: 72px; margin-bottom: 20px;">✅</div>
                    <h1 style="color: #28a745; margin-bottom: 20px;">Job Completed!</h1>
                    <p style="color: #666; font-size: 18px;">Your notes and photos have been submitted.</p>
                    <p style="color: #999; margin-top: 20px;">You can close this window.</p>
                  </div>
                \`;
              } else {
                alert('Error: ' + result.error);
                btn.disabled = false;
                document.getElementById('loading').style.display = 'none';
              }
            } catch (error) {
              alert('Error completing job: ' + error.message);
              btn.disabled = false;
              document.getElementById('loading').style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing completion form:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Complete job with photos and notes
 * POST /api/complete-job
 */
exports.completeJob = async (req, res) => {
  try {
    const {
      leadId,
      nvrLogin,
      nvrPassword,
      installerCode,
      masterCode,
      jobNotes,
      issueResolved,
      nextSteps,
      upgradeOpportunities
    } = req.body;
    const files = req.files;

    if (!leadId || !jobNotes) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`✅ Completing job for engagement ${leadId}`);
    console.log(`📝 Job Notes: ${jobNotes}`);
    console.log(`✅ Issue Resolved: ${issueResolved}`);
    console.log(`📷 Photos: ${files ? files.length : 0}`);

    // Upload photos to Cloudinary
    const photoAttachments = [];
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          console.log(`📤 Uploading ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB) to Cloudinary...`);

          // Upload to Cloudinary using base64
          const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

          const uploadResult = await cloudinary.uploader.upload(base64Data, {
            folder: `gws-jobs/${leadId}`,
            resource_type: 'auto',
            public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
          });

          console.log(`✓ Uploaded ${file.originalname} to Cloudinary: ${uploadResult.secure_url}`);

          photoAttachments.push({
            url: uploadResult.secure_url,
          });
        } catch (uploadError) {
          console.error(`❌ Failed to upload ${file.originalname} to Cloudinary:`, uploadError.message);
          // Continue with other files even if one fails
        }
      }
    }

    // Build comprehensive completion notes
    let completionNotes = `${jobNotes}`;

    if (nvrLogin) completionNotes += `\n\nNVR Login: ${nvrLogin}`;
    if (nvrPassword) completionNotes += `\nNVR Password: ${nvrPassword}`;
    if (installerCode) completionNotes += `\nInstaller Code: ${installerCode}`;
    if (masterCode) completionNotes += `\nMaster Code: ${masterCode}`;
    if (issueResolved) completionNotes += `\n\nIssue Resolved: ${issueResolved}`;
    if (nextSteps) completionNotes += `\nNext Steps: ${nextSteps}`;
    if (upgradeOpportunities) completionNotes += `\n\n💡 UPGRADE OPPORTUNITIES:\n${upgradeOpportunities}`;

    // Update lead with completion info
    const updates = {
      'Tech Notes': completionNotes,
      'Completion Date': new Date().toISOString().split('T')[0],
      'Issue Resolved': issueResolved || 'N/A',
      Status: 'Completed ✅',
    };

    // Add upgrade opportunities as separate field if provided
    if (upgradeOpportunities) {
      updates['Upgrade Opportunities'] = upgradeOpportunities;
    }

    // Add photos if any were uploaded
    if (photoAttachments.length > 0) {
      // Get existing photos
      const engagement = await airtableService.getEngagement(leadId);
      const existingPhotos = engagement.fields.Photos || [];
      updates.Photos = [...existingPhotos, ...photoAttachments];
    }

    await airtableService.updateEngagement(leadId, updates);

    console.log(`✓ Job marked as completed`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error completing job:', error);
    res.status(500).json({ error: 'Failed to complete job' });
  }
};

// Export multer middleware
exports.uploadMiddleware = upload.array('photos', 10); // Max 10 photos

module.exports = exports;
