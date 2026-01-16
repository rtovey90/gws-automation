const { tables } = require('../config/airtable');

/**
 * Airtable Service - Handles all CRUD operations with Airtable
 */
class AirtableService {
  // ============ LEADS ============

  /**
   * Create a new lead in Airtable
   */
  async createLead(leadData) {
    try {
      // Prepare service type as array (it's a multiple select field)
      let serviceType = leadData.serviceType || ['Other'];
      if (typeof serviceType === 'string') {
        serviceType = [serviceType];
      }

      console.log('Creating lead with service type:', serviceType);

      const fields = {
        'First Name': leadData.name,
        Phone: leadData.phone,
        Email: leadData.email || '',
        'Address/Location': leadData.address || leadData.location || '',
        ' Source': leadData.source || 'Form', // Note: field has leading space in Airtable
        Status: 'New',
        'Lead Type': serviceType, // Now using Lead Type instead of Service Type
        Notes: leadData.notes || '',
        'Original Transcript/Form Data': leadData.rawData || '',
        Business: leadData.business || 'Great White Security',
        'Client Notes': leadData.clientNotes || '',
      };

      // Add pricing fields if provided
      if (leadData.serviceCallAmount) {
        fields['Service Call Amount'] = leadData.serviceCallAmount;
      }
      if (leadData.projectValue) {
        fields['Project Value'] = leadData.projectValue;
      }

      const records = await tables.leads.create([{ fields }]);
      return records[0];
    } catch (error) {
      console.error('Error creating lead:', error);
      throw error;
    }
  }

  /**
   * Get lead by ID
   */
  async getLead(leadId) {
    try {
      return await tables.leads.find(leadId);
    } catch (error) {
      console.error('Error getting lead:', error);
      throw error;
    }
  }

  /**
   * Update lead
   */
  async updateLead(leadId, updates) {
    try {
      return await tables.leads.update(leadId, updates);
    } catch (error) {
      console.error('Error updating lead:', error);
      throw error;
    }
  }

  /**
   * Get lead by phone number
   */
  async getLeadByPhone(phone) {
    try {
      const records = await tables.leads
        .select({
          filterByFormula: `{Phone} = '${phone}'`,
          maxRecords: 1,
          sort: [{ field: 'Created', direction: 'desc' }],
        })
        .firstPage();

      return records[0] || null;
    } catch (error) {
      console.error('Error getting lead by phone:', error);
      throw error;
    }
  }

  // ============ CUSTOMERS ============

