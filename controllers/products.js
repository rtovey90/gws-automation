const stripeService = require('../services/stripe.service');
const airtableService = require('../services/airtable.service');

/**
 * Products Controllers - Handle Stripe product sync and pricing
 */

/**
 * Sync Stripe payment links to Airtable Products table
 * GET /api/sync-stripe-products
 */
exports.syncStripeProducts = async (req, res) => {
  try {
    console.log('🔄 Syncing Stripe products to Airtable...');

    // Get all payment links with product details from Stripe
    const paymentLinks = await stripeService.getAllPaymentLinksWithDetails();

    console.log(`Found ${paymentLinks.length} payment links in Stripe`);

    const results = [];

    // Upsert each product into Airtable
    for (const link of paymentLinks) {
      try {
        const productData = {
          name: `${link.productName} - $${link.priceAmount}`,
          description: link.productName,
          price: link.priceAmount,
          paymentLink: link.url,
          stripeProductId: link.productId,
          active: link.active,
        };

        const record = await airtableService.upsertProduct(productData);
        results.push({
          productId: link.productId,
          name: productData.name,
          status: 'synced',
          airtableId: record.id,
        });

        console.log(`  ✓ Synced: ${productData.name}`);
      } catch (error) {
        console.error(`  ✗ Failed to sync product ${link.productId}:`, error.message);
        results.push({
          productId: link.productId,
          status: 'failed',
          error: error.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Synced ${results.length} products from Stripe`,
      results,
    });
  } catch (error) {
    console.error('Error syncing Stripe products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;
