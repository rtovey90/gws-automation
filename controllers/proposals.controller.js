const airtableService = require('../services/airtable.service');
const stripeService = require('../services/stripe.service');
const twilioService = require('../services/twilio.service');
const metaService = require('../services/meta.service');
const shortLinkService = require('../services/shortlink.service');
const pushover = require('../services/pushover.service');
const { wrapInLayout } = require('../utils/layout');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const http = require('http');

// ── User-Agent Parsing (no npm dependency) ──
function parseDevice(ua) {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Other';
}
function parseBrowser(ua) {
  if (/SamsungBrowser/i.test(ua)) return 'Samsung';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/CriOS|Chrome/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Other';
}
function getIpLocation(ip) {
  return new Promise((resolve) => {
    const clean = (ip || '').replace(/^::ffff:/, '');
    if (!clean || clean === '::1' || clean === '127.0.0.1') return resolve(null);
    const req = http.get(`http://ip-api.com/json/${clean}?fields=city,regionName,status`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.status === 'success' ? { city: j.city, region: j.regionName } : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

function calcEngagementScore(viewCount, totalTime, maxScroll, ctaClicks) {
  let score = 0;
  if (viewCount >= 3) score += 3; else if (viewCount >= 2) score += 2; else if (viewCount >= 1) score += 1;
  if (totalTime >= 300) score += 3; else if (totalTime >= 120) score += 2; else if (totalTime >= 30) score += 1;
  if (maxScroll >= 100) score += 3; else if (maxScroll >= 75) score += 2; else if (maxScroll >= 50) score += 1;
  if (ctaClicks > 0) score += 1;
  return Math.max(1, Math.min(10, score));
}

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

// Multer for datasheet PDF uploads (memory storage)
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' ||
                  file.mimetype === 'application/x-pdf' ||
                  file.originalname.toLowerCase().trim().endsWith('.pdf');
    if (!isPdf) {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
});

exports.uploadDatasheetsMiddleware = uploadPdf.array('datasheets', 10);

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

function getFirstNames(fullName) {
  if (!fullName) return 'there';
  const name = fullName.trim();
  if (name.includes('&')) {
    const parts = name.split('&').map(s => s.trim());
    const secondWords = parts[1].split(' ');
    return parts[0] + ' & ' + secondWords[0];
  }
  return name.split(' ')[0] || 'there';
}

// ── Brand Configuration (shared module) ──
const { getBrandConfig, normalizeBrandName, buildDefaultClarifications, buildCredentialsHtml, getBrandForEngagement } = require('../config/brands');

function proposalPageHeader(logoPath, projectNumber, companyName) {
  return `<div class="header">
    <img src="${logoPath}" class="header-logo" alt="${escapeHtml(companyName || 'Security Proposal')}">
    <div class="project-num">Project #${escapeHtml(projectNumber)}</div>
  </div>`;
}


// ─── PUBLIC: Show Proposal ────────────────────────────────────

exports.showProposal = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (!proposal) {
      const fb = getBrandConfig();
      return res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:${fb.bodyFont};display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0e27;color:white;text-align:center;}</style>
        </head><body><div><h1>Proposal Not Found</h1><p>This link may have expired. Please contact us at ${fb.phone}.</p></div></body></html>`);
    }

    const f = proposal.fields;
    const proposalPaused = !!f['Paused'];
    const clientName = f['Client Name'] || '';
    const businessName = f['Business Name'] || '';
    const clientAddress = f['Client Address'] || '';
    const siteAddress = f['Site Address'] || '';
    const salutation = f['Salutation'] || '';
    const propertyType = f['Property Type'] || 'residential';
    const proposalTypeVal = f['Proposal Type'] || '';
    const isSupply = proposalTypeVal === 'Supply Only' || proposalTypeVal === 'Supply + Programming';
    const installOptionPrice = Number(f['Install Option Price']) || 0;
    const letterNote = f['Letter Note'] || '';
    const scopeItems = safeJsonParse(f['Scope Items']);
    const deliverables = safeJsonParse(f['Deliverables']);
    const cameraOptions = safeJsonParse(f['Camera Options']);
    const optionGroups = safeJsonParse(f['Option Groups']);
    const brand = getBrandConfig(f['Our Business Name']);
    const clarifications = safeJsonParse(f['Clarifications']);
    const sitePhotos = safeJsonParse(f['Site Photo URLs']);
    const datasheetPhotos = safeJsonParse(f['Datasheet Photo URLs']);
    const baseQtyEnabled = !!(f['Base Qty Enabled']);
    const baseMaxQty = Number(f['Base Max Qty']) || 10;
    const coverImage = f['Cover Image URL'] || brand.coverImage;
    const packageName = f['Package Name'] || 'Security System Package';
    const packageDesc = f['Package Description'] || '';
    const basePrice = f['Base Price'] || 0;
    const discountName = f['Discount Name'] || '';
    const discountType = f['Discount Type'] || '';
    const discountValue = f['Discount Value'] || 0;
    const discountExpires = f['Discount Expires'] || '';
    const discountExpired = discountExpires ? new Date(discountExpires + 'T23:59:59') < new Date() : false;
    const discountActive = !!(discountType && discountValue > 0 && !discountExpired);
    const proposalDate = f['Proposal Date'] || new Date().toISOString().split('T')[0];
    const firstName = getFirstNames(clientName);
    const greeting = salutation || `Dear ${escapeHtml(firstName)},`;
    const logoPath = brand.logoPath;
    const dateObj = new Date(proposalDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const coverMonthYear = dateObj.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }).toUpperCase();

    // Confirmed & tech view flags
    const selectedOptions = safeJsonParse(f['Selected Options']);
    const selectedPackageName = (f['Selected Package'] || '').split(' — ')[0];
    const isConfirmed = (f['Status'] === 'Accepted' || f['Status'] === 'Paid');
    const isTechView = req.path.endsWith('/install');

    // Track views — skip entirely for logged-in admin/VA and tech/install views
    const isAdmin = req.session && req.session.authenticated;
    if (!isAdmin && !isTechView) {
      const now = new Date().toISOString();
      const ua = req.headers['user-agent'] || '';
      const device = parseDevice(ua);
      const browser = parseBrowser(ua);
      const existingLog = f['Views Log'] || '';
      const logEntry = `${now} | ${device} | ${browser}`;
      const viewUpdates = {
        'View Count': (f['View Count'] || 0) + 1,
        'Last Viewed At': now,
        'Views Log': existingLog ? existingLog + '\n' + logEntry : logEntry,
      };
      if (!f['Viewed At']) {
        viewUpdates['Viewed At'] = now;
        viewUpdates['Status'] = 'Viewed';
      }
      airtableService.updateProposal(proposal.id, viewUpdates)
        .catch(err => console.error('Error tracking proposal view:', err));

      // Push notification
      const newViewCount = (f['View Count'] || 0) + 1;
      const viewLabel = newViewCount === 1 ? '1st view' : `view #${newViewCount}`;
      pushover.notifyOwner(
        `Proposal Viewed — ${clientName}`,
        `#${f['Project Number']} ($${Number(f['Base Price'] || 0).toLocaleString()})\n${viewLabel} — ${device} / ${browser}\n\nCall them now while it's on their mind.`
      );
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
    const selectedOptionNames = isConfirmed ? selectedOptions.map(o => o.name) : [];
    const hasSelectionData = selectedOptions.length > 0;
    const isLocked = isConfirmed || isTechView;
    // For confirmed total, use selected package price if a different package was chosen
    const selectedPkgPrice = (() => {
      if (!isConfirmed || !selectedPackageName) return basePrice;
      const match = [...optionGroups, { name: packageName, price: basePrice }].find(p => p.name === selectedPackageName);
      return match ? Number(match.price) || basePrice : basePrice;
    })();
    const savedBaseQtyEntry = selectedOptions.find(o => o.name === '__base__');
    const savedBaseQty = savedBaseQtyEntry ? (Number(savedBaseQtyEntry.qty) || 1) : 1;
    const confirmedTotal = isConfirmed
      ? selectedPkgPrice * savedBaseQty + selectedOptions.filter(o => o.name !== '__base__').reduce((sum, o) => sum + (Number(o.price) || 0) * (Number(o.qty) || 1), 0)
      : basePrice;
    const anyBundleSaving = !isTechView && !isLocked && cameraOptions.some(o => Number(o.bundleSaving) > 0);
    const upgradeCardsHtml = cameraOptions.map(opt => {
      const optSelected = isConfirmed && selectedOptionNames.includes(opt.name);
      const isMonthly = !!opt.monthly;
      const bundleSaving = Number(opt.bundleSaving) || 0;
      const isQtyEnabled = !!opt.qtyEnabled;
      const maxQty = isQtyEnabled ? (opt.maxQty || 10) : null;
      const classes = ['upgrade-card'];
      if (isLocked && hasSelectionData && optSelected) classes.push('selected', 'confirmed');
      if (isLocked && hasSelectionData && !optSelected) classes.push('not-chosen');
      if (!isLocked && opt.defaultSelected && !isQtyEnabled) classes.push('selected');
      const priceSuffix = isMonthly ? '<span class="upgrade-monthly-badge">/mo</span>' : '';
      const bundleBadge = bundleSaving > 0 && !isTechView ? `<div class="upgrade-bundle-badge">Bundle Save $${bundleSaving.toLocaleString('en-AU')}</div>` : '';

      if (isQtyEnabled) {
        // Qty-enabled: stepper card
        const savedQty = optSelected ? (Number((selectedOptions.find(o => o.name === opt.name) || {}).qty) || 1) : 0;
        const initQty = isLocked ? savedQty : (opt.defaultSelected ? 1 : 0);
        if (!isLocked && initQty > 0) classes.push('selected');
        const initPrice = initQty * (opt.price || 0);
        const initPriceDisplay = formatCurrency(initPrice);
        const stepperHtml = !isLocked ? `
          <div class="upgrade-qty-row">
            <button type="button" class="upgrade-qty-btn" onclick="event.stopPropagation();qtyChange(this.closest('.upgrade-card'),-1,${opt.price||0},${opt.discountable!==false},${isMonthly},${bundleSaving},${maxQty})">&#8722;</button>
            <input type="number" class="upgrade-qty-input" value="${initQty}" min="0" max="${maxQty}" onclick="event.stopPropagation()" oninput="event.stopPropagation();qtyChange(this.closest('.upgrade-card'),0,${opt.price||0},${opt.discountable!==false},${isMonthly},${bundleSaving},${maxQty},this.value)">
            <button type="button" class="upgrade-qty-btn" onclick="event.stopPropagation();qtyChange(this.closest('.upgrade-card'),1,${opt.price||0},${opt.discountable!==false},${isMonthly},${bundleSaving},${maxQty})">&#43;</button>
          </div>` : `<div class="upgrade-qty-confirmed">Qty: ${savedQty}</div>`;
        const priceHtml = isTechView ? '' : `<div class="upgrade-price">+${initPriceDisplay}${priceSuffix}</div>`;
        return `
      <div class="${classes.join(' ')}" data-price="${initPrice}" data-unit-price="${opt.price||0}" data-discountable="${opt.discountable!==false}" data-monthly="${isMonthly}" data-bundle="${bundleSaving}" data-qty-enabled="true" data-qty="${initQty}" data-max-qty="${maxQty}">
        <div class="upgrade-info"><h4>${escapeHtml(opt.name||'')}</h4><p>${escapeHtml(opt.description||'')}</p>${bundleBadge}${stepperHtml}</div>
        ${priceHtml}
      </div>`;
      }

      // Standard toggle card (unchanged)
      const onclick = isLocked ? '' : `onclick="toggleUpgrade(this, ${opt.price || 0}, ${opt.discountable !== false}, ${isMonthly}, ${bundleSaving})"`;
      const priceHtml = isTechView ? '' : `<div class="upgrade-price">+${formatCurrency(opt.price || 0)}${priceSuffix}</div>`;
      return `
      <div class="${classes.join(' ')}" ${onclick} data-price="${opt.price || 0}" data-discountable="${opt.discountable !== false}" data-monthly="${isMonthly}" data-bundle="${bundleSaving}">
        <div class="upgrade-check">&#10003;</div>
        <div class="upgrade-info"><h4>${escapeHtml(opt.name || '')}</h4><p>${escapeHtml(opt.description || '')}</p>${bundleBadge}</div>
        ${priceHtml}
      </div>`;
    }).join('');

    // Install upgrade card for supply proposals
    const installCardHtml = (() => {
      if (!isSupply || !installOptionPrice || isTechView) return '';
      const installSelected = isConfirmed && selectedOptionNames.includes('Professional Installation');
      const classes = ['upgrade-card'];
      if (isLocked && hasSelectionData && installSelected) classes.push('selected', 'confirmed');
      if (isLocked && hasSelectionData && !installSelected) classes.push('not-chosen');
      const onclick = isLocked ? '' : `onclick="toggleUpgrade(this, ${installOptionPrice}, true, false, 0)"`;
      const priceHtml = `<div class="upgrade-price">+${formatCurrency(installOptionPrice)}</div>`;
      return `
      <div class="${classes.join(' ')}" ${onclick} data-price="${installOptionPrice}" data-discountable="true" data-monthly="false" data-bundle="0" data-install="true">
        <div class="upgrade-check">&#10003;</div>
        <div class="upgrade-info"><h4>Professional Installation</h4><p>Our licensed technician attends site, installs and tests everything, then walks you through your new system</p></div>
        ${priceHtml}
      </div>`;
    })();

    // Build package selection cards if multiple packages exist
    const allPackages = [
      { name: packageName, description: packageDesc, price: basePrice },
      ...optionGroups
    ];
    const hasMultiplePackages = optionGroups.length > 0;
    const packageCardsHtml = hasMultiplePackages ? allPackages.map((pkg, i) => {
      const hasPackageData = !!selectedPackageName;
      const pkgSelected = isConfirmed && hasPackageData ? pkg.name === selectedPackageName : i === 0;
      const classes = ['og-radio-card'];
      if (pkgSelected) classes.push('selected');
      if (isLocked && hasPackageData) classes.push('confirmed');
      if (isLocked && hasPackageData && !pkgSelected) classes.push('not-chosen');
      const onclick = isLocked ? '' : `onclick="selectPackage(this, ${pkg.price || 0})"`;
      const priceHtml = isTechView ? '' : `<div class="og-radio-price">${formatCurrency(pkg.price || 0)}</div>`;
      return `
      <div class="${classes.join(' ')}" ${onclick} data-price="${pkg.price || 0}">
        <div class="og-radio-dot"></div>
        <div class="og-radio-info"><h4>${escapeHtml(pkg.name || '')}</h4>${pkg.description ? `<p>${escapeHtml(pkg.description)}</p>` : ''}</div>
        ${priceHtml}
      </div>`;
    }).join('') : '';

    // Build clarification rows
    const defaultClarifications = buildDefaultClarifications(brand);
    const allClarifications = clarifications.length > 0 ? clarifications : defaultClarifications;
    const clarificationRows = allClarifications.map((c, i) =>
      `<tr><td>${i + 1}</td><td>${escapeHtml(typeof c === 'string' ? c : c.description || '')}</td></tr>`
    ).join('');

    // Site photo pages
    const sitePhotoPages = sitePhotos.map(url => `
<div class="page">
  <div class="pg-header"><img src="${logoPath}" alt="GWS"><div class="pg-header-right">Site Photos</div></div>
  <div class="photo-section"><img src="${escapeHtml(url)}" alt="Site Photo"></div>
  <div class="pg-footer"><span>${escapeHtml(proposalDate)}</span><span>${brand.website}</span><span>Project #${escapeHtml(projectNumber)}</span></div>
</div>`).join('');

    // Datasheet pages
    const datasheetPages = datasheetPhotos.map(url => `
<div class="page">
  <div class="pg-header"><img src="${logoPath}" alt="GWS"><div class="pg-header-right">Product Datasheets</div></div>
  <div class="photo-section"><img src="${escapeHtml(url)}" alt="Datasheet"></div>
  <div class="pg-footer"><span>${escapeHtml(proposalDate)}</span><span>${brand.website}</span><span>Project #${escapeHtml(projectNumber)}</span></div>
</div>`).join('');

    // Letter note
    const isCommercial = propertyType === 'commercial';
    const letterContent = letterNote
      ? `<p>${escapeHtml(letterNote)}</p>`
      : isSupply
        ? isCommercial
          ? `<p>As per our conversation and understanding of your requirements, we're happy to present you with a modern &amp; reliable security &amp; safety solution to protect your staff, visitors and assets.</p>
    <p>With our proposed system/s, you can enjoy peace of mind knowing your premises are protected 24/7 whether on-site or after hours.</p>
    <p>I have provided this proposal based on my current understanding of your requirements along with typical options.</p>
    <p>If you require any amendments to the scope, please let me know and I will work with you to make sure you get the solution that works for you and within your budget.</p>
    <p id="supply-letter-cta">Alternatively, please accept the proposal below and we will prepare your equipment order, ready for collection or delivery (delivery charges apply separately).</p>`
          : `<p>As per our conversation and understanding of your requirements, we're happy to present you with a modern &amp; reliable security &amp; safety solution to protect your home and family.</p>
    <p>With our proposed system/s, you can enjoy peace of mind knowing you're protected 24/7 while home or away.</p>
    <p>I have provided this proposal based on my current understanding of your requirements along with typical options.</p>
    <p>If you require any amendments to the scope, please let me know and I will work with you to make sure you get the solution that works for you and within your budget.</p>
    <p id="supply-letter-cta">Alternatively, please accept the proposal below and we will prepare your equipment order, ready for collection or delivery (delivery charges apply separately).</p>`
        : isCommercial
          ? `<p>As per our conversation and understanding of your requirements, we're happy to present you with a modern &amp; reliable security &amp; safety solution to protect your staff, visitors and assets.</p>
    <p>With our proposed system/s, you can enjoy peace of mind knowing your premises are protected 24/7 whether on-site or after hours.</p>
    <p>I have provided this proposal based on my current understanding of your requirements along with typical options.</p>
    <p>If you require any amendments to the scope, please let me know and I will work with you to make sure you get the solution that works for you and within your budget.</p>
    <p>Alternatively, please accept the proposal below, and we will order your equipment and schedule one of our professional licensed technicians for a prompt attendance!</p>`
          : `<p>As per our conversation and understanding of your requirements, we're happy to present you with a modern &amp; reliable security &amp; safety solution to protect your home and family.</p>
    <p>With our proposed system/s, you can enjoy peace of mind knowing you're protected 24/7 while home or away.</p>
    <p>I have provided this proposal based on my current understanding of your requirements along with typical options.</p>
    <p>If you require any amendments to the scope, please let me know and I will work with you to make sure you get the solution that works for you and within your budget.</p>
    <p>Alternatively, please accept the proposal below, and we will order your equipment and schedule one of our professional licensed technicians for a prompt attendance!</p>`;

    // Page chrome helpers
    const pgHeader = `<div class="pg-header"><img src="${logoPath}" alt="${escapeHtml(brand.companyName)}"><div class="pg-header-right">Project #${escapeHtml(projectNumber)}</div></div>`;
    const pgFooter = `<div class="pg-footer"><span>${escapeHtml(proposalDate)}</span><span>${brand.website}</span><span>Project #${escapeHtml(projectNumber)}</span></div>`;

    // ── TECH / INSTALL VIEW ──────────────────────────────────────────────────
    if (isTechView) {
      const techPhotoPages = [...sitePhotos, ...datasheetPhotos].map(url => `
<div class="page">
  ${pgHeader}
  <div class="photo-section"><img src="${escapeHtml(url)}" alt=""></div>
  ${pgFooter}
</div>`).join('');

      const techHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Install Sheet \u2014 Project #${escapeHtml(projectNumber)}</title>
<link href="${brand.googleFontsUrl}" rel="stylesheet">
<style>
  :root { ${brand.cssVars} }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f0f2f5; font-family: 'DM Sans', sans-serif; color: #1a2233; }
  .page {
    width: 794px; min-height: 1123px; margin: 0 auto 24px; background: white;
    display: flex; flex-direction: column; padding: 0; position: relative;
    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  }
  .pg-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 40px; border-bottom: 2px solid var(--cyan); flex-shrink: 0;
  }
  .pg-header img { height: 36px; }
  .pg-header-right { font-size: 13px; color: #5a6a7a; font-weight: 600; }
  .pg-footer {
    display: flex; justify-content: space-between; padding: 12px 40px;
    border-top: 1px solid #e0e6ed; font-size: 11px; color: #8899aa; flex-shrink: 0;
  }
  .pg-body { flex: 1; padding: 32px 40px; }
  .job-banner {
    background: var(--navy); color: white; padding: 20px 40px;
    display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
  }
  .job-banner h1 { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--cyan); margin-bottom: 4px; }
  .job-banner p { font-size: 13px; color: #aab8cc; margin: 0; }
  .job-banner-right { text-align: right; }
  .job-banner-right .proj-num { font-size: 22px; font-weight: 700; color: var(--cyan); }
  .sec-title { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--navy); margin-bottom: 6px; }
  .sec-title-accent { width: 40px; height: 3px; background: var(--cyan); margin-bottom: 20px; }
  .styled-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .styled-table th { background: var(--navy); color: white; padding: 10px 14px; text-align: left; font-weight: 600; }
  .styled-table td { padding: 9px 14px; border-bottom: 1px solid #e8ecf0; vertical-align: top; }
  .styled-table tr:last-child td { border-bottom: none; }
  .styled-table tr:nth-child(even) td { background: #f8fafc; }
  .styled-table td:first-child { width: 36px; color: #8899aa; font-weight: 600; white-space: nowrap; }
  .clar-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .clar-table td { padding: 9px 14px; border-bottom: 1px solid #e8ecf0; vertical-align: top; }
  .clar-table td:first-child { width: 36px; color: #8899aa; font-weight: 600; }
  .clar-table tr:last-child td { border-bottom: none; }
  .photo-section { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .photo-section img { width: 100%; display: block; }
  @media print { body { background: white; } .page { box-shadow: none; margin: 0; page-break-after: always; } }
</style>
</head>
<body>

<div class="page">
  <div class="pg-header">
    <img src="${logoPath}" alt="${escapeHtml(brand.companyName)}">
    <div class="pg-header-right">Install Sheet</div>
  </div>
  <div class="job-banner">
    <div>
      <h1>${escapeHtml(clientName)}</h1>
      <p>${escapeHtml(siteAddress || clientAddress)}</p>
      ${businessName ? `<p style="margin-top:2px;color:#7a8899;">${escapeHtml(businessName)}</p>` : ''}
    </div>
    <div class="job-banner-right">
      <div class="proj-num">Project #${escapeHtml(projectNumber)}</div>
      <div style="font-size:12px;color:#aab8cc;margin-top:4px;">${escapeHtml(proposalDate)}</div>
    </div>
  </div>
  <div class="pg-body">
    <div class="sec-title">Project Scope</div>
    <div class="sec-title-accent"></div>
    <table class="styled-table">
      <thead><tr><th>#</th><th>Description</th></tr></thead>
      <tbody>${scopeRows}</tbody>
    </table>
  </div>
  ${pgFooter}
</div>

<div class="page">
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

<div class="page">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Clarifications &amp; Exclusions</div>
    <div class="sec-title-accent"></div>
    <table class="clar-table">${clarificationRows}</table>
  </div>
  ${pgFooter}
</div>

${techPhotoPages}

</body>
</html>`;

      return res.send(techHtml);
    }
    // ── END TECH VIEW ────────────────────────────────────────────────────────

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(brand.companyName)} \u2014 Proposal #${escapeHtml(projectNumber)}</title>
<link href="${brand.googleFontsUrl}" rel="stylesheet">
<style>
  :root {
    ${brand.cssVars}
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ${brand.bodyFont}; color: var(--gray-800);
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
    display: flex; flex-direction: column; padding: 0 30px 40px;
  }
  .cover-spacer { height: 56%; flex-shrink: 0; }
  .cover-client-name {
    font-family: ${brand.bodyFont}; font-size: 68px; font-weight: 800;
    color: var(--white); line-height: 1.05; margin-bottom: 12px; margin-top: 20px;
  }
  .cover-client-address {
    font-family: ${brand.bodyFont}; font-size: 22px; font-weight: 600;
    color: var(--cyan); margin-bottom: 0;
  }
  .cover-footer {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-top: auto;
  }
  .cover-footer span {
    font-family: ${brand.bodyFont}; font-size: 16px; font-weight: 700;
    color: var(--white); letter-spacing: 2px; text-transform: uppercase;
  }

  /* ===== PAGE CHROME ===== */
  .pg-header {
    background: var(--navy); padding: var(--header-padding, 16px 50px);
    display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
  }
  .pg-header img { height: var(--logo-height, 32px); object-fit: contain; }
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
    font-family: ${brand.headingFont}; font-size: 30px; font-weight: 800;
    color: var(--navy); margin-bottom: 6px; line-height: 1.15;
  }
  .sec-title-accent { width: 50px; height: 3px; background: var(--cyan); margin-bottom: 25px; }

  /* ===== LETTER ===== */
  .letter p { margin-bottom: 12px; color: var(--gray-600); line-height: 1.75; font-size: 13.5px; }
  .letter-greeting {
    font-family: ${brand.headingFont}; font-size: 17px; color: var(--navy) !important;
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
    font-family: ${brand.headingFont}; font-size: 38px; font-weight: 800;
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
  .upgrade-monthly-badge { font-size: 11px; font-weight: 600; color: var(--cyan-dark); }
  /* Upgrade card qty stepper — pill design */
  .upgrade-qty-row { display:inline-flex; align-items:center; margin-top:10px; background:var(--navy); border-radius:12px; overflow:hidden; }
  .upgrade-qty-btn {
    width:44px; height:44px; border:none; background:transparent;
    color:var(--cyan); font-size:22px; font-weight:700; cursor:pointer;
    display:flex; align-items:center; justify-content:center; flex-shrink:0; line-height:1;
  }
  .upgrade-qty-btn:hover { background:rgba(120,228,255,0.15); }
  .upgrade-qty-input {
    width:44px; text-align:center; border:none; background:transparent;
    color:white; font-size:18px; font-weight:800; padding:0;
    -moz-appearance:textfield;
  }
  .upgrade-qty-input::-webkit-outer-spin-button,
  .upgrade-qty-input::-webkit-inner-spin-button { -webkit-appearance:none; }
  .upgrade-card.confirmed .upgrade-qty-btn,
  .upgrade-card.not-chosen .upgrade-qty-btn { display:none; }
  .upgrade-qty-confirmed { font-size:12px; font-weight:700; color:#5a6a7a; margin-top:6px; }
  /* Base package qty stepper — big prominent design */
  .base-qty-section {
    display:flex; align-items:center; justify-content:space-between;
    margin-top:14px; padding-top:14px; border-top:1px solid rgba(120,228,255,0.25);
  }
  .base-qty-label { font-size:12px; font-weight:700; color:var(--gray-400); text-transform:uppercase; letter-spacing:0.5px; }
  .base-qty-stepper { display:flex; align-items:center; background:var(--navy); border-radius:14px; overflow:hidden; }
  .base-qty-btn {
    width:58px; height:58px; border:none; background:transparent;
    color:var(--cyan); font-size:30px; font-weight:700; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
  }
  .base-qty-btn:hover { background:rgba(120,228,255,0.2); }
  .base-qty-num { min-width:60px; text-align:center; font-size:34px; font-weight:900; color:white; }
  .upgrade-bundle-badge { display: inline-block; background: #16a34a; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; margin-top: 5px; letter-spacing: 0.4px; text-transform: uppercase; }
  .bundle-banner { display: flex; align-items: center; gap: 10px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; font-size: 13px; color: #166534; line-height: 1.4; }
  .saving-total-row { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
  .saving-total-row > span:first-child { font-size:30px; font-weight:900; color:#16a34a; line-height:1; }
  .saving-total-row > span:last-child { font-size:30px; font-weight:900; color:#16a34a; line-height:1; }
  .saving-detail-row { display:flex; justify-content:space-between; align-items:center; padding:3px 0; }
  .saving-lbl { font-size:22px; font-weight:800; color:#16a34a; }
  .saving-amt { font-size:22px; font-weight:800; color:#16a34a; }
  .discount-expiry { color:#dc2626; font-style:italic; font-size:13px; font-weight:600; }

  /* Confirmed & tech view states */
  .upgrade-card.confirmed { border-color: #28a745; background: #f0fff4; cursor: default; }
  .upgrade-card.confirmed:hover { border-color: #28a745; background: #f0fff4; }
  .upgrade-card.confirmed .upgrade-check { background: #28a745; border-color: #28a745; color: white; }
  .upgrade-card.not-chosen { opacity: 0.4; cursor: default; pointer-events: none; }
  .upgrade-card.not-chosen .upgrade-info h4 { text-decoration: line-through; }
  .og-radio-card.confirmed { border-color: #28a745; background: #f0fff4; cursor: default; }
  .og-radio-card.confirmed:hover { border-color: #28a745; background: #f0fff4; }
  .og-radio-card.confirmed.selected .og-radio-dot { border-color: #28a745; background: #28a745; }
  .og-radio-card.not-chosen { opacity: 0.4; cursor: default; pointer-events: none; }
  .og-radio-card.not-chosen .og-radio-info h4 { text-decoration: line-through; }
  .confirmed-banner {
    background: #d4edda; border: 2px solid #28a745; border-radius: 10px;
    padding: 16px 24px; text-align: center;
  }
  .confirmed-banner h3 { font-size: 18px; font-weight: 700; color: #155724; margin: 0; }
  .confirmed-banner p { font-size: 13px; color: #155724; margin: 4px 0 0; }
  .tech-banner {
    background: linear-gradient(135deg, var(--navy), var(--navy-light));
    border-radius: 10px; padding: 14px 24px; text-align: center; margin-bottom: 20px;
  }
  .tech-banner h3 { font-size: 15px; font-weight: 700; color: var(--cyan); margin: 0; }
  .tech-banner p { font-size: 12px; color: rgba(255,255,255,0.6); margin: 4px 0 0; }

  .total-bar {
    background: linear-gradient(135deg, var(--cyan-bg) 0%, #f0f7fc 100%);
    border: 2px solid rgba(120,228,255,0.3); border-radius: 10px;
    padding: 16px 20px; margin-top: 20px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .total-bar-left { font-size: 13px; color: var(--gray-600); }
  .total-bar-left strong { color: var(--navy); }
  .total-bar-amount { font-family: ${brand.headingFont}; font-size: 28px; font-weight: 800; color: var(--navy); }

  /* ===== OPTION GROUPS ===== */
  .og-radio-card {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 16px; border: 2px solid var(--gray-100); border-radius: 8px;
    margin: 8px 0; cursor: pointer; transition: all 0.2s; user-select: none;
    background: rgba(255,255,255,0.6);
  }
  .og-radio-card:hover { border-color: var(--cyan-mid); background: var(--cyan-pale); }
  .og-radio-card.selected { border-color: var(--cyan-mid); background: var(--cyan-pale); }
  .og-radio-dot {
    width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--gray-200);
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; margin-top: 2px;
  }
  .og-radio-card.selected .og-radio-dot {
    border-color: var(--cyan-mid); background: var(--cyan-mid);
    box-shadow: inset 0 0 0 3px var(--white);
  }
  .og-radio-info { flex: 1; }
  .og-radio-info h4 { font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 2px; }
  .og-radio-info p { font-size: 11.5px; color: var(--gray-400); line-height: 1.4; margin: 0; }
  .og-radio-price { font-size: 16px; font-weight: 800; color: var(--navy); white-space: nowrap; flex-shrink: 0; margin-top: 1px; }

  /* ===== CTA ===== */
  .cta-top {
    text-align: center; padding: 30px 40px 20px;
    background: linear-gradient(180deg, #e6f0f9 0%, #f0f6fc 100%);
  }
  .cta-section {
    text-align: center; padding: 8px 50px 14px;
    background: linear-gradient(180deg, #f0f6fc 0%, #e6f0f9 100%);
  }
  .cta-steps { display: flex; gap: 30px; justify-content: center; margin: 20px 0 5px; }
  .cta-step { flex: 1; max-width: 220px; text-align: center; }
  .cta-step-num {
    width: 42px; height: 42px; border-radius: 50%; background: var(--navy); color: var(--step-num-color, var(--cyan));
    font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 12px;
  }
  .cta-step h4 { font-size: 14px; font-weight: 700; color: var(--navy); margin-bottom: 4px; }
  .cta-step p { font-size: 12.5px; color: var(--gray-400); line-height: 1.5; }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .cta-button {
    display: block; width: 100%; margin-top: 0;
    background: linear-gradient(135deg, var(--cyan-dark) 0%, var(--cyan-mid) 50%, var(--cyan-dark) 100%);
    background-size: 200% 100%;
    color: var(--cta-btn-text, var(--navy)); font-weight: 800; font-size: 16px;
    padding: 18px 45px; border-radius: 12px; text-decoration: none; letter-spacing: 0.5px;
    transition: all 0.3s ease; border: none; cursor: pointer;
    box-shadow: 0 4px 20px rgba(120,228,255,0.35);
    position: relative; overflow: hidden;
  }
  .cta-button:hover {
    transform: translateY(-2px) scale(1.01);
    box-shadow: 0 8px 35px rgba(120,228,255,0.55), 0 0 20px rgba(120,228,255,0.2);
    animation: shimmer 1.5s ease infinite;
    letter-spacing: 0.8px;
  }
  .cta-button:active { transform: translateY(0) scale(0.99); }
  .cta-button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; animation: none; }
  .cta-sub { font-size: 11px; color: var(--gray-400); margin-top: 12px; line-height: 1.6; }
  .cta-sub a { color: var(--cyan-dark); text-decoration: underline; }
  .cta-divider { width: 60px; height: 1px; background: var(--gray-200); margin: 20px auto; }
  .cta-or { font-size: 12px; color: var(--gray-400); margin: 16px 0; }
  .cta-alt { font-size: 12.5px; color: var(--gray-600); }
  .cta-alt a { color: var(--cyan-dark); font-weight: 600; text-decoration: none; }
  .cta-thanks {
    font-family: ${brand.headingFont}; font-size: 16px; font-weight: 700;
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

  /* ===== DISCOUNT ===== */
  .discount-row {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    margin-top: 4px;
  }
  .discount-badge {
    display: inline-block; background: #e05252; color: #fff;
    font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
    letter-spacing: 0.5px; text-transform: uppercase;
  }
  .discount-original {
    font-size: 22px; font-weight: 700; color: var(--gray-400); text-decoration: line-through;
  }
  .discount-expiry {
    font-size: 11px; color: #e05252; font-weight: 600; width: 100%; margin-top: 2px;
  }

  /* ===== RESPONSIVE ===== */
  @media (max-width: 820px) {
    .page, .cover-page { width: 100%; min-height: auto; margin: 0; box-shadow: none; }
    .cover-page { height: 100vh; background: #0a0e27; }
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
    .pdf-btn { top: auto !important; bottom: 20px !important; }
    .cover-page .cover-bg { object-fit: contain; object-position: top center; }
  }

  @media print {
    .pdf-btn { display: none !important; }
  }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
</head>
<body>

<!-- ==================== COVER ==================== -->
<div class="cover-page">
  <img class="cover-bg" src="${escapeHtml(coverImage)}" alt="${escapeHtml(brand.companyName)}">
  <div class="cover-overlay">
    <div class="cover-spacer"></div>
    <div class="cover-client-name">Prepared for<br>${escapeHtml(businessName || clientName)}</div>
    <div class="cover-client-address">${escapeHtml(siteAddress || clientAddress)}</div>
    <div class="cover-footer">
      <span>CONFIDENTIAL</span>
      <span>${coverMonthYear}</span>
    </div>
  </div>
</div>

<!-- ==================== LETTER ==================== -->
<div class="page bg-gradient" data-section="letter">
  ${pgHeader}
  <div class="pg-body letter">
    <div style="display:flex; justify-content:space-between; margin-bottom:25px;">
      <div>
        <div style="font-weight:600; color:var(--navy);">${escapeHtml(clientName)}</div>${businessName ? `\n        <div style="color:var(--gray-400); font-size:12px;">${escapeHtml(businessName)}</div>` : ''}
        <div style="color:var(--gray-400); font-size:12px;">${escapeHtml(clientAddress)}</div>${siteAddress ? `\n        <div style="color:var(--gray-400); font-size:12px; margin-top:2px;">Site: ${escapeHtml(siteAddress)}</div>` : ''}
      </div>
      <div style="text-align:right; color:var(--gray-400); font-size:12px;">${formattedDate}</div>
    </div>
    <p class="letter-greeting">${greeting}</p>
    ${letterContent}
    <p style="margin-bottom:0;">Kind regards,</p>
    <div class="letter-sign">
      <img src="/proposal-assets/signature.jpeg" alt="Signature">
      <div class="letter-sign-name">${escapeHtml(brand.signerName)}</div>
      <div class="letter-sign-title">${escapeHtml(brand.signerTitle)}</div>
    </div>
  </div>
  ${pgFooter}
</div>

<!-- ==================== WHY CHOOSE US ==================== -->
<div class="page bg-subtle" data-section="why-us">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Why Choose Us?</div>
    <div class="sec-title-accent"></div>
    <p class="why-intro">${isCommercial ? brand.whyUsCommercial : brand.whyUsResidential}</p>
    <p class="why-intro">${brand.whyUsTeamLine}</p>
    <div class="why-highlight">
      <p>${brand.whyUsProductAgnostic}</p>
    </div>
    <div class="cap-grid">
      <div class="cap-card"><h4>24/7 Reliable Protection</h4><p>Advanced systems designed to safeguard your premises day and night.</p></div>
      <div class="cap-card"><h4>Layered Protection</h4><p>Multiple systems working together &mdash; cameras, alarms, sensors &amp; monitoring for complete coverage.</p></div>
      <div class="cap-card"><h4>AI Driven Technology</h4><p>Intuitive systems with simple remote access from your phone.</p></div>
      <div class="cap-card"><h4>Future-Proof Security</h4><p>Scalable solutions that can expand as your needs evolve.</p></div>
    </div>
    <p class="why-intro">${brand.whyUsClosing}</p>
    ${buildCredentialsHtml(brand)}
  </div>
  ${pgFooter}
</div>

<!-- ==================== PROJECT SCOPE ==================== -->
<div class="page bg-gradient" data-section="scope">
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

<!-- ==================== DATASHEETS ==================== -->
${datasheetPages}

<!-- ==================== DELIVERABLES ==================== -->
<div class="page bg-subtle" data-section="deliverables">
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
<div class="page bg-warm" data-section="pricing" style="display:flex; flex-direction:column;">
  ${pgHeader}
  <div class="pg-body" style="padding-bottom:0; flex:none;">
    <div class="sec-title">${isTechView ? 'Installation Summary' : isConfirmed ? 'Confirmed Selection' : 'Ready to Get Started?'}</div>
    <div class="sec-title-accent"></div>
  </div>
  ${isTechView ? `
  <div style="padding:0 50px 10px;">
    <div class="tech-banner">
      <h3>Installation Reference</h3>
      <p>${escapeHtml(clientName)}${siteAddress ? ' \u2014 ' + escapeHtml(siteAddress) : ''}</p>
    </div>
  </div>
  ` : isConfirmed ? '' : `
  <div class="cta-top">
    <div class="cta-steps">
      <div class="cta-step"><div class="cta-step-num">1</div><h4>Accept &amp; Pay</h4><p>Complete payment securely via Stripe</p></div>
      ${isSupply
        ? `<div class="cta-step"><div class="cta-step-num">2</div><h4>We Prepare</h4><p>We source and programme your equipment ready to go</p></div>
      <div class="cta-step"><div class="cta-step-num">3</div><h4 id="cta-step3-title">Collect or Deliver</h4><p id="cta-step3-body">Pick up from us or we arrange delivery (charges apply)</p></div>`
        : `<div class="cta-step"><div class="cta-step-num">2</div><h4>We Order</h4><p>Equipment is sourced from trusted local suppliers</p></div>
      <div class="cta-step"><div class="cta-step-num">3</div><h4>We Install</h4><p>Licensed technician installs, tests &amp; walks you through everything</p></div>`
      }
    </div>
  </div>
  `}
  <div class="pg-body" style="padding-top:20px; padding-bottom:0; flex:1;">
    ${hasMultiplePackages ? `
    <div style="margin-bottom:6px; padding-bottom:10px; border-bottom:2px solid var(--cyan-mid);">
      <h3 style="font-size:13px; font-weight:700; color:var(--navy); letter-spacing:0.5px;">
        ${isLocked ? 'Selected Package' : 'Choose Your Package'} <span style="font-size:11px; font-weight:400; color:var(--gray-400); letter-spacing:0;">\u2014 ${isLocked ? 'Chosen by customer' : 'Select one option'}</span>
      </h3>
    </div>
    <div class="og-radio-group">${packageCardsHtml}</div>
    ` : `
    <div class="hero-price">
      <div class="hero-price-left">
        <h3>${escapeHtml(packageName)}</h3>
        <div class="hero-price-items">${escapeHtml(packageDesc)}</div>
        ${isConfirmed && savedBaseQty > 1
          ? `<div class="included-badge">&#10003; Included &times;${savedBaseQty}</div>`
          : `<div class="included-badge">&#10003; Included</div>`}
        ${!isTechView && baseQtyEnabled && !isConfirmed ? `
        <div class="base-qty-section">
          <span class="base-qty-label">How many?</span>
          <div class="base-qty-stepper">
            <button type="button" class="base-qty-btn" onclick="changeBaseQty(-1)">&#8722;</button>
            <div class="base-qty-num" id="baseQtyDisplay">1</div>
            <button type="button" class="base-qty-btn" onclick="changeBaseQty(1)">&#43;</button>
          </div>
        </div>` : ''}
      </div>
      ${isTechView ? '' : `
      <div class="hero-price-right">
        <div class="hero-price-amount" id="basePriceDisplay">${formatCurrency(isConfirmed ? basePrice * savedBaseQty : basePrice)}</div>
        <div class="hero-price-gst">AUD Inc. GST</div>
      </div>
      `}
    </div>
    `}

    ${(cameraOptions.length > 0 || installCardHtml) ? `
    <div style="margin:22px 0 6px; padding-bottom:10px; border-bottom:2px solid var(--cyan-mid);">
      <h3 style="font-size:13px; font-weight:700; color:var(--navy); letter-spacing:0.5px;">${isLocked ? 'Additional Options' : 'Extend Your Coverage'} <span style="font-size:11px; font-weight:400; color:var(--gray-400); letter-spacing:0;">\u2014 ${isLocked ? 'Selected by customer' : 'Add additional options to your package'}</span></h3>
    </div>
    ${anyBundleSaving ? `<div class="bundle-banner"><span style="font-size:18px;">&#128161;</span><div><strong>Bundle &amp; Save</strong> &mdash; add extra systems to your install and unlock bundle savings on your total</div></div>` : ''}
    ${upgradeCardsHtml}
    ${installCardHtml}
    ` : ''}

    ${isTechView ? '' : `
    <div class="total-bar" style="flex-direction:column; align-items:stretch; gap:0;">
      <div id="savingsSection" style="display:none; margin-bottom:12px;">
        <div class="saving-total-row">
          <span>You&rsquo;re saving</span><span id="totalSavingAmt"></span>
        </div>
        <div id="bundleSavingLine" class="saving-detail-row" style="display:none;">
          <span class="saving-lbl">&#127873; Bundle Saving</span><span class="saving-amt" id="bundleSavingAmt"></span>
        </div>
        <div id="earlyBirdLine" class="saving-detail-row" style="display:none; align-items:center;">
          <span class="saving-lbl"><span id="earlyBirdLabel">&#9889; Early Bird</span><span class="discount-expiry" id="discountExpiry" style="display:none;"></span></span>
          <span class="saving-amt" id="earlyBirdAmt"></span>
        </div>
      </div>
      <div id="totalRow" style="display:flex; justify-content:space-between; align-items:center; padding-top:10px;">
        <div class="total-bar-left"><strong>Your Total</strong><br><span style="font-size:11px; color:var(--gray-400);">One-time investment \u00b7 Inc. GST</span></div>
        <div style="display:flex; align-items:baseline; gap:12px;">
          <span class="discount-original" id="originalPrice" style="display:none;"></span>
          <div class="total-bar-amount" id="totalAmount">${formatCurrency(isConfirmed ? confirmedTotal : basePrice)}</div>
        </div>
      </div>
    </div>
    <div id="monthlyTotalBar" class="total-bar" style="display:none; margin-top:8px; background:var(--cyan-bg); border:1px solid var(--cyan); border-radius:10px;">
      <div class="total-bar-left"><strong style="color:var(--cyan-dark);">Monthly</strong><br><span style="font-size:11px; color:var(--gray-400);">Recurring monthly \u00b7 Inc. GST</span></div>
      <div style="text-align:right;">
        <div class="total-bar-amount" id="monthlyTotalAmount" style="color:var(--cyan-dark);"></div>
      </div>
    </div>
    `}
  </div>
  <div class="cta-section">
    ${isTechView ? `
    <div style="font-size:12px; color:var(--gray-400); padding:10px 0;">${brand.installReferenceText}</div>
    ` : isConfirmed ? `
    <div class="confirmed-banner">
      <h3>\u2713 Proposal Accepted</h3>
      <p>${f['Accepted At'] ? 'Accepted on ' + new Date(f['Accepted At']).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'This proposal has been accepted'}</p>
    </div>
    ` : proposalPaused ? `
    <button class="cta-button" disabled style="opacity:0.5;cursor:not-allowed;">Proposal Unavailable</button>
    <div class="cta-sub" style="color:var(--red);font-weight:600;">This proposal is currently being updated. Please contact us at ${brand.phone} if you have any questions.</div>
    ` : `
    <button class="cta-button" id="acceptBtn" onclick="acceptAndPay()">Accept Proposal &amp; Secure My Booking \u2192</button>
    <div class="cta-sub">
      By clicking above you agree to the <a href="${brand.termsUrl}" target="_blank">Terms &amp; Conditions</a>
      and the Clarifications &amp; Exclusions outlined in this proposal.<br>
      Pricing includes GST. Quotation valid for 30 days.
    </div>
    `}
  </div>
  ${pgFooter}
</div>

<!-- ==================== CLARIFICATIONS ==================== -->
<div class="page bg-gradient" data-section="clarifications">
  ${pgHeader}
  <div class="pg-body">
    <div class="sec-title">Clarifications &amp; Exclusions</div>
    <div class="sec-title-accent"></div>
    <table class="clar-table">${clarificationRows}</table>
  </div>
  ${pgFooter}
</div>

<script>
  const IS_CONFIRMED = ${isConfirmed};
  const IS_TECH_VIEW = ${isTechView};
  let selectedBasePrice = ${basePrice};
  const BASE_QTY_ENABLED = ${baseQtyEnabled};
  const BASE_UNIT_PRICE = ${basePrice};
  const BASE_MAX_QTY = ${baseMaxQty};
  let currentBaseQty = 1;
  const PROJECT_NUMBER = '${escapeHtml(projectNumber)}';
  const PDF_PREFIX = '${escapeHtml(brand.pdfPrefix)}';
  let discountableUpgradeTotal = 0;
  let nonDiscountableUpgradeTotal = 0;
  let monthlyUpgradeTotal = 0;
  let bundleSavingTotal = 0;
  const DISCOUNT_TYPE = '${escapeHtml(discountType)}';
  const DISCOUNT_VALUE = ${Number(discountValue) || 0};
  const DISCOUNT_NAME = '${escapeHtml(discountName)}';
  const DISCOUNT_EXPIRED = ${discountExpired};
  const DISCOUNT_EXPIRES = '${escapeHtml(discountExpires)}';

  function getTotal() {
    return selectedBasePrice + discountableUpgradeTotal + nonDiscountableUpgradeTotal;
  }

  function applyDiscount(discountableSubtotal) {
    if (!DISCOUNT_TYPE || DISCOUNT_VALUE <= 0 || DISCOUNT_EXPIRED) return 0;
    if (DISCOUNT_TYPE === 'percentage') return Math.round(discountableSubtotal * DISCOUNT_VALUE / 100);
    if (DISCOUNT_TYPE === 'fixed') return Math.min(DISCOUNT_VALUE, discountableSubtotal);
    return 0;
  }

  function updateTotalDisplay() {
    const fullSubtotal = selectedBasePrice + discountableUpgradeTotal + nonDiscountableUpgradeTotal + bundleSavingTotal;
    const discountableSubtotal = selectedBasePrice + discountableUpgradeTotal;
    const discountAmt = applyDiscount(discountableSubtotal);
    const finalTotal = Math.max(selectedBasePrice + discountableUpgradeTotal + nonDiscountableUpgradeTotal - discountAmt, 0);
    const totalSaving = bundleSavingTotal + discountAmt;
    const hasSavings = totalSaving > 0;

    // Slashed original price (left of final total)
    const origPriceEl = document.getElementById('originalPrice');
    if (origPriceEl) {
      if (hasSavings) {
        origPriceEl.textContent = '$' + fullSubtotal.toLocaleString('en-AU');
        origPriceEl.style.display = '';
      } else { origPriceEl.style.display = 'none'; }
    }

    // Savings section (hero)
    const savingsSection = document.getElementById('savingsSection');
    if (savingsSection) {
      if (hasSavings) {
        savingsSection.style.display = 'block';
        document.getElementById('totalSavingAmt').textContent = '$' + totalSaving.toLocaleString('en-AU');
        const bundleLine = document.getElementById('bundleSavingLine');
        if (bundleSavingTotal > 0) {
          bundleLine.style.display = 'flex';
          document.getElementById('bundleSavingAmt').textContent = '-$' + bundleSavingTotal.toLocaleString('en-AU');
        } else { bundleLine.style.display = 'none'; }
        const earlyLine = document.getElementById('earlyBirdLine');
        if (discountAmt > 0) {
          earlyLine.style.display = 'flex';
          const lbl = DISCOUNT_NAME || (DISCOUNT_TYPE === 'percentage' ? DISCOUNT_VALUE + '% off' : '$' + DISCOUNT_VALUE.toLocaleString('en-AU') + ' off');
          document.getElementById('earlyBirdLabel').textContent = '\u26a1 ' + lbl;
          document.getElementById('earlyBirdAmt').textContent = '-$' + discountAmt.toLocaleString('en-AU');
          const expiryEl = document.getElementById('discountExpiry');
          if (expiryEl) {
            if (DISCOUNT_EXPIRES) {
              const d = new Date(DISCOUNT_EXPIRES + 'T00:00:00');
              expiryEl.textContent = ' \u2014 Offer ends ' + d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
              expiryEl.style.display = 'inline';
            } else { expiryEl.style.display = 'none'; }
          }
        } else {
          earlyLine.style.display = 'none';
          const expiryEl = document.getElementById('discountExpiry');
          if (expiryEl) expiryEl.style.display = 'none';
        }
      } else { savingsSection.style.display = 'none'; }
    }

    // Add divider above total row only when savings section is visible
    const totalRow = document.getElementById('totalRow');
    if (totalRow) {
      totalRow.style.borderTop = hasSavings ? '1px solid var(--gray-100)' : 'none';
    }

    var totalEl = document.getElementById('totalAmount');
    if (totalEl) totalEl.textContent = '$' + finalTotal.toLocaleString('en-AU');
    var monthlyBar = document.getElementById('monthlyTotalBar');
    var monthlyEl = document.getElementById('monthlyTotalAmount');
    if (monthlyBar && monthlyEl) {
      if (monthlyUpgradeTotal > 0) {
        monthlyBar.style.display = 'flex';
        monthlyEl.textContent = '$' + monthlyUpgradeTotal.toLocaleString('en-AU') + '/mo';
      } else {
        monthlyBar.style.display = 'none';
      }
    }
    var acceptEl = document.getElementById('acceptBtn');
    if (acceptEl) acceptEl.textContent = 'Accept Proposal & Secure My Booking \u2192';
  }

  function selectPackage(card, price) {
    if (IS_CONFIRMED || IS_TECH_VIEW) return;
    document.querySelectorAll('.og-radio-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedBasePrice = price;
    updateTotalDisplay();
  }

  function toggleUpgrade(card, price, discountable, monthly, bundleSaving) {
    if (IS_CONFIRMED || IS_TECH_VIEW) return;
    card.classList.toggle('selected');
    const isSelected = card.classList.contains('selected');
    const sign = isSelected ? 1 : -1;
    const saving = Number(bundleSaving) || 0;
    const effectivePrice = price - saving;
    if (monthly) {
      monthlyUpgradeTotal += sign * price; // monthly items: no bundle saving applied
    } else if (discountable) {
      discountableUpgradeTotal += sign * effectivePrice;
    } else {
      nonDiscountableUpgradeTotal += sign * effectivePrice;
    }
    bundleSavingTotal += sign * saving;
    updateTotalDisplay();
    updateSupplyCtaSteps();
  }

  function qtyChange(card, delta, unitPrice, discountable, monthly, bundleSaving, maxQty, rawVal) {
    if (IS_CONFIRMED || IS_TECH_VIEW) return;
    const input = card.querySelector('.upgrade-qty-input');
    const prevQty = parseInt(card.dataset.qty || 0);
    let newQty;
    if (rawVal !== undefined) {
      newQty = Math.max(0, Math.min(parseInt(rawVal) || 0, maxQty || 10));
      input.value = newQty;
    } else {
      newQty = Math.max(0, Math.min(prevQty + delta, maxQty || 10));
      input.value = newQty;
    }
    card.dataset.qty = newQty;
    card.dataset.price = newQty * unitPrice;
    card.classList.toggle('selected', newQty > 0);
    const priceEl = card.querySelector('.upgrade-price');
    if (priceEl) {
      const suffix = monthly ? '<span class="upgrade-monthly-badge">/mo</span>' : '';
      priceEl.innerHTML = '+$' + (newQty * unitPrice).toLocaleString('en-AU') + suffix;
    }
    const diff = newQty - prevQty;
    const saving = Number(bundleSaving) || 0;
    const effectiveUnit = unitPrice - saving;
    if (monthly) monthlyUpgradeTotal += diff * unitPrice;
    else if (discountable) discountableUpgradeTotal += diff * effectiveUnit;
    else nonDiscountableUpgradeTotal += diff * effectiveUnit;
    bundleSavingTotal += diff * saving;
    updateTotalDisplay();
  }

  function changeBaseQty(delta) {
    if (IS_CONFIRMED || IS_TECH_VIEW || !BASE_QTY_ENABLED) return;
    currentBaseQty = Math.max(1, Math.min(currentBaseQty + delta, BASE_MAX_QTY));
    document.getElementById('baseQtyDisplay').textContent = currentBaseQty;
    var basePriceEl = document.getElementById('basePriceDisplay');
    if (basePriceEl) basePriceEl.textContent = '$' + (BASE_UNIT_PRICE * currentBaseQty).toLocaleString('en-AU');
    selectedBasePrice = BASE_UNIT_PRICE * currentBaseQty;
    updateTotalDisplay();
    // Auto-sync all qty-enabled upgrade cards to match pole count
    document.querySelectorAll('.upgrade-card[data-qty-enabled="true"]').forEach(function(card) {
      var unitPrice = parseFloat(card.dataset.unitPrice) || 0;
      var discountable = card.dataset.discountable !== 'false';
      var monthly = card.dataset.monthly === 'true';
      var bundleSaving = parseFloat(card.dataset.bundle) || 0;
      var maxQty = parseInt(card.dataset.maxQty) || 10;
      qtyChange(card, 0, unitPrice, discountable, monthly, bundleSaving, maxQty, currentBaseQty);
    });
  }

  function updateSupplyCtaSteps() {
    var titleEl = document.getElementById('cta-step3-title');
    if (!titleEl) return; // not a supply proposal
    var hasInstall = false;
    document.querySelectorAll('.upgrade-card.selected').forEach(function(card) {
      if (card.dataset.install === 'true') hasInstall = true;
    });
    var bodyEl = document.getElementById('cta-step3-body');
    var letterEl = document.getElementById('supply-letter-cta');
    if (hasInstall) {
      titleEl.textContent = 'We Install';
      if (bodyEl) bodyEl.textContent = 'Licensed technician installs, tests & walks you through everything';
      if (letterEl) letterEl.textContent = 'Alternatively, please accept the proposal below and we will prepare your equipment and schedule one of our licensed technicians for a prompt installation.';
    } else {
      titleEl.textContent = 'Collect or Deliver';
      if (bodyEl) bodyEl.textContent = 'Pick up from us or we arrange delivery (charges apply)';
      if (letterEl) letterEl.textContent = 'Alternatively, please accept the proposal below and we will prepare your equipment order, ready for collection or delivery (delivery charges apply separately).';
    }
  }
  updateSupplyCtaSteps();

  function acceptAndPay() {
    if (IS_CONFIRMED || IS_TECH_VIEW) return;
    const btn = document.getElementById('acceptBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const selectedUpgrades = [];
    document.querySelectorAll('.upgrade-card.selected').forEach(card => {
      const name = card.querySelector('h4').textContent;
      const price = parseFloat(card.dataset.price) || 0;
      const monthly = card.dataset.monthly === 'true';
      const qty = card.dataset.qtyEnabled === 'true' ? (parseInt(card.dataset.qty) || 1) : 1;
      selectedUpgrades.push({ name, price, monthly, qty });
    });
    const selectedPkgEl = document.querySelector('.og-radio-card.selected');
    const selectedPkg = selectedPkgEl ? {
      name: selectedPkgEl.querySelector('h4').textContent,
      price: parseFloat(selectedPkgEl.dataset.price) || 0
    } : null;

    fetch('/api/proposals/' + PROJECT_NUMBER + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedUpgrades, selectedPackage: selectedPkg, total: getTotal(), baseQty: currentBaseQty })
    })
    .then(r => r.json())
    .then(data => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else {
        alert(data.error || 'Something went wrong');
        btn.disabled = false;
        btn.textContent = 'Accept Proposal & Secure My Booking \u2192';
      }
    })
    .catch(() => {
      alert('Connection error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Accept Proposal & Secure My Booking \u2192';
    });
  }

  // Initialize totals for pre-selected upgrades (defaultSelected)
  if (!IS_CONFIRMED && !IS_TECH_VIEW) {
    document.querySelectorAll('.upgrade-card.selected').forEach(card => {
      // Ensure data-qty is set for qty cards
      if (card.dataset.qtyEnabled === 'true' && !card.dataset.qty) {
        card.dataset.qty = card.querySelector('.upgrade-qty-input')?.value || 1;
      }
      const price = parseFloat(card.dataset.price) || 0;
      const discountable = card.dataset.discountable !== 'false';
      const monthly = card.dataset.monthly === 'true';
      const bundle = parseFloat(card.dataset.bundle) || 0;
      const effectivePrice = price - bundle;
      if (monthly) monthlyUpgradeTotal += price;
      else if (discountable) discountableUpgradeTotal += effectivePrice;
      else nonDiscountableUpgradeTotal += effectivePrice;
      bundleSavingTotal += bundle;
    });
  }

  // Set initial total including default option group selections
  if (!IS_CONFIRMED && !IS_TECH_VIEW) updateTotalDisplay();

  // Track view (skip for tech/install views)
  if (!IS_TECH_VIEW) {
    fetch('/api/proposals/' + PROJECT_NUMBER + '/track-view', { method: 'POST' }).catch(() => {});
  }
</script>

<button class="pdf-btn" onclick="downloadPDF()" title="Download PDF" style="position:fixed;top:20px;right:20px;z-index:9999;background:var(--navy);color:var(--cyan);border:2px solid var(--cyan);padding:10px 20px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.2s ease;" onmouseover="this.style.background='var(--cyan)';this.style.color='var(--navy)'" onmouseout="this.style.background='var(--navy)';this.style.color='var(--cyan)'">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  Download PDF
</button>
<script>
async function downloadPDF() {
  const btn = document.querySelector('.pdf-btn');
  const origText = btn.innerHTML;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Generating...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pages = document.querySelectorAll('.cover-page, .page');
    const pdfW = 210, pdfH = 297;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        width: page.offsetWidth,
        height: page.offsetHeight
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
    }

    pdf.save(PDF_PREFIX + ' — Proposal #' + PROJECT_NUMBER + '.pdf');
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('PDF generation failed. Please try again.');
  }

  btn.innerHTML = origText;
  btn.disabled = false;
  btn.style.opacity = '1';
}
</script>

<script>
// ── Proposal Analytics (skip for tech/install views) ──
if (IS_TECH_VIEW) { /* no analytics */ } else
(function() {
  var PN = '${escapeHtml(projectNumber)}';
  var SID = 'S' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  var activeTime = 0, scrollDepth = 0, ctaClicks = 0, active = true, lastTick = Date.now();
  var sectionTimes = {};
  var interactions = [];
  var printAttempts = 0;

  // Track active time (pause when tab hidden)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) { activeTime += (Date.now() - lastTick) / 1000; active = false; }
    else { lastTick = Date.now(); active = true; }
  });
  setInterval(function() { if (active) { activeTime += (Date.now() - lastTick) / 1000; lastTick = Date.now(); } }, 1000);

  // Track scroll depth
  window.addEventListener('scroll', function() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 0) scrollDepth = Math.max(scrollDepth, Math.round((window.scrollY / h) * 100));
  }, { passive: true });

  // Track time per section via IntersectionObserver
  var pages = document.querySelectorAll('.page');
  var visibleSections = {};
  if (pages.length && window.IntersectionObserver) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        var id = e.target.getAttribute('data-section') || ('section-' + Array.from(pages).indexOf(e.target));
        if (e.isIntersecting) { visibleSections[id] = Date.now(); }
        else if (visibleSections[id]) {
          sectionTimes[id] = (sectionTimes[id] || 0) + (Date.now() - visibleSections[id]) / 1000;
          delete visibleSections[id];
        }
      });
    }, { threshold: 0.3 });
    pages.forEach(function(p) { obs.observe(p); });
  }

  // Track CTA clicks
  document.addEventListener('click', function(e) {
    if (e.target.closest && e.target.closest('[onclick*="checkout"], .accept-btn, [data-cta]')) ctaClicks++;
  });

  // Track package and option interactions (ordered log)
  document.addEventListener('click', function(e) {
    var pkgCard = e.target.closest && e.target.closest('.og-radio-card');
    if (pkgCard) {
      var name = pkgCard.querySelector('h4') ? pkgCard.querySelector('h4').textContent.trim() : '';
      interactions.push({ t: Math.round(Date.now() / 1000), type: 'package', name: name });
      return;
    }
    var optCard = e.target.closest && e.target.closest('.upgrade-card');
    if (optCard) {
      var optName = optCard.querySelector('h4') ? optCard.querySelector('h4').textContent.trim() : '';
      // selected state flips after this click, so current class = pre-click state
      var willSelect = !optCard.classList.contains('selected');
      interactions.push({ t: Math.round(Date.now() / 1000), type: 'option', name: optName, selected: willSelect });
    }
  });

  // Track print / save-as attempts
  window.addEventListener('beforeprint', function() { printAttempts++; });
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's')) { printAttempts++; }
  });

  function flushSections() {
    var now = Date.now();
    Object.keys(visibleSections).forEach(function(id) {
      sectionTimes[id] = (sectionTimes[id] || 0) + (now - visibleSections[id]) / 1000;
      visibleSections[id] = now;
    });
  }

  function getPayload() {
    flushSections();
    return JSON.stringify({ sessionId: SID, activeTime: Math.round(activeTime), scrollDepth: scrollDepth, sectionTimes: sectionTimes, ctaClicks: ctaClicks, interactions: interactions, printAttempts: printAttempts });
  }

  // Heartbeat every 30s
  setInterval(function() {
    fetch('/api/proposals/' + PN + '/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: getPayload() }).catch(function(){});
  }, 30000);

  // Final beacon on page close
  window.addEventListener('beforeunload', function() {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/proposals/' + PN + '/analytics', new Blob([getPayload()], { type: 'application/json' }));
    }
  });

  // Send initial ping after 5s
  setTimeout(function() {
    fetch('/api/proposals/' + PN + '/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: getPayload() }).catch(function(){});
  }, 5000);
})();
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
    // Skip for logged-in admin/VA
    if (req.session && req.session.authenticated) return res.json({ ok: true });

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

// ─── PUBLIC: Analytics Heartbeat ──────────────────────────────

exports.analyticsHeartbeat = async (req, res) => {
  try {
    // Skip analytics for logged-in admin/VA
    if (req.session && req.session.authenticated) return res.json({ ok: true });

    const { projectNumber } = req.params;
    const { sessionId, activeTime, scrollDepth, sectionTimes, ctaClicks, interactions, printAttempts } = req.body;

    if (!sessionId) return res.json({ ok: true });

    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);
    if (!proposal) return res.json({ ok: true });

    const f = proposal.fields;
    let sessions = [];
    try { sessions = JSON.parse(f['Analytics'] || '[]'); } catch { sessions = []; }

    // Upsert session
    const idx = sessions.findIndex(s => s.id === sessionId);
    const sessionData = {
      id: sessionId,
      activeTime: activeTime || 0,
      scrollDepth: scrollDepth || 0,
      sectionTimes: sectionTimes || {},
      ctaClicks: ctaClicks || 0,
      interactions: interactions || [],
      printAttempts: printAttempts || 0,
      lastUpdate: new Date().toISOString(),
    };
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], ...sessionData };
    } else {
      sessionData.startedAt = new Date().toISOString();
      // Capture device/browser/location from first heartbeat
      const ua = req.headers['user-agent'] || '';
      sessionData.device = parseDevice(ua);
      sessionData.browser = parseBrowser(ua);
      const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
      const loc = await getIpLocation(ip);
      if (loc) sessionData.location = loc;
      sessions.push(sessionData);
    }

    // Recalculate aggregates
    const totalTime = sessions.reduce((sum, s) => sum + (s.activeTime || 0), 0);
    const maxScroll = Math.max(...sessions.map(s => s.scrollDepth || 0), 0);
    const totalCta = sessions.reduce((sum, s) => sum + (s.ctaClicks || 0), 0);
    const viewCount = f['View Count'] || 0;
    const engScore = calcEngagementScore(viewCount, totalTime, maxScroll, totalCta);

    await airtableService.updateProposal(proposal.id, {
      'Analytics': JSON.stringify(sessions),
      'Total View Time': Math.round(totalTime),
      'Max Scroll Depth': Math.round(maxScroll),
      'Engagement Score': engScore,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving analytics:', error);
    res.json({ ok: true });
  }
};

// ─── PUBLIC: Create Proposal Checkout ─────────────────────────

exports.createProposalCheckout = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const { selectedUpgrades, selectedPackage } = req.body;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.fields['Paused']) {
      const pb = getBrandConfig(proposal.fields['Brand']);
      return res.status(403).json({ error: `This proposal is currently unavailable. Please contact us at ${pb.phone}.` });
    }

    const f = proposal.fields;
    const basePrice = f['Base Price'] || 0;
    const packageName = f['Package Name'] || 'Security System Installation';
    const optionGroups = safeJsonParse(f['Option Groups']);
    const cameraOptions = safeJsonParse(f['Camera Options']);

    // Read discount fields
    const discountType = f['Discount Type'] || '';
    const discountValue = f['Discount Value'] || 0;
    const discountName = f['Discount Name'] || '';
    const discountExpires = f['Discount Expires'] || '';
    const discountExpired = discountExpires ? new Date(discountExpires + 'T23:59:59') < new Date() : false;
    const discountActive = !!(discountType && discountValue > 0 && !discountExpired);

    // Determine which package was selected (server-side price lookup)
    let selectedPrice = basePrice;
    let selectedName = packageName;
    if (selectedPackage && selectedPackage.name && optionGroups.length > 0) {
      // Build full list of packages (base + additional)
      const allPackages = [
        { name: packageName, price: basePrice },
        ...optionGroups
      ];
      const match = allPackages.find(p => p.name === selectedPackage.name);
      if (match) {
        selectedPrice = Number(match.price) || basePrice;
        selectedName = match.name;
      }
    }

    // Apply base qty multiplier (validated server-side)
    const baseQtyEnabledSvr = !!(f['Base Qty Enabled']);
    const baseMaxQtySvr = Number(f['Base Max Qty']) || 10;
    const baseQty = baseQtyEnabledSvr ? Math.max(1, Math.min(parseInt(req.body.baseQty) || 1, baseMaxQtySvr)) : 1;
    selectedPrice = selectedPrice * baseQty;

    // Server-side total calculation (never trust client amount)
    // Split upgrades into discountable, non-discountable, and monthly (recurring)
    let discountableTotal = selectedPrice;
    let nonDiscountableTotal = 0;
    const selectedMonthlyUpgrades = [];
    if (Array.isArray(selectedUpgrades)) {
      for (const upgrade of selectedUpgrades) {
        const match = cameraOptions.find(opt => opt.name === upgrade.name);
        if (match && match.price) {
          const bundleSav = Number(match.bundleSaving) || 0;
          const qty = match.qtyEnabled
            ? Math.max(1, Math.min(parseInt(upgrade.qty) || 1, match.maxQty || 10))
            : 1;
          const effectivePrice = (Number(match.price) - bundleSav) * qty;
          if (match.monthly) {
            // Monthly items are charged as subscriptions after checkout, not in the one-time total
            selectedMonthlyUpgrades.push({ name: match.name, price: Number(match.price), qty });
          } else if (match.discountable === false) {
            nonDiscountableTotal += effectivePrice;
          } else {
            discountableTotal += effectivePrice;
          }
        }
      }
    }

    // Apply discount server-side (only to discountable items)
    let discountAmount = 0;
    let checkoutDesc = selectedName;
    if (discountActive) {
      if (discountType === 'percentage') {
        discountAmount = Math.round(discountableTotal * discountValue / 100);
      } else if (discountType === 'fixed') {
        discountAmount = Math.min(discountValue, discountableTotal);
      }
      discountableTotal = Math.max(discountableTotal - discountAmount, 0);
      const label = discountName || (discountType === 'percentage' ? `${discountValue}% off` : `$${discountValue} off`);
      checkoutDesc = `${selectedName} (${label}: -$${discountAmount.toLocaleString('en-AU')})`;
    }

    const total = discountableTotal + nonDiscountableTotal;
    if (total <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripeService.createProposalCheckoutSession({
      projectNumber,
      proposalId: proposal.id,
      amount: total,
      customerName: f['Client Name'] || 'Customer',
      description: checkoutDesc,
      successUrl: `${baseUrl}/offers/${projectNumber}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/proposals/${projectNumber}`,
    });

    // Build list of selected options with server-verified prices (including monthly flag)
    const selectedOptionsList = [];
    if (baseQtyEnabledSvr && baseQty > 1) {
      selectedOptionsList.push({ name: '__base__', qty: baseQty });
    }
    if (Array.isArray(selectedUpgrades)) {
      for (const upgrade of selectedUpgrades) {
        const match = cameraOptions.find(opt => opt.name === upgrade.name);
        if (match) {
          const qty = match.qtyEnabled
            ? Math.max(1, Math.min(parseInt(upgrade.qty) || 1, match.maxQty || 10))
            : 1;
          const item = { name: match.name, price: Number(match.price), qty };
          if (match.monthly) item.monthly = true;
          selectedOptionsList.push(item);
        }
      }
    }

    // Update proposal status and save what the customer selected
    await airtableService.updateProposal(proposal.id, {
      Status: 'Accepted',
      'Accepted At': new Date().toISOString(),
      'Stripe Session ID': session.id,
      'Selected Package': `${selectedName} — $${selectedPrice.toLocaleString('en-AU')}`,
      'Selected Options': selectedOptionsList.length > 0
        ? JSON.stringify(selectedOptionsList)
        : '',
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
    const brand = getBrandConfig(f['Our Business Name']);
    const clientName = f['Client Name'] || '';
    const firstName = getFirstNames(clientName);

    // Read OTO items from JSON field (with fallback to old fields)
    let otoItems = safeJsonParse(f['OTO Items']);
    if (otoItems.length > 0) {
      // New format
      otoItems = otoItems.filter(it => it.price > 0).map((it, i) => ({
        key: String(i),
        name: it.name,
        desc: it.description || '',
        price: it.price,
        wasPrice: it.wasPrice || 0,
        saving: (it.wasPrice && it.wasPrice > it.price) ? it.wasPrice - it.price : 0,
        monthly: !!it.monthly,
      }));
    } else {
      // Fallback to old fixed fields
      const bundlePrice = f['OTO Bundle Price'] || 0;
      const alarmPrice = f['OTO Alarm Price'] || 0;
      const alarmWasPrice = f['OTO Alarm Was Price'] || 0;
      const upsPrice = f['OTO UPS Price'] || 0;
      const upsWasPrice = f['OTO UPS Was Price'] || 0;
      const carePrice = f['OTO Care Monthly Price'] || 0;
      otoItems = [];
      if (bundlePrice > 0) {
        const bundleWas = alarmPrice + upsPrice;
        otoItems.push({ key: 'bundle', name: 'Complete Protection Bundle', desc: 'Alarm monitoring + UPS battery backup bundled together.', price: bundlePrice, wasPrice: bundleWas, saving: bundleWas > bundlePrice ? bundleWas - bundlePrice : 0, monthly: false });
      } else {
        if (alarmPrice > 0) otoItems.push({ key: 'alarm', name: '24/7 Alarm Monitoring', desc: 'Professional monitoring station with instant emergency dispatch.', price: alarmPrice, wasPrice: alarmWasPrice, saving: alarmWasPrice > alarmPrice ? alarmWasPrice - alarmPrice : 0, monthly: false });
        if (upsPrice > 0) otoItems.push({ key: 'ups', name: 'UPS Battery Backup', desc: 'Keeps your system recording during power outages for hours.', price: upsPrice, wasPrice: upsWasPrice, saving: upsWasPrice > upsPrice ? upsWasPrice - upsPrice : 0, monthly: false });
      }
      if (carePrice > 0) otoItems.push({ key: 'care', name: 'After Install Support Package', desc: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: carePrice, wasPrice: 0, saving: 0, monthly: true });
    }

    // If session_id is present, retrieve customer & payment method and save to Airtable
    // (must happen before hasAnyOto check so monthly upgrade subscriptions get created)
    const sessionId = req.query.session_id;
    let hasCard = !!(f['Stripe Customer ID'] && f['Stripe Payment Method ID']);
    let savedCustomerId = f['Stripe Customer ID'] || null;
    let savedPaymentMethodId = f['Stripe Payment Method ID'] || null;

    if (sessionId && !hasCard) {
      try {
        const session = await stripeService.getCheckoutSession(sessionId);
        if (session.customer && session.payment_intent?.payment_method) {
          savedCustomerId = session.customer;
          savedPaymentMethodId = typeof session.payment_intent.payment_method === 'object'
            ? session.payment_intent.payment_method.id
            : session.payment_intent.payment_method;
          await airtableService.updateProposal(proposal.id, {
            'Stripe Customer ID': savedCustomerId,
            'Stripe Payment Method ID': savedPaymentMethodId,
          });
          hasCard = true;
        }
      } catch (e) {
        console.error('Could not retrieve session for card-on-file:', e.message);
      }
    }

    // Create subscriptions for any monthly upgrades selected on the proposal (once only)
    if (sessionId && savedCustomerId && savedPaymentMethodId && !f['Monthly Subs Created']) {
      const selectedOptions = safeJsonParse(f['Selected Options']);
      const monthlyOptions = selectedOptions.filter(opt => opt.monthly);
      if (monthlyOptions.length > 0) {
        // Set flag FIRST to prevent duplicates if page is refreshed mid-creation
        await airtableService.updateProposal(proposal.id, { 'Monthly Subs Created': true });
        for (const item of monthlyOptions) {
          try {
            const qty = item.qty || 1;
            await stripeService.createOffSessionSubscription({
              customerId: savedCustomerId,
              paymentMethodId: savedPaymentMethodId,
              amount: item.price * qty,
              productName: qty > 1 ? `${item.name} ×${qty}` : item.name,
              metadata: {
                type: 'proposal',
                product_name: item.name,
                project_number: projectNumber,
                proposal_id: proposal.id,
                qty: String(qty),
              },
            });
            console.log(`✓ Created monthly subscription for "${item.name}" ×${qty} — $${item.price * qty}/mo`);
          } catch (subErr) {
            console.error(`Error creating subscription for "${item.name}":`, subErr.message);
          }
        }
      }
    }

    const hasAnyOto = otoItems.length > 0;

    if (!hasAnyOto) {
      return res.redirect(`/offers/${projectNumber}/thank-you`);
    }

    const otoItemsJson = JSON.stringify(otoItems);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exclusive Offer - ${escapeHtml(brand.companyName)}</title>
  <link href="${brand.googleFontsUrl}" rel="stylesheet">
  <style>
    :root {
      ${brand.cssVars}
      --red-bright: #dc2626;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${brand.bodyFont}; color: var(--gray-800);
      background: var(--white); min-height: 100vh; line-height: 1.7; font-size: 14px;
      -webkit-font-smoothing: antialiased;
    }

    /* ===== PAGE SHELL ===== */
    .page {
      max-width: 100%; margin: 0 auto; background: var(--white);
      overflow: hidden; display: flex; flex-direction: column; min-height: 100vh;
    }
    /* ===== HERO (matches thank-you page) ===== */
    .oto-hero {
      background: var(--navy); text-align: center; padding: 50px 30px 44px;
      position: relative; overflow: hidden;
    }
    .oto-hero::before {
      content: ''; position: absolute; top: -40%; right: -10%; width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(120,228,255,0.06) 0%, transparent 70%);
    }
    .oto-hero img { max-width: 180px; margin-bottom: 28px; position: relative; z-index: 1; }
    .oto-hero .check {
      width: 72px; height: 72px; background: var(--green);
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      margin: 0 auto 22px; font-size: 36px; color: white;
      box-shadow: 0 4px 20px rgba(34,197,94,0.3);
      position: relative; z-index: 1;
    }
    .oto-hero h1 {
      font-family: ${brand.headingFont}; font-size: 36px; font-weight: 900;
      color: var(--white); margin-bottom: 10px; position: relative; z-index: 1;
    }
    .oto-hero .hero-sub {
      color: rgba(255,255,255,0.55); font-size: 16px; line-height: 1.7;
      max-width: 500px; margin: 0 auto; position: relative; z-index: 1;
    }

    /* ===== WAIT / INTERRUPT ===== */
    .wait-section {
      text-align: center; padding: 32px 30px 24px;
      border-bottom: 1px solid var(--gray-100);
    }
    .wait-text {
      font-family: ${brand.headingFont}; font-size: 42px; font-weight: 900;
      color: var(--red-bright); margin-bottom: 8px; line-height: 1.1;
    }
    .wait-sub {
      font-size: 15px; color: var(--gray-600); max-width: 480px;
      margin: 0 auto; line-height: 1.7;
    }
    .wait-timer {
      display: inline-flex; align-items: center; gap: 8px;
      margin-top: 14px; font-size: 13px; font-weight: 700; color: var(--gray-400);
    }
    .wait-timer .timer {
      display: inline-block; background: var(--navy); color: var(--cyan);
      padding: 4px 12px; border-radius: 6px; font-weight: 800;
      font-variant-numeric: tabular-nums; font-size: 14px; letter-spacing: 0.5px;
    }

    /* ===== BODY ===== */
    .pg-body { padding: 40px 50px; max-width: 680px; margin: 0 auto; width: 100%; }

    .sec-title {
      font-family: ${brand.headingFont}; font-size: 30px; font-weight: 800;
      color: var(--navy); margin-bottom: 6px; line-height: 1.15;
    }
    .sec-title-accent { width: 50px; height: 3px; background: var(--cyan); margin-bottom: 20px; }

    .eyebrow {
      font-size: 13px; font-weight: 800; text-transform: uppercase;
      letter-spacing: 2.5px; color: var(--red-bright); margin-bottom: 14px;
    }

    .oto-subtitle {
      font-size: 13.5px; color: var(--gray-600); line-height: 1.75; margin-bottom: 24px;
    }

    /* ===== SECTION LABEL (matches proposal) ===== */
    .section-label {
      font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 4px;
    }
    .section-label span { font-weight: 400; color: var(--gray-400); font-size: 12px; margin-left: 6px; }
    .section-divider { height: 1px; background: var(--gray-100); margin-bottom: 12px; }

    /* ===== UPGRADE CARDS (matches proposal exactly) ===== */
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
    .upgrade-card.selected .upgrade-check {
      background: var(--cyan-mid); border-color: var(--cyan-mid); color: var(--white);
    }
    .upgrade-info { flex: 1; }
    .upgrade-info h4 { font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 2px; }
    .upgrade-info p { font-size: 11.5px; color: var(--gray-400); line-height: 1.4; margin: 0; }
    .upgrade-right { text-align: right; flex-shrink: 0; margin-top: 1px; }
    .upgrade-price { font-size: 16px; font-weight: 800; color: var(--navy); white-space: nowrap; }
    .upgrade-was { font-size: 11px; color: var(--gray-400); text-decoration: line-through; }
    .upgrade-save {
      display: inline-block; background: rgba(224,82,82,0.1); color: var(--red);
      font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-top: 2px;
    }
    .upgrade-per { font-size: 14px; color: var(--gray-600); font-weight: 600; }

    /* ===== TOTAL BAR (matches proposal) ===== */
    .total-bar {
      background: linear-gradient(135deg, var(--cyan-bg) 0%, #f0f7fc 100%);
      border: 2px solid var(--cyan-mid); border-radius: 10px;
      padding: 16px 20px; margin-top: 20px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .total-bar-left {}
    .total-bar-label { font-size: 13px; font-weight: 700; color: var(--navy); }
    .total-bar-sub { font-size: 11px; color: var(--gray-400); margin-top: 1px; }
    .total-bar-amount {
      font-family: ${brand.headingFont}; font-size: 32px; font-weight: 800;
      color: var(--navy);
    }
    .total-monthly-note {
      font-family: ${brand.headingFont}; font-size: 24px; font-weight: 800;
      color: var(--navy); text-align: right; margin-top: 4px;
    }

    /* ===== CTA SECTION ===== */
    .cta-section { padding: 0 50px 10px; max-width: 680px; margin: 0 auto; width: 100%; }
    .social-proof {
      text-align: center; font-size: 11.5px; color: var(--gray-400); margin: 20px 0 12px;
    }
    .social-proof strong { color: var(--gray-600); }

    @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    @keyframes pulse { 0%,100% { box-shadow: 0 4px 20px rgba(120,228,255,0.35); } 50% { box-shadow: 0 4px 30px rgba(120,228,255,0.6); } }

    .cta-button {
      display: block; width: 100%; padding: 18px 24px; border: none; border-radius: 10px;
      font-family: ${brand.bodyFont}; font-size: 16px; font-weight: 800;
      cursor: pointer; transition: all 0.3s; text-align: center; letter-spacing: 0.3px;
      background: linear-gradient(135deg, var(--cyan-dark) 0%, var(--cyan-mid) 50%, var(--cyan-dark) 100%);
      background-size: 200% 100%; color: var(--navy);
      box-shadow: 0 4px 20px rgba(120,228,255,0.35);
      animation: pulse 2s ease-in-out infinite;
    }
    .cta-button:hover {
      transform: translateY(-2px) scale(1.01);
      box-shadow: 0 8px 35px rgba(120,228,255,0.55), 0 0 20px rgba(120,228,255,0.2);
      animation: shimmer 1.5s ease infinite; letter-spacing: 0.8px;
    }
    .cta-button:active { transform: translateY(0) scale(0.99); }
    .cta-button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; animation: none; }
    .cta-sub {
      text-align: center; font-size: 11px; color: var(--gray-400);
      margin-top: 10px; line-height: 1.6;
    }

    .skip-link {
      display: block; text-align: center; color: var(--gray-400); font-size: 11px;
      text-decoration: none; padding: 16px 15px 8px; line-height: 1.6;
    }
    .skip-link:hover { color: var(--gray-600); }

    .error-msg {
      background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b;
      padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 12px;
      text-align: center; display: none;
    }

    @media (max-width: 680px) {
      .pg-body, .cta-section { padding-left: 24px; padding-right: 24px; }
      .oto-hero { padding: 36px 20px 32px; }
      .oto-hero h1 { font-size: 28px; }
      .oto-hero img { max-width: 140px; }
      .wait-text { font-size: 32px; }
      .wait-section { padding: 24px 20px 20px; }
      .sec-title { font-size: 26px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="oto-hero">
      <img src="${brand.logoPath}" alt="${escapeHtml(brand.companyName)}">
      <div class="check">\u2713</div>
      <h1>Payment Confirmed!</h1>
      <p class="hero-sub">Your payment has been received and your installation is locked in.</p>
    </div>

    <div class="wait-section">
      <div class="wait-text">Wait \u2014 Before You Go!</div>
      <p class="wait-sub">Want more peace of mind? Most customers add these upgrades during installation \u2014 it\u2019s significantly cheaper than adding them later.</p>
      <div class="wait-timer">
        <span>Exclusive pricing expires in</span>
        <span class="timer" id="countdown">14:59</span>
      </div>
    </div>

    <div class="pg-body">
      <div class="eyebrow">One-Time Offer</div>
      <div class="sec-title">Protect Your Investment</div>
      <div class="sec-title-accent"></div>

      <div class="section-label">Your Upgrades<span>\u2014 Pre-selected for you</span></div>
      <div class="section-divider"></div>

      <div id="oto-items"></div>

      <div class="total-bar">
        <div class="total-bar-left">
          <div class="total-bar-label">Your Total</div>
          <div class="total-bar-sub" id="total-sub">All prices inc. GST</div>
        </div>
        <div style="text-align:right;">
          <div class="total-bar-amount" id="oto-total">$0</div>
          <div class="total-monthly-note" id="monthly-note" style="display:none;"></div>
        </div>
      </div>
    </div>

    <div class="cta-section">
      <div id="error-msg" class="error-msg"></div>
      <div class="social-proof">\u2b50 <strong>87% of customers</strong> keep all upgrades selected</div>
      <button class="cta-button" id="cta-btn" onclick="confirmSelection()">Yes, Protect My Investment \u2192</button>
      <div class="cta-sub">\ud83d\udd12 All prices inc. GST. Charged securely to your card on file.</div>
      <a href="/offers/${escapeHtml(projectNumber)}/thank-you" class="skip-link">No thanks, I\u2019ll leave my system without these protections \u2192</a>
    </div>

  </div>

  <script>
    const PROJECT = '${escapeHtml(projectNumber)}';
    const HAS_CARD = ${hasCard};
    const items = ${otoItemsJson};
    const selected = {};
    items.forEach(it => selected[it.key] = true);

    function render() {
      const container = document.getElementById('oto-items');
      container.innerHTML = '';
      items.forEach((it, i) => {
        const on = selected[it.key];
        const div = document.createElement('div');
        div.className = 'upgrade-card' + (on ? ' selected' : '');
        div.onclick = function() { toggleItem(it.key); };
        let rightHtml = '<div class="upgrade-price">$' + it.price.toLocaleString();
        if (it.monthly) rightHtml += '<span class="upgrade-per">/mo</span>';
        rightHtml += '</div>';
        if (it.wasPrice > it.price) rightHtml += '<div class="upgrade-was">Was $' + it.wasPrice.toLocaleString() + '</div>';
        if (it.saving > 0) rightHtml += '<div class="upgrade-save">SAVE $' + it.saving.toLocaleString() + '</div>';
        rightHtml += '<div style="font-size:10px;color:#8b90a0;margin-top:1px;">inc. GST</div>';
        div.innerHTML = '<div class="upgrade-check">' + (on ? '\\u2713' : '') + '</div>'
          + '<div class="upgrade-info"><h4>' + it.name + '</h4><p>' + it.desc + '</p></div>'
          + '<div class="upgrade-right">' + rightHtml + '</div>';
        container.appendChild(div);
      });
      updateTotal();
    }

    function toggleItem(key) {
      selected[key] = !selected[key];
      render();
    }

    function updateTotal() {
      let oneTime = 0, monthly = 0;
      items.forEach(it => {
        if (!selected[it.key]) return;
        if (it.monthly) monthly += it.price;
        else oneTime += it.price;
      });
      const totalEl = document.getElementById('oto-total');
      const note = document.getElementById('monthly-note');
      if (oneTime > 0) {
        totalEl.textContent = '$' + oneTime.toLocaleString();
        totalEl.style.display = 'block';
      } else if (monthly > 0) {
        totalEl.style.display = 'none';
      } else {
        totalEl.textContent = '$0';
        totalEl.style.display = 'block';
      }
      if (monthly > 0) {
        note.style.display = 'block';
        note.textContent = (oneTime > 0 ? '+ ' : '') + '$' + monthly.toLocaleString() + '/mo';
      } else {
        note.style.display = 'none';
      }
      const anySelected = items.some(it => selected[it.key]);
      const btn = document.getElementById('cta-btn');
      if (anySelected) {
        btn.textContent = 'Yes, Protect My Investment \\u2192';
        btn.style.animation = 'pulse 2s ease-in-out infinite';
      } else {
        btn.textContent = 'Continue Without Extras \\u2192';
        btn.style.animation = 'none';
      }
    }

    function confirmSelection() {
      const chosen = items.filter(it => selected[it.key]).map(it => it.key);
      if (chosen.length === 0) {
        window.location.href = '/offers/' + PROJECT + '/thank-you';
        return;
      }
      const btn = document.getElementById('cta-btn');
      const errEl = document.getElementById('error-msg');
      errEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Processing...';
      btn.style.animation = 'none';

      fetch('/api/proposals/' + PROJECT + '/oto-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: chosen })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          window.location.href = '/offers/' + PROJECT + '/thank-you';
        } else if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          errEl.textContent = data.error || 'Something went wrong. Please try again.';
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Try Again \\u2192';
        }
      })
      .catch(() => {
        errEl.textContent = 'Connection error. Please try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Try Again \\u2192';
      });
    }

    // Countdown timer
    let timeLeft = 15 * 60;
    const timerEl = document.getElementById('countdown');
    setInterval(() => {
      if (timeLeft <= 0) return;
      timeLeft--;
      const m = Math.floor(timeLeft / 60);
      const s = timeLeft % 60;
      timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);

    render();
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
    const brand = getBrandConfig(proposal.fields['Brand']);
    const firstName = proposal ? getFirstNames(proposal.fields['Client Name'] || '') : 'there';
    const proposalTypeTY = proposal?.fields['Proposal Type'] || '';
    const isSupplyOnlyTY = proposalTypeTY === 'Supply Only';
    const isSupplyProgTY = proposalTypeTY === 'Supply + Programming';
    const isSupplyTY = isSupplyOnlyTY || isSupplyProgTY;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You - ${escapeHtml(brand.companyName)}</title>
  <link href="${brand.googleFontsUrl}" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${brand.bodyFont};
      background: ${brand.thankYouBg};
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
      background: ${brand.thankYouAccent};
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 25px;
      font-size: 40px;
    }
    h1 {
      font-family: ${brand.headingFont};
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
    .steps h3 { font-size: 18px; margin-bottom: 15px; color: ${brand.thankYouAccent}; }
    .steps ol { padding-left: 20px; }
    .steps li { padding: 8px 0; color: rgba(255,255,255,0.8); font-size: 14px; }
    .contact { margin-top: 30px; font-size: 14px; }
    .contact a { color: ${brand.thankYouAccent}; text-decoration: none; }
  </style>
</head>
<body>
  <div class="thank-you">
    <img src="${brand.logoPath}" alt="${escapeHtml(brand.companyName)}">
    <div class="check">&#10003;</div>
    <h1>You're All Set, ${escapeHtml(firstName)}!</h1>
    <p>Your payment has been received — we'll be in touch soon to get things moving.</p>

    <p>If you have any questions in the meantime, don't hesitate to reach out.</p>
    <div class="contact">
      <p><a href="tel:${brand.phoneLink}">${escapeHtml(brand.phone)}</a> &bull; <a href="mailto:${brand.email}">${escapeHtml(brand.email)}</a></p>
    </div>
  </div>
</body>
</html>`);
  } catch (error) {
    console.error('Error showing thank you:', error);
    res.status(500).send('Error loading page');
  }
};

// ─── PUBLIC: OTO Direct Charge ───────────────────────────────

exports.chargeOTODirect = async (req, res) => {
  try {
    const { projectNumber } = req.params;
    const { items: selectedItems } = req.body;
    const proposal = await airtableService.getProposalByProjectNumber(projectNumber);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const f = proposal.fields;
    const customerId = f['Stripe Customer ID'];
    const paymentMethodId = f['Stripe Payment Method ID'];

    // Read OTO items from JSON (with fallback to old fields)
    const allItems = safeJsonParse(f['OTO Items']);
    let validItems;

    if (allItems.length > 0) {
      // New format: selectedItems are string indices like ["0", "1"]
      validItems = (selectedItems || [])
        .map(i => { const idx = Number(i); return !isNaN(idx) ? allItems[idx] : null; })
        .filter(item => item && item.price > 0);
    } else {
      // Old format: selectedItems are keys like ['alarm', 'ups', 'care']
      const priceMap = {
        bundle: f['OTO Bundle Price'] || 0,
        alarm: f['OTO Alarm Price'] || 0,
        ups: f['OTO UPS Price'] || 0,
        care: f['OTO Care Monthly Price'] || 0,
      };
      const nameMap = {
        bundle: 'Complete Protection Bundle',
        alarm: '24/7 Alarm Monitoring',
        ups: 'UPS Battery Backup',
        care: 'After Install Support Package',
      };
      validItems = (selectedItems || [])
        .filter(key => priceMap[key] > 0)
        .map(key => ({ name: nameMap[key], price: priceMap[key], monthly: key === 'care' }));
    }

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'No valid items selected' });
    }

    const oneTimeItems = validItems.filter(it => !it.monthly);
    const recurringItems = validItems.filter(it => it.monthly);
    const oneTimeTotal = oneTimeItems.reduce((sum, it) => sum + it.price, 0);

    // If we have a saved card, charge directly
    if (customerId && paymentMethodId) {
      try {
        const results = [];

        // Charge one-time items as a single payment
        if (oneTimeTotal > 0) {
          const description = oneTimeItems.map(it => it.name).join(' + ');
          const pi = await stripeService.chargeOffSession({
            customerId,
            paymentMethodId,
            amount: oneTimeTotal,
            description: `${description} - Proposal #${projectNumber}`,
            metadata: {
              type: 'oto',
              oto_items: oneTimeItems.map(it => it.name).join(','),
              project_number: projectNumber,
              proposal_id: proposal.id,
            },
          });
          results.push({ type: 'payment', status: pi.status });
        }

        // Create subscriptions for recurring items
        for (const item of recurringItems) {
          const sub = await stripeService.createOffSessionSubscription({
            customerId,
            paymentMethodId,
            amount: item.price,
            productName: item.name,
            metadata: {
              type: 'oto',
              oto_type: 'recurring',
              product_name: item.name,
              project_number: projectNumber,
              proposal_id: proposal.id,
            },
          });
          results.push({ type: 'subscription', status: sub.status });
        }

        return res.json({ success: true, results });
      } catch (chargeError) {
        console.error('Off-session charge failed, falling back to checkout:', chargeError.message);
        // Fall through to Checkout Session fallback below
      }
    }

    // Fallback: create a Checkout Session for the first item
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const firstItem = validItems[0];
    const session = await stripeService.createOTOCheckoutSession({
      projectNumber,
      proposalId: proposal.id,
      otoType: firstItem.monthly ? 'care' : 'onetime',
      amount: firstItem.price,
      description: firstItem.name,
      successUrl: `${baseUrl}/offers/${projectNumber}/thank-you`,
      cancelUrl: `${baseUrl}/offers/${projectNumber}`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Error charging OTO:', error);
    res.status(500).json({ error: 'Failed to process upgrades. Please try again.' });
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

    // Helper: format date as "05 Mar"
    const fmtShort = (d) => {
      if (!d) return '–';
      const dt = new Date(d);
      if (isNaN(dt)) return '–';
      return dt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', timeZone: 'Australia/Perth' });
    };
    // Helper: relative time
    const timeAgo = (d) => {
      if (!d) return '–';
      const dt = new Date(d);
      if (isNaN(dt)) return '–';
      const diff = (Date.now() - dt.getTime()) / 1000;
      if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + 'm ago';
      if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
      if (diff < 604800) return Math.round(diff / 86400) + 'd ago';
      return fmtShort(d);
    };
    // Helper: format seconds as "Xm Xs"
    const fmtTime = (s) => {
      if (!s || s < 1) return '–';
      if (s < 60) return Math.round(s) + 's';
      return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
    };

    const rows = proposals.map(p => {
      const f = p.fields;
      const status = f['Status'] || 'Draft';
      const paused = !!f['Paused'];
      const statusColors = {
        Draft: '#6c757d',
        Sent: '#2196f3',
        Viewed: '#ff9800',
        Accepted: '#4caf50',
        Paid: '#00bcd4',
      };
      const color = statusColors[status] || '#6c757d';
      const viewCount = f['View Count'] || 0;
      const totalTime = f['Total View Time'] || 0;
      const maxScroll = f['Max Scroll Depth'] || 0;
      const engScore = f['Engagement Score'] || 0;
      const lastViewed = f['Last Viewed At'] || '';

      // Engagement score color
      const scoreColor = engScore >= 7 ? '#4caf50' : engScore >= 4 ? '#ff9800' : engScore >= 1 ? '#e05252' : '#3a4a5a';

      // Parse device/browser from Views Log (last line format: "timestamp | Device | Browser")
      const viewsLog = f['Views Log'] || '';
      const logLines = viewsLog.split('\n').filter(Boolean);
      const lastLogLine = logLines[logLines.length - 1] || '';
      const logParts = lastLogLine.split(' | ').map(s => s.trim());
      const lastDevice = logParts[1] || '';
      const lastBrowser = logParts[2] || '';
      const deviceEmoji = ['iPhone', 'iPad', 'Android'].includes(lastDevice) ? '📱' : ['Windows', 'Mac'].includes(lastDevice) ? '💻' : '';

      // Engagement cell content
      let engHtml = '<span style="color:#3a4a5a">–</span>';
      if (viewCount > 0) {
        engHtml = `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${scoreColor};color:#fff;font-size:10px;font-weight:700;">${engScore}</span>
          <span style="font-size:11px;color:#8899aa;">👁${viewCount} · ${fmtTime(totalTime)} · ${maxScroll}%</span>
          ${lastDevice ? `<span style="font-size:11px;color:#8899aa;">${deviceEmoji} ${lastDevice} / ${lastBrowser}</span>` : ''}
        </span>`;
      }

      return `<tr onclick="window.location='/admin/proposals/edit/${p.id}'" style="cursor:pointer;">
        <td style="font-weight:700;">${escapeHtml(f['Project Number'] || '')}</td>
        <td>${escapeHtml(f['Client Name'] || '')}</td>
        <td>${escapeHtml(f['Client Address'] || '')}</td>
        <td><span style="background:${color};color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${escapeHtml(status)}</span></td>
        <td>${f['Base Price'] ? formatCurrency(f['Base Price']) : '-'}</td>
        <td style="font-size:12px;color:#8899aa;">${fmtShort(f['Proposal Date'])}</td>
        <td style="font-size:12px;color:#8899aa;">${fmtShort(f['Sent At'])}</td>
        <td>${engHtml}</td>
        <td style="font-size:11px;color:#5a6a7a;">${lastViewed ? timeAgo(lastViewed) : '–'}</td>
        <td>
          <button onclick="event.stopPropagation(); togglePause('${p.id}', this)" style="background:${paused ? '#e05252' : '#4caf50'};color:white;border:none;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;min-width:60px;">${paused ? 'Paused' : 'Live'}</button>
        </td>
        <td style="white-space:nowrap;">
          <a href="/proposals/${encodeURIComponent(f['Project Number'] || '')}" target="_blank" onclick="event.stopPropagation();" style="color:#00d4ff;text-decoration:none;font-size:12px;font-weight:600;margin-right:10px;">View</a>
          <a href="/admin/proposals/clone/${p.id}" onclick="event.stopPropagation();" style="color:#ff9800;text-decoration:none;font-size:12px;font-weight:600;">Clone</a>
        </td>
      </tr>`;
    }).join('');

    const thStyle = 'padding:12px;text-align:left;color:#8899aa;font-size:11px;text-transform:uppercase;white-space:nowrap;';
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
                <th style="${thStyle}">Project #</th>
                <th style="${thStyle}">Client</th>
                <th style="${thStyle}">Address</th>
                <th style="${thStyle}">Status</th>
                <th style="${thStyle}">Price</th>
                <th style="${thStyle}">Created</th>
                <th style="${thStyle}">Sent</th>
                <th style="${thStyle}">Engagement</th>
                <th style="${thStyle}">Last Opened</th>
                <th style="${thStyle}">Link</th>
                <th style="${thStyle}"></th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="11" style="padding:40px;text-align:center;color:#5a6a7a;">No proposals yet. Click "+ New Proposal" to create one.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    const customStyles = `
      tbody tr:hover { background: #1e2a3a; }
      td { padding: 14px 12px; border-bottom: 1px solid #2a3a4a; font-size: 14px; }
    `;

    const toggleScript = `<script>
      async function togglePause(id, btn) {
        const isPaused = btn.textContent.trim() === 'Live';
        btn.textContent = '...';
        try {
          const res = await fetch('/api/admin/proposals/' + id + '/toggle-pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: isPaused }) });
          const data = await res.json();
          if (data.ok) {
            btn.textContent = data.paused ? 'Paused' : 'Live';
            btn.style.background = data.paused ? '#e05252' : '#4caf50';
          } else { btn.textContent = 'Error'; }
        } catch { btn.textContent = 'Error'; }
      }
    </script>`;

    res.send(wrapInLayout('Proposals', bodyHtml + toggleScript, 'proposals', { customStyles }));
  } catch (error) {
    console.error('Error listing proposals:', error);
    res.status(500).send('Error loading proposals');
  }
};

// ─── ADMIN: Create Form ──────────────────────────────────────

exports.showCreateForm = async (req, res) => {
  try {
    const nextNum = await airtableService.getNextProjectNumber();
    res.send(renderProposalForm(null, { projectNumber: nextNum }));
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

      // Derive proposal number from engagement number if available
      let projectNumber = '';
      if (eng['Engagement Number']) {
        const suffix = await airtableService.getNextProposalSuffix(eng['Engagement Number']);
        projectNumber = `${eng['Engagement Number']}-${suffix}`;
      } else if (eng['Proposal Number']) {
        projectNumber = String(eng['Proposal Number']).padStart(6, '0');
      }

      prefill = {
        engagementId: result.engagement.id,
        clientName: [firstName, lastName].filter(Boolean).join(' '),
        clientAddress: address,
        clientPhone: phone,
        clientEmail: email,
        projectNumber,
        quoteAmount: parseFloat(eng['Quote Amount']) || 0,
        brand: normalizeBrandName(eng['Our Business Name']),
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

    // Pre-fill phone from linked engagement/customer
    let prefill = null;
    const engIds = proposal.fields['Engagement'];
    if (engIds && engIds.length > 0) {
      try {
        const result = await airtableService.getEngagementWithCustomer(engIds[0]);
        if (result && result.customer) {
          const cust = result.customer.fields;
          const phone = cust['Mobile Phone'] || cust['Phone'] || '';
          if (phone) prefill = { clientPhone: phone };
        }
      } catch (e) { /* ignore — phone stays empty */ }
    }

    res.send(renderProposalForm(proposal, prefill));
  } catch (error) {
    console.error('Error showing edit form:', error);
    res.status(500).send('Error loading form');
  }
};

// ─── ADMIN: Clone Form ───────────────────────────────────────

exports.showCloneForm = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const sourceProposal = await airtableService.getProposal(proposalId);

    if (!sourceProposal) {
      return res.status(404).send('Source proposal not found');
    }

    const customers = await airtableService.getAllCustomers();
    const nextProjectNumber = await airtableService.getNextProjectNumber();
    res.send(renderProposalForm(null, null, { cloneSource: sourceProposal, customers, nextProjectNumber }));
  } catch (error) {
    console.error('Error showing clone form:', error);
    res.status(500).send('Error loading clone form');
  }
};

// ─── ADMIN: Toggle Pause ─────────────────────────────────────

exports.togglePause = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const paused = !!req.body.paused;
    await airtableService.updateProposal(proposalId, { Paused: paused });
    res.json({ ok: true, paused });
  } catch (error) {
    console.error('Error toggling pause:', error);
    res.status(500).json({ error: 'Failed to toggle pause' });
  }
};

// ─── ADMIN: Customer API (for clone selector) ───────────────

exports.listCustomers = async (req, res) => {
  try {
    const customers = await airtableService.getAllCustomers();
    const list = customers.map(c => ({
      id: c.id,
      firstName: c.fields['First Name'] || '',
      lastName: c.fields['Last Name'] || '',
      address: c.fields['Address'] || '',
      phone: c.fields['Mobile Phone'] || c.fields['Phone'] || '',
      email: c.fields['Email'] || '',
    }));
    res.json(list);
  } catch (error) {
    console.error('Error listing customers:', error);
    res.status(500).json({ error: 'Failed to load customers' });
  }
};

exports.getCustomerEngagements = async (req, res) => {
  try {
    const { customerId } = req.params;
    const engagements = await airtableService.getEngagementsByCustomer(customerId);
    const list = engagements.map(e => ({
      id: e.id,
      proposalNumber: e.fields['Proposal Number'] ? String(e.fields['Proposal Number']).padStart(6, '0') : '',
      status: e.fields['Status'] || '',
      systemType: e.fields['System Type'] || [],
      leadType: e.fields['Lead Type'] || '',
    }));
    res.json(list);
  } catch (error) {
    console.error('Error getting customer engagements:', error);
    res.status(500).json({ error: 'Failed to load engagements' });
  }
};

// ─── ADMIN: Create Proposal API ──────────────────────────────

exports.createProposal = async (req, res) => {
  try {
    const data = buildProposalFields(req.body);
    // Prevent duplicate project numbers
    if (data['Project Number']) {
      const exists = await airtableService.projectNumberExists(data['Project Number']);
      if (exists) {
        return res.status(400).json({ error: `Project number ${data['Project Number']} already exists. Please use a unique number.` });
      }
    }
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
    // Prevent duplicate project numbers (exclude current record)
    if (data['Project Number']) {
      const exists = await airtableService.projectNumberExists(data['Project Number'], proposalId);
      if (exists) {
        return res.status(400).json({ error: `Project number ${data['Project Number']} already exists. Please use a unique number.` });
      }
    }
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

// ─── ADMIN: Upload Datasheets (PDF → per-page images via Cloudinary) ────────

exports.uploadProposalDatasheets = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const pageUrls = [];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) continue; // Skip >50MB

      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(base64Data, {
        folder: 'gws-datasheets',
        resource_type: 'image',
        public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
      });

      const pages = result.pages || 1;
      // Build per-page image URLs with compression: q_auto:eco, JPEG, max 1200px wide
      for (let i = 1; i <= pages; i++) {
        const pageUrl = result.secure_url.replace('/upload/', `/upload/pg_${i},q_auto:eco,f_jpg,w_1200/`);
        pageUrls.push(pageUrl);
      }
    }

    res.json({ success: true, urls: pageUrls });
  } catch (error) {
    console.error('Error uploading datasheets:', error);
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
    const firstName = getFirstNames(clientName);

    // Build proposal URL (already short — no encoding needed)
    const brand = getBrandConfig(f['Our Business Name']);
    const proposalUrl = `${brand.baseUrl}/proposals/${projectNumber}`;

    // Get phone number from request body
    const phone = req.body.phone;

    if (!phone) {
      return res.status(400).json({ error: 'No phone number found. Please provide one.' });
    }

    // Use custom message if provided, otherwise default
    let message;
    if (req.body.message) {
      message = req.body.message.replace(/\{proposalUrl\}/g, proposalUrl);
    } else {
      message = brand.smsTemplate(firstName, proposalUrl);
    }

    await twilioService.sendSMS(phone, message);

    // Update proposal status
    await airtableService.updateProposal(proposalId, {
      Status: 'Sent',
      'Sent At': new Date().toISOString(),
    });

    // Stamp Quote Sent At and Quote Amount on the linked engagement
    const engagementIds = f['Engagement'];
    if (engagementIds && engagementIds.length > 0) {
      const eng = await airtableService.getEngagement(engagementIds[0]);
      const engUpdate = {};
      if (eng && !eng.fields['Quote Sent At']) {
        engUpdate['Quote Sent At'] = new Date().toISOString();
      }
      const basePrice = parseFloat(f['Base Price']) || 0;
      if (basePrice > 0) {
        engUpdate['Quote Amount'] = basePrice;
      }
      if (Object.keys(engUpdate).length > 0) {
        await airtableService.updateEngagement(engagementIds[0], engUpdate);
      }
      // Log activity
      airtableService.logActivity(engagementIds[0], `Proposal #${projectNumber} sent${basePrice > 0 ? ' ($' + basePrice.toFixed(2) + ')' : ''}`);
    }

    // Add to Meta retargeting audience (fire and forget)
    const nameParts = clientName.split(' ');
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    metaService.addToProposalAudience({ phone, firstName, lastName })
      .then(() => airtableService.updateProposal(proposalId, {
        'Added to Meta Audience': true,
        'Meta Synced At': new Date().toISOString(),
      }))
      .catch(err => console.error('[Meta] Failed to add to audience:', err.message));

    res.json({ success: true, shortUrl: proposalUrl });
  } catch (error) {
    console.error('Error sending proposal:', error);
    res.status(500).json({ error: 'Failed to send proposal' });
  }
};

