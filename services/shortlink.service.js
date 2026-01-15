/**
 * Short Link Service - Generate and resolve short payment links
 */

// In-memory storage for short links
// Format: { shortCode: { url: checkoutUrl, leadId: leadId, createdAt: timestamp } }
const shortLinks = new Map();

class ShortLinkService {
  /**
   * Generate a random short code (6 characters)
   */
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a short link for a checkout URL
   */
  createShortLink(checkoutUrl, leadId) {
    // Generate unique code
    let code = this.generateCode();
    while (shortLinks.has(code)) {
      code = this.generateCode();
    }

    // Store mapping
    shortLinks.set(code, {
      url: checkoutUrl,
      leadId: leadId,
      createdAt: Date.now(),
    });

    console.log(`✓ Short link created: ${code} → ${checkoutUrl.substring(0, 50)}...`);

    return code;
  }

  /**
   * Get full URL from short code
   */
  resolveShortLink(code) {
    const link = shortLinks.get(code);
    if (!link) {
      return null;
    }
    return link.url;
  }

  /**
   * Clean up old links (older than 7 days)
   */
  cleanup() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [code, link] of shortLinks.entries()) {
      if (link.createdAt < sevenDaysAgo) {
        shortLinks.delete(code);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old short links`);
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      totalLinks: shortLinks.size,
      links: Array.from(shortLinks.entries()).map(([code, link]) => ({
        code,
        leadId: link.leadId,
        createdAt: new Date(link.createdAt).toISOString(),
      })),
    };
  }
}

module.exports = new ShortLinkService();
