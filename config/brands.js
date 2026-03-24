/**
 * Shared Brand Configuration
 * Single source of truth for all brand-specific values.
 * Used by proposals, SMS templates, customer-facing pages, Stripe, etc.
 */

const BRAND_CONFIG = {
  'Great White Security (WA)': {
    // Identity
    companyName: 'Great White Security',
    legalName: 'Great White Security Pty Ltd',
    // Contact
    phone: '0413 346 978',
    phoneLink: '+61413346978',
    email: 'hello@greatwhitesecurity.com',
    website: 'www.greatwhitesecurity.com',
    baseUrl: 'https://book.greatwhitesecurity.com',
    shortLinkDomain: 'book.greatwhitesecurity.com',
    senderName: 'Ricky',
    // Visual — proposals
    logoPath: '/proposal-assets/gws-logo.png',
    coverImage: '/proposal-assets/proposal-cover-page.jpg',
    signatureImage: '/proposal-assets/signature.jpeg',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&display=swap",
    cssVars: `--navy: #0a0e27; --navy-mid: #0f1430; --navy-light: #161c3a;
      --cyan: #78e4ff; --cyan-mid: #5dd4f0; --cyan-dark: #3dbfe0;
      --cyan-pale: #edf9ff; --cyan-bg: #f4fbff;
      --white: #ffffff; --gray-50: #f5f7fa; --gray-100: #e8ecf2;
      --gray-200: #d4d9e3; --gray-400: #8b90a0; --gray-600: #4a4f63;
      --gray-800: #1e2235; --red: #e05252; --green: #22c55e; --green-dark: #16a34a;
      --cta-btn-text: #0a0e27; --step-num-color: #78e4ff; --logo-height: 32px; --header-padding: 16px 50px;`,
    bodyFont: "'DM Sans', sans-serif",
    headingFont: "'Playfair Display', serif",
    // Visual — non-proposal pages
    logoWebp: '/gws-logo.webp',
    // Signer
    signerName: 'Richard Campbell-Tovey',
    signerTitle: 'WA Police Licensed Security Consultant 79960',
    // Credentials
    credentials: [
      { img: '/proposal-assets/wa-police-badge.png', alt: 'WA Police Licensed', label: 'WA Police Licensed #79960' },
      { img: '/proposal-assets/google-reviews.png', alt: 'Google Reviews 4.6 Stars', label: '' },
      { img: '/proposal-assets/acma-logo.png', alt: 'ACMA Registered', label: '' },
    ],
    // Why Choose Us
    whyUsResidential: 'Great White Security is built on over 21 years of proven experience securing homes and businesses across Western Australia. Our background in the industry has seen us deliver reliable protection for thousands of commercial and residential properties giving business owners &amp; home owners peace of mind that their staff, customers, family and assets are safe.',
    whyUsCommercial: 'Great White Security is built on over 21 years of proven experience securing businesses and commercial properties across Western Australia. Our background in the industry has seen us deliver reliable protection for thousands of commercial premises giving business owners and facility managers peace of mind that their staff, visitors and assets are safe.',
    whyUsTeamLine: 'Our team is WA Police licensed and committed to seamless, professional installations. We pride ourselves on leaving every site secure, tidy, and set up for long-term protection.',
    whyUsProductAgnostic: 'As a <strong>product-agnostic security installation business</strong>, we\'re not tied to any single brand. Instead, we partner with trusted local suppliers to provide solutions tailored to each client\'s needs.',
    whyUsClosing: 'By choosing Great White Security, you gain a trusted partner with over two decades of expertise, a commitment to quality, and the confidence of working with a WA-based business that\'s here to support you long after installation.',
    // Clarifications
    publicHolidayState: 'Western Australian',
    accessClarification: 'Great White Security requires full and free access to all areas of the site containing security equipment covered in the works outlined in this proposal for the duration of the works. This includes vehicles or equipment which may be in the way of accessing install locations. Delays in access or return attendances required to complete works due to access restrictions may be chargeable at the applicable service rates.',
    phoneClarification: 'If required, customer smartphones must be present during installation. Great White Security assume customer phones are able to install/run CCTV and alarm apps as required.',
    internetClarification: 'Customer must provide spare internet router port and have working internet for app connectivity. Great White Security assumes internet speed is sufficient for CCTV app access.',
    // Legal / links
    termsUrl: 'https://www.greatwhitesecurity.com/terms-of-service/',
    installReferenceText: 'Installation reference for Great White Security technicians',
    pdfPrefix: 'Great White Security',
    // SMS
    smsTemplate: (firstName, url, senderName) => `Hi ${firstName}, your security proposal from Great White Security is ready!\n\nView it here: ${url}\n\nAny questions, give us a call on 0413 346 978.\n\nCheers,\n${senderName || 'Ricky'}`,
    // Proposal letter
    defaultLetterIntro: (firstName) => `<p>Thank you for taking the time to discuss your security requirements with us. Based on our consultation, I'm pleased to present a tailored security proposal for your property.</p>`,
    defaultLetterOutro: `<p>Alternatively, please accept the proposal below, and we will order your equipment and schedule one of our professional licensed technicians for a prompt attendance!</p>`,
    // Thank you / OTO
    thankYouBg: '#0e1231',
    thankYouAccent: '#00bcd4',
  },
  'The Alarm Guy (SA)': {
    companyName: 'The Alarm Guy',
    legalName: 'The Alarm Guy Pty Ltd',
    phone: '0485 001 498',
    phoneLink: '+61485001498',
    email: 'info@thealarmguy.com.au',
    website: 'www.thealarmguy.com.au',
    baseUrl: 'https://book.thealarmguy.com.au',
    shortLinkDomain: 'book.thealarmguy.com.au',
    senderName: 'Ricky',
    logoPath: '/proposal-assets/tag-logo.png',
    coverImage: '/proposal-assets/tag-cover-page.png',
    signatureImage: '/proposal-assets/signature.jpeg',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Roboto:wght@300;400;500;700&display=swap",
    cssVars: `--navy: #1a1a1a; --navy-mid: #111111; --navy-light: #222222;
      --cyan: #DC2626; --cyan-mid: #B91C1C; --cyan-dark: #991B1B;
      --cyan-pale: #FEF2F2; --cyan-bg: #FFF5F5;
      --white: #ffffff; --gray-50: #f5f5f5; --gray-100: #e5e5e5;
      --gray-200: #d4d4d4; --gray-400: #a3a3a3; --gray-600: #525252;
      --gray-800: #1e1e1e; --red: #e05252; --green: #22c55e; --green-dark: #16a34a;
      --cta-btn-text: #ffffff; --step-num-color: #ffffff; --logo-height: 80px; --header-padding: 8px 50px;`,
    bodyFont: "'Inter', 'Roboto', sans-serif",
    headingFont: "'Inter', 'Roboto', sans-serif",
    logoWebp: '/proposal-assets/tag-logo.png',
    signerName: 'Richard Campbell-Tovey',
    signerTitle: 'Security Consultant',
    credentials: [],
    whyUsResidential: 'The Alarm Guy provides modern, reliable security solutions for homes across Adelaide and South Australia. We work with trusted local contractors and suppliers to deliver protection that fits your needs and budget, giving you peace of mind knowing your home and family are safe.',
    whyUsCommercial: 'The Alarm Guy provides modern, reliable security solutions for businesses across Adelaide and South Australia. We work with trusted local contractors and suppliers to deliver protection for commercial premises, giving business owners and facility managers peace of mind that their staff, visitors and assets are safe.',
    whyUsTeamLine: 'Our team of licensed SA security technicians is committed to seamless, professional installations. We pride ourselves on leaving every site secure, tidy, and set up for long-term protection.',
    whyUsProductAgnostic: 'As a <strong>product-agnostic security business</strong>, we\'re not tied to any single brand. Instead, we partner with trusted suppliers to provide solutions tailored to each client\'s needs.',
    whyUsClosing: 'By choosing The Alarm Guy, you gain a dedicated security partner focused on quality, reliability, and ongoing support long after installation.',
    publicHolidayState: 'South Australian',
    accessClarification: 'The Alarm Guy requires full and free access to all areas of the site containing security equipment covered in the works outlined in this proposal for the duration of the works. This includes vehicles or equipment which may be in the way of accessing install locations. Delays in access or return attendances required to complete works due to access restrictions may be chargeable at the applicable service rates.',
    phoneClarification: 'If required, customer smartphones must be present during installation. The Alarm Guy assume customer phones are able to install/run CCTV and alarm apps as required.',
    internetClarification: 'Customer must provide spare internet router port and have working internet for app connectivity. The Alarm Guy assumes internet speed is sufficient for CCTV app access.',
    termsUrl: 'https://www.greatwhitesecurity.com/terms-of-service/',
    installReferenceText: 'Installation reference for The Alarm Guy technicians',
    pdfPrefix: 'The Alarm Guy',
    smsTemplate: (firstName, url, senderName) => `Hi ${firstName}, your security proposal from The Alarm Guy is ready!\n\nView it here: ${url}\n\nAny questions, give us a call on 0485 001 498.\n\nCheers,\n${senderName || 'Ricky'}`,
    defaultLetterIntro: (firstName) => `<p>Thank you for taking the time to discuss your security requirements with us. Based on our consultation, I'm pleased to present a tailored security proposal for your property.</p>`,
    defaultLetterOutro: `<p>Alternatively, please accept the proposal below, and we will order your equipment and schedule one of our professional licensed technicians for a prompt attendance!</p>`,
    thankYouBg: '#000000',
    thankYouAccent: '#DC2626',
  },
};

