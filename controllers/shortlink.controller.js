const shortLinkService = require('../services/shortlink.service');
const airtableService = require('../services/airtable.service');
const { getBrandConfig } = require('../config/brands');

/**
 * Short Link Controllers - Handle payment link redirects
 */

/**
 * Redirect short code to full Stripe checkout URL
 * GET /p/:code
 */
exports.redirect = async (req, res) => {
  try {
    const { code } = req.params;

    console.log(`🔗 Short link accessed: /p/${code}`);

    // 1. Check in-memory cache first (fast)
    let fullUrl = shortLinkService.resolveShortLink(code);

    // 2. Fallback: look up in Airtable (survives server restarts)
    if (!fullUrl) {
      console.log(`🔍 Cache miss, checking Airtable for code: ${code}`);
      const record = await airtableService.resolveShortLinkCode(code);
      if (record && record.fields['Short Link URL']) {
        fullUrl = record.fields['Short Link URL'];
        shortLinkService.cacheLink(code, fullUrl); // repopulate cache
        console.log(`✓ Found in Airtable, cached for next time`);
      }
    }

    if (!fullUrl) {
      console.log(`❌ Short link not found: ${code}`);
      const brand = getBrandConfig();
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Link Not Found - ${brand.companyName}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
            }
            .container {
              max-width: 600px; width: 100%; background: white; border-radius: 12px;
              padding: 40px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .error-icon { font-size: 72px; margin-bottom: 20px; }
            h1 { color: #dc3545; font-size: 32px; margin-bottom: 20px; }
            p { color: #666; font-size: 18px; line-height: 1.6; margin-bottom: 15px; }
            .contact { color: #1a73e8; font-weight: 600; font-size: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Link Not Found</h1>
            <p>This link has expired or is invalid.</p>
            <p class="contact">Please contact us at ${brand.phone}</p>
          </div>
        </body>
        </html>
      `);
    }

    console.log(`✓ Redirecting to: ${fullUrl.substring(0, 60)}...`);
    res.redirect(302, fullUrl);
  } catch (error) {
    console.error('Error handling short link redirect:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Get short link stats (for debugging)
 * GET /api/shortlinks/stats
 */
exports.getStats = async (req, res) => {
  try {
    const stats = shortLinkService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting short link stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
