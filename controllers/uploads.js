const airtableService = require('../services/airtable.service');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;

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

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
});

/**
 * Show photo upload form
 * GET /upload-photos/:leadId
 */
exports.showUploadForm = async (req, res) => {
  try {
    const { leadId } = req.params;

    // Get engagement and customer details
    const result = await airtableService.getEngagementWithCustomer(leadId);

    if (!result || !result.engagement) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Engagement Not Found</title>
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
          <h1 class="error">❌ Lead Not Found</h1>
          <p>Invalid link. Please contact us for assistance.</p>
        </body>
        </html>
      `);
    }

    const { engagement, customer } = result;
    const lead = engagement; // For backward compatibility

    const clientName = (customer && customer.fields['First Name']) || lead.fields['First Name (from Customer)'] || 'there';

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Upload Photos - Great White Security</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            color: #1a73e8;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .upload-area {
            border: 2px dashed #ccc;
            border-radius: 8px;
            padding: 40px 20px;
            text-align: center;
            background: #fafafa;
            cursor: pointer;
            transition: all 0.3s;
            margin-bottom: 20px;
          }
          .upload-area:hover {
            border-color: #1a73e8;
            background: #f0f7ff;
          }
          .upload-area.dragover {
            border-color: #1a73e8;
            background: #e3f2fd;
          }
          .upload-icon {
            font-size: 48px;
            margin-bottom: 10px;
          }
          .upload-text {
            color: #666;
            font-size: 16px;
          }
          input[type="file"] {
            display: none;
          }
          .preview-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 10px;
            margin-bottom: 20px;
          }
          .preview-item {
            position: relative;
            aspect-ratio: 1;
            border-radius: 8px;
            overflow: hidden;
            border: 2px solid #eee;
          }
          .preview-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .preview-item .remove {
            position: absolute;
            top: 5px;
            right: 5px;
            background: rgba(255,255,255,0.9);
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            cursor: pointer;
            font-size: 16px;
            line-height: 24px;
            padding: 0;
          }
          .btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
          }
          .btn-primary {
            background: #1a73e8;
            color: white;
          }
          .btn-primary:hover {
            background: #1557b0;
          }
          .btn-primary:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .success-message {
            display: none;
            text-align: center;
            padding: 40px;
          }
          .success-message.show {
            display: block;
          }
          .success-icon {
            font-size: 72px;
            color: #28a745;
            margin-bottom: 20px;
          }
          .loading {
            display: none;
            text-align: center;
            padding: 20px;
          }
          .loading.show {
            display: block;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #1a73e8;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📸 Upload Photos</h1>
          <p class="subtitle">Hi ${clientName}, to help us determine what's required and who to dispatch, could you please upload a few photos of your system. Please include serial numbers/part numbers if possible.</p>

          <div id="upload-section">
            <div class="upload-area" id="uploadArea">
              <div class="upload-icon">📷</div>
              <div class="upload-text">
                <strong>Tap to select photos</strong><br>
                or drag and drop here
              </div>
              <input type="file" id="fileInput" accept="image/*" multiple>
            </div>

            <div class="preview-container" id="previewContainer"></div>

            <button class="btn btn-primary" id="uploadBtn" disabled>
              Upload Photos
            </button>
          </div>

          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Uploading photos...</p>
          </div>

          <div class="success-message" id="successMessage">
            <div class="success-icon">✅</div>
            <h2>Photos Uploaded Successfully!</h2>
            <p style="margin-top: 15px; color: #666;">Thank you! We've received your photos and will be in touch shortly.</p>
          </div>
        </div>

        <script>
          const fileInput = document.getElementById('fileInput');
          const uploadArea = document.getElementById('uploadArea');
          const previewContainer = document.getElementById('previewContainer');
          const uploadBtn = document.getElementById('uploadBtn');
          const uploadSection = document.getElementById('upload-section');
          const loading = document.getElementById('loading');
          const successMessage = document.getElementById('successMessage');

          let selectedFiles = [];

          // Click to select files
          uploadArea.addEventListener('click', () => fileInput.click());

          // File selection
          fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
          });

          // Drag and drop
          uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
          });

          uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
          });

          uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
          });

          function handleFiles(files) {
            for (let file of files) {
              if (file.type.startsWith('image/')) {
                selectedFiles.push(file);
                showPreview(file);
              }
            }
            updateUploadButton();
          }

          function showPreview(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const div = document.createElement('div');
              div.className = 'preview-item';
              div.innerHTML = \`
                <img src="\${e.target.result}" alt="Preview">
                <button class="remove" onclick="removeFile('\${file.name}')">×</button>
              \`;
              previewContainer.appendChild(div);
            };
            reader.readAsDataURL(file);
          }

          function removeFile(fileName) {
            selectedFiles = selectedFiles.filter(f => f.name !== fileName);
            updatePreview();
            updateUploadButton();
          }

          function updatePreview() {
            previewContainer.innerHTML = '';
            selectedFiles.forEach(file => showPreview(file));
          }

          function updateUploadButton() {
            uploadBtn.disabled = selectedFiles.length === 0;
          }

          // Upload photos
          uploadBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;

            const formData = new FormData();
            selectedFiles.forEach(file => {
              formData.append('photos', file);
            });

            uploadSection.style.display = 'none';
            loading.classList.add('show');

            try {
              const response = await fetch('/api/upload-photos/${leadId}', {
                method: 'POST',
                body: formData
              });

              if (response.ok) {
                loading.classList.remove('show');
                successMessage.classList.add('show');
              } else {
                throw new Error('Upload failed');
              }
            } catch (error) {
              loading.classList.remove('show');
              uploadSection.style.display = 'block';
              alert('Upload failed. Please try again or contact us for assistance.');
            }
          });

          // Make removeFile global
          window.removeFile = removeFile;
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing upload form:', error);
    res.status(500).send('Error loading upload form');
  }
};

/**
 * Handle photo upload
 * POST /api/upload-photos/:leadId
 */
exports.handleUpload = async (req, res) => {
  try {
    const { leadId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log(`📷 Uploading ${files.length} photos for lead: ${leadId}`);

    // Get engagement and customer
    const result = await airtableService.getEngagementWithCustomer(leadId);
    if (!result || !result.engagement) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    const { engagement, customer } = result;
    const lead = engagement; // For backward compatibility
    const clientName = (customer && customer.fields['First Name']) || lead.fields['First Name (from Customer)'] || 'Client';
    const clientPhone = (customer && (customer.fields['Mobile Phone'] || customer.fields.Phone)) ||
                        lead.fields['Mobile Phone (from Customer)'] ||
                        lead.fields['Phone (from Customer)'] ||
                        'Unknown';

    // Upload files to Cloudinary
    const attachments = [];
    for (const file of files) {
      try {
        // Upload to Cloudinary using base64
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

        const uploadResult = await cloudinary.uploader.upload(base64Data, {
          folder: `gws-leads/${leadId}`,
          resource_type: 'auto',
          public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
        });

        console.log(`✓ Uploaded to Cloudinary: ${uploadResult.secure_url}`);

        attachments.push({
          url: uploadResult.secure_url,
        });
      } catch (uploadError) {
        console.error(`Error uploading file to Cloudinary:`, uploadError);
        // Continue with other files even if one fails
      }
    }

    if (attachments.length === 0) {
      return res.status(500).json({ error: 'Failed to upload any photos' });
    }

    // Get existing photos
    const existingPhotos = lead.fields.Photos || [];

    // Append new photos
    await airtableService.updateLead(leadId, {
      Photos: [...existingPhotos, ...attachments],
    });

    console.log(`✓ ${files.length} photo(s) saved to lead`);

    // Log in Messages table
    try {
      await airtableService.logMessage({
        leadId: leadId,
        direction: 'Inbound',
        type: 'Web Upload',
        from: clientPhone,
        to: 'Web Form',
        content: `Uploaded ${files.length} photo(s) via web form`,
        status: 'Received',
      });
    } catch (messageError) {
      console.error('Error logging message:', messageError);
    }

    // Notify admin
    try {
      const twilioService = require('../services/twilio.service');
      await twilioService.sendSMS(
        process.env.ADMIN_PHONE,
        `📷 ${clientName} uploaded ${files.length} photo(s)!\n\nView in Airtable`,
        { leadId }
      );
    } catch (smsError) {
      console.error('Error sending notification:', smsError);
    }

    res.status(200).json({
      success: true,
      count: files.length,
    });
  } catch (error) {
    console.error('Error handling upload:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// Export multer middleware
exports.uploadMiddleware = upload.array('photos', 10); // Max 10 photos

module.exports = exports;
