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

  /**
   * Get current Stripe balance (available + pending) in AUD
   */
  async getBalance() {
    try {
      const balance = await stripe.balance.retrieve();

      const findAud = (arr) => {
        const entry = arr.find(b => b.currency === 'aud');
        return entry ? entry.amount / 100 : 0;
      };

      return {
        available: findAud(balance.available),
        pending: findAud(balance.pending),
      };
    } catch (error) {
      console.error('Error fetching Stripe balance:', error);
      throw error;
    }
  }

  /**
   * Get recent successful charges with customer details
   */
  async getRecentCharges(limit = 10) {
    try {
      const results = [];
      for await (const c of stripe.charges.list({
        limit: 100,
        expand: ['data.customer'],
      })) {
        if (c.status === 'succeeded' && c.currency === 'aud') {
          results.push({
            id: c.id,
            amount: c.amount / 100,
            currency: c.currency.toUpperCase(),
            customerName: c.customer?.name || c.billing_details?.name || 'Unknown',
            customerEmail: c.customer?.email || c.billing_details?.email || '',
            created: new Date(c.created * 1000),
            status: c.status,
          });
          if (results.length >= limit) break;
        }
      }
      return results;
    } catch (error) {
      console.error('Error fetching Stripe charges:', error);
      throw error;
    }
  }

  /**
   * Get recent payouts
   */
  async getPayouts(limit = 5) {
    try {
      const payouts = await stripe.payouts.list({ limit });

      return payouts.data
        .filter(p => p.currency === 'aud')
        .map(p => ({
          id: p.id,
          amount: p.amount / 100,
          currency: p.currency.toUpperCase(),
          status: p.status,
          arrivalDate: new Date(p.arrival_date * 1000),
          created: new Date(p.created * 1000),
        }));
    } catch (error) {
      console.error('Error fetching Stripe payouts:', error);
      throw error;
    }
  }

  /**
   * Get monthly revenue totals for the last N months
   */
  async getMonthlyRevenue(months = 6) {
    try {
      const now = new Date();
      const results = [];

      for (let i = months - 1; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

        let total = 0;
        for await (const charge of stripe.charges.list({
          created: {
            gte: Math.floor(start.getTime() / 1000),
            lt: Math.floor(end.getTime() / 1000),
          },
          limit: 100,
        })) {
          if (charge.status === 'succeeded' && charge.currency === 'aud') {
            total += charge.amount;
          }
        }

        results.push({
          month: start.toLocaleString('en-AU', { month: 'short' }),
          year: start.getFullYear(),
          total: total / 100,
        });
      }

      return results;
    } catch (error) {
      console.error('Error fetching monthly revenue:', error);
      throw error;
    }
  }
  /**
   * Create a Checkout Session for a proposal payment
   */
  async createProposalCheckoutSession({ projectNumber, proposalId, amount, customerName, description, successUrl, cancelUrl }) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'aud',
              product_data: {
                name: `Security Proposal #${projectNumber}`,
                description: description || `Security system installation for ${customerName}`,
              },
              unit_amount: Math.round(amount * 100), // Convert dollars to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        customer_creation: 'always',
        payment_intent_data: {
          setup_future_usage: 'off_session',
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'proposal',
          proposal_id: proposalId,
          project_number: projectNumber,
          customer_name: customerName,
        },
      });

      return session;
    } catch (error) {
      console.error('Error creating proposal checkout session:', error);
      throw error;
    }
  }

  /**
   * Create a Checkout Session for an OTO (post-purchase upgrade)
   */
  async createOTOCheckoutSession({ projectNumber, proposalId, otoType, amount, description, successUrl, cancelUrl }) {
    try {
      const isSubscription = otoType === 'care';

      const lineItem = isSubscription
        ? {
            price_data: {
              currency: 'aud',
              product_data: {
                name: `GWS Care Plan`,
                description: description || 'Monthly security maintenance & support plan',
              },
              unit_amount: Math.round(amount * 100),
              recurring: { interval: 'month' },
            },
            quantity: 1,
          }
        : {
            price_data: {
              currency: 'aud',
              product_data: {
                name: `GWS ${otoType === 'bundle' ? 'Bundle Deal' : otoType === 'alarm' ? 'Alarm System' : 'UPS Battery Backup'}`,
                description: description || `Upgrade for proposal #${projectNumber}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          };

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [lineItem],
        mode: isSubscription ? 'subscription' : 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'oto',
          oto_type: otoType,
          proposal_id: proposalId,
          project_number: projectNumber,
        },
      });

      return session;
    } catch (error) {
      console.error('Error creating OTO checkout session:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();
