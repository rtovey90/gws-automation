const stripeService = require('../services/stripe.service');
const airtableService = require('../services/airtable.service');

/**
 * Products Controllers - Handle Stripe product sync and pricing
 */

/**
 * Internal sync function (no req/res dependency)
 * Syncs all Stripe payment links to Airtable Products table
 */
exports.syncStripeProductsInternal = async () => {
  console.log('🔄 Syncing Stripe products to Airtable...');

  const paymentLinks = await stripeService.getAllPaymentLinksWithDetails();
  console.log(`Found ${paymentLinks.length} payment links in Stripe`);

  for (const link of paymentLinks) {
    await airtableService.upsertProduct({
      name: `${link.productName} - $${link.priceAmount}`,
      description: link.productName,
      price: link.priceAmount,
      paymentLink: link.url,
      stripeProductId: link.productId,
      active: link.active,
    });
    console.log(`  ✓ Synced: ${link.productName} - $${link.priceAmount}`);
  }

  return paymentLinks.length;
};

/**
 * Sync Stripe payment links to Airtable Products table
 * GET /api/sync-stripe-products
 */
exports.syncStripeProducts = async (req, res) => {
  try {
    const count = await exports.syncStripeProductsInternal();
    res.status(200).json({
      success: true,
      message: `Synced ${count} products from Stripe`,
    });
  } catch (error) {
    console.error('Error syncing Stripe products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
