/**
 * Short Link Service - Generate and resolve short payment links
 * Uses random 8-char codes stored in memory + Airtable for persistence
 */
const crypto = require('crypto');

// In-memory cache for fast lookups (populated on create, repopulated from Airtable on miss)
const linkMap = new Map();

class ShortLinkService {
  /**
   * Create a short link with a random 8-char code
   * Stores mapping in memory and returns the code (Airtable storage handled by caller)
   */
  createShortLink(targetUrl, leadId) {
    const code = crypto.randomBytes(6).toString('base64url').slice(0, 8);
    linkMap.set(code, targetUrl);
    console.log(`✓ Short link created: ${code} → ${targetUrl.substring(0, 60)}...`);
    return code;
  }

  /**
   * Get full URL from short code (in-memory only — caller handles Airtable fallback)
   */
  resolveShortLink(code) {
    return linkMap.get(code) || null;
  }

  /**
   * Store a resolved link back into memory (after Airtable fallback lookup)
   */
  cacheLink(code, targetUrl) {
    linkMap.set(code, targetUrl);
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return { totalLinks: linkMap.size };
  }
}

module.exports = new ShortLinkService();
