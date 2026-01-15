const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Stripe Service - Handles Stripe API operations
 */
class StripeService {
  /**
   * Get all payment links from Stripe
   */
  async getPaymentLinks() {
    try {
      const paymentLinks = await stripe.paymentLinks.list({
        limit: 100,
        active: true,
      });

      return paymentLinks.data;
    } catch (error) {
      console.error('Error fetching Stripe payment links:', error);
      throw error;
    }
  }

  /**
   * Get all products from Stripe (to get names and prices)
   */
  async getProducts() {
    try {
      const products = await stripe.products.list({
        limit: 100,
        active: true,
      });

      return products.data;
    } catch (error) {
      console.error('Error fetching Stripe products:', error);
      throw error;
    }
  }

  /**
   * Get all prices from Stripe
   */
  async getPrices() {
    try {
      const prices = await stripe.prices.list({
        limit: 100,
        active: true,
      });

      return prices.data;
    } catch (error) {
      console.error('Error fetching Stripe prices:', error);
      throw error;
    }
  }

  /**
   * Get payment link details with product and price info
   */
  async getPaymentLinkWithDetails(paymentLinkId) {
    try {
      const paymentLink = await stripe.paymentLinks.retrieve(paymentLinkId);

      // Get the line items to find the price
      const lineItems = paymentLink.line_items.data[0];
      const priceId = lineItems?.price?.id;

      if (priceId) {
        const price = await stripe.prices.retrieve(priceId);
        const product = await stripe.products.retrieve(price.product);

        return {
          paymentLink,
          price,
          product,
        };
      }

      return { paymentLink };
    } catch (error) {
      console.error('Error fetching payment link details:', error);
      throw error;
    }
  }

  /**
   * Get all payment links with their associated product and price details
   */
  async getAllPaymentLinksWithDetails() {
    try {
      const paymentLinks = await this.getPaymentLinks();
      const results = [];

      for (const link of paymentLinks) {
        try {
          // Expand the payment link to get line items
          const expandedLink = await stripe.paymentLinks.retrieve(link.id, {
            expand: ['line_items', 'line_items.data.price.product'],
          });

          if (expandedLink.line_items?.data?.[0]) {
            const lineItem = expandedLink.line_items.data[0];
            const price = lineItem.price;
            const product = price.product;

            results.push({
              id: expandedLink.id,
              url: expandedLink.url,
              active: expandedLink.active,
              productName: typeof product === 'object' ? product.name : 'Unknown Product',
              productId: typeof product === 'object' ? product.id : product,
              priceAmount: price.unit_amount / 100, // Convert from cents to dollars
              currency: price.currency.toUpperCase(),
            });
          }
        } catch (error) {
          console.error(`Error processing payment link ${link.id}:`, error.message);
          // Continue with next link
        }
      }

      return results;
    } catch (error) {
      console.error('Error fetching all payment links with details:', error);
      throw error;
    }
  }

  /**
   * Create a Checkout Session with metadata for lead tracking
   */
  async createCheckoutSession({ leadId, productId, priceId, leadName, leadPhone, successUrl, cancelUrl }) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          lead_id: leadId,
          product_id: productId,
          lead_name: leadName,
          lead_phone: leadPhone,
        },
      });

      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Get price ID for a product
   */
  async getPriceForProduct(productId) {
    try {
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 1,
      });

      if (prices.data.length === 0) {
        throw new Error(`No active price found for product ${productId}`);
      }

      return prices.data[0];
    } catch (error) {
      console.error('Error getting price for product:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();