// ─── ADMIN: Preview Checkout (creates a Stripe session for admin to verify) ──

exports.previewCheckout = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { packageName, packagePrice } = req.body;
    const proposal = await airtableService.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const f = proposal.fields;
    const projectNumber = f['Project Number'];
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    const session = await stripeService.createProposalCheckoutSession({
      projectNumber,
      proposalId: proposal.id,
      amount: Number(packagePrice) || 0,
      customerName: f['Client Name'] || 'Customer',
      description: packageName || 'Security System Installation',
      successUrl: `${baseUrl}/admin/proposals`,
      cancelUrl: `${baseUrl}/admin/proposals/edit/${proposalId}`,
    });

    res.json({ success: true, checkoutUrl: session.url });
  } catch (error) {
    console.error('Error creating preview checkout:', error);
    res.status(500).json({ error: 'Failed to create preview checkout' });
  }
};

// ─── ADMIN: Check Project Number & Get Next ──────────────────

exports.checkProjectNumber = async (req, res) => {
  try {
    const { projectNumber, excludeId } = req.query;
    if (!projectNumber) return res.json({ available: true });
    const exists = await airtableService.projectNumberExists(projectNumber, excludeId || null);
    res.json({ available: !exists });
  } catch (error) {
    console.error('Error checking project number:', error);
    res.status(500).json({ error: 'Failed to check' });
  }
};

