const airtableService = require('../services/airtable.service');
const stripeService = require('../services/stripe.service');
const twilioService = require('../services/twilio.service');
const shortLinkService = require('../services/shortlink.service');
const { wrapInLayout } = require('../utils/layout');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (same pattern as uploads.js)
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
    console.error('Invalid CLOUDINARY_URL format.');
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

// Multer for proposal photo uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
});

exports.uploadMiddleware = upload.array('photos', 20);

// ─── Helpers ──────────────────────────────────────────────────

function safeJsonParse(str, fallback = []) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0';
  return '$' + Number(amount).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function proposalPageHeader(logoPath, projectNumber) {
  return `<div class="header">
    <img src="${logoPath}" class="header-logo" alt="Great White Security">
    <div class="project-num">Project #${escapeHtml(projectNumber)}</div>
  </div>`;
}

// ─── PUBLIC: Show Proposal ────────────────────────────────────

exports.showProposal = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (!proposal) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0e1231;color:white;text-align:center;}</style>
        </head><body><div><h1>Proposal Not Found</h1><p>This link may have expired. Please contact us at (08) 6444 6308.</p></div></body></html>`);
    }

    const f = proposal.fields;
    const clientName = f['Client Name'] || '';
    const clientAddress = f['Client Address'] || '';
    const letterNote = f['Letter Note'] || '';
    const scopeItems = safeJsonParse(f['Scope Items']);
    const deliverables = safeJsonParse(f['Deliverables']);
    const cameraOptions = safeJsonParse(f['Camera Options']);
    const clarifications = safeJsonParse(f['Clarifications']);
    const sitePhotos = safeJsonParse(f['Site Photo URLs']);
    const coverImage = f['Cover Image URL'] || '';
    const packageName = f['Package Name'] || 'Security System Package';
    const packageDesc = f['Package Description'] || '';
    const basePrice = f['Base Price'] || 0;
    const proposalDate = f['Proposal Date'] || new Date().toISOString().split('T')[0];
    const firstName = clientName.split(' ')[0] || 'there';
    const logoPath = '/proposal-assets/gws-logo.png';

    // Track view (fire-and-forget)
    if (!f['Viewed At']) {
      airtableService.updateProposal(proposal.id, {
        'Viewed At': new Date().toISOString(),
        Status: 'Viewed',
      }).catch(err => console.error('Error tracking proposal view:', err));
    }

    // Build scope rows
    const scopeRows = scopeItems.map((item, i) =>
      `<tr><td class="qty">${i + 1}</td><td>${escapeHtml(typeof item === 'string' ? item : item.description || '')}</td></tr>`
    ).join('');

    // Build deliverables rows
    const deliverableRows = deliverables.map(d => {
      const qty = typeof d === 'string' ? '' : (d.qty || '');
      const desc = typeof d === 'string' ? d : (d.description || '');
      return `<tr><td class="qty">${escapeHtml(String(qty))}</td><td>${escapeHtml(desc)}</td></tr>`;
    }).join('');

    // Build camera option toggles for pricing page
    const cameraOptionsHtml = cameraOptions.map((opt, i) => `
      <label class="camera-option" data-price="${opt.price || 0}">
        <input type="checkbox" class="camera-toggle" data-index="${i}" data-price="${opt.price || 0}">
        <div class="option-content">
          <div class="option-info">
            <strong>${escapeHtml(opt.name || '')}</strong>
            <span class="option-desc">${escapeHtml(opt.description || '')}</span>
          </div>
          <div class="option-price">+${formatCurrency(opt.price || 0)}</div>
        </div>
      </label>
    `).join('');

    // Build clarification rows
    const defaultClarifications = [
      'Only items expressly listed are included.',
      'Works conducted 08:00-17:00 Monday-Friday excluding WA public holidays.',
      'Full access to site required.',
      'Customer smartphones required during installation if needed.',
      'Working internet required for app connectivity.',
      'Existing cables and devices assumed in working order.',
    ];
    const allClarifications = clarifications.length > 0 ? clarifications : defaultClarifications;
    const clarificationRows = allClarifications.map((c, i) =>
      `<tr><td class="qty">${i + 1}</td><td>${escapeHtml(typeof c === 'string' ? c : c.description || '')}</td></tr>`
    ).join('');

    // Cover page photos
    const coverPhotos = sitePhotos.length > 0
      ? sitePhotos.slice(0, 4).map(url => `<img src="${escapeHtml(url)}" class="cover-img" alt="Site photo">`).join('')
      : `<img src="${coverImage || '/proposal-assets/gws-logo.png'}" class="cover-img" alt="Security">
         <div style="background: rgba(0, 188, 212, 0.1);"></div>
         <div style="background: rgba(0, 188, 212, 0.05);"></div>
         <div style="background: rgba(0, 188, 212, 0.1);"></div>`;

    // Letter note (custom or default)
    const letterContent = letterNote || `<p>As per our conversation and understanding of your requirements, we're happy to present you with a modern &amp; reliable security &amp; safety solution to protect your home and family.</p>
    <p>With our proposed system/s, you can enjoy peace of mind knowing you're protected 24/7 while home or away.</p>
    <p>I have provided this proposal based on my current understanding of your requirements along with typical options.</p>
    <p>If you require any amendments to the scope, please let me know and I will work with you to make sure you get the solution that works for you and within your budget.</p>
    <p>Alternatively, click Accept &amp; Pay below and we will order your equipment and schedule one of our professional licensed technicians for a prompt attendance!</p>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Proposal - ${escapeHtml(clientName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      line-height: 1.6;
      color: #2c3e50;
      background: #f0f2f5;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: white;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      page-break-after: always;
    }

    @media (max-width: 800px) {
      .page { width: 100%; min-height: auto; margin: 0; box-shadow: none; }
      body { background: white; }
      .cover { padding: 30px !important; min-height: 100vh !important; }
      .content { padding: 30px !important; }
      .property-name { font-size: 42px !important; letter-spacing: -1px !important; }
      .cover-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
      .benefits { grid-template-columns: 1fr !important; }
      .cover-footer { font-size: 12px !important; }
    }

    /* COVER */
    .cover {
      background: #0e1231;
      color: white;
      padding: 60px;
      min-height: 297mm;
      display: flex;
      flex-direction: column;
    }
    .cover-logo { max-width: 500px; margin-bottom: 40px; }
    .cover-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 40px;
    }
    .cover-img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      border-radius: 4px;
    }
    .property-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 90px;
      font-weight: 900;
      line-height: 0.95;
      margin-bottom: 20px;
      letter-spacing: -3px;
    }
    .property-address {
      font-size: 26px;
      color: #00bcd4;
      font-weight: 400;
      margin-bottom: auto;
    }
    .cover-footer {
      display: flex;
      justify-content: space-between;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-top: 60px;
    }

    /* CONTENT PAGES */
    .content { padding: 50px 60px; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 3px solid #00bcd4;
      margin-bottom: 40px;
    }
    .header-logo { height: 50px; }
    .project-num { color: #6c757d; font-size: 13px; font-weight: 600; }

    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 32px;
      font-weight: 800;
      color: #0e1231;
      margin-bottom: 25px;
    }
    p { margin-bottom: 15px; font-size: 14px; line-height: 1.7; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 25px 0;
      border: 1px solid #e0e6ed;
      border-radius: 8px;
      overflow: hidden;
    }
    thead { background: #0e1231; color: white; }
    th { padding: 15px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    td { padding: 12px 15px; border-bottom: 1px solid #e0e6ed; font-size: 13px; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: #f8f9fa; }
    .qty { width: 70px; text-align: center; font-weight: 700; color: #0e1231; }

    .benefits {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin: 30px 0;
    }
    .benefit {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #00bcd4;
    }
    .benefit h3 { font-size: 16px; color: #0e1231; margin-bottom: 8px; font-weight: 700; }
    .benefit p { font-size: 13px; color: #6c757d; margin: 0; }

    /* PRICING */
    .price-summary {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 30px;
      margin: 25px 0;
    }
    .price-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 0;
      border-bottom: 1px solid #e0e6ed;
    }
    .price-line:last-child { border-bottom: none; }
    .price-line.total {
      border-top: 3px solid #0e1231;
      border-bottom: none;
      margin-top: 10px;
      padding-top: 20px;
    }
    .price-line.total .price-amount {
      font-size: 32px;
      color: #0e1231;
    }
    .price-amount {
      font-size: 20px;
      font-weight: 800;
      color: #0e1231;
    }

    /* Camera option toggles */
    .camera-options { margin: 25px 0; }
    .camera-option {
      display: block;
      cursor: pointer;
      border: 2px solid #e0e6ed;
      border-radius: 10px;
      margin-bottom: 12px;
      transition: all 0.2s;
      overflow: hidden;
    }
    .camera-option:hover { border-color: #00bcd4; }
    .camera-option.selected {
      border-color: #00bcd4;
      background: linear-gradient(135deg, #f0fdff 0%, #e6f9fc 100%);
    }
    .camera-option input { display: none; }
    .option-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 22px;
    }
    .option-info { flex: 1; }
    .option-info strong { font-size: 15px; color: #0e1231; display: block; margin-bottom: 4px; }
    .option-desc { font-size: 13px; color: #6c757d; }
    .option-price { font-size: 18px; font-weight: 800; color: #00bcd4; white-space: nowrap; margin-left: 20px; }

    /* CTA Button */
    .cta-section {
      background: linear-gradient(135deg, #0e1231 0%, #1a237e 100%);
      padding: 40px;
      border-radius: 12px;
      text-align: center;
      margin: 35px 0;
    }
    .cta-section h2 {
      color: white;
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28px;
      margin-bottom: 10px;
    }
    .cta-section p { color: rgba(255,255,255,0.7); margin-bottom: 25px; }
    .cta-btn {
      display: inline-block;
      background: #00bcd4;
      color: white;
      padding: 18px 50px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 700;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0.5px;
    }
    .cta-btn:hover { background: #00a5bb; transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,188,212,0.3); }
    .cta-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

    /* Trust badges */
    .trust-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 30px;
      margin: 25px 0;
      flex-wrap: wrap;
    }
    .trust-badge img { height: 50px; opacity: 0.7; }
    .trust-badge { text-align: center; font-size: 11px; color: #6c757d; }

    /* Agreement */
    .agreement-box {
      background: #f8f9fa;
      padding: 35px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .field { margin-bottom: 20px; }
    .field-label { font-size: 11px; text-transform: uppercase; color: #6c757d; margin-bottom: 6px; font-weight: 600; }
    .field-line { border-bottom: 2px solid #0e1231; height: 35px; }

    /* Terms */
    .terms { font-size: 9px; line-height: 1.4; }
    .terms h3 { font-size: 12px; color: #0e1231; margin: 15px 0 8px 0; font-weight: 700; }

    @media print {
      body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { box-shadow: none; margin: 0; page-break-after: always; }
      .cta-section { display: none; }
    }
  </style>
</head>
<body>

<!-- COVER PAGE -->
<div class="page cover">
  <img src="${logoPath}" class="cover-logo" alt="Great White Security">
  <div class="cover-grid">
    ${coverPhotos}
  </div>
  <h1 class="property-name">${escapeHtml(firstName)}</h1>
  <p class="property-address">${escapeHtml(clientAddress)}</p>
  <div class="cover-footer">
    <div>CONFIDENTIAL</div>
    <div>${escapeHtml(proposalDate)}</div>
  </div>
</div>

<!-- LETTER PAGE -->
<div class="page content">
  ${proposalPageHeader(logoPath, projectNumber)}
  <p style="color: #6c757d; margin-bottom: 25px;">${escapeHtml(proposalDate)}</p>
  <p style="font-size: 16px; font-weight: 600; margin-bottom: 25px;">Dear ${escapeHtml(firstName)},</p>
  ${letterNote ? `<p>${escapeHtml(letterNote)}</p>` : letterContent}
  <div style="margin-top: 50px;">
    <p>Kind regards,</p>
    <img src="/proposal-assets/signature.jpeg" style="max-width: 300px; margin-top: 30px;" alt="Signature">
    <p style="font-weight: 700; margin-top: 10px; margin-bottom: 4px;">Richard Campbell-Tovey</p>
    <p style="font-size: 12px; color: #6c757d;">WA Police Licensed Security Consultant 79960</p>
  </div>
</div>

<!-- WHY CHOOSE US -->
<div class="page content">
  ${proposalPageHeader(logoPath, projectNumber)}
  <h1>Why Choose Us?</h1>
  <p>Great White Security is built on over 18 years of proven experience securing homes and businesses across Western Australia. Our team is WA Police licensed and committed to seamless, professional installations.</p>
  <p>As a product-agnostic security installation business, we're not tied to any single brand. Instead, we partner with trusted local suppliers to provide solutions tailored to each client's needs.</p>
  <div class="benefits">
    <div class="benefit"><h3>24/7 Reliable Protection</h3><p>Advanced systems designed to safeguard your premises day and night.</p></div>
    <div class="benefit"><h3>Complete Coverage</h3><p>Strategic placement of cameras, alarms, and sensors for maximum protection.</p></div>
    <div class="benefit"><h3>AI Driven Technology</h3><p>Intuitive systems with simple remote access from your phone.</p></div>
    <div class="benefit"><h3>Future-Proof Security</h3><p>Scalable solutions that can expand as your needs evolve.</p></div>
  </div>
  <div class="trust-row">
    <div class="trust-badge"><img src="/proposal-assets/wa-police-badge.png" alt="WA Police Licensed"><br>Licensed</div>
    <div class="trust-badge"><img src="/proposal-assets/google-reviews.png" alt="Google Reviews"><br>5-Star Reviews</div>
    <div class="trust-badge"><img src="/proposal-assets/acma-logo.jpeg" alt="ACMA"><br>ACMA Registered</div>
  </div>
</div>

<!-- SCOPE & DELIVERABLES -->
<div class="page content">
  ${proposalPageHeader(logoPath, projectNumber)}
  <h1>Project Scope</h1>
  <table>
    <thead><tr><th style="width:70px;">Item</th><th>Description</th></tr></thead>
    <tbody>${scopeRows || '<tr><td class="qty">1</td><td>As discussed</td></tr>'}</tbody>
  </table>

  <h1 style="margin-top: 40px;">Project Deliverables</h1>
  <table>
    <thead><tr><th style="width:70px;">Qty</th><th>Description</th></tr></thead>
    <tbody>
      ${deliverableRows || '<tr><td class="qty">1</td><td>As discussed</td></tr>'}
      <tr><td class="qty"></td><td>Installation Materials and Sundries</td></tr>
      <tr><td class="qty"></td><td>Installation &amp; Programming by Licensed Technicians</td></tr>
      <tr><td class="qty">1</td><td>12 Month Warranty on Installation &amp; Equipment</td></tr>
    </tbody>
  </table>
</div>

<!-- PRICING PAGE -->
<div class="page content">
  ${proposalPageHeader(logoPath, projectNumber)}
  <h1>Total Investment</h1>

  <div class="price-summary">
    <div class="price-line">
      <div><strong>${escapeHtml(packageName)}</strong>${packageDesc ? `<br><span style="font-size:13px;color:#6c757d;">${escapeHtml(packageDesc)}</span>` : ''}</div>
      <div class="price-amount" id="base-price">${formatCurrency(basePrice)}</div>
    </div>
    <div id="selected-options-summary"></div>
    <div class="price-line total">
      <div><strong style="font-size:18px;">Total (inc. GST)</strong></div>
      <div class="price-amount" id="total-price">${formatCurrency(basePrice)}</div>
    </div>
  </div>

  ${cameraOptions.length > 0 ? `
  <h2 style="font-size: 20px; margin: 30px 0 15px;">Customise Your System</h2>
  <p style="color: #6c757d; font-size: 13px;">Toggle options to add or remove from your package:</p>
  <div class="camera-options">
    ${cameraOptionsHtml}
  </div>
  ` : ''}

  <div class="cta-section">
    <h2>Ready to Secure Your Property?</h2>
    <p>Click below to accept this proposal and proceed to secure payment.</p>
    <button class="cta-btn" id="accept-btn" onclick="acceptProposal()">Accept &amp; Pay ${formatCurrency(basePrice)}</button>
  </div>

  <div class="trust-row" style="margin-top:15px;">
    <div class="trust-badge" style="font-size:12px;color:#6c757d;">Secure payment via Stripe. All major cards accepted.</div>
  </div>
</div>

<!-- CLARIFICATIONS -->
<div class="page content">
  ${proposalPageHeader(logoPath, projectNumber)}
  <h1>Clarifications &amp; Exclusions</h1>
  <table>
    <thead><tr><th style="width:70px;">Item</th><th>Description</th></tr></thead>
    <tbody>${clarificationRows}</tbody>
  </table>
</div>

<!-- TERMS PAGE 1 -->
<div class="page content">
  ${proposalPageHeader(logoPath, projectNumber)}
  <h1>Terms and Conditions</h1>
  <div class="terms">
    <h3>DEFINITIONS</h3>
    <p><strong>1.</strong> "Agreement" means the agreement deemed to exist when the Quotation is accepted by the Client. "Client" means the purchaser of Equipment and/or Services. "Company" means Great White Security Systems Pty Ltd. "Equipment" means goods and equipment detailed in the Quotation. "Services" means installation, monitoring, and maintenance services.</p>
    <h3>QUOTATION AND ACCEPTANCE</h3>
    <p><strong>2.</strong> The Quotation is valid for 30 days. Acceptance constitutes a binding agreement.</p>
    <h3>RETENTION OF OWNERSHIP</h3>
    <p><strong>3.</strong> Equipment remains Company property until payment received in full.</p>
    <p><strong>4.</strong> Risk passes to Client upon delivery.</p>
    <h3>INSTALLATION</h3>
    <p><strong>5-12.</strong> Company will install Equipment subject to parts and labor availability. Client responsible for site access. Company not liable for delays. Additional charges apply for access delays or site-specific inductions. Making good excluded. Client must advise of asbestos. Client provides IT access as required.</p>
    <h3>MONITORING</h3>
    <p><strong>13-14.</strong> Monitored equipment enabled for monitoring fee. Company responds per agreed procedure.</p>
    <h3>PAYMENT</h3>
    <p><strong>15-17.</strong> Full balance due on completion. Debt recovery costs payable by Client. Monitoring fees paid in advance.</p>
  </div>
</div>

<!-- TERMS PAGE 2 -->
<div class="page content">
  ${proposalPageHeader(logoPath, projectNumber)}
  <h1>Terms and Conditions (cont.)</h1>
  <div class="terms">
    <h3>MISCELLANEOUS</h3>
    <p><strong>18-30.</strong> Agreement cancellation requires Company consent. Equipment may detect/deter but cannot prevent all unlawful activity. Company not liable for equipment failure. Client does not rely on warranties beyond those herein. Terms subject to Competition and Consumer Act 2010. Site changes may require reassessment. Detection devices have limitations. Regular maintenance required. Company may subcontract. Discounts claimed at quotation time only.</p>
    <h3>WARRANTY</h3>
    <p><strong>31.</strong> Equipment warranted 12 months from installation.</p>
    <p><strong>32.</strong> No warranty on pre-existing equipment. Company not liable for compatibility issues. Warranty void if damage related to pre-existing equipment. EWP excluded from warranty.</p>
  </div>
</div>

<script>
  const BASE_PRICE = ${Number(basePrice) || 0};
  const PROJECT_NUMBER = '${escapeHtml(projectNumber)}';
  let selectedExtras = 0;

  // Camera option toggles
  document.querySelectorAll('.camera-toggle').forEach(cb => {
    cb.addEventListener('change', function() {
      const label = this.closest('.camera-option');
      const price = parseFloat(this.dataset.price) || 0;

      if (this.checked) {
        label.classList.add('selected');
        selectedExtras += price;
      } else {
        label.classList.remove('selected');
        selectedExtras -= price;
      }

      updateTotal();
    });
  });

  function updateTotal() {
    const total = BASE_PRICE + selectedExtras;
    document.getElementById('total-price').textContent = '$' + total.toLocaleString('en-AU');
    document.getElementById('accept-btn').textContent = 'Accept & Pay $' + total.toLocaleString('en-AU');

    // Update selected options summary
    const summary = document.getElementById('selected-options-summary');
    summary.innerHTML = '';
    document.querySelectorAll('.camera-toggle:checked').forEach(cb => {
      const label = cb.closest('.camera-option');
      const name = label.querySelector('strong').textContent;
      const price = parseFloat(cb.dataset.price) || 0;
      summary.innerHTML += '<div class="price-line"><div>' + name + '</div><div class="price-amount" style="font-size:16px;">+$' + price.toLocaleString('en-AU') + '</div></div>';
    });
  }

  function acceptProposal() {
    const btn = document.getElementById('accept-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    // Collect selected camera options
    const selected = [];
    document.querySelectorAll('.camera-toggle:checked').forEach(cb => {
      selected.push(parseInt(cb.dataset.index));
    });

    fetch('/api/proposals/' + PROJECT_NUMBER + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedOptions: selected })
    })
    .then(r => r.json())
    .then(data => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Accept & Pay $' + (BASE_PRICE + selectedExtras).toLocaleString('en-AU');
      }
    })
    .catch(err => {
      alert('Connection error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Accept & Pay $' + (BASE_PRICE + selectedExtras).toLocaleString('en-AU');
    });
  }

  // Track view
  fetch('/api/proposals/' + PROJECT_NUMBER + '/track-view', { method: 'POST' }).catch(() => {});
</script>

</body>
</html>`;

    res.send(html);
  } catch (error) {
    console.error('Error showing proposal:', error);
    res.status(500).send('Error loading proposal');
  }
};

// ─── PUBLIC: Track View ───────────────────────────────────────

exports.trackProposalView = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (proposal && !proposal.fields['Viewed At']) {
      await airtableService.updateProposal(proposal.id, {
        'Viewed At': new Date().toISOString(),
        Status: 'Viewed',
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error tracking view:', error);
    res.json({ ok: true }); // Don't fail the client
  }
};

// ─── PUBLIC: Create Proposal Checkout ─────────────────────────

exports.createProposalCheckout = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const { selectedOptions } = req.body;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const f = proposal.fields;
    const basePrice = f['Base Price'] || 0;
    const cameraOptions = safeJsonParse(f['Camera Options']);

    // Server-side total calculation (never trust client amount)
    let total = basePrice;
    if (Array.isArray(selectedOptions)) {
      for (const idx of selectedOptions) {
        if (cameraOptions[idx] && cameraOptions[idx].price) {
          total += Number(cameraOptions[idx].price);
        }
      }
    }

    if (total <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripeService.createProposalCheckoutSession({
      projectNumber,
      proposalId: proposal.id,
      amount: total,
      customerName: f['Client Name'] || 'Customer',
      description: f['Package Name'] || 'Security System Installation',
      successUrl: `${baseUrl}/offers/${projectNumber}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/proposals/${projectNumber}`,
    });

    // Update proposal status
    await airtableService.updateProposal(proposal.id, {
      Status: 'Accepted',
      'Accepted At': new Date().toISOString(),
      'Stripe Session ID': session.id,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Error creating proposal checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

// ─── PUBLIC: Show OTO Page ────────────────────────────────────

exports.showOTO = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (!proposal) {
      return res.status(404).send('Proposal not found');
    }

    const f = proposal.fields;
    const clientName = f['Client Name'] || '';
    const firstName = clientName.split(' ')[0] || 'there';
    const bundlePrice = f['OTO Bundle Price'] || 0;
    const alarmPrice = f['OTO Alarm Price'] || 0;
    const alarmWasPrice = f['OTO Alarm Was Price'] || 0;
    const upsPrice = f['OTO UPS Price'] || 0;
    const upsWasPrice = f['OTO UPS Was Price'] || 0;
    const carePrice = f['OTO Care Monthly Price'] || 0;

    const hasBundle = bundlePrice > 0;
    const hasAlarm = alarmPrice > 0;
    const hasUps = upsPrice > 0;
    const hasCare = carePrice > 0;
    const hasAnyOto = hasBundle || hasAlarm || hasUps || hasCare;

    if (!hasAnyOto) {
      return res.redirect(`/offers/${projectNumber}/thank-you`);
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Special Offers - Great White Security</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', -apple-system, sans-serif;
      background: linear-gradient(180deg, #0e1231 0%, #1a237e 50%, #0e1231 100%);
      min-height: 100vh;
      color: white;
    }
    .oto-container {
      max-width: 700px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .oto-header {
      text-align: center;
      margin-bottom: 40px;
    }
    .oto-header img { max-width: 200px; margin-bottom: 20px; }
    .oto-header .congrats {
      font-size: 14px;
      color: #00bcd4;
      text-transform: uppercase;
      letter-spacing: 3px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .oto-header h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 36px;
      font-weight: 900;
      margin-bottom: 10px;
    }
    .oto-header p { color: rgba(255,255,255,0.7); font-size: 16px; }

    .oto-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 35px;
      margin-bottom: 24px;
      backdrop-filter: blur(10px);
      transition: all 0.3s;
    }
    .oto-card:hover { border-color: #00bcd4; transform: translateY(-2px); }
    .oto-card.bundle {
      background: linear-gradient(135deg, rgba(0,188,212,0.15), rgba(0,188,212,0.05));
      border-color: #00bcd4;
    }
    .oto-card h3 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 22px;
      margin-bottom: 10px;
    }
    .oto-card p { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 15px; }
    .oto-card .pricing {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 20px;
    }
    .oto-card .current-price { font-size: 32px; font-weight: 800; color: #00bcd4; }
    .oto-card .was-price { font-size: 18px; color: rgba(255,255,255,0.4); text-decoration: line-through; }
    .oto-card .save-badge {
      background: #ff5252;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
    }
    .oto-btn {
      display: block;
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
      text-decoration: none;
    }
    .oto-btn-primary {
      background: #00bcd4;
      color: white;
    }
    .oto-btn-primary:hover { background: #00a5bb; transform: translateY(-1px); }
    .oto-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .oto-features {
      list-style: none;
      margin-bottom: 20px;
    }
    .oto-features li {
      padding: 6px 0;
      font-size: 14px;
      color: rgba(255,255,255,0.8);
    }
    .oto-features li::before {
      content: '\\2713';
      color: #00bcd4;
      font-weight: 700;
      margin-right: 10px;
    }

    .skip-link {
      display: block;
      text-align: center;
      color: rgba(255,255,255,0.4);
      font-size: 14px;
      text-decoration: none;
      margin-top: 30px;
      padding: 15px;
    }
    .skip-link:hover { color: rgba(255,255,255,0.6); }

    @media (max-width: 600px) {
      .oto-container { padding: 20px 15px; }
      .oto-header h1 { font-size: 28px; }
      .oto-card { padding: 25px; }
    }
  </style>
</head>
<body>
  <div class="oto-container">
    <div class="oto-header">
      <img src="/proposal-assets/gws-logo.png" alt="Great White Security">
      <div class="congrats">Payment Confirmed</div>
      <h1>Thank You, ${escapeHtml(firstName)}!</h1>
      <p>Your security system is being prepared. Before you go, we have some exclusive offers just for you.</p>
    </div>

    ${hasBundle ? `
    <div class="oto-card bundle">
      <h3>Complete Protection Bundle</h3>
      <p>Get everything below in one package at a special bundled price. Alarm monitoring, UPS battery backup, and our care plan — all included.</p>
      <div class="pricing">
        <span class="current-price">${formatCurrency(bundlePrice)}</span>
        ${(alarmPrice + upsPrice) > bundlePrice ? `<span class="was-price">${formatCurrency(alarmPrice + upsPrice)}</span><span class="save-badge">SAVE ${formatCurrency((alarmPrice + upsPrice) - bundlePrice)}</span>` : ''}
      </div>
      <ul class="oto-features">
        <li>24/7 Alarm Monitoring Station</li>
        <li>UPS Battery Backup System</li>
        <li>Priority support &amp; maintenance</li>
      </ul>
      <button class="oto-btn oto-btn-primary" onclick="purchaseOTO('bundle', ${bundlePrice})">Add Bundle to My Order</button>
    </div>
    ` : ''}

    ${hasAlarm ? `
    <div class="oto-card">
      <h3>24/7 Alarm Monitoring</h3>
      <p>Professional monitoring station watches your property around the clock. Instant dispatch when triggered.</p>
      <div class="pricing">
        <span class="current-price">${formatCurrency(alarmPrice)}</span>
        ${alarmWasPrice > alarmPrice ? `<span class="was-price">${formatCurrency(alarmWasPrice)}</span><span class="save-badge">SAVE ${formatCurrency(alarmWasPrice - alarmPrice)}</span>` : ''}
      </div>
      <button class="oto-btn oto-btn-primary" onclick="purchaseOTO('alarm', ${alarmPrice})">Add Alarm Monitoring</button>
    </div>
    ` : ''}

    ${hasUps ? `
    <div class="oto-card">
      <h3>UPS Battery Backup</h3>
      <p>Keep your security system running during power outages. Protects NVR and cameras for hours.</p>
      <div class="pricing">
        <span class="current-price">${formatCurrency(upsPrice)}</span>
        ${upsWasPrice > upsPrice ? `<span class="was-price">${formatCurrency(upsWasPrice)}</span><span class="save-badge">SAVE ${formatCurrency(upsWasPrice - upsPrice)}</span>` : ''}
      </div>
      <button class="oto-btn oto-btn-primary" onclick="purchaseOTO('ups', ${upsPrice})">Add UPS Backup</button>
    </div>
    ` : ''}

    ${hasCare ? `
    <div class="oto-card">
      <h3>GWS Care Plan</h3>
      <p>Monthly maintenance, priority support, and annual system health check. Peace of mind, always.</p>
      <div class="pricing">
        <span class="current-price">${formatCurrency(carePrice)}/mo</span>
      </div>
      <ul class="oto-features">
        <li>Priority phone &amp; text support</li>
        <li>Annual on-site health check</li>
        <li>Firmware updates &amp; optimisation</li>
        <li>15% off additional equipment</li>
      </ul>
      <button class="oto-btn oto-btn-primary" onclick="purchaseOTO('care', ${carePrice})">Start Care Plan</button>
    </div>
    ` : ''}

    <a href="/offers/${escapeHtml(projectNumber)}/thank-you" class="skip-link">No thanks, I'm all set &rarr;</a>
  </div>

  <script>
    function purchaseOTO(type, amount) {
      const btn = event.target;
      btn.disabled = true;
      btn.textContent = 'Processing...';

      fetch('/api/proposals/${escapeHtml(projectNumber)}/oto-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otoType: type, amount: amount })
      })
      .then(r => r.json())
      .then(data => {
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          alert(data.error || 'Something went wrong');
          btn.disabled = false;
          btn.textContent = 'Try Again';
        }
      })
      .catch(() => {
        alert('Connection error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Try Again';
      });
    }
  </script>
</body>
</html>`;

    res.send(html);
  } catch (error) {
    console.error('Error showing OTO page:', error);
    res.status(500).send('Error loading offers');
  }
};

// ─── PUBLIC: OTO Thank You ────────────────────────────────────

exports.showOTOThankYou = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);
    const firstName = proposal ? (proposal.fields['Client Name'] || '').split(' ')[0] || 'there' : 'there';

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You - Great White Security</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #0e1231;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      padding: 20px;
    }
    .thank-you {
      text-align: center;
      max-width: 600px;
    }
    .thank-you img { max-width: 200px; margin-bottom: 30px; }
    .check {
      width: 80px; height: 80px;
      background: #00bcd4;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 25px;
      font-size: 40px;
    }
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 36px;
      margin-bottom: 15px;
    }
    p { color: rgba(255,255,255,0.7); font-size: 16px; line-height: 1.7; margin-bottom: 15px; }
    .steps {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 30px;
      margin: 30px 0;
      text-align: left;
    }
    .steps h3 { font-size: 18px; margin-bottom: 15px; color: #00bcd4; }
    .steps ol { padding-left: 20px; }
    .steps li { padding: 8px 0; color: rgba(255,255,255,0.8); font-size: 14px; }
    .contact { margin-top: 30px; font-size: 14px; }
    .contact a { color: #00bcd4; text-decoration: none; }
  </style>
</head>
<body>
  <div class="thank-you">
    <img src="/proposal-assets/gws-logo.png" alt="Great White Security">
    <div class="check">&#10003;</div>
    <h1>You're All Set, ${escapeHtml(firstName)}!</h1>
    <p>Your payment has been received and we're excited to get started on your security system.</p>

    <div class="steps">
      <h3>What Happens Next</h3>
      <ol>
        <li>We'll order your equipment from our suppliers</li>
        <li>A licensed technician will contact you to schedule installation</li>
        <li>Installation day — we handle everything</li>
        <li>Setup your phone app &amp; full demonstration</li>
      </ol>
    </div>

    <p>If you have any questions in the meantime, don't hesitate to reach out.</p>
    <div class="contact">
      <p><a href="tel:+61864446308">(08) 6444 6308</a> &bull; <a href="mailto:hello@greatwhitesecurity.com">hello@greatwhitesecurity.com</a></p>
    </div>
  </div>
</body>
</html>`);
  } catch (error) {
    console.error('Error showing thank you:', error);
    res.status(500).send('Error loading page');
  }
};

// ─── PUBLIC: OTO Checkout ─────────────────────────────────────

exports.createOTOCheckout = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const { otoType, amount } = req.body;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const f = proposal.fields;

    // Server-side price validation — never trust client amount
    const priceMap = {
      bundle: f['OTO Bundle Price'],
      alarm: f['OTO Alarm Price'],
      ups: f['OTO UPS Price'],
      care: f['OTO Care Monthly Price'],
    };

    const serverPrice = priceMap[otoType];
    if (!serverPrice || serverPrice <= 0) {
      return res.status(400).json({ error: 'Invalid upgrade option' });
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripeService.createOTOCheckoutSession({
      projectNumber,
      proposalId: proposal.id,
      otoType,
      amount: serverPrice,
      successUrl: `${baseUrl}/offers/${projectNumber}/thank-you`,
      cancelUrl: `${baseUrl}/offers/${projectNumber}`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Error creating OTO checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

// ─── ADMIN: List Proposals ────────────────────────────────────

exports.listProposals = async (req, res) => {
  try {
    const proposals = await airtableService.getAllProposals();

    // Sort by Date descending
    proposals.sort((a, b) => {
      const da = a.fields['Proposal Date'] || '';
      const db = b.fields['Proposal Date'] || '';
      return db.localeCompare(da);
    });

    const rows = proposals.map(p => {
      const f = p.fields;
      const status = f['Status'] || 'Draft';
      const statusColors = {
        Draft: '#6c757d',
        Sent: '#2196f3',
        Viewed: '#ff9800',
        Accepted: '#4caf50',
        Paid: '#00bcd4',
      };
      const color = statusColors[status] || '#6c757d';

      return `<tr onclick="window.location='/admin/proposals/edit/${p.id}'" style="cursor:pointer;">
        <td style="font-weight:700;">${escapeHtml(f['Project Number'] || '')}</td>
        <td>${escapeHtml(f['Client Name'] || '')}</td>
        <td>${escapeHtml(f['Client Address'] || '')}</td>
        <td><span style="background:${color};color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${escapeHtml(status)}</span></td>
        <td>${f['Base Price'] ? formatCurrency(f['Base Price']) : '-'}</td>
        <td>${escapeHtml(f['Proposal Date'] || '')}</td>
      </tr>`;
    }).join('');

    const bodyHtml = `
      <div style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
          <h1 style="font-size:24px;color:#e0e6ed;">Proposals</h1>
          <a href="/admin/proposals/new" style="background:#00d4ff;color:#0f1419;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">+ New Proposal</a>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid #2a3a4a;">
                <th style="padding:12px;text-align:left;color:#8899aa;font-size:12px;text-transform:uppercase;">Project #</th>
                <th style="padding:12px;text-align:left;color:#8899aa;font-size:12px;text-transform:uppercase;">Client</th>
                <th style="padding:12px;text-align:left;color:#8899aa;font-size:12px;text-transform:uppercase;">Address</th>
                <th style="padding:12px;text-align:left;color:#8899aa;font-size:12px;text-transform:uppercase;">Status</th>
                <th style="padding:12px;text-align:left;color:#8899aa;font-size:12px;text-transform:uppercase;">Price</th>
                <th style="padding:12px;text-align:left;color:#8899aa;font-size:12px;text-transform:uppercase;">Date</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6" style="padding:40px;text-align:center;color:#5a6a7a;">No proposals yet. Click "+ New Proposal" to create one.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    const customStyles = `
      tbody tr:hover { background: #1e2a3a; }
      td { padding: 14px 12px; border-bottom: 1px solid #2a3a4a; font-size: 14px; }
    `;

    res.send(wrapInLayout('Proposals', bodyHtml, 'proposals', { customStyles }));
  } catch (error) {
    console.error('Error listing proposals:', error);
    res.status(500).send('Error loading proposals');
  }
};

// ─── ADMIN: Create Form ──────────────────────────────────────

exports.showCreateForm = async (req, res) => {
  try {
    res.send(renderProposalForm(null, null));
  } catch (error) {
    console.error('Error showing create form:', error);
    res.status(500).send('Error loading form');
  }
};

exports.showCreateFormForEngagement = async (req, res) => {
  try {
    const { engagementId } = req.params;
    const result = await airtableService.getEngagementWithCustomer(engagementId);

    let prefill = null;
    if (result && result.engagement) {
      const eng = result.engagement.fields;
      const cust = result.customer ? result.customer.fields : {};

      // Pull from Customer table first, fall back to Engagement lookup fields
      const firstName = cust['First Name'] || (eng['First Name (from Customer)'] && eng['First Name (from Customer)'][0]) || '';
      const lastName = cust['Last Name'] || (eng['Last Name (from Customer)'] && eng['Last Name (from Customer)'][0]) || '';
      const address = cust['Address'] || (eng['Address (from Customer)'] && eng['Address (from Customer)'][0]) || eng['Address/Location'] || '';
      const phone = cust['Mobile Phone'] || cust['Phone'] || (eng['Mobile Phone (from Customer)'] && eng['Mobile Phone (from Customer)'][0]) || (eng['Phone (from Customer)'] && eng['Phone (from Customer)'][0]) || '';
      const email = cust['Email'] || (eng['Email (from Customer)'] && eng['Email (from Customer)'][0]) || '';

      prefill = {
        engagementId: result.engagement.id,
        clientName: [firstName, lastName].filter(Boolean).join(' '),
        clientAddress: address,
        clientPhone: phone,
        clientEmail: email,
        projectNumber: eng['Proposal Number'] ? String(eng['Proposal Number']).padStart(6, '0') : '',
      };
    }

    res.send(renderProposalForm(null, prefill));
  } catch (error) {
    console.error('Error showing create form for engagement:', error);
    res.status(500).send('Error loading form');
  }
};

// ─── ADMIN: Edit Form ────────────────────────────────────────

exports.showEditForm = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const proposal = await airtableService.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).send('Proposal not found');
    }

    res.send(renderProposalForm(proposal, null));
  } catch (error) {
    console.error('Error showing edit form:', error);
    res.status(500).send('Error loading form');
  }
};

// ─── ADMIN: Create Proposal API ──────────────────────────────

exports.createProposal = async (req, res) => {
  try {
    const data = buildProposalFields(req.body);
    const proposal = await airtableService.createProposal(data);
    res.json({ success: true, id: proposal.id, projectNumber: data['Project Number'] });
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
};

// ─── ADMIN: Update Proposal API ──────────────────────────────

exports.updateProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const data = buildProposalFields(req.body);
    await airtableService.updateProposal(proposalId, data);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating proposal:', error);
    res.status(500).json({ error: 'Failed to update proposal' });
  }
};

// ─── ADMIN: Upload Photos ────────────────────────────────────

exports.uploadProposalPhotos = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const urls = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) continue; // Skip >10MB

      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(base64Data, {
        folder: 'gws-proposals',
        resource_type: 'auto',
        public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
      });
      urls.push(result.secure_url);
    }

    res.json({ success: true, urls });
  } catch (error) {
    console.error('Error uploading proposal photos:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// ─── ADMIN: Send Proposal ────────────────────────────────────

exports.sendProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const proposal = await airtableService.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const f = proposal.fields;
    const projectNumber = f['Project Number'];
    const clientName = f['Client Name'] || 'there';
    const firstName = clientName.split(' ')[0];

    // Build proposal URL
    const baseUrl = process.env.BASE_URL || 'https://book.greatwhitesecurity.com';
    const proposalUrl = `${baseUrl}/proposals/${projectNumber}`;

    // Create short link
    const shortCode = shortLinkService.createShortLink(proposalUrl, proposalId);
    const shortUrl = `${baseUrl}/${shortCode}`;

    // Get phone number — try to get from engagement link or from request body
    let phone = req.body.phone;
    if (!phone) {
      // Try to find via engagement
      const engagements = await airtableService.getAllEngagements();
      // Look for engagement with matching client name
      for (const eng of engagements) {
        const engName = eng.fields['First Name (from Customer)'];
        if (engName && clientName.toLowerCase().includes(String(engName).toLowerCase())) {
          const custIds = eng.fields['Customer'];
          if (custIds && custIds[0]) {
            const cust = await airtableService.getCustomer(custIds[0]);
            phone = cust.fields['Mobile Phone'] || cust.fields['Phone'];
            break;
          }
        }
      }
    }

    if (!phone) {
      return res.status(400).json({ error: 'No phone number found. Please provide one.' });
    }

    // Send SMS
    const message = `Hi ${firstName}, your security proposal from Great White Security is ready!\n\nView it here: ${shortUrl}\n\nAny questions, give us a call on (08) 6444 6308.\n\nCheers,\nRicky`;

    await twilioService.sendSMS(phone, message);

    // Update proposal status
    await airtableService.updateProposal(proposalId, {
      Status: 'Sent',
      'Sent At': new Date().toISOString(),
    });

    res.json({ success: true, shortUrl });
  } catch (error) {
    console.error('Error sending proposal:', error);
    res.status(500).json({ error: 'Failed to send proposal' });
  }
};

// ─── Helper: Build Airtable fields from form data ────────────

function buildProposalFields(body) {
  const fields = {};

  if (body.projectNumber) fields['Project Number'] = body.projectNumber;
  if (body.date) fields['Proposal Date'] = body.date;
  if (body.clientName) fields['Client Name'] = body.clientName;
  if (body.clientAddress) fields['Client Address'] = body.clientAddress;
  if (body.letterNote !== undefined) fields['Letter Note'] = body.letterNote;
  if (body.packageName) fields['Package Name'] = body.packageName;
  if (body.packageDescription !== undefined) fields['Package Description'] = body.packageDescription;
  if (body.basePrice !== undefined) fields['Base Price'] = Number(body.basePrice) || 0;
  if (body.coverImageUrl) fields['Cover Image URL'] = body.coverImageUrl;
  if (body.status) fields['Status'] = body.status;

  // JSON fields
  if (body.scopeItems) fields['Scope Items'] = typeof body.scopeItems === 'string' ? body.scopeItems : JSON.stringify(body.scopeItems);
  if (body.deliverables) fields['Deliverables'] = typeof body.deliverables === 'string' ? body.deliverables : JSON.stringify(body.deliverables);
  if (body.cameraOptions) fields['Camera Options'] = typeof body.cameraOptions === 'string' ? body.cameraOptions : JSON.stringify(body.cameraOptions);
  if (body.clarifications) fields['Clarifications'] = typeof body.clarifications === 'string' ? body.clarifications : JSON.stringify(body.clarifications);
  if (body.sitePhotoUrls) fields['Site Photo URLs'] = typeof body.sitePhotoUrls === 'string' ? body.sitePhotoUrls : JSON.stringify(body.sitePhotoUrls);

  // OTO pricing
  if (body.otoBundlePrice !== undefined) fields['OTO Bundle Price'] = Number(body.otoBundlePrice) || 0;
  if (body.otoAlarmPrice !== undefined) fields['OTO Alarm Price'] = Number(body.otoAlarmPrice) || 0;
  if (body.otoAlarmWasPrice !== undefined) fields['OTO Alarm Was Price'] = Number(body.otoAlarmWasPrice) || 0;
  if (body.otoUpsPrice !== undefined) fields['OTO UPS Price'] = Number(body.otoUpsPrice) || 0;
  if (body.otoUpsWasPrice !== undefined) fields['OTO UPS Was Price'] = Number(body.otoUpsWasPrice) || 0;
  if (body.otoCareMonthlyPrice !== undefined) fields['OTO Care Monthly Price'] = Number(body.otoCareMonthlyPrice) || 0;

  return fields;
}

// ─── Helper: Render Proposal Admin Form ──────────────────────

function renderProposalForm(proposal, prefill) {
  const isEdit = !!proposal;
  const f = proposal ? proposal.fields : {};
  const pf = prefill || {};

  // Pre-fill values
  const projectNumber = f['Project Number'] || pf.projectNumber || '';
  const date = f['Proposal Date'] || new Date().toISOString().split('T')[0];
  const clientName = f['Client Name'] || pf.clientName || '';
  const clientAddress = f['Client Address'] || pf.clientAddress || '';
  const clientPhone = pf.clientPhone || '';
  const clientEmail = pf.clientEmail || '';
  const letterNote = f['Letter Note'] || '';
  const packageName = f['Package Name'] || '';
  const packageDesc = f['Package Description'] || '';
  const basePrice = f['Base Price'] || '';
  const coverImageUrl = f['Cover Image URL'] || '';
  const status = f['Status'] || 'Draft';

  const scopeItems = f['Scope Items'] || '[]';
  const deliverables = f['Deliverables'] || '[]';
  const cameraOptions = f['Camera Options'] || '[]';
  const clarifications = f['Clarifications'] || '[]';
  const sitePhotoUrls = f['Site Photo URLs'] || '[]';

  const otoBundlePrice = f['OTO Bundle Price'] || '';
  const otoAlarmPrice = f['OTO Alarm Price'] || '';
  const otoAlarmWasPrice = f['OTO Alarm Was Price'] || '';
  const otoUpsPrice = f['OTO UPS Price'] || '';
  const otoUpsWasPrice = f['OTO UPS Was Price'] || '';
  const otoCareMonthlyPrice = f['OTO Care Monthly Price'] || '';

  const formAction = isEdit
    ? `/api/admin/proposals/${proposal.id}`
    : '/api/admin/proposals';
  const formMethod = isEdit ? 'PUT' : 'POST';

  const bodyHtml = `
    <div style="padding:24px;max-width:900px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <h1 style="font-size:24px;color:#e0e6ed;">${isEdit ? 'Edit' : 'New'} Proposal</h1>
        <a href="/admin/proposals" style="color:#8899aa;text-decoration:none;font-size:14px;">&larr; Back to Proposals</a>
      </div>

      <form id="proposalForm" onsubmit="return saveProposal(event)">
        <div class="form-section">
          <h2 class="section-title">Client Details</h2>
          <div class="form-row">
            <div class="form-group">
              <label>Project Number *</label>
              <input type="text" name="projectNumber" value="${escapeHtml(projectNumber)}" placeholder="e.g. 003256" required>
            </div>
            <div class="form-group">
              <label>Date</label>
              <input type="date" name="date" value="${escapeHtml(date)}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Client Name *</label>
              <input type="text" name="clientName" value="${escapeHtml(clientName)}" placeholder="John Smith" required>
            </div>
            <div class="form-group">
              <label>Client Address</label>
              <input type="text" name="clientAddress" value="${escapeHtml(clientAddress)}" placeholder="123 Main St, Suburb WA 6000">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Client Phone</label>
              <input type="text" id="clientPhone" value="${escapeHtml(clientPhone)}" placeholder="0412 345 678">
            </div>
            <div class="form-group">
              <label>Client Email</label>
              <input type="text" id="clientEmail" value="${escapeHtml(clientEmail)}" placeholder="john@example.com">
            </div>
          </div>
          <div class="form-group">
            <label>Letter Note (custom intro paragraph)</label>
            <textarea name="letterNote" rows="4" placeholder="Leave blank for default letter text">${escapeHtml(letterNote)}</textarea>
          </div>
        </div>

        <div class="form-section">
          <h2 class="section-title">Scope & Deliverables</h2>
          <div class="form-group">
            <label>Scope Items (JSON array of strings)</label>
            <textarea name="scopeItems" rows="5" placeholder='["Conduct Discovery Meeting", "Procure Parts", ...]'>${escapeHtml(scopeItems)}</textarea>
          </div>
          <div class="form-group">
            <label>Deliverables (JSON array: [{qty, description}])</label>
            <textarea name="deliverables" rows="5" placeholder='[{"qty": "4", "description": "8MP AI Turret Camera"}, ...]'>${escapeHtml(deliverables)}</textarea>
          </div>
        </div>

        <div class="form-section">
          <h2 class="section-title">Pricing</h2>
          <div class="form-row">
            <div class="form-group">
              <label>Package Name</label>
              <input type="text" name="packageName" value="${escapeHtml(packageName)}" placeholder="e.g. Complete CCTV Package">
            </div>
            <div class="form-group">
              <label>Base Price ($)</label>
              <input type="number" name="basePrice" value="${escapeHtml(String(basePrice))}" step="0.01" placeholder="4990">
            </div>
          </div>
          <div class="form-group">
            <label>Package Description</label>
            <input type="text" name="packageDescription" value="${escapeHtml(packageDesc)}" placeholder="Supply & install 4-camera system">
          </div>
          <div class="form-group">
            <label>Camera Options (JSON: [{name, description, price}])</label>
            <textarea name="cameraOptions" rows="4" placeholder='[{"name": "Upgrade to 4K", "description": "8MP cameras", "price": 800}]'>${escapeHtml(cameraOptions)}</textarea>
          </div>
        </div>

        <div class="form-section">
          <h2 class="section-title">OTO (Post-Purchase Offers)</h2>
          <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="form-group"><label>Bundle Price ($)</label><input type="number" name="otoBundlePrice" value="${escapeHtml(String(otoBundlePrice))}" step="0.01"></div>
            <div class="form-group"><label>Alarm Price ($)</label><input type="number" name="otoAlarmPrice" value="${escapeHtml(String(otoAlarmPrice))}" step="0.01"></div>
            <div class="form-group"><label>Alarm Was Price ($)</label><input type="number" name="otoAlarmWasPrice" value="${escapeHtml(String(otoAlarmWasPrice))}" step="0.01"></div>
          </div>
          <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="form-group"><label>UPS Price ($)</label><input type="number" name="otoUpsPrice" value="${escapeHtml(String(otoUpsPrice))}" step="0.01"></div>
            <div class="form-group"><label>UPS Was Price ($)</label><input type="number" name="otoUpsWasPrice" value="${escapeHtml(String(otoUpsWasPrice))}" step="0.01"></div>
            <div class="form-group"><label>Care Monthly ($)</label><input type="number" name="otoCareMonthlyPrice" value="${escapeHtml(String(otoCareMonthlyPrice))}" step="0.01"></div>
          </div>
        </div>

        <div class="form-section">
          <h2 class="section-title">Photos</h2>
          <div class="form-group">
            <label>Cover Image URL</label>
            <input type="text" name="coverImageUrl" value="${escapeHtml(coverImageUrl)}" placeholder="https://res.cloudinary.com/...">
          </div>
          <div class="form-group">
            <label>Site Photo URLs (JSON array)</label>
            <textarea name="sitePhotoUrls" rows="3" placeholder='["https://...", "https://..."]'>${escapeHtml(sitePhotoUrls)}</textarea>
          </div>
          <div class="form-group">
            <label>Upload New Photos</label>
            <input type="file" id="photoUpload" accept="image/*" multiple style="padding:10px;background:#1a2332;border:2px dashed #2a3a4a;border-radius:8px;width:100%;">
            <div id="upload-status" style="margin-top:8px;font-size:13px;color:#8899aa;"></div>
          </div>
        </div>

        <div class="form-section">
          <h2 class="section-title">Clarifications</h2>
          <div class="form-group">
            <label>Clarifications (JSON array of strings, leave blank for defaults)</label>
            <textarea name="clarifications" rows="4" placeholder='["Only items expressly listed are included.", ...]'>${escapeHtml(clarifications)}</textarea>
          </div>
        </div>

        <div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;">
          <button type="submit" class="btn-save">Save Proposal</button>
          ${isEdit ? `<button type="button" class="btn-send" onclick="sendProposal('${proposal.id}')">Send to Client</button>` : ''}
          ${isEdit ? `<a href="/proposals/${escapeHtml(projectNumber)}" target="_blank" class="btn-preview">Preview</a>` : ''}
        </div>
        <div id="save-status" style="margin-top:12px;font-size:14px;"></div>
      </form>
    </div>`;

  const customStyles = `
    .form-section { background:#0f1419; border:1px solid #2a3a4a; border-radius:12px; padding:24px; margin-bottom:20px; }
    .section-title { font-size:16px; color:#00d4ff; margin-bottom:18px; font-weight:700; }
    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .form-group { margin-bottom:16px; }
    .form-group label { display:block; font-size:13px; color:#8899aa; margin-bottom:6px; font-weight:600; }
    .form-group input, .form-group textarea {
      width:100%; padding:10px 14px; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px;
      color:#e0e6ed; font-size:14px; font-family:inherit; transition:border-color .2s;
    }
    .form-group input:focus, .form-group textarea:focus { border-color:#00d4ff; outline:none; }
    .btn-save {
      background:#00d4ff; color:#0f1419; padding:12px 28px; border:none; border-radius:8px;
      font-size:15px; font-weight:700; cursor:pointer; transition:all .2s;
    }
    .btn-save:hover { background:#00b8d9; }
    .btn-send {
      background:#4caf50; color:white; padding:12px 28px; border:none; border-radius:8px;
      font-size:15px; font-weight:700; cursor:pointer; transition:all .2s;
    }
    .btn-send:hover { background:#43a047; }
    .btn-preview {
      background:transparent; color:#00d4ff; padding:12px 28px; border:2px solid #00d4ff; border-radius:8px;
      font-size:15px; font-weight:700; text-decoration:none; display:inline-block; transition:all .2s;
    }
    .btn-preview:hover { background:rgba(0,212,255,0.1); }
    @media (max-width:768px) { .form-row { grid-template-columns:1fr; } }
  `;

  const customScripts = `<script>
    async function saveProposal(e) {
      e.preventDefault();
      const form = document.getElementById('proposalForm');
      const status = document.getElementById('save-status');
      status.textContent = 'Saving...';
      status.style.color = '#ffd93d';

      const formData = new FormData(form);
      const data = {};
      for (const [key, val] of formData.entries()) {
        data[key] = val;
      }

      try {
        const resp = await fetch('${formAction}', {
          method: '${formMethod}',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await resp.json();

        if (result.success) {
          status.textContent = 'Saved!';
          status.style.color = '#4caf50';
          ${!isEdit ? "if (result.id) window.location = '/admin/proposals/edit/' + result.id;" : ''}
        } else {
          status.textContent = 'Error: ' + (result.error || 'Unknown');
          status.style.color = '#ff5252';
        }
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = '#ff5252';
      }
      return false;
    }

    async function sendProposal(proposalId) {
      let phone = document.getElementById('clientPhone').value.trim();
      if (!phone) {
        phone = prompt('Enter client phone number (e.g. 0412345678):');
      }
      if (!phone) return;

      const status = document.getElementById('save-status');
      status.textContent = 'Sending...';
      status.style.color = '#ffd93d';

      try {
        const resp = await fetch('/api/admin/proposals/' + proposalId + '/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const result = await resp.json();

        if (result.success) {
          status.textContent = 'Sent! Short link: ' + result.shortUrl;
          status.style.color = '#4caf50';
        } else {
          status.textContent = 'Error: ' + (result.error || 'Failed to send');
          status.style.color = '#ff5252';
        }
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = '#ff5252';
      }
    }

    // Photo upload handler
    document.getElementById('photoUpload').addEventListener('change', async function() {
      const files = this.files;
      if (!files.length) return;

      const statusEl = document.getElementById('upload-status');
      statusEl.textContent = 'Uploading ' + files.length + ' photo(s)...';
      statusEl.style.color = '#ffd93d';

      const formData = new FormData();
      for (const file of files) {
        formData.append('photos', file);
      }

      try {
        const resp = await fetch('/api/admin/proposals/upload-photos', {
          method: 'POST',
          body: formData
        });
        const result = await resp.json();

        if (result.success && result.urls) {
          // Append to site photo URLs textarea
          const textarea = document.querySelector('textarea[name="sitePhotoUrls"]');
          let existing = [];
          try { existing = JSON.parse(textarea.value || '[]'); } catch {}
          existing.push(...result.urls);
          textarea.value = JSON.stringify(existing, null, 2);

          statusEl.textContent = result.urls.length + ' photo(s) uploaded!';
          statusEl.style.color = '#4caf50';
        } else {
          statusEl.textContent = 'Upload failed: ' + (result.error || 'Unknown');
          statusEl.style.color = '#ff5252';
        }
      } catch (err) {
        statusEl.textContent = 'Upload error: ' + err.message;
        statusEl.style.color = '#ff5252';
      }
    });
  </script>`;

  return wrapInLayout(
    `${isEdit ? 'Edit' : 'New'} Proposal`,
    bodyHtml,
    'proposals',
    { customStyles, customScripts }
  );
}

module.exports = exports;
