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
        'Service Type': serviceType,
        Notes: leadData.notes || '',
        'Original Transcript/Form Data': leadData.rawData || '',
        Business: leadData.business || 'Great White Security',
        'Client Notes': leadData.clientNotes || '',
        'Lead Type': leadData.leadType || 'Service ', // Note: options have trailing spaces in Airtable
        'Quote Status': leadData.quoteStatus || 'Draft',
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
}

module.exports = new AirtableService();