exports.getNextProjectNumber = async (req, res) => {
  try {
    const next = await airtableService.getNextProjectNumber();
    res.json({ projectNumber: next });
  } catch (error) {
    console.error('Error getting next project number:', error);
    res.status(500).json({ error: 'Failed to get next number' });
  }
};

// ─── Helper: Build Airtable fields from form data ────────────

function buildProposalFields(body) {
  const fields = {};

  if (body.projectNumber) fields['Project Number'] = body.projectNumber;
  if (body.engagementId) fields['Engagement'] = [body.engagementId];
  if (body.date) fields['Proposal Date'] = body.date;
  if (body.clientName) fields['Client Name'] = body.clientName;
  if (body.businessName !== undefined) fields['Business Name'] = body.businessName || '';
  if (body.brand) fields['Our Business Name'] = body.brand;
  if (body.clientAddress) fields['Client Address'] = body.clientAddress;
  if (body.siteAddress !== undefined) fields['Site Address'] = body.siteAddress || '';
  if (body.salutation !== undefined) fields['Salutation'] = body.salutation || '';
  if (body.propertyType) fields['Property Type'] = body.propertyType;
  if (body.letterNote !== undefined) fields['Letter Note'] = body.letterNote;
  if (body.packageName) fields['Package Name'] = body.packageName;
  if (body.packageDescription !== undefined) fields['Package Description'] = body.packageDescription;
  if (body.basePrice !== undefined) fields['Base Price'] = Number(body.basePrice) || 0;
  if (body.discountName !== undefined) fields['Discount Name'] = body.discountName || '';
  if (body.discountType !== undefined) fields['Discount Type'] = body.discountType || null;
  if (body.discountValue !== undefined) fields['Discount Value'] = Number(body.discountValue) || 0;
  if (body.discountExpires !== undefined) fields['Discount Expires'] = body.discountExpires || null;
  if (body.coverImageUrl) fields['Cover Image URL'] = body.coverImageUrl;
  if (body.proposalType !== undefined) fields['Proposal Type'] = body.proposalType || '';
  if (body.installOptionPrice !== undefined) fields['Install Option Price'] = Number(body.installOptionPrice) || 0;
  if (body.status) fields['Status'] = body.status;

  // JSON fields
  if (body.scopeItems) fields['Scope Items'] = typeof body.scopeItems === 'string' ? body.scopeItems : JSON.stringify(body.scopeItems);
  if (body.deliverables) fields['Deliverables'] = typeof body.deliverables === 'string' ? body.deliverables : JSON.stringify(body.deliverables);
  if (body.cameraOptions) fields['Camera Options'] = typeof body.cameraOptions === 'string' ? body.cameraOptions : JSON.stringify(body.cameraOptions);
  if (body.optionGroups) fields['Option Groups'] = typeof body.optionGroups === 'string' ? body.optionGroups : JSON.stringify(body.optionGroups);
  if (body.clarifications) fields['Clarifications'] = typeof body.clarifications === 'string' ? body.clarifications : JSON.stringify(body.clarifications);
  if (body.sitePhotoUrls) fields['Site Photo URLs'] = typeof body.sitePhotoUrls === 'string' ? body.sitePhotoUrls : JSON.stringify(body.sitePhotoUrls);
  if (body.baseQtyEnabled !== undefined) fields['Base Qty Enabled'] = !!body.baseQtyEnabled;
  if (body.baseMaxQty !== undefined) fields['Base Max Qty'] = Number(body.baseMaxQty) || 10;
  if (body.datasheetPhotoUrls !== undefined) fields['Datasheet Photo URLs'] = typeof body.datasheetPhotoUrls === 'string' ? body.datasheetPhotoUrls : JSON.stringify(body.datasheetPhotoUrls);

  // OTO Items (new JSON format)
  if (body.otoItems) fields['OTO Items'] = typeof body.otoItems === 'string' ? body.otoItems : JSON.stringify(body.otoItems);

  // Legacy OTO pricing (keep for backward compat reads, cleared when using new format)
  if (body.otoItems) {
    fields['OTO Bundle Price'] = 0;
    fields['OTO Alarm Price'] = 0;
    fields['OTO Alarm Was Price'] = 0;
    fields['OTO UPS Price'] = 0;
    fields['OTO UPS Was Price'] = 0;
    fields['OTO Care Monthly Price'] = 0;
  } else {
    if (body.otoBundlePrice !== undefined) fields['OTO Bundle Price'] = Number(body.otoBundlePrice) || 0;
    if (body.otoAlarmPrice !== undefined) fields['OTO Alarm Price'] = Number(body.otoAlarmPrice) || 0;
    if (body.otoAlarmWasPrice !== undefined) fields['OTO Alarm Was Price'] = Number(body.otoAlarmWasPrice) || 0;
    if (body.otoUpsPrice !== undefined) fields['OTO UPS Price'] = Number(body.otoUpsPrice) || 0;
    if (body.otoUpsWasPrice !== undefined) fields['OTO UPS Was Price'] = Number(body.otoUpsWasPrice) || 0;
    if (body.otoCareMonthlyPrice !== undefined) fields['OTO Care Monthly Price'] = Number(body.otoCareMonthlyPrice) || 0;
  }

  return fields;
}