const DEFAULT_BRAND = 'Great White Security (WA)';

const BRAND_ALIASES = {
  'Great White Security': 'Great White Security (WA)',
  'The Alarm Guy': 'The Alarm Guy (SA)',
};

function getBrandConfig(brandName) {
  const key = BRAND_ALIASES[brandName] || brandName;
  return BRAND_CONFIG[key] || BRAND_CONFIG[DEFAULT_BRAND];
}

function normalizeBrandName(brandName) {
  return BRAND_ALIASES[brandName] || brandName || DEFAULT_BRAND;
}

function buildDefaultClarifications(brand) {
  return [
    'Only items expressly listed above are included in this quotation. Any additional parts or works to other items are chargeable at the applicable rate.',
    `All works quoted and any subsequent warranty works are conducted between the hours of 08:00 & 17:00 Monday to Friday excluding ${brand.publicHolidayState} public holidays. Warranty attendances do not include provision of EWP which must be organised by the client.`,
    brand.accessClarification,
    brand.phoneClarification,
    'Quotation valid for 30 days.',
    brand.internetClarification,
    'CCTV Alarm Monitoring by Monitoring Station pricing is based on being set to only send alarms overnight between 2200 – 0530. More than 8 events per month may require a plan increase but will be reviewed first.',
    'License plate capture from cameras is dependent on many variables such as lighting, if vehicles are stationary or moving, speed of vehicles, license plate illumination/cleanliness, obstructions, distance from cameras etc.',
    'Final mounting locations depend on cable and mounting access — to be confirmed by on-site technician.',
  ];
}

function buildCredentialsHtml(brand) {
  if (!brand.credentials || brand.credentials.length === 0) return '';
  return `<div class="cred-row">
${brand.credentials.map(c => `      <div class="cred-item"><img src="${c.img}" alt="${c.alt}">${c.label ? `<div class="cred-label">${c.label}</div>` : ''}</div>`).join('\n')}
    </div>`;
}

/**
 * Get brand config for an engagement by looking up its 'Our Business Name' field.
 * Requires the airtable service to be passed in to avoid circular dependencies.
 */
async function getBrandForEngagement(engagementId, airtableService) {
  try {
    const eng = await airtableService.getEngagement(engagementId);
    const businessName = eng?.fields?.['Our Business Name'];
    return getBrandConfig(businessName);
  } catch (error) {
    console.error('Error getting brand for engagement:', error.message);
    return getBrandConfig(); // fallback to default
  }
}

module.exports = {
  BRAND_CONFIG,
  DEFAULT_BRAND,
  BRAND_ALIASES,
  getBrandConfig,
  normalizeBrandName,
  buildDefaultClarifications,
  buildCredentialsHtml,
  getBrandForEngagement,
};
