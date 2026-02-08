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
        <style>body{font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0e27;color:white;text-align:center;}</style>
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
    const coverImage = f['Cover Image URL'] || '/proposal-assets/proposal-cover-page.png';
    const packageName = f['Package Name'] || 'Security System Package';
    const packageDesc = f['Package Description'] || '';
    const basePrice = f['Base Price'] || 0;
    const proposalDate = f['Proposal Date'] || new Date().toISOString().split('T')[0];
    const firstName = clientName.split(' ')[0] || 'there';
    const logoPath = '/proposal-assets/gws-logo.png';
    const dateObj = new Date(proposalDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const coverMonthYear = dateObj.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }).toUpperCase();

    // Track view (fire-and-forget)
    if (!f['Viewed At']) {
      airtableService.updateProposal(proposal.id, {
        'Viewed At': new Date().toISOString(),
        Status: 'Viewed',
      }).catch(err => console.error('Error tracking proposal view:', err));
    }

    // Build scope rows
    const scopeRows = scopeItems.map((item, i) =>
      `<tr><td>${i + 1}</td><td>${escapeHtml(typeof item === 'string' ? item : item.description || '')}</td></tr>`
    ).join('');

    // Build deliverables rows
    const deliverableRows = deliverables.map(d => {
      const qty = typeof d === 'string' ? '' : (d.qty || '');
      const desc = typeof d === 'string' ? d : (d.description || '');
      return `<tr><td>${escapeHtml(String(qty) || '\u2014')}</td><td>${escapeHtml(desc)}</td></tr>`;
    }).join('');

    // Build upgrade cards for pricing page
    const upgradeCardsHtml = cameraOptions.map(opt => `
      <div class="upgrade-card" onclick="toggleUpgrade(this, ${opt.price || 0})">
        <div class="upgrade-check">&#10003;</div>
        <div class="upgrade-info"><h4>${escapeHtml(opt.name || '')}</h4><p>${escapeHtml(opt.description || '')}</p></div>
        <div class="upgrade-price">+${formatCurrency(opt.price || 0)}</div>
      </div>
    `).join('');

    // Build clarification rows
    const defaultClarifications = [
      'Only items expressly listed above are included in this quotation. Any additional parts or works to other items are chargeable at the applicable rate.',
      'All works quoted and any subsequent warranty works are conducted between the hours of 08:00 & 17:00 Monday to Friday excluding Western Australian public holidays. Warranty attendances do not include provision of EWP which must be organised by the client.',
      'Great White Security requires full and free access to all areas of the site containing security equipment covered in the works outlined in this proposal for the duration of the works. This includes vehicles or equipment which may be in the way of accessing install locations. Delays in access or return attendances required to complete works due to access restrictions may be chargeable at the applicable service rates.',
      'If required, customer smartphones must be present during installation. Great White Security assume customer phones are able to install/run CCTV and alarm apps as required.',
      'Quotation valid for 30 days.',
      'Customer must provide spare internet router port and have working internet for app connectivity. Great White Security assumes internet speed is sufficient for CCTV app access.',
      'CCTV Alarm Monitoring by Monitoring Station pricing is based on being set to only send alarms overnight between 2200 \u2013 0530. More than 8 events per month may require a plan increase but will be reviewed first.',
      'License plate capture from cameras is dependent on many variables such as lighting, if vehicles are stationary or moving, speed of vehicles, license plate illumination/cleanliness, obstructions, distance from cameras etc.',
      'Final mounting locations depend on cable and mounting access \u2014 to be confirmed by on-site technician.',
    ];
    const allClarifications = clarifications.length > 0 ? clarifications : defaultClarifications;
    const clarificationRows = allClarifications.map((c, i) =>
      `<tr><td>${i + 1}</td><td>${escapeHtml(typeof c === 'string' ? c : c.description || '')}</td></tr>`
    ).join('');

    // Site photo pages
    const sitePhotoPages = sitePhotos.map(url => `
<div class="page">
  <div class="pg-header"><img src="${logoPath}" alt="GWS"><div class="pg-header-right">Site Photos</div></div>
  <div class="photo-section"><img src="${escapeHtml(url)}" alt="Site Photo"></div>
  <div class="pg-footer"><span>${escapeHtml(proposalDate)}</span><span>www.greatwhitesecurity.com</span><span>Project #${escapeHtml(projectNumber)}</span></div>
</div>`).join('');

    // Letter note
    const letterContent = letterNote
      ? `<p>${escapeHtml(letterNote)}</p>`
      : `<p>As per our conversation and understanding of your requirements, we're happy to present you with a modern &amp; reliable security &amp; safety solution to protect your home and family.</p>
    <p>With our proposed system/s, you can enjoy peace of mind knowing you're protected 24/7 while home or away.</p>
    <p>I have provided this proposal based on my current understanding of your requirements along with typical options.</p>
    <p>If you require any amendments to the scope, please let me know and I will work with you to make sure you get the solution that works for you and within your budget.</p>
    <p>Alternatively, please accept the proposal below, and we will order your equipment and schedule one of our professional licensed technicians for a prompt attendance!</p>`;

    // Page chrome helpers
    const pgHeader = `<div class="pg-header"><img src="${logoPath}" alt="Great White Security"><div class="pg-header-right">Project #${escapeHtml(projectNumber)}</div></div>`;
    const pgFooter = `<div class="pg-footer"><span>${escapeHtml(proposalDate)}</span><span>www.greatwhitesecurity.com</span><span>Project #${escapeHtml(projectNumber)}</span></div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Great White Security \u2014 Proposal #${escapeHtml(projectNumber)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #0a0e27; --navy-mid: #0f1430; --navy-light: #161c3a;
    --cyan: #78e4ff; --cyan-mid: #5dd4f0; --cyan-dark: #3dbfe0;
    --cyan-pale: #edf9ff; --cyan-bg: #f4fbff;
    --white: #ffffff; --gray-50: #f5f7fa; --gray-100: #e8ecf2;
    --gray-200: #d4d9e3; --gray-400: #8b90a0; --gray-600: #4a4f63;
    --gray-800: #1e2235; --red: #e05252; --green: #22c55e; --green-dark: #16a34a;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'DM Sans', sans-serif; color: var(--gray-800);
    background: #c0c4cf; line-height: 1.7; font-size: 14px;
    -webkit-font-smoothing: antialiased;
  }

  /* ===== A4 PAGE ===== */
  .page {
    width: 794px; min-height: 1123px; margin: 40px auto;
    background: var(--white); box-shadow: 0 8px 60px rgba(0,0,0,0.2);
    overflow: hidden; position: relative; display: flex; flex-direction: column;
  }
  .page.bg-gradient { background: linear-gradient(175deg, #f0f7fc 0%, #ffffff 30%, #ffffff 70%, #f4f8fc 100%); }
  .page.bg-warm { background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 50%, #eef3f9 100%); }
  .page.bg-subtle { background: linear-gradient(170deg, #f8fbfe 0%, #ffffff 40%, #f9fbfd 100%); }

  /* ===== COVER ===== */
  .cover-page {
    width: 794px; height: 1123px; overflow: hidden;
    margin: 40px auto; box-shadow: 0 8px 60px rgba(0,0,0,0.2);
    position: relative;
  }
  .cover-page .cover-bg {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  .cover-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; flex-direction: column; padding: 50px;
  }
  .cover-spacer { flex: 1; }
  .cover-client-name {
    font-family: 'DM Sans', sans-serif; font-size: 68px; font-weight: 800;
    color: var(--white); line-height: 1.05; margin-bottom: 12px;
  }
  .cover-client-address {
    font-family: 'DM Sans', sans-serif; font-size: 22px; font-weight: 600;
    color: var(--cyan); margin-bottom: 0;
  }
  .cover-footer {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-top: auto; padding-top: 60px;
  }
  .cover-footer span {
    font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 700;
    color: var(--white); letter-spacing: 2px; text-transform: uppercase;
  }

  /* ===== PAGE CHROME ===== */
  .pg-header {
    background: var(--navy); padding: 16px 50px;
    display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
  }
  .pg-header img { height: 32px; object-fit: contain; }
  .pg-header-right { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 0.5px; }
  .pg-body { padding: 40px 50px; flex: 1; }
  .pg-footer {
    padding: 14px 50px; border-top: 1px solid rgba(0,0,0,0.06);
    display: flex; justify-content: space-between;
    font-size: 10px; color: var(--gray-400); flex-shrink: 0;
    background: rgba(255,255,255,0.5);
  }

  /* Section titles */
  .sec-title {
    font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 800;
    color: var(--navy); margin-bottom: 6px; line-height: 1.15;
  }
  .sec-title-accent { width: 50px; height: 3px; background: var(--cyan); margin-bottom: 25px; }

  /* ===== LETTER ===== */
  .letter p { margin-bottom: 12px; color: var(--gray-600); line-height: 1.75; font-size: 13.5px; }
  .letter-greeting {
    font-family: 'Playfair Display', serif; font-size: 17px; color: var(--navy) !important;
    font-weight: 700; margin-bottom: 16px !important;
  }
  .letter-note {
    background: linear-gradient(135deg, var(--cyan-pale), var(--cyan-bg));
    border-left: 3px solid var(--cyan); padding: 14px 18px; margin: 16px 0;
    font-size: 12.5px; color: var(--gray-600); border-radius: 0 6px 6px 0;
  }
  .letter-sign { margin-top: 25px; }
  .letter-sign img { height: 50px; margin-bottom: 6px; display: block; }
  .letter-sign-name { font-weight: 700; color: var(--navy); font-size: 13px; }
  .letter-sign-title { color: var(--gray-400); font-size: 11px; margin-top: 2px; }

  /* ===== WHY CHOOSE US ===== */
  .why-intro { font-size: 13.5px; color: var(--gray-600); line-height: 1.8; margin-bottom: 14px; }
  .why-highlight {
    background: linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%);
    color: var(--white); padding: 24px 28px; border-radius: 10px;
    margin: 24px 0; position: relative; overflow: hidden;
  }
  .why-highlight::before {
    content: ''; position: absolute; top: 0; right: 0; width: 250px; height: 100%;
    background: linear-gradient(135deg, transparent, rgba(120,228,255,0.06));
  }
  .why-highlight p { font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,0.85); position: relative; z-index: 1; }
  .why-highlight strong { color: var(--cyan); }
  .cap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 22px 0; }
  .cap-card {
    border: 1px solid var(--gray-200); border-radius: 10px; padding: 18px 16px;
    position: relative; overflow: hidden; background: rgba(255,255,255,0.7); backdrop-filter: blur(4px);
  }
  .cap-card::before {
    content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%;
    background: var(--cyan); border-radius: 3px 0 0 3px;
  }
  .cap-card h4 { font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 4px; }
  .cap-card p { font-size: 12px; color: var(--gray-400); line-height: 1.5; }
  .cred-row {
    display: flex; justify-content: center; align-items: flex-start; gap: 50px;
    margin-top: 25px; padding: 30px 20px; border-top: 1px solid var(--gray-100);
  }
  .cred-item { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .cred-item img { height: 120px; object-fit: contain; }
  .cred-item .cred-label { font-size: 10.5px; font-weight: 600; color: var(--navy); text-align: center; letter-spacing: 0.3px; }

  /* ===== TABLES ===== */
  .styled-table { width: 100%; border-collapse: collapse; }
  .styled-table thead th {
    background: var(--navy); color: var(--white); padding: 11px 14px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; text-align: left;
  }
  .styled-table thead th:first-child { width: 48px; text-align: center; border-radius: 6px 0 0 0; }
  .styled-table thead th:last-child { border-radius: 0 6px 0 0; }
  .styled-table tbody td {
    padding: 11px 14px; border-bottom: 1px solid var(--gray-100);
    font-size: 13px; color: var(--gray-600); vertical-align: top; background: rgba(255,255,255,0.5);
  }
  .styled-table tbody td:first-child { text-align: center; font-weight: 600; color: var(--navy); font-size: 12px; }
  .styled-table tbody tr:last-child td { border-bottom: none; }
  .styled-table tbody tr:hover td { background: rgba(120,228,255,0.06); }

  /* ===== PHOTOS ===== */
  .photo-section { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .photo-section img { width: 100%; display: block; }

  /* ===== INTERACTIVE PRICING ===== */
  .hero-price {
    background: linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%);
    border-radius: 12px; padding: 24px 28px;
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 24px; position: relative; overflow: hidden;
  }
  .hero-price::before {
    content: ''; position: absolute; top: 0; right: 0; width: 300px; height: 100%;
    background: linear-gradient(135deg, transparent 50%, rgba(120,228,255,0.05));
  }
  .hero-price-left h3 { color: var(--white); font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .hero-price-items { font-size: 12px; color: rgba(255,255,255,0.55); line-height: 1.9; padding-left: 5px; }
  .hero-price-right { text-align: right; position: relative; z-index: 1; }
  .hero-price-amount {
    font-family: 'Playfair Display', serif; font-size: 38px; font-weight: 800;
    color: var(--cyan); line-height: 1;
  }
  .hero-price-gst { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px; letter-spacing: 0.5px; }
  .included-badge {
    display: inline-block; background: rgba(34,197,94,0.15); color: var(--green-dark);
    font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 20px;
    letter-spacing: 0.5px; text-transform: uppercase; margin-top: 8px;
  }

  .upgrade-card {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 16px; border: 2px solid var(--gray-100); border-radius: 8px;
    margin: 8px 0; cursor: pointer; transition: all 0.2s; user-select: none;
    background: rgba(255,255,255,0.6);
  }
  .upgrade-card:hover { border-color: var(--cyan-mid); background: var(--cyan-pale); }
  .upgrade-card.selected { border-color: var(--cyan-mid); background: var(--cyan-pale); }
  .upgrade-check {
    width: 22px; height: 22px; border-radius: 5px; border: 2px solid var(--gray-200);
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; margin-top: 1px; font-size: 13px; color: transparent;
  }
  .upgrade-card.selected .upgrade-check { background: var(--cyan-mid); border-color: var(--cyan-mid); color: var(--white); }
  .upgrade-info { flex: 1; }
  .upgrade-info h4 { font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 2px; }
  .upgrade-info p { font-size: 11.5px; color: var(--gray-400); line-height: 1.4; margin: 0; }
  .upgrade-price { font-size: 16px; font-weight: 800; color: var(--navy); white-space: nowrap; flex-shrink: 0; margin-top: 1px; }

  .total-bar {
    background: linear-gradient(135deg, var(--cyan-bg) 0%, #f0f7fc 100%);
    border: 2px solid rgba(120,228,255,0.3); border-radius: 10px;
    padding: 16px 20px; margin-top: 20px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .total-bar-left { font-size: 13px; color: var(--gray-600); }
  .total-bar-left strong { color: var(--navy); }
  .total-bar-amount { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 800; color: var(--navy); }

  /* ===== CTA ===== */
  .cta-section {
    text-align: center; padding: 40px 50px 45px; flex: 1;
    display: flex; flex-direction: column; justify-content: center;
    background: linear-gradient(180deg, #ffffff 0%, #f0f6fc 40%, #e6f0f9 100%);
  }
  .cta-steps { display: flex; gap: 18px; justify-content: center; margin: 25px 0; }
  .cta-step { flex: 1; max-width: 180px; text-align: center; }
  .cta-step-num {
    width: 32px; height: 32px; border-radius: 50%; background: var(--navy); color: var(--cyan);
    font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 10px;
  }
  .cta-step h4 { font-size: 12px; font-weight: 700; color: var(--navy); margin-bottom: 3px; }
  .cta-step p { font-size: 11px; color: var(--gray-400); line-height: 1.5; }
  .cta-button {
    display: inline-block; margin-top: 25px;
    background: linear-gradient(135deg, var(--cyan-dark) 0%, var(--cyan-mid) 100%);
    color: var(--navy); font-weight: 800; font-size: 15px;
    padding: 16px 45px; border-radius: 10px; text-decoration: none; letter-spacing: 0.3px;
    transition: all 0.2s; border: none; cursor: pointer;
    box-shadow: 0 4px 20px rgba(120,228,255,0.35);
  }
  .cta-button:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(120,228,255,0.5); }
  .cta-button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
  .cta-sub { font-size: 11px; color: var(--gray-400); margin-top: 12px; line-height: 1.6; }
  .cta-sub a { color: var(--cyan-dark); text-decoration: underline; }
  .cta-or { font-size: 12px; color: var(--gray-400); margin: 16px 0; }
  .cta-alt { font-size: 12.5px; color: var(--gray-600); }
  .cta-alt a { color: var(--cyan-dark); font-weight: 600; text-decoration: none; }
  .cta-thanks {
    font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 700;
    font-style: italic; color: var(--navy); margin-top: 28px;
  }

  /* ===== CLARIFICATIONS ===== */
  .clar-table { width: 100%; border-collapse: collapse; }
  .clar-table td {
    padding: 11px 14px; font-size: 12px; color: var(--gray-600);
    vertical-align: top; border-bottom: 1px solid var(--gray-100); line-height: 1.6;
    background: rgba(255,255,255,0.5);
  }
  .clar-table td:first-child {
    width: 38px; text-align: center; font-weight: 700; color: var(--navy);
    font-size: 11px; background: rgba(244,251,255,0.8); border-right: 2px solid var(--cyan);
  }

  /* ===== RESPONSIVE ===== */
  @media (max-width: 820px) {
    .page, .cover-page { width: 100%; min-height: auto; margin: 0; box-shadow: none; }
    .cover-page { height: auto; min-height: 100vh; }
    .cover-client-name { font-size: 42px !important; }
    .cover-client-address { font-size: 16px !important; }
    .cover-overlay { padding: 30px !important; }
    body { background: var(--white); }
    .cap-grid { grid-template-columns: 1fr; }
    .cred-row { gap: 20px; flex-wrap: wrap; }
    .cred-item img { height: 80px; }
    .hero-price { flex-direction: column; gap: 16px; }
    .hero-price-right { text-align: left; }
    .cta-steps { flex-direction: column; align-items: center; }
  }

  @media print {
    body { background: #fff; }
    .page, .cover-page { box-shadow: none; margin: 0; page-break-after: always; }
    .upgrade-card { cursor: default; }
  }
</style>
</head>
<body>

<!-- ==================== COVER ==================== -->
<div class="cover-page">
  <img class="cover-bg" src="${escapeHtml(coverImage)}" alt="Great White Security">
  <div class="cover-overlay">
    <div class="cover-spacer"></div>
    <div class="cover-client-name">Prepared for<br>${escapeHtml(clientName)}</div>
    <div class="cover-client-address">${escapeHtml(clientAddress)}</div>
    <div class="cover-footer">
      <span>CONFIDENTIAL</span>
      <span>${coverMonthYear}</span>
    </div>
  </div>
</div>

<!-- ==================== LETTER ==================== -->
<div class="page bg-gradient">
  ${pgHeader}
  <div class="pg-body letter">
    <div style="display:flex; justify-content:space-between; margin-bottom:25px;">
      <div>
        <div style="font-weight:600; color:var(--navy);">${escapeHtml(clientName)}</div>
        <div style="color:var(--gray-400); font-size:12px;">${escapeHtml(clientAddress)}</div>
      </div>
      <div style="text-align:right; color:var(--gray-400); font-size:12px;">${formattedDate}</div>
    </div>
    <p class="letter-greeting">Dear ${escapeHtml(firstName)},</p>
    ${letterContent}
    <p style="margin-bottom:0;">Kind regards,</p>
    <div class="letter-sign">
      <img src="/proposal-assets/signature.jpeg" alt="Signature">
      <div class="letter-sign-name">Richard Campbell-Tovey</div>
      <div class="letter-sign-title">WA Police Licensed Security Consultant 79960</div>
    </div>
  </div>
  ${pgFooter}
</div>

<!-- ==================== WHY CHOOSE US ==================== -->
<div class="page bg-subtle">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Why Choose Us?</div>
    <div class="sec-title-accent"></div>
    <p class="why-intro">Great White Security is built on over 21 years of proven experience securing homes and businesses across Western Australia. Our background in the industry has seen us deliver reliable protection for thousands of commercial and residential properties giving business owners &amp; home owners peace of mind that their staff, customers, family and assets are safe.</p>
    <p class="why-intro">Our team is WA Police licensed and committed to seamless, professional installations. We pride ourselves on leaving every site secure, tidy, and set up for long-term protection.</p>
    <div class="why-highlight">
      <p>As a <strong>product-agnostic security installation business</strong>, we're not tied to any single brand. Instead, we partner with trusted local suppliers to provide solutions tailored to each client's needs.</p>
    </div>
    <div class="cap-grid">
      <div class="cap-card"><h4>24/7 Reliable Protection</h4><p>Advanced systems designed to safeguard your premises day and night.</p></div>
      <div class="cap-card"><h4>Complete Coverage</h4><p>Strategic placement of cameras, alarms, and sensors for maximum protection.</p></div>
      <div class="cap-card"><h4>AI Driven Technology</h4><p>Intuitive systems with simple remote access from your phone.</p></div>
      <div class="cap-card"><h4>Future-Proof Security</h4><p>Scalable solutions that can expand as your needs evolve.</p></div>
    </div>
    <p class="why-intro">By choosing Great White Security, you gain a trusted partner with nearly two decades of expertise, a commitment to quality, and the confidence of working with a WA-based business that's here to support you long after installation.</p>
    <div class="cred-row">
      <div class="cred-item"><img src="/proposal-assets/wa-police-badge.png" alt="WA Police Licensed"><div class="cred-label">WA Police Licensed #79960</div></div>
      <div class="cred-item"><img src="/proposal-assets/google-reviews.png" alt="Google Reviews 4.6 Stars"></div>
      <div class="cred-item"><img src="/proposal-assets/acma-logo.jpeg" alt="ACMA Registered"></div>
    </div>
  </div>
  ${pgFooter}
</div>

<!-- ==================== PROJECT SCOPE ==================== -->
<div class="page bg-gradient">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Project Scope</div>
    <div class="sec-title-accent"></div>
    <table class="styled-table">
      <thead><tr><th>Item</th><th>Description</th></tr></thead>
      <tbody>${scopeRows}</tbody>
    </table>
  </div>
  ${pgFooter}
</div>

<!-- ==================== SITE PHOTOS ==================== -->
${sitePhotoPages}

<!-- ==================== DELIVERABLES ==================== -->
<div class="page bg-subtle">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Project Deliverables</div>
    <div class="sec-title-accent"></div>
    <table class="styled-table">
      <thead><tr><th>Qty</th><th>Description</th></tr></thead>
      <tbody>${deliverableRows}</tbody>
    </table>
  </div>
  ${pgFooter}
</div>

<!-- ==================== INTERACTIVE PRICING ==================== -->
<div class="page bg-warm">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Your Investment</div>
    <div class="sec-title-accent"></div>
    <div class="hero-price">
      <div class="hero-price-left">
        <h3>${escapeHtml(packageName)}</h3>
        <div class="hero-price-items">${escapeHtml(packageDesc)}</div>
        <div class="included-badge">&#10003; Included</div>
      </div>
      <div class="hero-price-right">
        <div class="hero-price-amount">${formatCurrency(basePrice)}</div>
        <div class="hero-price-gst">AUD Inc. GST</div>
      </div>
    </div>

    ${cameraOptions.length > 0 ? `
    <div style="margin:22px 0 6px; padding-bottom:10px; border-bottom:2px solid var(--cyan-mid);">
      <h3 style="font-size:13px; font-weight:700; color:var(--navy); letter-spacing:0.5px;">Extend Your Coverage <span style="font-size:11px; font-weight:400; color:var(--gray-400); letter-spacing:0;">\u2014 Add additional options to your install</span></h3>
    </div>
    ${upgradeCardsHtml}
    ` : ''}

    <div class="total-bar">
      <div class="total-bar-left"><strong>Your Total</strong><br><span style="font-size:11px; color:var(--gray-400);">One-time investment \u00b7 Inc. GST</span></div>
      <div>
        <div class="total-bar-amount" id="totalAmount">${formatCurrency(basePrice)}</div>
      </div>
    </div>
  </div>
  ${pgFooter}
</div>

<!-- ==================== ACCEPT & PAY ==================== -->
<div class="page">
  ${pgHeader}
  <div class="cta-section">
    <div class="sec-title">Ready to Get Started?</div>
    <div class="sec-title-accent" style="margin:6px auto 20px;"></div>
    <p style="color:var(--gray-600); max-width:460px; margin:0 auto 8px; font-size:13.5px; line-height:1.7;">Accept the proposal and secure your installation slot. We'll order your equipment and schedule your install promptly.</p>
    <div class="cta-steps">
      <div class="cta-step"><div class="cta-step-num">1</div><h4>Accept &amp; Pay</h4><p>Click below to accept and complete payment via Stripe</p></div>
      <div class="cta-step"><div class="cta-step-num">2</div><h4>We Order</h4><p>Equipment is sourced from trusted local suppliers</p></div>
      <div class="cta-step"><div class="cta-step-num">3</div><h4>We Install</h4><p>Licensed technician installs, tests &amp; walks you through everything</p></div>
    </div>
    <button class="cta-button" id="acceptBtn" onclick="acceptAndPay()">Accept Proposal &amp; Pay ${formatCurrency(basePrice)} \u2192</button>
    <div class="cta-sub">
      By clicking above you agree to the <a href="https://www.greatwhitesecurity.com/terms-and-conditions" target="_blank">Terms &amp; Conditions</a>
      and the Clarifications &amp; Exclusions outlined in this proposal.<br>
      Pricing includes GST. Quotation valid for 30 days.
    </div>
    <div class="cta-or">\u2014 or \u2014</div>
    <div class="cta-alt">Questions? Email <a href="mailto:hello@greatwhitesecurity.com">hello@greatwhitesecurity.com</a> or call Richard directly.</div>
    <p class="cta-thanks">Thank you for trusting Great White Security<br>to help protect your home and family.</p>
  </div>
  ${pgFooter}
</div>

<!-- ==================== CLARIFICATIONS ==================== -->
<div class="page bg-gradient">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Clarifications &amp; Exclusions</div>
    <div class="sec-title-accent"></div>
    <table class="clar-table">${clarificationRows}</table>
  </div>
  ${pgFooter}
</div>

<script>
  const BASE_PRICE = ${basePrice};
  const PROJECT_NUMBER = '${escapeHtml(projectNumber)}';
  let upgradeTotal = 0;

  function toggleUpgrade(card, price) {
    card.classList.toggle('selected');
    upgradeTotal += card.classList.contains('selected') ? price : -price;
    const total = BASE_PRICE + upgradeTotal;
    document.getElementById('totalAmount').textContent = '$' + total.toLocaleString('en-AU');
    document.getElementById('acceptBtn').textContent = 'Accept Proposal & Pay $' + total.toLocaleString('en-AU') + ' \u2192';
  }

  function acceptAndPay() {
    const btn = document.getElementById('acceptBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const selectedUpgrades = [];
    document.querySelectorAll('.upgrade-card.selected').forEach(card => {
      const name = card.querySelector('h4').textContent;
      const price = parseInt(card.querySelector('.upgrade-price').textContent.replace(/[^0-9]/g, ''));
      selectedUpgrades.push({ name, price });
    });

    fetch('/api/proposals/' + PROJECT_NUMBER + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedUpgrades, total: BASE_PRICE + upgradeTotal })
    })
    .then(r => r.json())
    .then(data => {
      if (data.url) window.location.href = data.url;
      else {
        alert(data.error || 'Something went wrong');
        btn.disabled = false;
        btn.textContent = 'Accept Proposal & Pay $' + (BASE_PRICE + upgradeTotal).toLocaleString('en-AU') + ' \u2192';
      }
    })
    .catch(() => {
      alert('Connection error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Accept Proposal & Pay $' + (BASE_PRICE + upgradeTotal).toLocaleString('en-AU') + ' \u2192';
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

    // Check if a proposal already exists for this engagement
    const allProposals = await airtableService.getAllProposals();
    const existing = allProposals.find(p => {
      const engLinks = p.fields['Engagement'];
      return engLinks && engLinks.includes(engagementId);
    });
    if (existing) {
      return res.redirect(`/admin/proposals/edit/${existing.id}`);
    }

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
  if (body.engagementId) fields['Engagement'] = [body.engagementId];
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

  // Parse JSON fields into arrays for the UI
  const scopeItemsRaw = safeJsonParse(f['Scope Items']);
  const deliverablesRaw = safeJsonParse(f['Deliverables']);
  const cameraOptionsRaw = safeJsonParse(f['Camera Options']);
  const clarificationsRaw = safeJsonParse(f['Clarifications']);
  const sitePhotoUrlsRaw = safeJsonParse(f['Site Photo URLs']);

  const otoBundlePrice = f['OTO Bundle Price'] || '';
  const otoAlarmPrice = f['OTO Alarm Price'] || '';
  const otoAlarmWasPrice = f['OTO Alarm Was Price'] || '';
  const otoUpsPrice = f['OTO UPS Price'] || '';
  const otoUpsWasPrice = f['OTO UPS Was Price'] || '';
  const otoCareMonthlyPrice = f['OTO Care Monthly Price'] || '';

  const formAction = isEdit ? `/api/admin/proposals/${proposal.id}` : '/api/admin/proposals';
  const formMethod = isEdit ? 'PUT' : 'POST';

  // Default scope items for new proposals
  const defaultScope = [
    'Conduct Discovery Meeting to Determine Specific Security Needs',
    'Collaborate with Vendors to Design Tailored Security Solution',
    'Procure Parts & Materials from Local Suppliers',
    '',
    '',
    'Program, Test & Commission System',
    'Setup Customer Phone App & Full Demonstration',
    'Clean Up Site After Installation',
  ];
  const scopeItems = scopeItemsRaw.length > 0 ? scopeItemsRaw : (isEdit ? [] : defaultScope);
  const deliverables = deliverablesRaw.length > 0 ? deliverablesRaw : [];
  const cameraOptions = cameraOptionsRaw.length > 0 ? cameraOptionsRaw : [];

  const defaultClarifications = [
    'Only items expressly listed above are included in this quotation. Any additional parts or works to other items are chargeable at the applicable rate.',
    'All works quoted and any subsequent warranty works are conducted between the hours of 08:00 & 17:00 Monday to Friday excluding Western Australian public holidays. Warranty attendances do not include provision of EWP which must be organised by the client.',
    'Great White Security requires full and free access to all areas of the site containing security equipment covered in the works outlined in this proposal for the duration of the works. This includes vehicles or equipment which may be in the way of accessing install locations. Delays in access or return attendances required to complete works due to access restrictions may be chargeable at the applicable service rates.',
    'If required, customer smartphones must be present during installation. Great White Security assume customer phones are able to install/run CCTV and alarm apps as required.',
    'Quotation valid for 30 days.',
    'Customer must provide spare internet router port and have working internet for app connectivity. Great White Security assumes internet speed is sufficient for CCTV app access.',
    'CCTV Alarm Monitoring by Monitoring Station pricing is based on being set to only send alarms overnight between 2200 \u2013 0530. More than 8 events per month may require a plan increase but will be reviewed first.',
    'License plate capture from cameras is dependent on many variables such as lighting, if vehicles are stationary or moving, speed of vehicles, license plate illumination/cleanliness, obstructions, distance from cameras etc.',
    'Final mounting locations depend on cable and mounting access \u2014 to be confirmed by on-site technician.',
  ];
  const clarifications = clarificationsRaw.length > 0 ? clarificationsRaw : (isEdit ? [] : defaultClarifications);
  const sitePhotoUrls = sitePhotoUrlsRaw.length > 0 ? sitePhotoUrlsRaw : [];

  // Build scope item rows
  const scopeRowsHtml = scopeItems.map((item, i) => {
    const val = typeof item === 'string' ? item : (item.description || '');
    return `<div class="list-row" data-list="scope" draggable="true">
      <span class="drag-handle" title="Drag to reorder">&#9776;</span>
      <span class="row-num">${i + 1}</span>
      <input type="text" class="list-input" value="${escapeHtml(val)}" placeholder="Enter scope item...">
      <button type="button" class="row-insert" onclick="insertRowBelow(this,'scope')" title="Add item below">+</button>
      <button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>
    </div>`;
  }).join('');

  // Build deliverable rows
  const deliverableRowsHtml = deliverables.map(d => {
    const qty = typeof d === 'string' ? '' : (d.qty || '');
    const desc = typeof d === 'string' ? d : (d.description || '');
    return `<div class="list-row" data-list="deliverable" draggable="true">
      <span class="drag-handle" title="Drag to reorder">&#9776;</span>
      <input type="text" class="qty-input" value="${escapeHtml(String(qty))}" placeholder="Qty">
      <input type="text" class="list-input" value="${escapeHtml(desc)}" placeholder="Description...">
      <button type="button" class="row-insert" onclick="insertRowBelow(this,'deliverable')" title="Add item below">+</button>
      <button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>
    </div>`;
  }).join('');

  // Build clarification rows
  const clarificationRowsHtml = clarifications.map((c, i) => {
    const val = typeof c === 'string' ? c : (c.description || '');
    return `<div class="list-row" data-list="clarification" draggable="true">
      <span class="drag-handle" title="Drag to reorder">&#9776;</span>
      <span class="row-num">${i + 1}</span>
      <input type="text" class="list-input" value="${escapeHtml(val)}" placeholder="Enter clarification...">
      <button type="button" class="row-insert" onclick="insertRowBelow(this,'clarification')" title="Add item below">+</button>
      <button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>
    </div>`;
  }).join('');

  // Build camera option rows
  const cameraRowsHtml = cameraOptions.map(opt => {
    return `<div class="list-row camera-row" data-list="camera">
      <input type="text" class="cam-name" value="${escapeHtml(opt.name || '')}" placeholder="Option name">
      <input type="text" class="cam-desc" value="${escapeHtml(opt.description || '')}" placeholder="Description">
      <input type="number" class="cam-price" value="${opt.price || ''}" placeholder="Price" step="1">
      <button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>
    </div>`;
  }).join('');

  // Uploaded photo thumbnails
  const photoThumbsHtml = sitePhotoUrls.map(url =>
    `<div class="photo-thumb"><img src="${escapeHtml(url)}" alt="Site photo"><button type="button" class="photo-remove" onclick="removePhoto(this, '${escapeHtml(url)}')">&times;</button></div>`
  ).join('');

  const bodyHtml = `
    <div style="padding:24px;max-width:800px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h1 style="font-size:22px;color:#e0e6ed;">${isEdit ? 'Edit' : 'New'} Proposal</h1>
        <a href="/admin/proposals" style="color:#5a6a7a;text-decoration:none;font-size:13px;">&larr; All Proposals</a>
      </div>
      ${clientName ? `<p style="color:#00d4ff;font-size:15px;margin-bottom:20px;">for <strong>${escapeHtml(clientName)}</strong>${clientAddress ? ' &mdash; ' + escapeHtml(clientAddress) : ''}</p>` : ''}

      <!-- STEP INDICATORS -->
      <div class="steps-bar">
        <button type="button" class="step-tab active" onclick="goStep(1)">1. Client</button>
        <button type="button" class="step-tab" onclick="goStep(2)">2. Scope</button>
        <button type="button" class="step-tab" onclick="goStep(3)">3. Pricing</button>
        <button type="button" class="step-tab" onclick="goStep(4)">4. Upsells</button>
        <button type="button" class="step-tab" onclick="goStep(5)">5. Photos</button>
      </div>

      <form id="proposalForm">

        <!-- STEP 1: CLIENT -->
        <div class="step" id="step-1">
          <div class="card">
            <h2 class="card-title">Client Details</h2>
            <div class="form-row">
              <div class="fg"><label>Project Number</label><input type="text" name="projectNumber" value="${escapeHtml(projectNumber)}" placeholder="e.g. 003256"></div>
              <div class="fg"><label>Date</label><input type="date" name="date" value="${escapeHtml(date)}"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Client Name</label><input type="text" name="clientName" value="${escapeHtml(clientName)}" placeholder="John Smith"></div>
              <div class="fg"><label>Address</label><input type="text" name="clientAddress" value="${escapeHtml(clientAddress)}" placeholder="123 Main St, Suburb WA 6000"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Phone</label><input type="text" id="clientPhone" value="${escapeHtml(clientPhone)}" placeholder="0412 345 678"></div>
              <div class="fg"><label>Email</label><input type="text" id="clientEmail" value="${escapeHtml(clientEmail)}" placeholder="john@example.com"></div>
            </div>
            <div class="fg">
              <label>Custom Letter Note <span style="color:#5a6a7a;font-weight:400;">(leave blank for default)</span></label>
              <textarea name="letterNote" rows="3" placeholder="Optional: custom intro paragraph for this client">${escapeHtml(letterNote)}</textarea>
            </div>
          </div>
          <div class="step-nav"><button type="button" class="btn-next" onclick="goStep(2)">Next: Scope &rarr;</button></div>
        </div>

        <!-- STEP 2: SCOPE & DELIVERABLES -->
        <div class="step" id="step-2" style="display:none;">
          <div class="card">
            <h2 class="card-title">Project Scope</h2>
            <p class="card-hint">What will you do? Add/remove/edit items.</p>
            <div id="scope-list">${scopeRowsHtml}</div>
            <button type="button" class="btn-add" onclick="addScopeRow()">+ Add Scope Item</button>
          </div>
          <div class="card" style="margin-top:16px;">
            <h2 class="card-title">Deliverables</h2>
            <p class="card-hint">What equipment/materials are included?</p>
            <div id="deliverable-list">${deliverableRowsHtml}</div>
            <button type="button" class="btn-add" onclick="addDeliverableRow()">+ Add Deliverable</button>
            <p class="card-hint" style="margin-top:10px;color:#5a6a7a;font-size:11px;">Note: "Installation Materials", "Installation by Licensed Technicians", and "12 Month Warranty" are always included automatically.</p>
          </div>
          <div class="card" style="margin-top:16px;">
            <h2 class="card-title">Clarifications & Exclusions</h2>
            <p class="card-hint">Terms and conditions shown at the end of the proposal.</p>
            <div id="clarification-list">${clarificationRowsHtml}</div>
            <button type="button" class="btn-add" onclick="addClarificationRow()">+ Add Clarification</button>
          </div>
          <div class="step-nav">
            <button type="button" class="btn-back" onclick="goStep(1)">&larr; Back</button>
            <button type="button" class="btn-next" onclick="goStep(3)">Next: Pricing &rarr;</button>
          </div>
        </div>

        <!-- STEP 3: PRICING -->
        <div class="step" id="step-3" style="display:none;">
          <div class="card">
            <h2 class="card-title">Package & Pricing</h2>
            <div class="form-row">
              <div class="fg"><label>Package Name</label><input type="text" name="packageName" value="${escapeHtml(packageName)}" placeholder="e.g. Complete 4-Camera CCTV Package"></div>
              <div class="fg"><label>Total Price (inc. GST)</label><input type="number" name="basePrice" value="${escapeHtml(String(basePrice))}" step="1" placeholder="4990" style="font-size:20px;font-weight:700;"></div>
            </div>
            <div class="fg"><label>Short Description</label><input type="text" name="packageDescription" value="${escapeHtml(packageDesc)}" placeholder="Supply & install 4-camera AI security system with NVR"></div>
          </div>
          <div class="card" style="margin-top:16px;">
            <h2 class="card-title">Optional Upgrades <span style="color:#5a6a7a;font-weight:400;font-size:13px;">(customer can toggle these on/off)</span></h2>
            <p class="card-hint">Add options the customer can add to their package.</p>
            <div id="camera-list">${cameraRowsHtml}</div>
            <button type="button" class="btn-add" onclick="addCameraRow()">+ Add Upgrade Option</button>
          </div>
          <div class="step-nav">
            <button type="button" class="btn-back" onclick="goStep(2)">&larr; Back</button>
            <button type="button" class="btn-next" onclick="goStep(4)">Next: Upsells &rarr;</button>
          </div>
        </div>

        <!-- STEP 4: OTO UPSELLS -->
        <div class="step" id="step-4" style="display:none;">
          <div class="card">
            <h2 class="card-title">Post-Payment Upsells (OTO)</h2>
            <p class="card-hint">These show after the customer pays. Leave blank to skip any offer.</p>

            <div class="oto-group">
              <h3 class="oto-label">Bundle Deal <span style="color:#5a6a7a;font-weight:400;">— everything below in one discounted package</span></h3>
              <div class="fg"><label>Bundle Price ($)</label><input type="number" name="otoBundlePrice" value="${escapeHtml(String(otoBundlePrice))}" step="1" placeholder="e.g. 1490"></div>
            </div>

            <div class="oto-group">
              <h3 class="oto-label">Alarm Monitoring</h3>
              <div class="form-row">
                <div class="fg"><label>Offer Price ($)</label><input type="number" name="otoAlarmPrice" value="${escapeHtml(String(otoAlarmPrice))}" step="1" placeholder="990"></div>
                <div class="fg"><label>Was Price ($) <span style="color:#5a6a7a;font-weight:400;">for strikethrough</span></label><input type="number" name="otoAlarmWasPrice" value="${escapeHtml(String(otoAlarmWasPrice))}" step="1" placeholder="1290"></div>
              </div>
            </div>

            <div class="oto-group">
              <h3 class="oto-label">UPS Battery Backup</h3>
              <div class="form-row">
                <div class="fg"><label>Offer Price ($)</label><input type="number" name="otoUpsPrice" value="${escapeHtml(String(otoUpsPrice))}" step="1" placeholder="590"></div>
                <div class="fg"><label>Was Price ($)</label><input type="number" name="otoUpsWasPrice" value="${escapeHtml(String(otoUpsWasPrice))}" step="1" placeholder="790"></div>
              </div>
            </div>

            <div class="oto-group">
              <h3 class="oto-label">GWS Care Plan <span style="color:#5a6a7a;font-weight:400;">— monthly subscription</span></h3>
              <div class="fg"><label>Monthly Price ($)</label><input type="number" name="otoCareMonthlyPrice" value="${escapeHtml(String(otoCareMonthlyPrice))}" step="1" placeholder="49"></div>
            </div>
          </div>
          <div class="step-nav">
            <button type="button" class="btn-back" onclick="goStep(3)">&larr; Back</button>
            <button type="button" class="btn-next" onclick="goStep(5)">Next: Photos &rarr;</button>
          </div>
        </div>

        <!-- STEP 5: PHOTOS & FINISH -->
        <div class="step" id="step-5" style="display:none;">
          <div class="card">
            <h2 class="card-title">Site Photos</h2>
            <p class="card-hint">Upload photos to show on the proposal cover page.</p>
            <div class="photo-grid" id="photo-grid">${photoThumbsHtml}</div>
            <div class="fg">
              <input type="file" id="photoUpload" accept="image/*" multiple style="display:none;">
              <button type="button" class="btn-add" onclick="document.getElementById('photoUpload').click()" style="width:100%;padding:20px;">
                + Upload Photos
              </button>
              <div id="upload-status" style="margin-top:8px;font-size:13px;color:#8899aa;text-align:center;"></div>
            </div>
          </div>

          <div class="card" style="margin-top:16px;background:linear-gradient(135deg,#0a1628,#0f1e30);border-color:#00d4ff;">
            <h2 class="card-title" style="color:#00d4ff;">Ready to Go</h2>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <button type="button" class="btn-save" onclick="saveProposal(false)">Save as Draft</button>
              <button type="button" class="btn-send" onclick="saveProposal(true)">Save & Send to Client</button>
              ${isEdit ? `<a href="/proposals/${escapeHtml(projectNumber)}" target="_blank" class="btn-preview">Preview Proposal</a>` : ''}
            </div>
            <div id="save-status" style="margin-top:12px;font-size:14px;"></div>
          </div>

          <div class="step-nav">
            <button type="button" class="btn-back" onclick="goStep(4)">&larr; Back</button>
          </div>
        </div>

        <!-- Hidden fields for JSON data -->
        <input type="hidden" name="engagementId" value="${escapeHtml(pf.engagementId || '')}">
        <input type="hidden" name="scopeItems" id="h-scope">
        <input type="hidden" name="deliverables" id="h-deliverables">
        <input type="hidden" name="clarifications" id="h-clarifications">
        <input type="hidden" name="cameraOptions" id="h-cameras">
        <input type="hidden" name="sitePhotoUrls" id="h-photos">
      </form>
    </div>`;

  const customStyles = `
    .steps-bar { display:flex; gap:4px; margin-bottom:20px; overflow-x:auto; }
    .step-tab {
      flex:1; padding:10px 8px; background:#0f1419; border:2px solid #2a3a4a; border-radius:8px;
      color:#5a6a7a; font-size:13px; font-weight:600; cursor:pointer; transition:all .2s; white-space:nowrap;
    }
    .step-tab:hover { border-color:#3a4a5a; color:#8899aa; }
    .step-tab.active { border-color:#00d4ff; color:#00d4ff; background:#0a1628; }
    .step-tab.done { border-color:#4caf50; color:#4caf50; }

    .card {
      background:#0f1419; border:1px solid #2a3a4a; border-radius:12px; padding:24px;
    }
    .card-title { font-size:18px; color:#e0e6ed; margin-bottom:6px; }
    .card-hint { font-size:13px; color:#5a6a7a; margin-bottom:16px; }

    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .fg { margin-bottom:14px; }
    .fg label { display:block; font-size:12px; color:#8899aa; margin-bottom:5px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
    .fg input, .fg textarea {
      width:100%; padding:10px 14px; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px;
      color:#e0e6ed; font-size:14px; font-family:inherit; transition:border-color .2s;
    }
    .fg input:focus, .fg textarea:focus { border-color:#00d4ff; outline:none; }

    .list-row {
      display:flex; align-items:center; gap:8px; margin-bottom:2px; transition:transform 0.15s, opacity 0.15s;
    }
    .list-row.dragging { opacity:0.4; }
    .list-row.drag-over-below { border-bottom:2px solid #00d4ff; margin-bottom:0; }
    .list-row.drag-over-above { border-top:2px solid #00d4ff; margin-top:-2px; }
    .drag-handle {
      cursor:grab; color:#3a4a5a; font-size:16px; padding:4px 2px; user-select:none; touch-action:none;
      transition:color .2s;
    }
    .drag-handle:hover { color:#8899aa; }
    .drag-handle:active { cursor:grabbing; }
    .row-num { color:#5a6a7a; font-size:13px; font-weight:700; min-width:20px; text-align:center; }
    .list-input {
      flex:1; padding:9px 12px; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px;
      color:#e0e6ed; font-size:14px; font-family:inherit;
    }
    .list-input:focus { border-color:#00d4ff; outline:none; }
    .qty-input {
      width:60px; padding:9px 8px; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px;
      color:#e0e6ed; font-size:14px; text-align:center; font-family:inherit;
    }
    .qty-input:focus { border-color:#00d4ff; outline:none; }
    .row-insert {
      background:none; border:none; color:#2a3a4a; font-size:14px; cursor:pointer; padding:2px 6px;
      transition:color .2s;
    }
    .row-insert:hover { color:#00d4ff; }
    .row-remove {
      background:none; border:none; color:#5a6a7a; font-size:20px; cursor:pointer; padding:4px 8px;
      transition:color .2s;
    }
    .row-remove:hover { color:#ff5252; }

    .camera-row { display:grid; grid-template-columns:1fr 1.5fr 80px 30px; gap:8px; align-items:center; margin-bottom:8px; }
    .cam-name, .cam-desc, .cam-price {
      padding:9px 12px; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px;
      color:#e0e6ed; font-size:14px; font-family:inherit;
    }
    .cam-name:focus, .cam-desc:focus, .cam-price:focus { border-color:#00d4ff; outline:none; }

    .btn-add {
      background:none; border:2px dashed #2a3a4a; border-radius:8px; color:#00d4ff; padding:10px 18px;
      font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; width:auto;
    }
    .btn-add:hover { border-color:#00d4ff; background:rgba(0,212,255,0.05); }

    .step-nav { display:flex; justify-content:space-between; margin-top:16px; gap:12px; }
    .btn-next {
      background:#00d4ff; color:#0f1419; padding:12px 28px; border:none; border-radius:8px;
      font-size:15px; font-weight:700; cursor:pointer; margin-left:auto;
    }
    .btn-next:hover { background:#00b8d9; }
    .btn-back {
      background:none; color:#8899aa; border:2px solid #2a3a4a; padding:12px 24px; border-radius:8px;
      font-size:14px; font-weight:600; cursor:pointer;
    }
    .btn-back:hover { border-color:#5a6a7a; color:#e0e6ed; }
    .btn-save {
      background:#00d4ff; color:#0f1419; padding:14px 32px; border:none; border-radius:8px;
      font-size:16px; font-weight:700; cursor:pointer;
    }
    .btn-save:hover { background:#00b8d9; }
    .btn-send {
      background:#4caf50; color:white; padding:14px 32px; border:none; border-radius:8px;
      font-size:16px; font-weight:700; cursor:pointer;
    }
    .btn-send:hover { background:#43a047; }
    .btn-preview {
      background:none; color:#00d4ff; padding:14px 28px; border:2px solid #00d4ff; border-radius:8px;
      font-size:15px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center;
    }
    .btn-preview:hover { background:rgba(0,212,255,0.1); }

    .oto-group { border-bottom:1px solid #2a3a4a; padding-bottom:16px; margin-bottom:16px; }
    .oto-group:last-child { border-bottom:none; margin-bottom:0; padding-bottom:0; }
    .oto-label { font-size:15px; color:#e0e6ed; margin-bottom:10px; font-weight:600; }

    .photo-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); gap:10px; margin-bottom:14px; }
    .photo-thumb { position:relative; aspect-ratio:1; border-radius:8px; overflow:hidden; border:2px solid #2a3a4a; }
    .photo-thumb img { width:100%; height:100%; object-fit:cover; }
    .photo-remove {
      position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.7); color:white; border:none;
      border-radius:50%; width:22px; height:22px; font-size:14px; cursor:pointer; line-height:22px; padding:0;
    }

    @media (max-width:768px) {
      .form-row { grid-template-columns:1fr; }
      .camera-row { grid-template-columns:1fr 1fr; }
      .steps-bar { gap:2px; }
      .step-tab { font-size:11px; padding:8px 4px; }
    }
  `;

  const customScripts = `<script>
    let currentStep = 1;
    let uploadedPhotoUrls = ${JSON.stringify(sitePhotoUrls)};

    function goStep(n) {
      document.querySelectorAll('.step').forEach(s => s.style.display = 'none');
      document.getElementById('step-' + n).style.display = 'block';
      document.querySelectorAll('.step-tab').forEach((t, i) => {
        t.classList.remove('active');
        if (i + 1 < n) t.classList.add('done');
        else t.classList.remove('done');
        if (i + 1 === n) t.classList.add('active');
      });
      currentStep = n;
      window.scrollTo(0, 0);
      renumberScope();
    }

    function removeRow(btn) { btn.closest('.list-row, .camera-row').remove(); renumberScope(); }

    function renumberScope() {
      document.querySelectorAll('#scope-list .row-num').forEach((el, i) => el.textContent = i + 1);
      document.querySelectorAll('#clarification-list .row-num').forEach((el, i) => el.textContent = i + 1);
    }

    function makeScopeRowHtml() {
      return '<span class="drag-handle" title="Drag to reorder">&#9776;</span><span class="row-num"></span><input type="text" class="list-input" placeholder="Enter scope item..."><button type="button" class="row-insert" onclick="insertRowBelow(this,\\'scope\\')" title="Add item below">+</button><button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>';
    }

    function makeDeliverableRowHtml() {
      return '<span class="drag-handle" title="Drag to reorder">&#9776;</span><input type="text" class="qty-input" placeholder="Qty"><input type="text" class="list-input" placeholder="Description..."><button type="button" class="row-insert" onclick="insertRowBelow(this,\\'deliverable\\')" title="Add item below">+</button><button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>';
    }

    function addScopeRow() {
      const list = document.getElementById('scope-list');
      const row = document.createElement('div');
      row.className = 'list-row';
      row.dataset.list = 'scope';
      row.draggable = true;
      row.innerHTML = makeScopeRowHtml();
      list.appendChild(row);
      initDragRow(row);
      renumberScope();
      row.querySelector('.list-input').focus();
    }

    function addDeliverableRow() {
      const list = document.getElementById('deliverable-list');
      const row = document.createElement('div');
      row.className = 'list-row';
      row.dataset.list = 'deliverable';
      row.draggable = true;
      row.innerHTML = makeDeliverableRowHtml();
      list.appendChild(row);
      initDragRow(row);
      row.querySelector('.qty-input').focus();
    }

    function makeClarificationRowHtml() {
      return '<span class="drag-handle" title="Drag to reorder">&#9776;</span><span class="row-num"></span><input type="text" class="list-input" placeholder="Enter clarification..."><button type="button" class="row-insert" onclick="insertRowBelow(this,\\'clarification\\')" title="Add item below">+</button><button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>';
    }

    function addClarificationRow() {
      const list = document.getElementById('clarification-list');
      const row = document.createElement('div');
      row.className = 'list-row';
      row.dataset.list = 'clarification';
      row.draggable = true;
      row.innerHTML = makeClarificationRowHtml();
      list.appendChild(row);
      initDragRow(row);
      renumberScope();
      row.querySelector('.list-input').focus();
    }

    function insertRowBelow(btn, type) {
      const currentRow = btn.closest('.list-row');
      const row = document.createElement('div');
      row.className = 'list-row';
      row.dataset.list = type;
      row.draggable = true;
      if (type === 'scope') row.innerHTML = makeScopeRowHtml();
      else if (type === 'deliverable') row.innerHTML = makeDeliverableRowHtml();
      else if (type === 'clarification') row.innerHTML = makeClarificationRowHtml();
      currentRow.after(row);
      initDragRow(row);
      renumberScope();
      row.querySelector(type === 'deliverable' ? '.qty-input' : '.list-input').focus();
    }

    // ── Drag & Drop ──
    let dragRow = null;

    function initDragRow(row) {
      row.addEventListener('dragstart', function(e) {
        dragRow = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        document.querySelectorAll('.drag-over-below,.drag-over-above').forEach(el => {
          el.classList.remove('drag-over-below','drag-over-above');
        });
        dragRow = null;
        renumberScope();
      });
      row.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (!dragRow || dragRow === this) return;
        if (dragRow.dataset.list !== this.dataset.list) return;
        e.dataTransfer.dropEffect = 'move';
        const rect = this.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        this.classList.remove('drag-over-below','drag-over-above');
        if (e.clientY < mid) this.classList.add('drag-over-above');
        else this.classList.add('drag-over-below');
      });
      row.addEventListener('dragleave', function() {
        this.classList.remove('drag-over-below','drag-over-above');
      });
      row.addEventListener('drop', function(e) {
        e.preventDefault();
        if (!dragRow || dragRow === this) return;
        if (dragRow.dataset.list !== this.dataset.list) return;
        const rect = this.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) this.before(dragRow);
        else this.after(dragRow);
        this.classList.remove('drag-over-below','drag-over-above');
        renumberScope();
      });
    }

    // Init drag on all existing rows
    document.querySelectorAll('.list-row[draggable]').forEach(initDragRow);

    function addCameraRow() {
      const list = document.getElementById('camera-list');
      const row = document.createElement('div');
      row.className = 'list-row camera-row';
      row.dataset.list = 'camera';
      row.innerHTML = '<input type="text" class="cam-name" placeholder="Option name"><input type="text" class="cam-desc" placeholder="Description"><input type="number" class="cam-price" placeholder="Price" step="1"><button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>';
      list.appendChild(row);
      row.querySelector('.cam-name').focus();
    }

    function removePhoto(btn, url) {
      uploadedPhotoUrls = uploadedPhotoUrls.filter(u => u !== url);
      btn.closest('.photo-thumb').remove();
    }

    function collectFormData() {
      const form = document.getElementById('proposalForm');
      const fd = new FormData(form);
      const data = {};
      for (const [k, v] of fd.entries()) data[k] = v;

      // Collect scope items
      const scopeItems = [];
      document.querySelectorAll('#scope-list .list-input').forEach(inp => {
        if (inp.value.trim()) scopeItems.push(inp.value.trim());
      });
      data.scopeItems = JSON.stringify(scopeItems);

      // Collect deliverables
      const deliverables = [];
      document.querySelectorAll('#deliverable-list .list-row').forEach(row => {
        const qty = row.querySelector('.qty-input').value.trim();
        const desc = row.querySelector('.list-input').value.trim();
        if (desc) deliverables.push({ qty, description: desc });
      });
      data.deliverables = JSON.stringify(deliverables);

      // Collect clarifications
      const clarifications = [];
      document.querySelectorAll('#clarification-list .list-input').forEach(inp => {
        if (inp.value.trim()) clarifications.push(inp.value.trim());
      });
      data.clarifications = JSON.stringify(clarifications);

      // Collect camera options
      const cameras = [];
      document.querySelectorAll('#camera-list .camera-row').forEach(row => {
        const name = row.querySelector('.cam-name').value.trim();
        const desc = row.querySelector('.cam-desc').value.trim();
        const price = parseFloat(row.querySelector('.cam-price').value) || 0;
        if (name) cameras.push({ name, description: desc, price });
      });
      data.cameraOptions = JSON.stringify(cameras);

      // Photos
      data.sitePhotoUrls = JSON.stringify(uploadedPhotoUrls);

      return data;
    }

    async function saveProposal(andSend) {
      const status = document.getElementById('save-status');
      status.textContent = 'Saving...';
      status.style.color = '#ffd93d';

      const data = collectFormData();

      try {
        const resp = await fetch('${formAction}', {
          method: '${formMethod}',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await resp.json();

        if (!result.success) {
          status.textContent = 'Error: ' + (result.error || 'Unknown');
          status.style.color = '#ff5252';
          return;
        }

        const proposalId = result.id || '${isEdit ? proposal.id : ''}';

        if (andSend && proposalId) {
          status.textContent = 'Saved! Sending SMS...';
          let phone = document.getElementById('clientPhone').value.trim();
          if (!phone) phone = prompt('Enter client phone number (e.g. 0412345678):');
          if (phone) {
            const sendResp = await fetch('/api/admin/proposals/' + proposalId + '/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone })
            });
            const sendResult = await sendResp.json();
            if (sendResult.success) {
              status.textContent = 'Sent! Link: ' + sendResult.shortUrl;
              status.style.color = '#4caf50';
            } else {
              status.textContent = 'Saved but send failed: ' + (sendResult.error || 'Unknown');
              status.style.color = '#ff9800';
            }
          } else {
            status.textContent = 'Saved! (send cancelled)';
            status.style.color = '#4caf50';
          }
        } else {
          status.textContent = 'Saved!';
          status.style.color = '#4caf50';
        }

        ${!isEdit ? "if (result.id) { setTimeout(() => { window.location = '/admin/proposals/edit/' + result.id; }, 1000); }" : ''}
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = '#ff5252';
      }
    }

    // Photo upload
    document.getElementById('photoUpload').addEventListener('change', async function() {
      const files = this.files;
      if (!files.length) return;
      const statusEl = document.getElementById('upload-status');
      statusEl.textContent = 'Uploading ' + files.length + ' photo(s)...';
      statusEl.style.color = '#ffd93d';

      const formData = new FormData();
      for (const file of files) formData.append('photos', file);

      try {
        const resp = await fetch('/api/admin/proposals/upload-photos', { method: 'POST', body: formData });
        const result = await resp.json();
        if (result.success && result.urls) {
          uploadedPhotoUrls.push(...result.urls);
          const grid = document.getElementById('photo-grid');
          result.urls.forEach(url => {
            const div = document.createElement('div');
            div.className = 'photo-thumb';
            div.innerHTML = '<img src="' + url + '" alt="Photo"><button type="button" class="photo-remove" onclick="removePhoto(this, \\'' + url + '\\')">&times;</button>';
            grid.appendChild(div);
          });
          statusEl.textContent = result.urls.length + ' photo(s) uploaded!';
          statusEl.style.color = '#4caf50';
        } else {
          statusEl.textContent = 'Upload failed';
          statusEl.style.color = '#ff5252';
        }
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = '#ff5252';
      }
      this.value = '';
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
