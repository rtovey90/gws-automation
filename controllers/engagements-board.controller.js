const { wrapInLayout } = require('../utils/layout');

exports.showBoard = (req, res) => {
  const embedUrl = process.env.AIRTABLE_EMBED_URL || '';

  const styles = `
    .embed-container { width:100%; height:calc(100vh - 52px); background:#1a2332; }
    .embed-container iframe { width:100%; height:100%; border:none; }
    .no-embed { display:flex; align-items:center; justify-content:center; height:calc(100vh - 52px); color:#5a6a7a; font-size:15px; }
    .no-embed a { color:#00d4ff; }
  `;

  const body = embedUrl
    ? `<div class="embed-container"><iframe src="${embedUrl}" loading="lazy"></iframe></div>`
    : `<div class="no-embed"><p>Airtable embed URL not configured. Add <code>AIRTABLE_EMBED_URL</code> to your .env file. <a href="/dashboard">Back to Dashboard</a></p></div>`;

  res.send(wrapInLayout('Engagements', body, 'engagements', { customStyles: styles }));
};