  /**
   * Get customer by phone number (checks both Phone and Mobile Phone fields)
   */
  async getCustomerByPhone(phone) {
    try {
      const records = await tables.customers
        .select({
          filterByFormula: `OR({Phone} = '${phone}', {Mobile Phone} = '${phone}')`,
          maxRecords: 1,
        })
        .firstPage();

      return records[0] || null;
    } catch (error) {
      console.error('Error getting customer by phone:', error);
      throw error;
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(customerData) {
    try {
      const fields = {
        'First Name': customerData.firstName || '',
        'Last Name': customerData.lastName || '',
        Phone: customerData.phone || '',
        'Mobile Phone': customerData.mobilePhone || '',
        Email: customerData.email || '',
        'Business Name': customerData.businessName || '',
        Address: customerData.address || '',
        Notes: customerData.notes || '',
      };

      const records = await tables.customers.create([{ fields }]);
      console.log('✓ Customer created:', records[0].id);
      return records[0];
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId) {
    try {
      return await tables.customers.find(customerId);
    } catch (error) {
      console.error('Error getting customer:', error);
      throw error;
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(customerId, updates) {
    try {
      return await tables.customers.update(customerId, updates);
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  // ============ ENGAGEMENTS ============

  /**
   * Create a new engagement linked to a customer
   */
  async createEngagement(engagementData) {
    try {
      const fields = {
        Status: engagementData.status || 'New Lead',
        ' Source': engagementData.source || 'Form',
        Notes: engagementData.notes || '',
        'Original Transcript/Form Data': engagementData.rawData || '',
        Business: engagementData.business || 'Great White Security',
      };

      // Only add Lead Type if provided (it's optional)
      if (engagementData.leadType) {
        fields['Lead Type'] = Array.isArray(engagementData.leadType) ? engagementData.leadType : [engagementData.leadType];
      }

      // Link to customer
      if (engagementData.customerId) {
        fields.Customer = [engagementData.customerId];
      }

      // Add pricing fields if provided
      if (engagementData.serviceCallAmount) {
        fields['Service Call Amount'] = engagementData.serviceCallAmount;
      }
      if (engagementData.projectValue) {
        fields['Project Value'] = engagementData.projectValue;
      }

      const records = await tables.engagements.create([{ fields }]);
      console.log('✓ Engagement created:', records[0].id);
      return records[0];
    } catch (error) {
      console.error('Error creating engagement:', error);
      throw error;
    }
  }

  /**
   * Get engagement by ID
   */
  async getEngagement(engagementId) {
    try {
      return await tables.engagements.find(engagementId);
    } catch (error) {
      console.error('Error getting engagement:', error);
      throw error;
    }
  }

  /**
   * Update engagement
   */
  async updateEngagement(engagementId, updates) {
    try {
      return await tables.engagements.update(engagementId, updates);
    } catch (error) {
      console.error('Error updating engagement:', error);
      throw error;
    }
  }

  // ============ JOBS ============

  /**
   * Create a new job in Airtable
   */
  async createJob(jobData) {
    try {
      const fields = {
        'Client Address': jobData.clientAddress || '',
        'Job Status': jobData.status || 'Draft',
        'Scope of Work': jobData.scope || '',
        'Quoted Price': jobData.quotedPrice || 0,
        'Payment Status': 'Not Sent',
        'Stripe Payment Link': jobData.stripeLink || '',
        'Auto-Send Pricing': jobData.autoSendPricing || false,
        'Activity Log': `[${new Date().toISOString()}] Job created`,
      };

      // Link to lead if provided
      if (jobData.leadId) {
        fields.Lead = [jobData.leadId];
      }

      const records = await tables.jobs.create([{ fields }]);
      return records[0];
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId) {
    try {
      return await tables.jobs.find(jobId);
    } catch (error) {
      console.error('Error getting job:', error);
      throw error;
    }
  }

  /**
   * Update job
   */
  async updateJob(jobId, updates) {
    try {
      const job = await this.getJob(jobId);
      const currentLog = job.fields['Activity Log'] || '';

      // If status is being updated, add to activity log
      if (updates['Job Status']) {
        const logEntry = `\n[${new Date().toISOString()}] Status changed to: ${updates['Job Status']}`;
        updates['Activity Log'] = currentLog + logEntry;
      }

      return await tables.jobs.update(jobId, updates);
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
    }
  }

  /**
   * Assign tech to job
   */
  async assignTechToJob(jobId, techId) {
    try {
      return await this.updateJob(jobId, {
        'Assigned Tech': [techId],
        'Job Status': 'Tech Assigned',
      });
    } catch (error) {
      console.error('Error assigning tech:', error);
      throw error;
    }
  }

  /**
   * Update job with Stripe payment info
   */
  async updateJobPayment(jobId, paymentId) {
    try {
      return await this.updateJob(jobId, {
        'Stripe Payment ID': paymentId,
        'Payment Status': 'Paid',
        'Job Status': 'Payment Received',
      });
    } catch (error) {
      console.error('Error updating job payment:', error);
      throw error;
    }
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, techNotes, photos) {
    try {
      const updates = {
        'Job Status': 'Completed',
        'Completion Date': new Date().toISOString().split('T')[0],
        'Tech Notes': techNotes || '',
      };

      if (photos && photos.length > 0) {
        updates.Photos = photos;
      }

      return await this.updateJob(jobId, updates);
    } catch (error) {
      console.error('Error completing job:', error);
      throw error;
    }
  }

  // ============ TECHS ============

  /**
   * Get tech by ID
   */
  async getTech(techId) {
    try {
      return await tables.techs.find(techId);
    } catch (error) {
      console.error('Error getting tech:', error);
      throw error;
    }
  }

  /**
   * Get tech by phone number
   */
  async getTechByPhone(phone) {
    try {
      const records = await tables.techs
        .select({
          filterByFormula: `{Phone} = '${phone}'`,
          maxRecords: 1,
        })
        .firstPage();

      return records[0] || null;
    } catch (error) {
      console.error('Error getting tech by phone:', error);
      throw error;
    }
  }

  /**
   * Get all available techs
   */
  async getAvailableTechs() {
    try {
      const records = await tables.techs
        .select({
          filterByFormula: `{Availability Status} = 'Available'`,
        })
        .all();

      return records;
    } catch (error) {
      console.error('Error getting available techs:', error);
      throw error;
    }
  }

  /**
   * Get all techs (regardless of availability)
   */
  async getAllTechs() {
    try {
      const records = await tables.techs
        .select()
        .all();

      return records;
    } catch (error) {
      console.error('Error getting all techs:', error);
      throw error;
    }
  }

  // ============ MESSAGES ============

  /**
   * Log a message in Airtable
   */
  async logMessage(messageData) {
    try {
      const fields = {
        Direction: messageData.direction || 'Outbound',
        Type: messageData.type || 'SMS',
        To: messageData.to,
        From: messageData.from,
        Content: messageData.content,
        Status: messageData.status || 'Sent',
      };

      // Link to job if provided
      if (messageData.jobId) {
        fields['Related Job'] = [messageData.jobId];
      }

      // Link to lead if provided
      if (messageData.leadId) {
        fields['Related Lead'] = [messageData.leadId];
      }

      const records = await tables.messages.create([{ fields }]);
      return records[0];
    } catch (error) {
      console.error('Error logging message:', error);
      throw error;
    }
  }

  // ============ TEMPLATES ============

  /**
   * Get template by name
   */
  async getTemplate(templateName) {
    try {
      const records = await tables.templates
        .select({
          filterByFormula: `AND({Name} = '${templateName}', {Active} = TRUE())`,
          maxRecords: 1,
        })
        .firstPage();

      return records[0] || null;
    } catch (error) {
      console.error('Error getting template:', error);
      throw error;
    }
  }

  /**
   * Get all active templates
   */
  async getActiveTemplates() {
    try {
      const records = await tables.templates
        .select({
          filterByFormula: '{Active} = TRUE()',
        })
        .all();

      return records;
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  // ============ PRODUCTS ============

  /**
   * Create or update a product in Airtable
   */
  async upsertProduct(productData) {
    try {
      // Check if product already exists by Stripe Product ID
      const existingRecords = await tables.products
        .select({
          filterByFormula: `{Stripe Product ID} = '${productData.stripeProductId}'`,
          maxRecords: 1,
        })
        .firstPage();

      const fields = {
        'Product Name': productData.name,
        Description: productData.description || '',
        Price: productData.price,
        'Stripe Payment Link': productData.paymentLink,
        'Stripe Product ID': productData.stripeProductId,
        Active: productData.active !== false,
      };

      if (existingRecords.length > 0) {
        // Update existing record
        const recordId = existingRecords[0].id;
        return await tables.products.update(recordId, fields);
      } else {
        // Create new record
        const records = await tables.products.create([{ fields }]);
        return records[0];
      }
    } catch (error) {
      console.error('Error upserting product:', error);
      throw error;
    }
  }

  /**
   * Get all active products
   */
  async getActiveProducts() {
    try {
      const records = await tables.products
        .select({
          filterByFormula: '{Active} = TRUE()',
        })
        .all();

      return records;
    } catch (error) {
      console.error('Error getting active products:', error);
      throw error;
    }
  }

  /**
   * Get product by ID
   */
  async getProduct(productId) {
    try {
      return await tables.products.find(productId);
    } catch (error) {
      console.error('Error getting product:', error);
      throw error;
    }
  }
}

module.exports = new AirtableService();
