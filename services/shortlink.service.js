/**
 * Short Link Service - Generate and resolve short links
 * Encodes the target URL directly into the code (stateless, survives deploys)
 */

class ShortLinkService {
  /**
   * Create a short link by encoding the URL into the code
   */
  createShortLink(targetUrl, leadId) {
    const code = Buffer.from(targetUrl).toString('base64url');
    console.log(`✓ Short link created: ${code.substring(0, 20)}... → ${targetUrl.substring(0, 50)}...`);
    return code;
  }

  /**
   * Get full URL from short code
   */
  resolveShortLink(code) {
    try {
      return Buffer.from(code, 'base64url').toString();
    } catch {
      return null;
    }
  }

  /**
   * Get stats (no longer tracking in-memory)
   */
  getStats() {
    return { totalLinks: 'N/A (stateless)' };
  }
}

module.exports = new ShortLinkService();
