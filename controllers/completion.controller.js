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
    const engagementId = req.params.leadId;
    const techFromUrl = req.query.tech || '';

    console.log(`✅ Opening completion form for engagement: ${engagementId}`);

    // Get engagement and customer details
    const result = await airtableService.getEngagementWithCustomer(engagementId);

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

    // Fetch previous site visits
    let previousVisits = [];
    try {
      previousVisits = await airtableService.getSiteVisitsByEngagement(engagementId);
    } catch (e) {
      console.warn('Could not fetch site visits:', e.message);
    }

    // Pre-fill access codes from most recent visit
    const lastVisit = previousVisits.length > 0 ? previousVisits[0] : null;
    const prefillNvrLogin = (lastVisit && lastVisit.fields['NVR Login']) || '';
    const prefillNvrPassword = (lastVisit && lastVisit.fields['NVR Password']) || '';
    const prefillInstallerCode = (lastVisit && lastVisit.fields['Installer Code']) || '';
    const prefillMasterCode = (lastVisit && lastVisit.fields['Master Code']) || '';
    const prefillCameraLogin = (lastVisit && lastVisit.fields['Camera Login']) || '';
    const prefillCameraPassword = (lastVisit && lastVisit.fields['Camera Password']) || '';

    // Build previous visits HTML
    let previousVisitsHtml = '';
    if (previousVisits.length > 0) {
      const visitRows = previousVisits.map((v, i) => {
        const f = v.fields;
        const visitDate = f['Visit Date'] ? new Date(f['Visit Date']).toLocaleDateString('en-AU') : 'Unknown date';
        const timeRange = (f['Time Arrived'] && f['Time Left']) ? `${f['Time Arrived']} – ${f['Time Left']}` : '';
        const resolved = f['Issue Resolved'] || '';
        const resolvedIcon = resolved === 'Yes' ? '✅' : '❌';
        const techName = f['Tech Name'] || '';
        const notes = f['Job Notes'] || '';
        const truncatedNotes = notes.length > 120 ? notes.substring(0, 120) + '...' : notes;
        return `
          <div style="padding: 12px 0; ${i < previousVisits.length - 1 ? 'border-bottom: 1px solid #e0e0e0;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong>Visit ${previousVisits.length - i}${visitDate ? ' — ' + visitDate : ''}</strong>
              <span>${resolvedIcon} ${resolved}</span>
            </div>
            ${techName ? `<div style="color: #888; font-size: 13px;">Tech: ${techName}${timeRange ? ' | ' + timeRange : ''}</div>` : ''}
            ${truncatedNotes ? `<div style="color: #555; font-size: 14px; margin-top: 4px;">${truncatedNotes}</div>` : ''}
          </div>
        `;
      }).join('');

      previousVisitsHtml = `
        <div class="section-title">📋 Previous Visits (${previousVisits.length})</div>
        <div style="background: #f8f9fa; border-radius: 8px; padding: 12px 16px; margin-bottom: 30px;">
          ${visitRows}
        </div>
      `;
    }

    // Count visits: Site Visits table records + any pre-existing visit blocks in Client Notes
    const existingNotes = engagement.fields['Client Notes'] || '';
    const legacyVisitCount = (existingNotes.match(/── VISIT \d+/g) || []).length;
    // If there's Client Notes content but no visit markers, that's a legacy completion (count as 1)
    const hasLegacyCompletion = existingNotes.trim().length > 0 && legacyVisitCount === 0;
    const priorVisits = Math.max(previousVisits.length, legacyVisitCount, hasLegacyCompletion ? 1 : 0);
    const visitNumber = priorVisits + 1;
    const submitLabel = visitNumber === 1 ? 'Submit Visit Notes' : `Submit Visit ${visitNumber} Notes`;

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
            background: #0a0e27;
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
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
          input[type="time"],
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
            border-color: #78e4ff;
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
            border-color: #78e4ff;
          }
          .file-note {
            color: #999;
            font-size: 14px;
            margin-top: 8px;
          }
          .btn {
            background: linear-gradient(135deg, #0a0e27 0%, #1a2332 100%);
            color: #78e4ff;
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
            background: linear-gradient(135deg, #1a2332 0%, #0a0e27 100%);
          }
          .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .loading {
            display: none;
            text-align: center;
            color: #78e4ff;
            font-weight: 600;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card-header">
            <img src="/gws-logo.webp" alt="Great White Security">
            <h1>Visit ${visitNumber} — ${clientName}</h1>
            <p>Great White Security</p>
          </div>
          <div class="card-body">

          <p class="subtitle">Upload photos and add notes about the work done on this visit.</p>

          ${previousVisitsHtml}

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
            <input type="hidden" name="leadId" value="${engagementId}">
            <input type="hidden" name="visitNumber" value="${visitNumber}">

            <div class="section-title">👤 Tech 1</div>
            <label for="techName">Name:</label>
            <input type="text" name="techName" id="techName" placeholder="e.g. Lee Clowting" value="${techFromUrl}" required>
            <div style="display: flex; gap: 20px; margin-bottom: 20px;">
              <div style="flex: 1;">
                <label for="timeArrived">Time Arrived:</label>
                <input type="time" name="timeArrived" id="timeArrived" required>
              </div>
              <div style="flex: 1;">
                <label for="timeDeparted">Time Left:</label>
                <input type="time" name="timeDeparted" id="timeDeparted" required>
              </div>
            </div>

            <div class="section-title">👤 Tech 2 <span style="font-weight: 400; font-size: 14px; color: #999;">(optional)</span></div>
            <label for="tech2Name">Name:</label>
            <input type="text" name="tech2Name" id="tech2Name" placeholder="Leave blank if solo">
            <div style="margin-bottom: 12px;">
              <label style="display: inline; font-weight: normal; font-size: 14px; cursor: pointer;">
                <input type="checkbox" id="sameTime" style="width: auto; margin-right: 6px;">
                Same time as Tech 1
              </label>
            </div>
            <div id="tech2TimeFields" style="display: flex; gap: 20px; margin-bottom: 20px;">
              <div style="flex: 1;">
                <label for="tech2TimeArrived">Time Arrived:</label>
                <input type="time" name="tech2TimeArrived" id="tech2TimeArrived">
              </div>
              <div style="flex: 1;">
                <label for="tech2TimeLeft">Time Left:</label>
                <input type="time" name="tech2TimeLeft" id="tech2TimeLeft">
              </div>
            </div>

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
            <input type="text" name="nvrLogin" id="nvrLogin" placeholder="Username" value="${prefillNvrLogin}">

            <label for="nvrPassword">NVR Password:</label>
            <input type="text" name="nvrPassword" id="nvrPassword" placeholder="Password" value="${prefillNvrPassword}">

            <label for="installerCode">Installer Code:</label>
            <input type="text" name="installerCode" id="installerCode" placeholder="Installer code" value="${prefillInstallerCode}">

            <label for="masterCode">Master Code:</label>
            <input type="text" name="masterCode" id="masterCode" placeholder="Master code" value="${prefillMasterCode}">

            <label for="cameraLogin">Camera Login:</label>
            <input type="text" name="cameraLogin" id="cameraLogin" placeholder="Camera username" value="${prefillCameraLogin}">

            <label for="cameraPassword">Camera Password:</label>
            <input type="text" name="cameraPassword" id="cameraPassword" placeholder="Camera password" value="${prefillCameraPassword}">

            <label for="photos">📷 Please upload photos of site equipment:</label>
            <div class="file-input-wrapper">
              <input type="file" name="photos" id="photos" multiple accept="image/*">
              <div class="file-note">You can select multiple photos</div>
            </div>

            <button type="submit" class="btn">${submitLabel}</button>
            <div class="loading" id="loading">Uploading...</div>
          </form>
          </div>
        </div>

        <script>
          // Same time as Tech 1 checkbox
          const sameTimeCheckbox = document.getElementById('sameTime');
          const tech2TimeFields = document.getElementById('tech2TimeFields');
          sameTimeCheckbox.addEventListener('change', () => {
            if (sameTimeCheckbox.checked) {
              tech2TimeFields.style.display = 'none';
              document.getElementById('tech2TimeArrived').value = '';
              document.getElementById('tech2TimeLeft').value = '';
            } else {
              tech2TimeFields.style.display = 'flex';
            }
          });

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

            // If "Same time as Tech 1" is checked, copy Tech 1 times to Tech 2
            if (sameTimeCheckbox.checked && document.getElementById('tech2Name').value.trim()) {
              formData.set('tech2TimeArrived', document.getElementById('timeArrived').value);
              formData.set('tech2TimeLeft', document.getElementById('timeDeparted').value);
            }

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
                const resolved = formData.get('issueResolved') === 'Yes';
                const icon = resolved ? '✅' : '🔄';
                const heading = resolved ? 'Job Completed!' : 'Visit Logged!';
                const subtext = resolved
                  ? 'Your notes and photos have been submitted.'
                  : 'Return visit required — notes saved.';
                document.querySelector('.container').innerHTML = \`
                  <div style="text-align: center; padding: 40px 0;">
                    <div style="font-size: 72px; margin-bottom: 20px;">\${icon}</div>
                    <h1 style="color: \${resolved ? '#28a745' : '#e67e22'}; margin-bottom: 20px;">\${heading}</h1>
                    <p style="color: #666; font-size: 18px;">\${subtext}</p>
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
      leadId, // Keep as leadId from form for backwards compatibility
      nvrLogin,
      nvrPassword,
      installerCode,
      masterCode,
      cameraLogin,
      cameraPassword,
      jobNotes,
      issueResolved,
      nextSteps,
      upgradeOpportunities,
      timeArrived,
      timeDeparted,
      techName,
      tech2Name,
      tech2TimeArrived,
      tech2TimeLeft,
      visitNumber,
    } = req.body;
    const files = req.files;
    const engagementId = leadId; // Extract to engagementId variable

    if (!engagementId || !jobNotes) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const vNum = parseInt(visitNumber, 10) || 1;
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-AU');

    console.log(`✅ Logging visit ${vNum} for engagement ${engagementId}`);
    console.log(`📝 Job Notes: ${jobNotes}`);
    console.log(`✅ Issue Resolved: ${issueResolved}`);
    console.log(`📷 Photos: ${files ? files.length : 0}`);

    // Upload photos to Cloudinary
    const photoAttachments = [];
    const skippedFiles = [];
    const cloudinaryLimit = 10 * 1024 * 1024; // 10MB Cloudinary free tier limit

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);

          // Skip files over 10MB (Cloudinary free tier limit)
          if (file.size > cloudinaryLimit) {
            console.log(`⚠️ Skipping ${file.originalname} (${fileSizeMB}MB) - exceeds Cloudinary 10MB limit`);
            skippedFiles.push(`${file.originalname} (${fileSizeMB}MB - too large)`);
            continue;
          }

          console.log(`📤 Uploading ${file.originalname} (${fileSizeMB}MB) to Cloudinary...`);

          // Upload to Cloudinary using base64
          const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

          const uploadResult = await cloudinary.uploader.upload(base64Data, {
            folder: `gws-jobs/${engagementId}`,
            resource_type: 'auto',
            public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
          });

          console.log(`✓ Uploaded ${file.originalname} to Cloudinary: ${uploadResult.secure_url}`);

          photoAttachments.push({
            url: uploadResult.secure_url,
          });
        } catch (uploadError) {
          console.error(`❌ Failed to upload ${file.originalname} to Cloudinary:`, uploadError.message);
          skippedFiles.push(`${file.originalname} (upload error)`);
          // Continue with other files even if one fails
        }
      }
    }

    // 1. Create Site Visit record
    const siteVisitFields = {
      'Engagement': [engagementId],
      'Visit Date': today.toISOString().split('T')[0],
      'Job Notes': jobNotes,
      'Issue Resolved': issueResolved || 'Yes',
    };
    if (techName) siteVisitFields['Tech Name'] = techName;
    if (timeArrived) siteVisitFields['Time Arrived'] = timeArrived;
    if (timeDeparted) siteVisitFields['Time Left'] = timeDeparted;
    if (nextSteps) siteVisitFields['Next Steps'] = nextSteps;
    if (upgradeOpportunities) siteVisitFields['Upgrade Opportunities'] = upgradeOpportunities;
    if (nvrLogin) siteVisitFields['NVR Login'] = nvrLogin;
    if (nvrPassword) siteVisitFields['NVR Password'] = nvrPassword;
    if (installerCode) siteVisitFields['Installer Code'] = installerCode;
    if (masterCode) siteVisitFields['Master Code'] = masterCode;
    if (cameraLogin) siteVisitFields['Camera Login'] = cameraLogin;
    if (cameraPassword) siteVisitFields['Camera Password'] = cameraPassword;
    if (photoAttachments.length > 0) siteVisitFields['Photos'] = photoAttachments;
    if (tech2Name) {
      siteVisitFields['Tech 2 Name'] = tech2Name;
      if (tech2TimeArrived) siteVisitFields['Tech 2 Time Arrived'] = tech2TimeArrived;
      if (tech2TimeLeft) siteVisitFields['Tech 2 Time Left'] = tech2TimeLeft;
    }

    try {
      await airtableService.createSiteVisit(siteVisitFields);
    } catch (siteVisitErr) {
      console.error('⚠️ Could not create site visit record:', siteVisitErr.message);
      // Continue — still update engagement even if site visit table isn't set up yet
    }

    // 2. Build visit block to APPEND to engagement Client Notes
    const separator = `── VISIT ${vNum} — ${dateStr} ──────────────`;
    let visitBlock = separator;
    if (techName) visitBlock += `\nTech 1: ${techName}`;
    if (timeArrived && timeDeparted) {
      visitBlock += ` (${timeArrived} – ${timeDeparted})`;
    }
    if (tech2Name) {
      visitBlock += `\nTech 2: ${tech2Name}`;
      if (tech2TimeArrived && tech2TimeLeft) {
        visitBlock += ` (${tech2TimeArrived} – ${tech2TimeLeft})`;
      }
    }
    visitBlock += `\n\n${jobNotes}`;
    visitBlock += `\n\nIssue Resolved: ${issueResolved || 'Yes'}`;
    if (nextSteps) visitBlock += `\nNext Steps: ${nextSteps}`;
    if (upgradeOpportunities) visitBlock += `\n\n💡 UPGRADE OPPORTUNITIES:\n${upgradeOpportunities}`;
    if (photoAttachments.length > 0) {
      visitBlock += `\n\n📷 ${photoAttachments.length} photo(s) uploaded`;
    }
    if (skippedFiles.length > 0) {
      visitBlock += `\n⚠️ Skipped files (too large): ${skippedFiles.join(', ')}`;
    }

    // 3. Update engagement record
    const engagement = await airtableService.getEngagement(engagementId);
    const existingNotes = engagement.fields['Client Notes'] || '';
    const appendedNotes = existingNotes
      ? existingNotes + '\n\n' + visitBlock
      : visitBlock;

    const resolved = issueResolved === 'Yes';
    const updates = {
      'Client Notes': appendedNotes,
      'Status': resolved ? 'Completed ✨' : 'Return Visit Required',
    };

    // Merge photos into engagement (all job photos browsable)
    if (photoAttachments.length > 0) {
      const existingPhotos = engagement.fields.Photos || [];
      updates.Photos = [...existingPhotos, ...photoAttachments];
    }

    await airtableService.updateEngagement(engagementId, updates);

    // Update time fields on engagement (most recent visit times)
    if (timeArrived || timeDeparted) {
      try {
        const timeUpdates = {};
        if (timeArrived) timeUpdates['Time Arrived'] = timeArrived;
        if (timeDeparted) timeUpdates['Time Left'] = timeDeparted;
        await airtableService.updateEngagement(engagementId, timeUpdates);
      } catch (timeErr) {
        console.warn('⚠️ Could not update time fields:', timeErr.message);
      }
    }

    console.log(`✓ Visit ${vNum} logged for engagement ${engagementId}`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error completing job:', error);
    res.status(500).json({ error: 'Failed to complete job' });
  }
};

// Export multer middleware
exports.uploadMiddleware = upload.array('photos', 10); // Max 10 photos

module.exports = exports;