// ─── Helper: Render Proposal Admin Form ──────────────────────

function renderProposalForm(proposal, prefill, cloneOpts) {
  const isEdit = !!proposal;
  const f = proposal ? proposal.fields : {};
  const pf = prefill || {};
  const clone = cloneOpts || {};
  const isClone = !!clone.cloneSource;
  const cf = isClone ? clone.cloneSource.fields : {};
  const customers = clone.customers || [];
  const nextProjectNumber = clone.nextProjectNumber || '';

  // ── Brand & Job Type Templates ──────────────────────────
  const currentBrand = f['Our Business Name'] || (pf && pf.brand) || 'Great White Security (WA)';
  const brandForForm = getBrandConfig(currentBrand);
  const commonClarifications = [
    'Only items expressly listed above are included in this quotation. Any additional parts or works to other items are chargeable at the applicable rate.',
    `All works quoted and any subsequent warranty works are conducted between the hours of 08:00 & 17:00 Monday to Friday excluding ${brandForForm.publicHolidayState} public holidays. Warranty attendances do not include provision of EWP which must be organised by the client.`,
    brandForForm.accessClarification,
    brandForForm.phoneClarification,
    'Quotation valid for 30 days.',
    brandForForm.internetClarification,
  ];
  const cctvOnlyClarifications = [
    'CCTV Alarm Monitoring by Monitoring Station pricing is based on being set to only send alarms overnight between 2200 \u2013 0530. More than 8 events per month may require a plan increase but will be reviewed first.',
    'License plate capture from cameras is dependent on many variables such as lighting, if vehicles are stationary or moving, speed of vehicles, license plate illumination/cleanliness, obstructions, distance from cameras etc.',
  ];
  const commonTailDeliverables = [
    { qty: '\u2014', description: 'Cat 6 Cable & Patch Leads' },
    { qty: '\u2014', description: 'Conduit, Ducting, Installation Materials and Sundries' },
    { qty: '\u2014', description: 'Installation & Programming by Licensed Security Technician/s' },
    { qty: '\u2014', description: '12 Month Warranty on Installation & Manufacturer Equipment Warranty' },
    { qty: '\u2014', description: 'Smartphone App (No Subscription Costs)' },
  ];
  const jobTypeTemplates = {
    cctv: {
      scope: [
        'Conduct Discovery Meeting to Determine Specific Security Needs',
        'Collaborate with Local Suppliers to Design Tailored Security Solution',
        'Procure Parts & Materials from Local Suppliers',
        'Install Cat 6 Cable for Cameras',
        'Install Conduit & Fittings as Required',
        'Install Cameras & Mounting Brackets',
        'Install NVR & Hard Drive & Connect to Customer Internet',
        'Aim, Focus & Setup Cameras',
        'Program, Test & Commission System',
        'Setup Customer Phone App & Demonstrate Use',
        'Clean Up Site After Installation',
        'Post Install Remote Support & System Fine-Tuning (1 Month Included)',
      ],
      deliverables: [
        { qty: '4', description: 'Dahua Wizsense Turret Cameras' },
        { qty: '4', description: 'Dahua Camera Mounting Brackets' },
        { qty: '1', description: 'Dahua 8 Channel NVR (Network Video Recorder) & Hard Drive \u2013 4 TB' },
        ...commonTailDeliverables,
        { qty: '\u2014', description: '30 Days Post Installation Remote Programming Support' },
      ],
      packages: [
        { name: 'Dahua 5MP Wizsense \u2014 Minimum Package', description: 'Colour at Night Cameras', price: 3997 },
        { name: 'Dahua 8MP/4K \u2014 Standard Package', description: 'Colour at Night Cameras in 4K', price: 5997 },
        { name: 'Dahua 8MP TIOC PRO Active Deterrent \u2014 VIP Package (Recommended)', description: 'Cameras Feature Red & White Flashing Lights & Audio Alarms to Deter Intruders', price: 7997 },
      ],
      upgrades: [
        { name: 'Power Surge UPS (Supplied & Installed)', description: 'Protect Your Investment from Power Surges & Outages', price: 197 },
        { name: 'Clarity CCTV Monitor 22 Inch', description: 'See Your Cameras on a Bigger Screen', price: 247 },
      ],
      otoOneTime: [],
      otoRecurring: [
        { name: 'Professional Monitoring (Includes Video Verification)', description: 'Professional monitoring station with instant emergency dispatch.', price: '47', wasPrice: '', monthly: true },
        { name: 'After Install Support Package', description: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: '57', wasPrice: '', monthly: true },
      ],
      clarifications: [...commonClarifications, ...cctvOnlyClarifications, 'Final mounting locations depend on cable and mounting access \u2014 to be confirmed by on-site technician.'],
    },
    alarm: {
      scope: [
        'Create Alarm Designs (Minimum & Perimeter)',
        'Procure Parts & Materials from Local Suppliers',
        'Install Motion Detectors',
        'Install External Siren/Strobe',
        'Install Internal Siren',
        'Install Hub & Connect to Router',
        'Install Keypad',
        'Install Door/Window Sensor (if Perimeter)',
        'Program, Test & Commission System',
        'Setup Customer Phone App & Full Demonstration',
        'Clean Up Site After Installation',
      ],
      deliverables: [
        { qty: '1', description: 'Ajax Hub (with Battery Backup)' },
        { qty: '3', description: 'Ajax Pet Friendly Motion Detectors' },
        { qty: '1', description: 'Ajax External Siren/Strobe' },
        { qty: '1', description: 'Ajax Internal Siren' },
        { qty: '1', description: 'Ajax Sim Card' },
        { qty: '1', description: 'Cat 6 Patch Lead' },
        ...commonTailDeliverables,
      ],
      packages: [
        { name: 'Minimum Protection Ajax Alarm', description: '', price: 2497 },
        { name: 'Recommended Protection (Perimeter)', description: '', price: 3497 },
      ],
      upgrades: [
        { name: 'Remote Keyfob', description: '', price: 67 },
        { name: 'Heat/Smoke Detector', description: '', price: 197 },
      ],
      otoOneTime: [],
      otoRecurring: [
        { name: 'After Install Support Package', description: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: '27', wasPrice: '', monthly: true },
        { name: 'Professional Alarm Monitoring', description: 'Professional monitoring station with instant emergency dispatch.', price: '47', wasPrice: '', monthly: true },
      ],
      clarifications: [...commonClarifications, 'Final mounting locations depend on cable and mounting access \u2014 to be confirmed by on-site technician.'],
    },
    combined: {
      scope: [
        'Conduct Discovery Meeting to Determine Specific Security Needs',
        'Collaborate with Vendors to Design Tailored Security Solution',
        'Procure Parts & Materials from Local Suppliers',
        '',
        '',
        'Install Ajax Hub & Connect to Router',
        'Install Motion Detectors',
        'Install External Siren/Strobe',
        'Install Internal Siren',
        'Install Keypad',
        'Install Door/Window Sensors',
        'Program, Test & Commission System',
        'Setup Customer Phone App & Full Demonstration',
        'Clean Up Site After Installation',
      ],
      deliverables: [
        { qty: '4', description: 'Dahua 8MP TIOC PRO Active Deterrent Turret Cameras' },
        { qty: '4', description: 'Dahua Camera Junction Boxes' },
        { qty: '1', description: 'Dahua 8 Channel NVR (Network Video Recorder) with AI' },
        { qty: '1', description: '4TB Surveillance Hard Drive' },
        { qty: '1', description: 'Ajax Hub (with Battery Backup)' },
        { qty: '3', description: 'Ajax Pet Friendly Motion Detectors' },
        { qty: '1', description: 'Ajax External Siren/Strobe' },
        { qty: '1', description: 'Ajax Internal Siren' },
        { qty: '1', description: 'Ajax Sim Card' },
        { qty: '1', description: 'Cat 6 Patch Lead' },
        ...commonTailDeliverables,
      ],
      packages: [
        { name: '', description: '', price: '' },
      ],
      upgrades: [
        { name: 'Power Surge UPS (Supplied & Installed)', description: '', price: 197 },
        { name: 'Clarity CCTV Monitor 22 Inch', description: '', price: 247 },
        { name: 'Additional Camera (Supplied & Installed)', description: '', price: 497 },
        { name: 'Remote Keyfob', description: '', price: 67 },
        { name: 'Heat/Smoke Detector', description: '', price: 197 },
      ],
      otoOneTime: [],
      otoRecurring: [
        { name: 'Professional Monitoring (Includes Video Verification)', description: 'Professional monitoring station with instant emergency dispatch.', price: '47', wasPrice: '', monthly: true },
        { name: 'After Install Support Package', description: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: '57', wasPrice: '', monthly: true },
      ],
      clarifications: [...commonClarifications, ...cctvOnlyClarifications, 'Final mounting locations depend on cable and mounting access \u2014 to be confirmed by on-site technician.'],
    },
    'supply-cctv': {
      scope: [
        'Procure CCTV Parts & Materials from Local Suppliers',
        'Programme & Configure Cameras & NVR',
        'Quality Check & Commission System',
        'Package Equipment Ready for Collection or Delivery',
      ],
      deliverables: [
        { qty: '4', description: 'Dahua Wizsense Turret Cameras' },
        { qty: '4', description: 'Dahua Camera Mounting Brackets' },
        { qty: '1', description: 'Dahua 8 Channel NVR (Network Video Recorder) & Hard Drive \u2013 4 TB' },
      ],
      packages: [
        { name: 'CCTV Supply Package', description: '', price: '' },
      ],
      upgrades: [],
      otoOneTime: [],
      otoRecurring: [
        { name: 'After Install Support Package', description: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: '57', wasPrice: '', monthly: true },
      ],
      clarifications: [
        'Only items expressly listed above are included in this quotation. Any additional parts or works are chargeable at the applicable rate.',
        'Delivery not included — available at additional cost. Please enquire.',
        'Programming and installation not included in Supply Only — available as upgrades above.',
        'Equipment remains the property of Great White Security until payment is received in full.',
        'Quotation valid for 30 days.',
      ],
    },
    'supply-alarm': {
      scope: [
        'Procure Alarm Parts & Materials from Local Suppliers',
        'Programme & Configure Alarm System',
        'Quality Check & Commission System',
        'Package Equipment Ready for Collection or Delivery',
      ],
      deliverables: [
        { qty: '1', description: 'Ajax Hub (with Battery Backup)' },
        { qty: '3', description: 'Ajax Pet Friendly Motion Detectors' },
        { qty: '1', description: 'Ajax External Siren/Strobe' },
        { qty: '1', description: 'Ajax Internal Siren' },
        { qty: '1', description: 'Ajax Sim Card' },
      ],
      packages: [
        { name: 'Alarm Supply Package', description: '', price: '' },
      ],
      upgrades: [],
      otoOneTime: [],
      otoRecurring: [
        { name: 'After Install Support Package', description: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: '27', wasPrice: '', monthly: true },
      ],
      clarifications: [
        'Only items expressly listed above are included in this quotation. Any additional parts or works are chargeable at the applicable rate.',
        'Delivery not included — available at additional cost. Please enquire.',
        'Equipment remains the property of Great White Security until payment is received in full.',
        'Quotation valid for 30 days.',
      ],
    },
    'supply-combined': {
      scope: [
        'Procure CCTV & Alarm Parts & Materials from Local Suppliers',
        'Programme & Configure Cameras, NVR & Alarm System',
        'Quality Check & Commission System',
        'Package Equipment Ready for Collection or Delivery',
      ],
      deliverables: [
        { qty: '4', description: 'Dahua Wizsense Turret Cameras' },
        { qty: '4', description: 'Dahua Camera Mounting Brackets' },
        { qty: '1', description: 'Dahua 8 Channel NVR (Network Video Recorder) & Hard Drive \u2013 4 TB' },
        { qty: '1', description: 'Ajax Hub (with Battery Backup)' },
        { qty: '3', description: 'Ajax Pet Friendly Motion Detectors' },
        { qty: '1', description: 'Ajax External Siren/Strobe' },
        { qty: '1', description: 'Ajax Internal Siren' },
        { qty: '1', description: 'Ajax Sim Card' },
      ],
      packages: [
        { name: 'CCTV & Alarm Supply Package', description: '', price: '' },
      ],
      upgrades: [],
      otoOneTime: [],
      otoRecurring: [
        { name: 'After Install Support Package', description: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: '57', wasPrice: '', monthly: true },
      ],
      clarifications: [
        'Only items expressly listed above are included in this quotation. Any additional parts or works are chargeable at the applicable rate.',
        'Delivery not included — available at additional cost. Please enquire.',
        'Equipment remains the property of Great White Security until payment is received in full.',
        'Quotation valid for 30 days.',
      ],
    },
  };
  const defaultTemplate = jobTypeTemplates.cctv;

  // For clone: use next available project number, NOT the source's
  const projectNumber = isClone ? nextProjectNumber : (f['Project Number'] || pf.projectNumber || '');
  const date = f['Proposal Date'] || new Date().toISOString().split('T')[0];
  const clientName = f['Client Name'] || pf.clientName || '';
  const businessName = f['Business Name'] || '';
  const clientAddress = f['Client Address'] || pf.clientAddress || '';
  const siteAddress = f['Site Address'] || '';
  const salutation = f['Salutation'] || '';
  const clientPhone = pf.clientPhone || '';
  const clientEmail = pf.clientEmail || '';
  const propertyType = f['Property Type'] || (isClone ? (cf['Property Type'] || 'residential') : 'residential');
  const letterNote = f['Letter Note'] || '';
  const packageName = f['Package Name'] || (isClone ? (cf['Package Name'] || '') : (defaultTemplate.packages[0] ? defaultTemplate.packages[0].name : ''));
  const packageDesc = f['Package Description'] || (isEdit ? '' : (isClone ? (cf['Package Description'] || '') : (defaultTemplate.packages[0] ? defaultTemplate.packages[0].description : '')));
  const basePrice = f['Base Price'] || (isClone ? (cf['Base Price'] || '') : (pf.quoteAmount || (defaultTemplate.packages[0] ? defaultTemplate.packages[0].price : '')));
  const discountName = f['Discount Name'] || (isClone ? (cf['Discount Name'] || '') : '');
  const discountType = f['Discount Type'] || (isClone ? (cf['Discount Type'] || '') : '');
  const discountValue = f['Discount Value'] || (isClone ? (cf['Discount Value'] || '') : '');
  const discountExpires = f['Discount Expires'] || (isClone ? (cf['Discount Expires'] || '') : '');
  const coverImageUrl = f['Cover Image URL'] || (isClone ? (cf['Cover Image URL'] || '') : '');
  const proposalType = f['Proposal Type'] || (isClone ? (cf['Proposal Type'] || '') : '');
  const installOptionPrice = Number(f['Install Option Price']) || (isClone ? (Number(cf['Install Option Price']) || 0) : 0);
  const baseQtyEnabled = !!(f['Base Qty Enabled']);
  const baseMaxQty = Number(f['Base Max Qty']) || 10;

  // For clone mode, use source proposal's JSON fields as the data source
  const srcFields = isClone ? cf : f;

  // Parse JSON fields into arrays for the UI
  const scopeItemsRaw = safeJsonParse(srcFields['Scope Items']);
  const deliverablesRaw = safeJsonParse(srcFields['Deliverables']);
  const cameraOptionsRaw = safeJsonParse(srcFields['Camera Options']);
  const optionGroupsRaw = safeJsonParse(srcFields['Option Groups']);
  const clarificationsRaw = safeJsonParse(srcFields['Clarifications']);
  const sitePhotoUrlsRaw = isClone ? safeJsonParse(cf['Site Photo URLs']) : safeJsonParse(f['Site Photo URLs']);
  const datasheetPhotoUrlsRaw = isClone ? [] : safeJsonParse(f['Datasheet Photo URLs']);

  // OTO Items — new JSON format with fallback from old fields
  const otoItemsRaw = safeJsonParse(srcFields['OTO Items']);
  let otoItems;
  if (otoItemsRaw.length > 0) {
    otoItems = otoItemsRaw;
  } else if ((isEdit || isClone) && (srcFields['OTO Alarm Price'] || srcFields['OTO UPS Price'] || srcFields['OTO Bundle Price'] || srcFields['OTO Care Monthly Price'])) {
    // Backward compat: convert old fixed fields to new format
    otoItems = [];
    if (srcFields['OTO Alarm Price']) otoItems.push({ name: '24/7 Alarm Monitoring', description: 'Professional monitoring station with instant emergency dispatch.', price: srcFields['OTO Alarm Price'], wasPrice: srcFields['OTO Alarm Was Price'] || '', monthly: false });
    if (srcFields['OTO UPS Price']) otoItems.push({ name: 'UPS Battery Backup', description: 'Keeps your system recording during power outages for hours.', price: srcFields['OTO UPS Price'], wasPrice: srcFields['OTO UPS Was Price'] || '', monthly: false });
    if (srcFields['OTO Bundle Price']) otoItems.push({ name: 'Complete Protection Bundle', description: 'Alarm monitoring + UPS battery backup bundled together.', price: srcFields['OTO Bundle Price'], wasPrice: '', monthly: false });
    if (srcFields['OTO Care Monthly Price']) otoItems.push({ name: 'After Install Support Package', description: 'Remote troubleshooting, annual on-site system maintenance, priority support response within 24 hours, proactive firmware & software updates & 15% off equipment for active subscribers. Min. 12 months.', price: srcFields['OTO Care Monthly Price'], wasPrice: '', monthly: true });
  } else if (!isEdit && !isClone) {
    // Defaults for new proposals from template
    otoItems = [...defaultTemplate.otoOneTime, ...defaultTemplate.otoRecurring];
  } else {
    otoItems = [];
  }
  const otoOneTime = otoItems.filter(it => !it.monthly);
  const otoRecurring = otoItems.filter(it => it.monthly);

  const formAction = isEdit ? `/api/admin/proposals/${proposal.id}` : '/api/admin/proposals';
  const formMethod = isEdit ? 'PUT' : 'POST';

  // Use CCTV template as default for new proposals
  const scopeItems = scopeItemsRaw.length > 0 ? scopeItemsRaw : ((isEdit || isClone) ? [] : defaultTemplate.scope);
  const deliverables = deliverablesRaw.length > 0 ? deliverablesRaw : ((isEdit || isClone) ? [] : defaultTemplate.deliverables);
  const cameraOptions = cameraOptionsRaw.length > 0 ? cameraOptionsRaw : ((isEdit || isClone) ? [] : defaultTemplate.upgrades);
  const optionGroups = optionGroupsRaw.length > 0 ? optionGroupsRaw : ((isEdit || isClone) ? [] : defaultTemplate.packages.slice(1));
  const clarifications = clarificationsRaw.length > 0 ? clarificationsRaw : defaultTemplate.clarifications;
  const sitePhotoUrls = sitePhotoUrlsRaw.length > 0 ? sitePhotoUrlsRaw : [];
  const datasheetPhotoUrls = datasheetPhotoUrlsRaw.length > 0 ? datasheetPhotoUrlsRaw : [];

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
    return `<div class="list-row clarification-row" data-list="clarification" draggable="true">
      <span class="drag-handle" title="Drag to reorder">&#9776;</span>
      <span class="row-num">${i + 1}</span>
      <textarea class="list-input clarification-input" rows="3" placeholder="Enter clarification...">${escapeHtml(val)}</textarea>
      <div class="row-actions">
        <button type="button" class="row-insert" onclick="insertRowBelow(this,'clarification')" title="Add item below">+</button>
        <button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>
      </div>
    </div>`;
  }).join('');

  // Build camera option rows
  const cameraRowsHtml = cameraOptions.map(opt => {
    const discChecked = opt.discountable !== false ? 'checked' : '';
    const monthlyChecked = opt.monthly ? 'checked' : '';
    const defaultChecked = opt.defaultSelected ? 'checked' : '';
    return `<div class="list-row camera-row" data-list="camera" draggable="true">
      <span class="drag-handle" title="Drag to reorder">&#9776;</span>
      <input type="text" class="cam-name" value="${escapeHtml(opt.name || '')}" placeholder="Option name">
      <input type="text" class="cam-desc" value="${escapeHtml(opt.description || '')}" placeholder="Description">
      <input type="number" class="cam-price" value="${opt.price || ''}" placeholder="Price" step="1">
      <input type="number" class="cam-bundle" value="${opt.bundleSaving || ''}" placeholder="Bundle $" step="1" title="Bundle saving — deducted when customer selects this item (shown as green saving to customer)">
      <label class="cam-disc-label" title="Apply early bird discount to this upgrade"><input type="checkbox" class="cam-disc" ${discChecked}> %</label>
      <label class="cam-disc-label" title="Recurring monthly charge" style="color:#ffa726"><input type="checkbox" class="cam-monthly" ${monthlyChecked}> /mo</label>
      <label class="cam-disc-label" title="Pre-selected for customer by default" style="color:#4ade80"><input type="checkbox" class="cam-default" ${defaultChecked}> ★</label>
      <label class="cam-disc-label" title="Allow customer to select quantity" style="color:#c084fc"><input type="checkbox" class="cam-qty-enabled" onchange="toggleQtyMaxInput(this)" ${opt.qtyEnabled ? 'checked' : ''}> qty</label>
      <input type="number" class="cam-max-qty" value="${opt.maxQty || 10}" placeholder="max" step="1" min="1" style="width:48px;display:${opt.qtyEnabled ? 'inline-block' : 'none'};" title="Max quantity">
      <button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>
    </div>`;
  }).join('');

  // Build ALL package cards for admin form (Package 1 = base package, 2+ = additional)
  const allPackages = [
    { name: packageName, description: packageDesc, price: basePrice },
    ...optionGroups
  ];
  const additionalPkgHtml = allPackages.map((pkg, i) => `
    <div class="pkg-card" data-idx="${i}" draggable="true">
      <div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:#00d4ff;font-weight:700;">Package ${i + 1}</span><button type="button" class="row-remove" onclick="removePackage(this)" title="Remove package">&times;</button></div>
      <div class="fg-row"><div class="fg"><label>Package Name</label><input type="text" class="pkg-name" value="${escapeHtml(pkg.name || '')}" placeholder="e.g. Complete 4-Camera CCTV Package"></div><div class="fg" style="max-width:150px;"><label>Total Price (Inc. GST)</label><input type="number" class="pkg-price" value="${pkg.price || ''}" placeholder="Price" step="1"></div></div>
      <div class="fg"><label>Short Description</label><input type="text" class="pkg-desc" value="${escapeHtml(pkg.description || '')}" placeholder="Supply & install security system with NVR"></div>
    </div>
  `).join('');

  // Build OTO item cards
  const otoOneTimeHtml = otoOneTime.map(item => `
    <div class="pkg-card" data-oto-type="onetime" draggable="true">
      <div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:#00d4ff;font-weight:700;">One-Time Item</span><span class="oto-badge-onetime">ONE-TIME</span><button type="button" class="row-remove" onclick="this.closest('.pkg-card').remove()" title="Remove">&times;</button></div>
      <div class="fg-row"><div class="fg"><label>Name</label><input type="text" class="oto-item-name" value="${escapeHtml(item.name || '')}" placeholder="e.g. 24/7 Alarm Monitoring"></div><div class="fg" style="max-width:120px;"><label>Price ($)</label><input type="number" class="oto-item-price" value="${item.price || ''}" placeholder="990" step="1"></div><div class="fg" style="max-width:120px;"><label>Was ($)</label><input type="number" class="oto-item-was" value="${item.wasPrice || ''}" placeholder="" step="1"></div></div>
      <div class="fg"><label>Description</label><input type="text" class="oto-item-desc" value="${escapeHtml(item.description || '')}" placeholder="What does this include?"></div>
    </div>
  `).join('');

  const otoRecurringHtml = otoRecurring.map(item => `
    <div class="pkg-card" data-oto-type="recurring" draggable="true">
      <div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:#22c55e;font-weight:700;">Recurring Item</span><span class="oto-badge-recurring">MONTHLY</span><button type="button" class="row-remove" onclick="this.closest('.pkg-card').remove()" title="Remove">&times;</button></div>
      <div class="fg-row"><div class="fg"><label>Name</label><input type="text" class="oto-item-name" value="${escapeHtml(item.name || '')}" placeholder="e.g. After Install Support Package"></div><div class="fg" style="max-width:120px;"><label>Monthly ($)</label><input type="number" class="oto-item-price" value="${item.price || ''}" placeholder="97" step="1"></div></div>
      <div class="fg"><label>Description</label><input type="text" class="oto-item-desc" value="${escapeHtml(item.description || '')}" placeholder="What does this include?"></div>
    </div>
  `).join('');

  // Uploaded photo thumbnails
  const photoThumbsHtml = sitePhotoUrls.map(url =>
    `<div class="photo-thumb" draggable="true" data-url="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="Site photo"><button type="button" class="photo-remove" onclick="removePhoto(this)">&times;</button></div>`
  ).join('');

  // Datasheet page thumbnails
  const datasheetThumbsHtml = datasheetPhotoUrls.map(url =>
    `<div class="photo-thumb" draggable="true" data-url="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="Datasheet page"><button type="button" class="photo-remove" onclick="removeDatasheet(this)">&times;</button></div>`
  ).join('');

  const bodyHtml = `
    <div style="padding:24px;max-width:800px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h1 style="font-size:22px;color:#e0e6ed;">${isClone ? 'Clone' : (isEdit ? 'Edit' : 'New')} Proposal</h1>
        <div style="display:flex;gap:12px;align-items:center;">
          ${isEdit ? `<a href="/admin/proposals/clone/${proposal.id}" style="color:#ff9800;text-decoration:none;font-size:13px;font-weight:600;">Clone as New</a>` : ''}
          <a href="/admin/proposals" style="color:#5a6a7a;text-decoration:none;font-size:13px;">&larr; All Proposals</a>
        </div>
      </div>
      ${isClone ? `<div style="background:#1a2a1a;border:1px solid #2d6a2d;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#8cc88c;">
        Cloned from <strong style="color:#4caf50;">${escapeHtml(cf['Client Name'] || 'Unknown')}</strong>${cf['Project Number'] ? ' (Project #' + escapeHtml(cf['Project Number']) + ')' : ''} &mdash; scope, deliverables, pricing & upsells carried over. Select a customer below.
      </div>` : ''}
      ${clientName ? `<p style="color:#00d4ff;font-size:15px;margin-bottom:20px;">for <strong>${escapeHtml(clientName)}</strong>${clientAddress ? ' &mdash; ' + escapeHtml(clientAddress) : ''}</p>` : ''}

      ${isEdit && (f['View Count'] || 0) > 0 ? (() => {
        const vc = f['View Count'] || 0;
        const tvt = f['Total View Time'] || 0;
        const msd = f['Max Scroll Depth'] || 0;
        const es = f['Engagement Score'] || 0;
        const esColor = es >= 7 ? '#4caf50' : es >= 4 ? '#ff9800' : '#e05252';
        let sessions = [];
        try { sessions = JSON.parse(f['Analytics'] || '[]'); } catch {}
        const totalCta = sessions.reduce((s, x) => s + (x.ctaClicks || 0), 0);

        // Section times aggregated across sessions
        const aggSections = {};
        sessions.forEach(s => {
          if (s.sectionTimes) Object.entries(s.sectionTimes).forEach(([k, v]) => { aggSections[k] = (aggSections[k] || 0) + v; });
        });
        const maxSectionTime = Math.max(...Object.values(aggSections), 1);
        const sectionLabels = { cover: 'Cover', letter: 'Letter', 'why-us': 'Why Us', scope: 'Scope', deliverables: 'Deliverables', pricing: 'Pricing', clarifications: 'Clarifications' };
        const sectionBars = Object.entries(aggSections).map(([k, v]) => {
          const pct = Math.round((v / maxSectionTime) * 100);
          const label = sectionLabels[k] || k;
          return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="width:90px;font-size:11px;color:#8899aa;text-align:right;">' + label + '</span><div style="flex:1;background:#1a2a3a;border-radius:3px;height:14px;"><div style="width:' + pct + '%;background:#00d4ff;border-radius:3px;height:100%;min-width:2px;"></div></div><span style="font-size:10px;color:#5a6a7a;width:35px;">' + Math.round(v) + 's</span></div>';
        }).join('');

        // Session history
        const totalPrints = sessions.reduce((s, x) => s + (x.printAttempts || 0), 0);
        const sessionRows = sessions.slice().reverse().slice(0, 10).map(s => {
          const dt = s.startedAt ? new Date(s.startedAt) : null;
          const dateStr = dt ? dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Perth' }) + ', ' + dt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' }) : '–';
          const devIcon = (s.device === 'iPhone' || s.device === 'iPad' || s.device === 'Android') ? '📱' : '💻';
          const dur = s.activeTime >= 60 ? Math.floor(s.activeTime / 60) + 'm ' + Math.round(s.activeTime % 60) + 's' : Math.round(s.activeTime || 0) + 's';
          const locStr = s.location ? ' · 📍 ' + s.location.city : '';
          const printStr = s.printAttempts > 0 ? ' · 🖨 ' + s.printAttempts + ' print' : '';

          // Interaction log for this session
          let interactionHtml = '';
          if (s.interactions && s.interactions.length) {
            const sessionStart = dt ? dt.getTime() / 1000 : null;
            const rows = s.interactions.map(ix => {
              const relSec = sessionStart ? Math.round(ix.t - sessionStart) : null;
              const relStr = relSec !== null ? (relSec < 60 ? relSec + 's' : Math.floor(relSec / 60) + 'm ' + (relSec % 60) + 's') : '';
              if (ix.type === 'package') {
                return '<div style="padding:2px 0;font-size:11px;color:#8899aa;">📦 Selected <strong style="color:#e0e6ed;">' + escapeHtml(ix.name) + '</strong>' + (relStr ? ' <span style="color:#5a6a7a;">+' + relStr + '</span>' : '') + '</div>';
              } else {
                const action = ix.selected ? '✅ Added' : '✖ Removed';
                const col = ix.selected ? '#4caf50' : '#e05252';
                return '<div style="padding:2px 0;font-size:11px;color:#8899aa;"><span style="color:' + col + ';">' + action + '</span> <strong style="color:#e0e6ed;">' + escapeHtml(ix.name) + '</strong>' + (relStr ? ' <span style="color:#5a6a7a;">+' + relStr + '</span>' : '') + '</div>';
              }
            }).join('');
            interactionHtml = '<div style="margin-top:6px;padding:6px 8px;background:#0a1520;border-radius:6px;">' + rows + '</div>';
          }

          return '<div style="padding:6px 0;border-bottom:1px solid #1a2a3a;">'
            + '<div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#8899aa;">'
            + '<span>' + dateStr + '</span>'
            + '<span>' + devIcon + ' ' + (s.device || '') + ' ' + (s.browser || '') + locStr + printStr + '</span>'
            + '<span style="margin-left:auto;">' + dur + ' · ' + Math.round(s.scrollDepth || 0) + '%</span>'
            + '</div>'
            + interactionHtml
            + '</div>';
        }).join('');

        const timeFmt = tvt >= 60 ? Math.floor(tvt / 60) + 'm ' + Math.round(tvt % 60) + 's' : Math.round(tvt) + 's';
        return '<div id="analyticsPanel" style="background:#0f1a24;border:1px solid #2a3a4a;border-radius:12px;padding:16px 20px;margin-bottom:20px;">'
          + '<div id="analyticsToggle" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">'
          + '<div style="display:flex;align-items:center;gap:12px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:' + esColor + ';color:#fff;font-size:14px;font-weight:700;">' + es + '</span><span style="font-size:14px;font-weight:600;color:#e0e6ed;">Engagement Analytics</span></div>'
          + '<div style="display:flex;gap:16px;font-size:12px;color:#8899aa;"><span>👁 ' + vc + ' views</span><span>⏱ ' + timeFmt + '</span><span>📜 ' + msd + '%</span>' + (totalCta > 0 ? '<span>🖱 ' + totalCta + ' CTA</span>' : '') + (totalPrints > 0 ? '<span>🖨 ' + totalPrints + ' print</span>' : '') + '<span id="analyticsArrow" style="color:#5a6a7a;">▼</span></div>'
          + '</div>'
          + '<div id="analyticsBody" style="display:none;margin-top:16px;">'
          + (sectionBars ? '<div style="margin-bottom:16px;"><div style="font-size:11px;color:#5a6a7a;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Time per Section</div>' + sectionBars + '</div>' : '')
          + (sessionRows ? '<div><div style="font-size:11px;color:#5a6a7a;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Session History</div>' + sessionRows + '</div>' : '')
          + '</div></div>'
          + '<script>document.getElementById("analyticsToggle").addEventListener("click",function(){var b=document.getElementById("analyticsBody");var a=document.getElementById("analyticsArrow");if(b.style.display==="none"){b.style.display="block";a.textContent="▲";}else{b.style.display="none";a.textContent="▼";}});</script>';
      })() : ''}

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
            <div class="fg">
              <label>Brand</label>
              <input type="hidden" name="brand" id="brandInput" value="${escapeHtml(currentBrand)}">
              <div style="display:flex;gap:0;margin-top:4px;">
                <button type="button" id="btn-brand-gws" onclick="setBrand('Great White Security (WA)')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:6px 0 0 6px;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;${currentBrand === 'Great White Security (WA)' ? "background:#78e4ff;color:#0a0e27;border-color:#78e4ff;" : "background:#1a2236;color:#8a9ab5;"}">Great White Security</button>
                <button type="button" id="btn-brand-tag" onclick="setBrand('The Alarm Guy (SA)')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:0 6px 6px 0;border-left:none;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;${currentBrand === 'The Alarm Guy (SA)' ? "background:#78e4ff;color:#0a0e27;border-color:#78e4ff;" : "background:#1a2236;color:#8a9ab5;"}">The Alarm Guy</button>
              </div>
            </div>
            ${isClone ? `
            <div class="fg" id="customer-selector-wrap">
              <label>Select Customer</label>
              <div style="position:relative;">
                <input type="text" id="customerSearch" placeholder="Type to search customers..." autocomplete="off" style="padding-right:36px;">
                <span id="customerSearchClear" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:#5a6a7a;font-size:18px;display:none;" onclick="clearCustomerSearch()">&times;</span>
              </div>
              <div id="customerDropdown" style="display:none;position:relative;z-index:100;max-height:200px;overflow-y:auto;background:#1a2332;border:2px solid #00d4ff;border-top:none;border-radius:0 0 8px 8px;margin-top:-2px;"></div>
            </div>
            <div class="fg" id="engagement-selector-wrap" style="display:none;">
              <label>Link to Engagement</label>
              <select id="engagementSelect" style="width:100%;padding:10px 14px;background:#1a2332;border:2px solid #2a3a4a;border-radius:8px;color:#e0e6ed;font-size:14px;font-family:inherit;">
                <option value="">-- Select engagement --</option>
              </select>
            </div>
            ` : ''}
            <div class="form-row">
              <div class="fg"><label>Project Number</label><input type="text" name="projectNumber" value="${escapeHtml(projectNumber)}" placeholder="e.g. 003256"><span id="pn-status" style="font-size:11px;margin-top:4px;display:block;"></span></div>
              <div class="fg"><label>Date</label><input type="date" name="date" value="${escapeHtml(date)}"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Client Name</label><input type="text" name="clientName" value="${escapeHtml(clientName)}" placeholder="John Smith"></div>
              <div class="fg"><label>Business Name <span style="color:#5a6a7a;font-weight:400;">(optional)</span></label><input type="text" name="businessName" value="${escapeHtml(businessName)}" placeholder="e.g. Australian Submarine Agency"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Client Address</label><input type="text" name="clientAddress" value="${escapeHtml(clientAddress)}" placeholder="123 Main St, Suburb WA 6000"></div>
              <div class="fg"><label>Site Address <span style="color:#5a6a7a;font-weight:400;">(if different from client)</span></label><input type="text" name="siteAddress" value="${escapeHtml(siteAddress)}" placeholder="Leave blank if same as client address"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Salutation <span style="color:#5a6a7a;font-weight:400;">(if not "Dear [first name]")</span></label><input type="text" name="salutation" value="${escapeHtml(salutation)}" placeholder="e.g. To Whom It May Concern,"></div>
              <div class="fg"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Phone</label><input type="text" id="clientPhone" name="clientPhone" value="${escapeHtml(clientPhone)}" placeholder="0412 345 678"></div>
              <div class="fg"><label>Email</label><input type="text" id="clientEmail" value="${escapeHtml(clientEmail)}" placeholder="john@example.com"></div>
            </div>
            <div class="fg">
              <label>Property Type</label>
              <input type="hidden" name="propertyType" id="propertyTypeInput" value="${escapeHtml(propertyType)}">
              <div style="display:flex;gap:0;margin-top:4px;">
                <button type="button" id="btn-residential" onclick="setPropertyType('residential')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:6px 0 0 6px;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;${propertyType === 'residential' ? "background:#78e4ff;color:#0a0e27;border-color:#78e4ff;" : "background:#1a2236;color:#8a9ab5;"}">Residential</button>
                <button type="button" id="btn-commercial" onclick="setPropertyType('commercial')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:0 6px 6px 0;border-left:none;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;${propertyType === 'commercial' ? "background:#78e4ff;color:#0a0e27;border-color:#78e4ff;" : "background:#1a2236;color:#8a9ab5;"}">Commercial</button>
              </div>
            </div>
            <div class="fg">
              <label>Proposal Type</label>
              <input type="hidden" name="proposalType" id="proposalTypeInput" value="${escapeHtml(proposalType)}">
              <div style="display:flex;gap:0;margin-top:4px;">
                <button type="button" id="btn-pt-install" onclick="setProposalType('')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:6px 0 0 6px;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;${proposalType === '' ? "background:#78e4ff;color:#0a0e27;border-color:#78e4ff;" : "background:#1a2236;color:#8a9ab5;"}">Installation</button>
                <button type="button" id="btn-pt-supply-only" onclick="setProposalType('Supply Only')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-left:none;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;${proposalType === 'Supply Only' ? "background:#78e4ff;color:#0a0e27;border-color:#78e4ff;" : "background:#1a2236;color:#8a9ab5;"}">Supply Only</button>
                <button type="button" id="btn-pt-supply-prog" onclick="setProposalType('Supply + Programming')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:0 6px 6px 0;border-left:none;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;${proposalType === 'Supply + Programming' ? "background:#78e4ff;color:#0a0e27;border-color:#78e4ff;" : "background:#1a2236;color:#8a9ab5;"}">Supply + Programming</button>
              </div>
            </div>
            <div class="fg" id="job-type-section">
              <label>Job Type</label>
              <div style="display:flex;gap:0;margin-top:4px;">
                <button type="button" id="btn-jt-cctv" onclick="setJobType('cctv')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:6px 0 0 6px;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;background:#78e4ff;color:#0a0e27;border-color:#78e4ff;">CCTV</button>
                <button type="button" id="btn-jt-alarm" onclick="setJobType('alarm')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-left:none;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;background:#1a2236;color:#8a9ab5;">Alarm</button>
                <button type="button" id="btn-jt-combined" onclick="setJobType('combined')" style="flex:1;padding:8px 0;border:1px solid #3a4a5c;border-radius:0 6px 6px 0;border-left:none;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;background:#1a2236;color:#8a9ab5;">Alarm & CCTV</button>
              </div>
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
          <h2 class="card-title" style="margin-bottom:12px;">Package & Pricing</h2>
          <div id="additional-packages">${additionalPkgHtml}</div>
          <button type="button" class="btn-add" style="margin-top:12px;" onclick="addPackageOption()">+ Add Package Option</button>
          <div class="card" style="margin-top:16px;">
            <h2 class="card-title">Base Quantity <span style="color:#5a6a7a;font-weight:400;font-size:13px;">(optional)</span></h2>
            <p class="card-hint">Enable when the customer needs to choose how many of the main item they want (e.g. solar poles). Upgrade options will auto-sync to the chosen quantity.</p>
            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;font-weight:600;color:#e0e6ed;">
                <input type="checkbox" id="baseQtyEnabledInput" ${baseQtyEnabled ? 'checked' : ''} onchange="document.getElementById('baseMaxQtyWrap').style.display=this.checked?'flex':'none'" style="width:16px;height:16px;accent-color:#78e4ff;">
                Allow customer to choose quantity
              </label>
              <div id="baseMaxQtyWrap" style="display:${baseQtyEnabled ? 'flex' : 'none'};align-items:center;gap:8px;">
                <label style="font-size:13px;color:#8899aa;">Max qty:</label>
                <input type="number" id="baseMaxQtyInput" value="${baseMaxQty}" min="1" step="1" style="width:70px;padding:6px 10px;background:#1a2332;border:2px solid #2a3a4a;border-radius:6px;color:#e0e6ed;font-size:14px;font-family:inherit;">
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:16px;">
            <h2 class="card-title">Optional Upgrades <span style="color:#5a6a7a;font-weight:400;font-size:13px;">(customer can toggle these on/off)</span></h2>
            <p class="card-hint">Add options the customer can add to their package.</p>
            <div id="camera-list">${cameraRowsHtml}</div>
            <button type="button" class="btn-add" onclick="addCameraRow()">+ Add Upgrade Option</button>
          </div>
          <div class="card" id="install-option-card" style="margin-top:16px;${proposalType ? '' : 'display:none;'}">
            <h2 class="card-title">Installation Option <span style="color:#5a6a7a;font-weight:400;font-size:13px;">(supply proposals only)</span></h2>
            <p class="card-hint">When set, shows a "Professional Installation" upgrade the client can add on. Ticking it automatically updates the proposal steps.</p>
            <div class="form-row">
              <div class="fg" style="max-width:220px;">
                <label>Installation Price ($) <span style="color:#5a6a7a;font-weight:400;">(leave blank to hide)</span></label>
                <input type="number" name="installOptionPrice" id="installOptionPriceInput" value="${installOptionPrice || ''}" step="1" min="0" placeholder="e.g. 1200">
              </div>
            </div>
          </div>
          <div class="card" style="margin-top:16px;">
            <h2 class="card-title">Discount <span style="color:#5a6a7a;font-weight:400;font-size:13px;">(optional \u2014 shown on customer proposal)</span></h2>
            <div class="form-row">
              <div class="fg"><label>Discount Name</label><input type="text" name="discountName" value="${escapeHtml(discountName)}" placeholder="e.g. Early Bird Special"></div>
              <div class="fg"><label>Type</label>
                <select name="discountType" style="width:100%;padding:10px 12px;border:1px solid #d0d8e0;border-radius:8px;font-size:14px;font-family:inherit;">
                  <option value=""${!discountType ? ' selected' : ''}>None</option>
                  <option value="percentage"${discountType === 'percentage' ? ' selected' : ''}>Percentage (%)</option>
                  <option value="fixed"${discountType === 'fixed' ? ' selected' : ''}>Fixed Amount ($)</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Value</label><input type="number" name="discountValue" value="${escapeHtml(String(discountValue))}" step="1" min="0" placeholder="e.g. 10"></div>
              <div class="fg"><label>Valid Until</label><input type="date" name="discountExpires" value="${escapeHtml(discountExpires)}"></div>
            </div>
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
            <p class="card-hint">These appear after the customer pays. Add, edit or remove items. All prices inc. GST.</p>

            <div style="font-size:12px;font-weight:700;color:#8899aa;text-transform:uppercase;letter-spacing:1.5px;margin:20px 0 10px;">One-Time Add-Ons</div>
            <div id="oto-onetime-list">${otoOneTimeHtml}</div>
            <button type="button" class="btn-add" onclick="addOtoItem('onetime')">+ Add One-Time Item</button>

            <div style="font-size:12px;font-weight:700;color:#8899aa;text-transform:uppercase;letter-spacing:1.5px;margin:24px 0 10px;">Recurring</div>
            <div id="oto-recurring-list">${otoRecurringHtml}</div>
            <button type="button" class="btn-add" onclick="addOtoItem('recurring')">+ Add Recurring Item</button>
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

          <div class="card" style="margin-top:16px;">
            <h2 class="card-title">Product Datasheets</h2>
            <p class="card-hint">Upload PDF datasheets — each page becomes a full-page image in the proposal. Click &times; to remove any pages you don't need.</p>
            <div class="photo-grid" id="datasheet-grid">${datasheetThumbsHtml}</div>
            <div class="fg">
              <input type="file" id="datasheetUpload" accept="application/pdf" multiple style="display:none;">
              <button type="button" class="btn-add" onclick="document.getElementById('datasheetUpload').click()" style="width:100%;padding:20px;">
                + Upload Datasheets (PDF)
              </button>
              <div id="datasheet-upload-status" style="margin-top:8px;font-size:13px;color:#8899aa;text-align:center;"></div>
            </div>
          </div>

          <div class="card" style="margin-top:16px;background:linear-gradient(135deg,#0a1628,#0f1e30);border-color:#00d4ff;">
            <h2 class="card-title" style="color:#00d4ff;">Ready to Go</h2>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <button type="button" class="btn-save" onclick="saveProposal(false)">Save as Draft</button>
              <button type="button" class="btn-send" onclick="openSendModal()">Save & Send to Client</button>
              ${isEdit ? `<a id="preview-proposal-link" href="/proposals/${escapeHtml(projectNumber)}" target="_blank" class="btn-preview">Preview Proposal</a>
              <a id="preview-oto-link" href="/offers/${escapeHtml(projectNumber)}" target="_blank" class="btn-preview">Preview OTO Page</a>` : ''}
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
        <input type="hidden" name="datasheetPhotoUrls" id="h-datasheets">
      </form>

      <!-- Send Preview Modal -->
      <div id="sendModal" class="send-modal-overlay" style="display:none;">
        <div class="send-modal">
          <div class="send-modal-header">
            <h2 id="sendModalTitle">Send Proposal</h2>
            <button type="button" class="send-modal-close" onclick="closeSendModal()">&times;</button>
          </div>
          <div class="send-modal-body">
            <div class="fg">
              <label>Phone Number</label>
              <input type="text" id="sendPhone" placeholder="0412 345 678">
            </div>

            <div class="send-modal-section">
              <label style="display:block;font-size:12px;color:#8899aa;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">Payment Summary</label>
              <div id="sendPackageList"></div>
            </div>

            <div class="fg">
              <label>SMS Message <span style="color:#5a6a7a;font-weight:400;">(edit before sending)</span></label>
              <textarea id="sendMessage" rows="8" style="font-size:13px;line-height:1.6;"></textarea>
            </div>

            <div id="sendModalStatus" style="font-size:14px;margin-bottom:12px;"></div>

            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <button type="button" class="btn-send" id="sendModalBtn" onclick="sendFromModal()">Send</button>
              <button type="button" class="btn-back" onclick="closeSendModal()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
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
    textarea.clarification-input { resize:vertical; min-height:60px; line-height:1.5; }
    .clarification-row { align-items:flex-start; }
    .clarification-row .drag-handle, .clarification-row .row-num { margin-top:10px; }
    .clarification-row .row-actions { display:flex; flex-direction:column; gap:4px; margin-top:4px; }
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

    .camera-row { display:grid; grid-template-columns:16px 1fr 1.5fr 80px 75px 32px 30px 32px; gap:8px; align-items:center; margin-bottom:8px; }
    .cam-name, .cam-desc, .cam-price {
      padding:9px 12px; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px;
      color:#e0e6ed; font-size:14px; font-family:inherit;
    }
    .cam-name:focus, .cam-desc:focus, .cam-price:focus { border-color:#00d4ff; outline:none; }
    .cam-disc-label { display:flex; align-items:center; gap:3px; color:#78e4ff; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
    .cam-disc-label input { width:auto; cursor:pointer; }

    .pkg-card { background:#1a2332; border:2px solid #2a3a4a; border-radius:10px; padding:16px; margin-top:12px; transition:opacity 0.2s; }
    .pkg-card.dragging { opacity:0.4; }
    .pkg-card.pkg-drag-over-above { border-top-color:#00d4ff; }
    .pkg-card.pkg-drag-over-below { border-bottom-color:#00d4ff; }
    .pkg-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:10px; }
    .pkg-drag-handle { cursor:grab; color:#3a4a5a; font-size:16px; user-select:none; }
    .pkg-drag-handle:hover { color:#8899aa; }
    .pkg-drag-handle:active { cursor:grabbing; }
    .pkg-card .fg { margin-bottom:8px; }
    .pkg-card .fg label { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#5a6a7a; font-weight:700; margin-bottom:4px; display:block; }
    .pkg-card .fg input { width:100%; padding:9px 12px; background:#0f1419; border:2px solid #2a3a4a; border-radius:8px; color:#e0e6ed; font-size:14px; font-family:inherit; box-sizing:border-box; }
    .pkg-card .fg input:focus { border-color:#00d4ff; outline:none; }
    .pkg-card .fg-row { display:grid; grid-template-columns:1fr auto; gap:12px; }

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

    .oto-badge-onetime { font-size:9px; font-weight:700; color:#8899aa; background:#1e2a3a; padding:2px 8px; border-radius:10px; letter-spacing:1px; margin-left:auto; }
    .oto-badge-recurring { font-size:9px; font-weight:700; color:#22c55e; background:rgba(34,197,94,0.1); padding:2px 8px; border-radius:10px; letter-spacing:1px; margin-left:auto; }

    .photo-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); gap:10px; margin-bottom:14px; }
    .photo-thumb { position:relative; aspect-ratio:1; border-radius:8px; overflow:hidden; border:2px solid #2a3a4a; cursor:grab; }
    .photo-thumb.dragging { opacity:0.35; border-color:#00d4ff; }
    .photo-thumb img { width:100%; height:100%; object-fit:cover; }
    .photo-remove {
      position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.7); color:white; border:none;
      border-radius:50%; width:22px; height:22px; font-size:14px; cursor:pointer; line-height:22px; padding:0;
    }

    .send-modal-overlay {
      position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7);
      z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;
    }
    .send-modal {
      background:#0f1419; border:2px solid #2a3a4a; border-radius:16px; width:100%; max-width:560px;
      max-height:90vh; overflow-y:auto;
    }
    .send-modal-header {
      display:flex; justify-content:space-between; align-items:center; padding:20px 24px;
      border-bottom:1px solid #2a3a4a;
    }
    .send-modal-header h2 { font-size:18px; color:#e0e6ed; margin:0; }
    .send-modal-close {
      background:none; border:none; color:#5a6a7a; font-size:24px; cursor:pointer; padding:4px 8px;
    }
    .send-modal-close:hover { color:#ff5252; }
    .send-modal-body { padding:24px; }
    .send-modal-section { margin-bottom:16px; }
    .send-pkg-row {
      display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
      background:#1a2332; border:1px solid #2a3a4a; border-radius:8px; margin-bottom:6px;
    }
    .send-pkg-row .pkg-info { display:flex; align-items:center; gap:8px; }
    .send-pkg-row .pkg-check { color:#4caf50; font-size:16px; }
    .send-pkg-row .pkg-label { color:#e0e6ed; font-size:14px; font-weight:500; }
    .send-pkg-row .pkg-amount { color:#00d4ff; font-size:15px; font-weight:700; }
    .send-pkg-row .btn-preview-checkout {
      background:none; border:1px solid #3a4a5a; border-radius:6px; color:#8899aa; font-size:11px;
      padding:4px 10px; cursor:pointer; margin-left:10px; white-space:nowrap;
    }
    .send-pkg-row .btn-preview-checkout:hover { border-color:#00d4ff; color:#00d4ff; }

    #customerDropdown { scrollbar-width:thin; scrollbar-color:#2a3a4a #1a2332; }
    #engagementSelect option { padding:8px; }

    @media (max-width:768px) {
      .form-row { grid-template-columns:1fr; }
      .camera-row { grid-template-columns:16px 1fr 75px 32px; }
      .steps-bar { gap:2px; }
      .step-tab { font-size:11px; padding:8px 4px; }
    }
  `;

  const customScripts = `<script>
    let currentStep = 1;
    let uploadedPhotoUrls = ${JSON.stringify(sitePhotoUrls)};
    let uploadedDatasheetUrls = ${JSON.stringify(datasheetPhotoUrls)};
    window.JOB_TYPE_TEMPLATES = ${JSON.stringify(jobTypeTemplates)};
    var IS_NEW_PROPOSAL = ${!isEdit && !isClone};

    function addOtoItem(type) {
      const list = document.getElementById('oto-' + type + '-list');
      const div = document.createElement('div');
      div.className = 'pkg-card';
      div.dataset.otoType = type;
      div.draggable = true;
      const isRec = type === 'recurring';
      const badge = isRec ? '<span class="oto-badge-recurring">MONTHLY</span>' : '<span class="oto-badge-onetime">ONE-TIME</span>';
      const color = isRec ? '#22c55e' : '#00d4ff';
      const label = isRec ? 'Recurring Item' : 'One-Time Item';
      const priceLabel = isRec ? 'Monthly ($)' : 'Price ($)';
      const wasCol = isRec ? '' : '<div class="fg" style="max-width:120px;"><label>Was ($)</label><input type="number" class="oto-item-was" placeholder="" step="1"></div>';
      div.innerHTML = '<div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:' + color + ';font-weight:700;">' + label + '</span>' + badge + '<button type="button" class="row-remove" onclick="this.closest(\\'.pkg-card\\').remove()" title="Remove">&times;</button></div><div class="fg-row"><div class="fg"><label>Name</label><input type="text" class="oto-item-name" placeholder="Item name"></div><div class="fg" style="max-width:120px;"><label>' + priceLabel + '</label><input type="number" class="oto-item-price" placeholder="0" step="1"></div>' + wasCol + '</div><div class="fg"><label>Description</label><input type="text" class="oto-item-desc" placeholder="What does this include?"></div>';
      list.appendChild(div);
      initPkgDrag(div);
      div.querySelector('.oto-item-name').focus();
    }

    function setBrand(val) {
      document.getElementById('brandInput').value = val;
      const btnGws = document.getElementById('btn-brand-gws');
      const btnTag = document.getElementById('btn-brand-tag');
      if (val === 'Great White Security (WA)') {
        btnGws.style.background = '#78e4ff'; btnGws.style.color = '#0a0e27'; btnGws.style.borderColor = '#78e4ff';
        btnTag.style.background = '#1a2236'; btnTag.style.color = '#8a9ab5'; btnTag.style.borderColor = '#3a4a5c';
      } else {
        btnTag.style.background = '#78e4ff'; btnTag.style.color = '#0a0e27'; btnTag.style.borderColor = '#78e4ff';
        btnGws.style.background = '#1a2236'; btnGws.style.color = '#8a9ab5'; btnGws.style.borderColor = '#3a4a5c';
      }
    }

    function setPropertyType(type) {
      document.getElementById('propertyTypeInput').value = type;
      const btnR = document.getElementById('btn-residential');
      const btnC = document.getElementById('btn-commercial');
      if (type === 'commercial') {
        btnC.style.background = '#78e4ff'; btnC.style.color = '#0a0e27'; btnC.style.borderColor = '#78e4ff';
        btnR.style.background = '#1a2236'; btnR.style.color = '#8a9ab5'; btnR.style.borderColor = '#3a4a5c';
      } else {
        btnR.style.background = '#78e4ff'; btnR.style.color = '#0a0e27'; btnR.style.borderColor = '#78e4ff';
        btnC.style.background = '#1a2236'; btnC.style.color = '#8a9ab5'; btnC.style.borderColor = '#3a4a5c';
      }
    }

    function setProposalType(val) {
      document.getElementById('proposalTypeInput').value = val;
      ['install','supply-only','supply-prog'].forEach(function(id) {
        const btn = document.getElementById('btn-pt-' + id);
        if (!btn) return;
        btn.style.background = '#1a2236';
        btn.style.color = '#8a9ab5';
        btn.style.borderColor = '#3a4a5c';
      });
      const activeId = val === 'Supply Only' ? 'btn-pt-supply-only' : val === 'Supply + Programming' ? 'btn-pt-supply-prog' : 'btn-pt-install';
      const activeBtn = document.getElementById(activeId);
      if (activeBtn) {
        activeBtn.style.background = '#78e4ff';
        activeBtn.style.color = '#0a0e27';
        activeBtn.style.borderColor = '#78e4ff';
      }
      const installCard = document.getElementById('install-option-card');
      if (installCard) installCard.style.display = val ? 'block' : 'none';
      if (IS_NEW_PROPOSAL) setJobType('cctv');
    }

    function setJobType(type) {
      const ptVal = document.getElementById('proposalTypeInput') ? document.getElementById('proposalTypeInput').value : '';
      const isSupplyMode = ptVal === 'Supply Only' || ptVal === 'Supply + Programming';
      const key = isSupplyMode ? ('supply-' + type) : type;
      const tpl = window.JOB_TYPE_TEMPLATES[key] || window.JOB_TYPE_TEMPLATES[type];
      if (!tpl) return;

      // Update button highlights
      ['cctv','alarm','combined'].forEach(t => {
        const btn = document.getElementById('btn-jt-' + t);
        if (!btn) return;
        if (t === type) {
          btn.style.background = '#78e4ff'; btn.style.color = '#0a0e27'; btn.style.borderColor = '#78e4ff';
        } else {
          btn.style.background = '#1a2236'; btn.style.color = '#8a9ab5'; btn.style.borderColor = '#3a4a5c';
        }
      });

      // Rebuild scope
      const scopeList = document.getElementById('scope-list');
      scopeList.innerHTML = '';
      tpl.scope.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.dataset.list = 'scope';
        row.draggable = true;
        row.innerHTML = makeScopeRowHtml();
        row.querySelector('.list-input').value = item || '';
        scopeList.appendChild(row);
        initDragRow(row);
      });
      renumberScope();

      // Rebuild deliverables
      const delList = document.getElementById('deliverable-list');
      delList.innerHTML = '';
      tpl.deliverables.forEach(d => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.dataset.list = 'deliverable';
        row.draggable = true;
        row.innerHTML = makeDeliverableRowHtml();
        row.querySelector('.qty-input').value = d.qty || '';
        row.querySelector('.list-input').value = d.description || '';
        delList.appendChild(row);
        initDragRow(row);
      });

      // Rebuild packages
      const pkgList = document.getElementById('additional-packages');
      pkgList.innerHTML = '';
      tpl.packages.forEach((pkg, i) => {
        const div = document.createElement('div');
        div.className = 'pkg-card';
        div.draggable = true;
        div.innerHTML = '<div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:#00d4ff;font-weight:700;">Package ' + (i + 1) + '</span><button type="button" class="row-remove" onclick="removePackage(this)" title="Remove package">&times;</button></div><div class="fg-row"><div class="fg"><label>Package Name</label><input type="text" class="pkg-name" value="" placeholder="e.g. Complete 4-Camera CCTV Package"></div><div class="fg" style="max-width:150px;"><label>Total Price (Inc. GST)</label><input type="number" class="pkg-price" value="" placeholder="Price" step="1"></div></div><div class="fg"><label>Short Description</label><input type="text" class="pkg-desc" value="" placeholder="Supply & install security system with NVR"></div>';
        div.querySelector('.pkg-name').value = pkg.name || '';
        div.querySelector('.pkg-price').value = pkg.price || '';
        div.querySelector('.pkg-desc').value = pkg.description || '';
        pkgList.appendChild(div);
        initPkgDrag(div);
      });

      // Rebuild upgrades
      const camList = document.getElementById('camera-list');
      camList.innerHTML = '';
      tpl.upgrades.forEach(opt => {
        const row = document.createElement('div');
        row.className = 'list-row camera-row';
        row.dataset.list = 'camera';
        row.draggable = true;
        row.innerHTML = '<span class="drag-handle" title="Drag to reorder">&#9776;</span><input type="text" class="cam-name" placeholder="Option name"><input type="text" class="cam-desc" placeholder="Description"><input type="number" class="cam-price" placeholder="Price" step="1"><input type="number" class="cam-bundle" placeholder="Bundle $" step="1" title="Bundle saving shown to customer"><label class="cam-disc-label" title="Apply discount to this upgrade"><input type="checkbox" class="cam-disc" checked> %</label><button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>';
        row.querySelector('.cam-name').value = opt.name || '';
        row.querySelector('.cam-desc').value = opt.description || '';
        row.querySelector('.cam-price').value = opt.price || '';
        camList.appendChild(row);
        initDragRow(row);
      });

      // Rebuild OTO one-time
      const otoOTList = document.getElementById('oto-onetime-list');
      otoOTList.innerHTML = '';
      (tpl.otoOneTime || []).forEach(item => {
        const div = document.createElement('div');
        div.className = 'pkg-card';
        div.dataset.otoType = 'onetime';
        div.draggable = true;
        div.innerHTML = '<div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:#00d4ff;font-weight:700;">One-Time Item</span><span class="oto-badge-onetime">ONE-TIME</span><button type="button" class="row-remove" onclick="this.closest(\\'.pkg-card\\').remove()" title="Remove">&times;</button></div><div class="fg-row"><div class="fg"><label>Name</label><input type="text" class="oto-item-name" placeholder="Item name"></div><div class="fg" style="max-width:120px;"><label>Price ($)</label><input type="number" class="oto-item-price" placeholder="0" step="1"></div><div class="fg" style="max-width:120px;"><label>Was ($)</label><input type="number" class="oto-item-was" placeholder="" step="1"></div></div><div class="fg"><label>Description</label><input type="text" class="oto-item-desc" placeholder="What does this include?"></div>';
        div.querySelector('.oto-item-name').value = item.name || '';
        div.querySelector('.oto-item-price').value = item.price || '';
        if (div.querySelector('.oto-item-was')) div.querySelector('.oto-item-was').value = item.wasPrice || '';
        div.querySelector('.oto-item-desc').value = item.description || '';
        otoOTList.appendChild(div);
        initPkgDrag(div);
      });

      // Rebuild OTO recurring
      const otoRecList = document.getElementById('oto-recurring-list');
      otoRecList.innerHTML = '';
      (tpl.otoRecurring || []).forEach(item => {
        const div = document.createElement('div');
        div.className = 'pkg-card';
        div.dataset.otoType = 'recurring';
        div.draggable = true;
        div.innerHTML = '<div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:#22c55e;font-weight:700;">Recurring Item</span><span class="oto-badge-recurring">MONTHLY</span><button type="button" class="row-remove" onclick="this.closest(\\'.pkg-card\\').remove()" title="Remove">&times;</button></div><div class="fg-row"><div class="fg"><label>Name</label><input type="text" class="oto-item-name" placeholder="e.g. After Install Support Package"></div><div class="fg" style="max-width:120px;"><label>Monthly ($)</label><input type="number" class="oto-item-price" placeholder="97" step="1"></div></div><div class="fg"><label>Description</label><input type="text" class="oto-item-desc" placeholder="What does this include?"></div>';
        div.querySelector('.oto-item-name').value = item.name || '';
        div.querySelector('.oto-item-price').value = item.price || '';
        div.querySelector('.oto-item-desc').value = item.description || '';
        otoRecList.appendChild(div);
        initPkgDrag(div);
      });

      // Rebuild clarifications
      const clarList = document.getElementById('clarification-list');
      clarList.innerHTML = '';
      tpl.clarifications.forEach(c => {
        const row = document.createElement('div');
        row.className = 'list-row clarification-row';
        row.dataset.list = 'clarification';
        row.draggable = true;
        row.innerHTML = makeClarificationRowHtml();
        row.querySelector('.list-input').value = c || '';
        clarList.appendChild(row);
        initDragRow(row);
      });
      renumberScope();
    }

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
      return '<span class="drag-handle" title="Drag to reorder">&#9776;</span><span class="row-num"></span><textarea class="list-input clarification-input" rows="3" placeholder="Enter clarification..."></textarea><div class="row-actions"><button type="button" class="row-insert" onclick="insertRowBelow(this,\\'clarification\\')" title="Add item below">+</button><button type="button" class="row-remove" onclick="removeRow(this)">&times;</button></div>';
    }

    function addClarificationRow() {
      const list = document.getElementById('clarification-list');
      const row = document.createElement('div');
      row.className = 'list-row clarification-row';
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
      row.className = type === 'clarification' ? 'list-row clarification-row' : 'list-row';
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

    // ── Package Card Drag & Drop ──
    let dragPkg = null;

    function initPkgDrag(card) {
      card.addEventListener('dragstart', function(e) {
        dragPkg = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        document.querySelectorAll('.pkg-drag-over-above,.pkg-drag-over-below').forEach(el => {
          el.classList.remove('pkg-drag-over-above','pkg-drag-over-below');
        });
        dragPkg = null;
        renumberPackages();
      });
      card.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (!dragPkg || dragPkg === this) return;
        e.dataTransfer.dropEffect = 'move';
        const rect = this.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        this.classList.remove('pkg-drag-over-above','pkg-drag-over-below');
        if (e.clientY < mid) this.classList.add('pkg-drag-over-above');
        else this.classList.add('pkg-drag-over-below');
      });
      card.addEventListener('dragleave', function() {
        this.classList.remove('pkg-drag-over-above','pkg-drag-over-below');
      });
      card.addEventListener('drop', function(e) {
        e.preventDefault();
        if (!dragPkg || dragPkg === this) return;
        const rect = this.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) this.before(dragPkg);
        else this.after(dragPkg);
        this.classList.remove('pkg-drag-over-above','pkg-drag-over-below');
        renumberPackages();
      });
    }

    function renumberPackages() {
      document.querySelectorAll('#additional-packages .pkg-card').forEach((card, i) => {
        const label = card.querySelector('.pkg-card-header span[style]');
        if (label) label.textContent = 'Package ' + (i + 1);
      });
    }

    // Init drag on existing package and OTO cards
    document.querySelectorAll('#additional-packages .pkg-card[draggable]').forEach(initPkgDrag);
    document.querySelectorAll('#oto-onetime-list .pkg-card[draggable]').forEach(initPkgDrag);
    document.querySelectorAll('#oto-recurring-list .pkg-card[draggable]').forEach(initPkgDrag);

    function toggleQtyMaxInput(cb) {
      cb.closest('.camera-row').querySelector('.cam-max-qty').style.display = cb.checked ? 'inline-block' : 'none';
    }

    function addCameraRow() {
      const list = document.getElementById('camera-list');
      const row = document.createElement('div');
      row.className = 'list-row camera-row';
      row.dataset.list = 'camera';
      row.draggable = true;
      row.innerHTML = '<span class="drag-handle" title="Drag to reorder">&#9776;</span><input type="text" class="cam-name" placeholder="Option name"><input type="text" class="cam-desc" placeholder="Description"><input type="number" class="cam-price" placeholder="Price" step="1"><input type="number" class="cam-bundle" placeholder="Bundle $" step="1" title="Bundle saving shown to customer"><label class="cam-disc-label" title="Apply early bird discount to this upgrade"><input type="checkbox" class="cam-disc" checked> %</label><label class="cam-disc-label" title="Recurring monthly charge" style="color:#ffa726"><input type="checkbox" class="cam-monthly"> /mo</label><label class="cam-disc-label" title="Pre-selected for customer by default" style="color:#4ade80"><input type="checkbox" class="cam-default"> &#9733;</label><label class="cam-disc-label" title="Allow customer to select quantity" style="color:#c084fc"><input type="checkbox" class="cam-qty-enabled" onchange="toggleQtyMaxInput(this)"> qty</label><input type="number" class="cam-max-qty" value="10" placeholder="max" step="1" min="1" style="width:48px;display:none;" title="Max quantity"><button type="button" class="row-remove" onclick="removeRow(this)">&times;</button>';
      list.appendChild(row);
      initDragRow(row);
      row.querySelector('.cam-name').focus();
    }

    function addPackageOption() {
      const list = document.getElementById('additional-packages');
      const idx = list.querySelectorAll('.pkg-card').length + 1;
      const div = document.createElement('div');
      div.className = 'pkg-card';
      div.draggable = true;
      div.innerHTML = '<div class="pkg-card-header"><span class="pkg-drag-handle" title="Drag to reorder">&#9776;</span><span style="color:#00d4ff;font-weight:700;">Package ' + idx + '</span><button type="button" class="row-remove" onclick="removePackage(this)" title="Remove package">&times;</button></div><div class="fg-row"><div class="fg"><label>Package Name</label><input type="text" class="pkg-name" placeholder="e.g. Ajax Alarm Package"></div><div class="fg" style="max-width:150px;"><label>Total Price (Inc. GST)</label><input type="number" class="pkg-price" placeholder="Price" step="1"></div></div><div class="fg"><label>Short Description</label><input type="text" class="pkg-desc" placeholder="e.g. Wireless alarm with Ajax hub + sensors"></div>';
      list.appendChild(div);
      initPkgDrag(div);
      div.querySelector('.pkg-name').focus();
    }

    function removePackage(btn) {
      const list = document.getElementById('additional-packages');
      if (list.querySelectorAll('.pkg-card').length <= 1) {
        alert('You need at least one package.');
        return;
      }
      btn.closest('.pkg-card').remove();
      renumberPackages();
    }

    function removePhoto(btn) {
      const thumb = btn.closest('.photo-thumb');
      const url = thumb.dataset.url;
      uploadedPhotoUrls = uploadedPhotoUrls.filter(u => u !== url);
      thumb.remove();
    }

    function initPhotoDrag() {
      const grid = document.getElementById('photo-grid');
      let dragSrc = null;
      grid.addEventListener('dragstart', e => {
        const thumb = e.target.closest('.photo-thumb');
        if (!thumb) return;
        dragSrc = thumb;
        thumb.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      grid.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const thumb = e.target.closest('.photo-thumb');
        if (!thumb || thumb === dragSrc) return;
        const rect = thumb.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
          grid.insertBefore(dragSrc, thumb);
        } else {
          grid.insertBefore(dragSrc, thumb.nextSibling);
        }
      });
      grid.addEventListener('dragend', () => {
        if (dragSrc) dragSrc.classList.remove('dragging');
        dragSrc = null;
        uploadedPhotoUrls = Array.from(grid.querySelectorAll('.photo-thumb')).map(t => t.dataset.url);
      });
    }
    initPhotoDrag();

    function removeDatasheet(btn) {
      const thumb = btn.closest('.photo-thumb');
      const url = thumb.dataset.url;
      uploadedDatasheetUrls = uploadedDatasheetUrls.filter(u => u !== url);
      thumb.remove();
    }

    function initDatasheetDrag() {
      const grid = document.getElementById('datasheet-grid');
      let dragSrc = null;
      grid.addEventListener('dragstart', e => {
        const thumb = e.target.closest('.photo-thumb');
        if (!thumb) return;
        dragSrc = thumb;
        thumb.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      grid.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const thumb = e.target.closest('.photo-thumb');
        if (!thumb || thumb === dragSrc) return;
        const rect = thumb.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
          grid.insertBefore(dragSrc, thumb);
        } else {
          grid.insertBefore(dragSrc, thumb.nextSibling);
        }
      });
      grid.addEventListener('dragend', () => {
        if (dragSrc) dragSrc.classList.remove('dragging');
        dragSrc = null;
        uploadedDatasheetUrls = Array.from(grid.querySelectorAll('.photo-thumb')).map(t => t.dataset.url);
      });
    }
    initDatasheetDrag();

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

      // Collect all packages — first card is base package, rest are option groups
      const allCards = document.querySelectorAll('#additional-packages .pkg-card');
      const addlPkgs = [];
      allCards.forEach((card, i) => {
        const name = card.querySelector('.pkg-name').value.trim();
        const desc = card.querySelector('.pkg-desc').value.trim();
        const price = parseFloat(card.querySelector('.pkg-price').value) || 0;
        if (i === 0) {
          data.packageName = name;
          data.basePrice = price;
          data.packageDescription = desc;
        } else {
          if (name) addlPkgs.push({ name, description: desc, price });
        }
      });
      data.optionGroups = JSON.stringify(addlPkgs);

      // Collect camera options
      const cameras = [];
      document.querySelectorAll('#camera-list .camera-row').forEach(row => {
        const name = row.querySelector('.cam-name').value.trim();
        const desc = row.querySelector('.cam-desc').value.trim();
        const price = parseFloat(row.querySelector('.cam-price').value) || 0;
        const bundleSaving = parseFloat(row.querySelector('.cam-bundle')?.value) || 0;
        const discountable = row.querySelector('.cam-disc') ? row.querySelector('.cam-disc').checked : true;
        const monthly = row.querySelector('.cam-monthly') ? row.querySelector('.cam-monthly').checked : false;
        const defaultSelected = row.querySelector('.cam-default') ? row.querySelector('.cam-default').checked : false;
        const qtyEnabled = row.querySelector('.cam-qty-enabled')?.checked || false;
        const maxQty = qtyEnabled ? (parseInt(row.querySelector('.cam-max-qty')?.value) || 10) : undefined;
        if (name) cameras.push({ name, description: desc, price, ...(bundleSaving > 0 ? { bundleSaving } : {}), discountable, monthly, ...(defaultSelected ? { defaultSelected: true } : {}), ...(qtyEnabled ? { qtyEnabled: true, maxQty: maxQty || 10 } : {}) });
      });
      data.cameraOptions = JSON.stringify(cameras);

      // Collect OTO items
      const otoItems = [];
      document.querySelectorAll('#oto-onetime-list .pkg-card').forEach(card => {
        const name = card.querySelector('.oto-item-name').value.trim();
        const desc = card.querySelector('.oto-item-desc').value.trim();
        const price = parseFloat(card.querySelector('.oto-item-price').value) || 0;
        const wasPrice = parseFloat(card.querySelector('.oto-item-was')?.value) || 0;
        if (name) otoItems.push({ name, description: desc, price, wasPrice, monthly: false });
      });
      document.querySelectorAll('#oto-recurring-list .pkg-card').forEach(card => {
        const name = card.querySelector('.oto-item-name').value.trim();
        const desc = card.querySelector('.oto-item-desc').value.trim();
        const price = parseFloat(card.querySelector('.oto-item-price').value) || 0;
        if (name) otoItems.push({ name, description: desc, price, wasPrice: 0, monthly: true });
      });
      data.otoItems = JSON.stringify(otoItems);

      // Base quantity
      const baseQtyEnabledEl = document.getElementById('baseQtyEnabledInput');
      data.baseQtyEnabled = baseQtyEnabledEl ? baseQtyEnabledEl.checked : false;
      data.baseMaxQty = parseInt(document.getElementById('baseMaxQtyInput')?.value) || 10;

      // Photos
      data.sitePhotoUrls = JSON.stringify(uploadedPhotoUrls);
      data.datasheetPhotoUrls = JSON.stringify(uploadedDatasheetUrls);

      return data;
    }

    let savedProposalId = '${isEdit ? proposal.id : ''}';

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
          return null;
        }

        savedProposalId = result.id || savedProposalId;
        status.textContent = 'Saved!';
        status.style.color = '#4caf50';

        ${!isEdit ? "if (result.id) { setTimeout(() => { window.location = '/admin/proposals/edit/' + result.id; }, 1000); }" : ''}
        return savedProposalId;
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = '#ff5252';
        return null;
      }
    }

    function getPackagesFromForm() {
      const packages = [];
      document.querySelectorAll('#additional-packages .pkg-card').forEach(card => {
        const name = card.querySelector('.pkg-name').value.trim();
        const price = parseFloat(card.querySelector('.pkg-price').value) || 0;
        if (name) packages.push({ name, price });
      });
      return packages;
    }

    async function openSendModal() {
      // Save first
      const status = document.getElementById('save-status');
      status.textContent = 'Saving before send...';
      status.style.color = '#ffd93d';
      const id = await saveProposal(false);
      if (!id) return;

      const clientName = document.querySelector('[name="clientName"]').value.trim() || 'Client';
      const phone = document.getElementById('clientPhone').value.trim();
      const packages = getPackagesFromForm();

      // Set modal title
      document.getElementById('sendModalTitle').textContent = 'Send Proposal to ' + clientName;

      // Set phone
      document.getElementById('sendPhone').value = phone;

      // Build package list
      const listEl = document.getElementById('sendPackageList');
      listEl.innerHTML = '';
      packages.forEach(pkg => {
        const row = document.createElement('div');
        row.className = 'send-pkg-row';
        row.innerHTML = '<div class="pkg-info"><span class="pkg-check">&#10003;</span><span class="pkg-label"></span></div>' +
          '<div style="display:flex;align-items:center;"><span class="pkg-amount">$' + pkg.price.toLocaleString('en-AU') + '</span>' +
          '<button type="button" class="btn-preview-checkout">Preview Checkout</button></div>';
        row.querySelector('.pkg-label').textContent = pkg.name;
        row.querySelector('.btn-preview-checkout').addEventListener('click', function() {
          previewCheckout(pkg.name, pkg.price);
        });
        listEl.appendChild(row);
      });

      // Set default SMS message
      const firstName = clientName.split('&')[0].trim().split(' ')[0] || 'there';
      const fullFirstNames = clientName.includes('&')
        ? clientName.split('&').map(s => s.trim().split(' ')[0]).join(' & ')
        : firstName;
      const brandVal = document.getElementById('brandInput').value;
      if (brandVal === 'The Alarm Guy (SA)') {
        document.getElementById('sendMessage').value = 'Hi ' + fullFirstNames + ', your security proposal from The Alarm Guy is ready!\\n\\nView it here: {proposalUrl}\\n\\nAny questions, give us a call on 0485 001 498.\\n\\nCheers,\\nRicky';
      } else {
        document.getElementById('sendMessage').value = 'Hi ' + fullFirstNames + ', your security proposal from Great White Security is ready!\\n\\nView it here: {proposalUrl}\\n\\nAny questions, give us a call on 0413 346 978.\\n\\nCheers,\\nRicky';
      }

      // Reset and update send button
      const sendBtn = document.getElementById('sendModalBtn');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send to ' + clientName;

      // Show modal
      document.getElementById('sendModal').style.display = 'flex';
      document.getElementById('sendModalStatus').textContent = '';
    }

    function closeSendModal() {
      document.getElementById('sendModal').style.display = 'none';
    }

    async function previewCheckout(packageName, packagePrice) {
      if (!savedProposalId) { alert('Please save the proposal first.'); return; }
      try {
        const resp = await fetch('/api/admin/proposals/' + savedProposalId + '/preview-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageName, packagePrice })
        });
        const result = await resp.json();
        if (result.checkoutUrl) {
          window.open(result.checkoutUrl, '_blank');
        } else {
          alert(result.error || 'Failed to create preview checkout');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function sendFromModal() {
      const phone = document.getElementById('sendPhone').value.trim();
      const message = document.getElementById('sendMessage').value;
      const statusEl = document.getElementById('sendModalStatus');
      const btn = document.getElementById('sendModalBtn');

      if (!phone) { statusEl.textContent = 'Please enter a phone number.'; statusEl.style.color = '#ff5252'; return; }
      if (!savedProposalId) { statusEl.textContent = 'No proposal ID. Save first.'; statusEl.style.color = '#ff5252'; return; }

      btn.disabled = true;
      btn.textContent = 'Sending...';
      statusEl.textContent = 'Sending SMS...';
      statusEl.style.color = '#ffd93d';

      try {
        const resp = await fetch('/api/admin/proposals/' + savedProposalId + '/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, message })
        });
        const result = await resp.json();
        if (result.success) {
          statusEl.textContent = 'Sent! Link: ' + result.shortUrl;
          statusEl.style.color = '#4caf50';
          btn.textContent = 'Sent!';
          document.getElementById('save-status').textContent = 'Saved & Sent! Link: ' + result.shortUrl;
          document.getElementById('save-status').style.color = '#4caf50';
          setTimeout(() => closeSendModal(), 2000);
        } else {
          statusEl.textContent = 'Failed: ' + (result.error || 'Unknown error');
          statusEl.style.color = '#ff5252';
          btn.disabled = false;
          btn.textContent = 'Retry Send';
        }
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = '#ff5252';
        btn.disabled = false;
        btn.textContent = 'Retry Send';
      }
    }

    // Datasheet upload
    document.getElementById('datasheetUpload').addEventListener('change', async function() {
      const files = this.files;
      if (!files.length) return;
      const statusEl = document.getElementById('datasheet-upload-status');
      statusEl.textContent = 'Uploading ' + files.length + ' datasheet(s)... converting pages, please wait';
      statusEl.style.color = '#ffd93d';

      const formData = new FormData();
      for (const file of files) formData.append('datasheets', file);

      try {
        const resp = await fetch('/api/admin/proposals/upload-datasheets', { method: 'POST', body: formData });
        const result = await resp.json();
        if (result.success && result.urls) {
          uploadedDatasheetUrls.push(...result.urls);
          const grid = document.getElementById('datasheet-grid');
          result.urls.forEach(url => {
            const div = document.createElement('div');
            div.className = 'photo-thumb';
            div.draggable = true;
            div.dataset.url = url;
            div.innerHTML = '<img src="' + url + '" alt="Datasheet page"><button type="button" class="photo-remove" onclick="removeDatasheet(this)">&times;</button>';
            grid.appendChild(div);
          });
          statusEl.textContent = result.urls.length + ' page(s) added!';
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
            div.draggable = true;
            div.dataset.url = url;
            div.innerHTML = '<img src="' + url + '" alt="Photo"><button type="button" class="photo-remove" onclick="removePhoto(this)">&times;</button>';
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

    // ── Customer Selector (clone mode) ──
    ${isClone ? `
    const allCustomers = ${JSON.stringify(customers.map(c => ({
      id: c.id,
      firstName: c.fields['First Name'] || '',
      lastName: c.fields['Last Name'] || '',
      name: [c.fields['First Name'], c.fields['Last Name']].filter(Boolean).join(' '),
      address: c.fields['Address'] || '',
      phone: c.fields['Mobile Phone'] || c.fields['Phone'] || '',
      email: c.fields['Email'] || '',
    })))};

    const searchInput = document.getElementById('customerSearch');
    const dropdown = document.getElementById('customerDropdown');
    const clearBtn = document.getElementById('customerSearchClear');
    let selectedCustomerId = null;

    searchInput.addEventListener('input', function() {
      const q = this.value.toLowerCase().trim();
      clearBtn.style.display = q ? 'block' : 'none';
      if (!q) { dropdown.style.display = 'none'; return; }
      const matches = allCustomers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      ).slice(0, 15);
      if (matches.length === 0) {
        dropdown.innerHTML = '<div style="padding:10px 14px;color:#5a6a7a;font-size:13px;">No matches</div>';
      } else {
        dropdown.innerHTML = matches.map(c =>
          '<div class="cust-option" data-id="' + c.id + '" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #2a3a4a;transition:background .15s;">' +
          '<div style="color:#e0e6ed;font-weight:600;font-size:14px;">' + escapeForJs(c.name) + '</div>' +
          (c.address ? '<div style="color:#5a6a7a;font-size:12px;">' + escapeForJs(c.address) + '</div>' : '') +
          '</div>'
        ).join('');
        dropdown.querySelectorAll('.cust-option').forEach(opt => {
          opt.addEventListener('mouseenter', function() { this.style.background = '#1e2a3a'; });
          opt.addEventListener('mouseleave', function() { this.style.background = 'none'; });
          opt.addEventListener('click', function() { selectCustomer(this.dataset.id); });
        });
      }
      dropdown.style.display = 'block';
    });

    searchInput.addEventListener('focus', function() {
      if (this.value.trim()) this.dispatchEvent(new Event('input'));
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('#customer-selector-wrap')) dropdown.style.display = 'none';
    });

    function escapeForJs(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function clearCustomerSearch() {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      dropdown.style.display = 'none';
    }

    function selectCustomer(customerId) {
      const cust = allCustomers.find(c => c.id === customerId);
      if (!cust) return;
      selectedCustomerId = customerId;

      // Fill client fields
      document.querySelector('[name="clientName"]').value = cust.name;
      document.querySelector('[name="clientAddress"]').value = cust.address;
      document.getElementById('clientPhone').value = cust.phone;
      document.getElementById('clientEmail').value = cust.email;

      // Update search display
      searchInput.value = cust.name;
      clearBtn.style.display = 'block';
      dropdown.style.display = 'none';

      // Fetch engagements
      loadEngagements(customerId);
    }

    async function loadEngagements(customerId) {
      const wrap = document.getElementById('engagement-selector-wrap');
      const sel = document.getElementById('engagementSelect');
      wrap.style.display = 'block';
      sel.innerHTML = '<option value="">Loading...</option>';

      try {
        const resp = await fetch('/api/admin/customers/' + customerId + '/engagements');
        const engagements = await resp.json();
        sel.innerHTML = '<option value="">-- Select engagement --</option>';
        engagements.forEach(e => {
          const label = (e.proposalNumber ? '#' + e.proposalNumber + ' ' : '') +
            (e.status || '') +
            (e.systemType && e.systemType.length ? ' (' + e.systemType.join(', ') + ')' : '');
          const opt = document.createElement('option');
          opt.value = e.id;
          opt.dataset.proposalNumber = e.proposalNumber || '';
          opt.textContent = label || e.id;
          sel.appendChild(opt);
        });
        if (engagements.length === 0) {
          sel.innerHTML = '<option value="">No engagements found</option>';
        }
      } catch (err) {
        sel.innerHTML = '<option value="">Error loading engagements</option>';
      }
    }

    document.getElementById('engagementSelect')?.addEventListener('change', function() {
      const selected = this.options[this.selectedIndex];
      if (selected && selected.value) {
        document.querySelector('[name="engagementId"]').value = selected.value;
        const pn = selected.dataset.proposalNumber;
        if (pn) document.querySelector('[name="projectNumber"]').value = pn;
      } else {
        document.querySelector('[name="engagementId"]').value = '';
      }
    });
    ` : ''}

    // ── Project Number duplicate check + preview link sync ──
    (function() {
      const pnInput = document.querySelector('[name="projectNumber"]');
      const pnStatus = document.getElementById('pn-status');
      const previewLink = document.getElementById('preview-proposal-link');
      const otoLink = document.getElementById('preview-oto-link');
      if (!pnInput || !pnStatus) return;

      function updatePreviewLinks() {
        const val = pnInput.value.trim();
        if (previewLink) previewLink.href = '/proposals/' + encodeURIComponent(val);
        if (otoLink) otoLink.href = '/offers/' + encodeURIComponent(val);
      }

      let debounce;
      const currentId = '${isEdit ? proposal.id : ''}';
      pnInput.addEventListener('input', function() {
        clearTimeout(debounce);
        updatePreviewLinks();
        const val = this.value.trim();
        if (!val) { pnStatus.textContent = ''; return; }
        pnStatus.textContent = 'Checking...';
        pnStatus.style.color = '#aaa';
        debounce = setTimeout(async () => {
          try {
            const url = '/api/admin/proposals/check-number?projectNumber=' + encodeURIComponent(val) + (currentId ? '&excludeId=' + currentId : '');
            const resp = await fetch(url);
            const data = await resp.json();
            if (data.available) {
              pnStatus.textContent = 'Available';
              pnStatus.style.color = '#4caf50';
            } else {
              pnStatus.textContent = 'Already in use — this will cause conflicts!';
              pnStatus.style.color = '#ff5252';
            }
          } catch (e) {
            pnStatus.textContent = '';
          }
        }, 400);
      });
    })();
  </script>`;

  return wrapInLayout(
    `${isEdit ? 'Edit' : 'New'} Proposal`,
    bodyHtml,
    'proposals',
    { customStyles, customScripts }
  );
}

module.exports = exports;
