const { tables } = require('../config/airtable');

// Simple in-memory cache for getAll* calls (60-second TTL)
const cache = {};
const CACHE_TTL = 60 * 1000; // 60 seconds

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.time < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

function clearCache(key) {
  if (key) {
    delete cache[key];
  } else {
    Object.keys(cache).forEach(k => delete cache[k]);
  }
}

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
      clearCache('engagements');
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
      // First try exact match (for already-normalized numbers)
      let records = await tables.customers
        .select({
          filterByFormula: `OR({Phone} = '${phone}', {Mobile Phone} = '${phone}')`,
          maxRecords: 1,
        })
        .firstPage();

      if (records.length > 0) {
        return records[0];
      }

      // If no exact match, fetch all customers and normalize to compare
      // This handles cases like "(040) 440-1616" vs "+61404401616"
      const allCustomers = await this.getAllCustomers();

      for (const customer of allCustomers) {
        const mobilePhone = customer.fields['Mobile Phone'];
        const landlinePhone = customer.fields.Phone;

        // Normalize and compare mobile phone
        if (mobilePhone) {
          const normalized = this.normalizePhone(mobilePhone);
          if (normalized === phone) {
            return customer;
          }
        }

        // Normalize and compare landline phone
        if (landlinePhone) {
          const normalized = this.normalizePhone(landlinePhone);
          if (normalized === phone) {
            return customer;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting customer by phone:', error);
      throw error;
    }
  }

  // Helper function to normalize Australian phone numbers
  normalizePhone(phone) {
    if (!phone) return phone;

    // Remove all spaces, dashes, parentheses
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // If starts with 0, replace with +61
    if (cleaned.startsWith('0')) {
      cleaned = '+61' + cleaned.substring(1);
    }
    // If starts with 61 but no +, add the +
    else if (cleaned.startsWith('61') && !cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    // If doesn't start with +61 or 0, assume it needs +61
    else if (!cleaned.startsWith('+61')) {
      cleaned = '+61' + cleaned;
    }

    return cleaned;
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
   * Create a new tech
   */
  async createTech(techData) {
    try {
      const fields = {
        'First Name': techData.firstName || '',
        'Last Name': techData.lastName || '',
        Name: techData.firstName && techData.lastName ? `${techData.firstName} ${techData.lastName}` : (techData.firstName || ''),
        Phone: techData.phone || '',
        Email: techData.email || '',
        Skills: techData.skills || [],
        'Availability Status': 'Available',
        Notes: techData.notes || '',
      };

      const records = await tables.techs.create([{ fields }]);
      console.log('✓ Tech created:', records[0].id);
      return records[0];
    } catch (error) {
      console.error('Error creating tech:', error);
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

  /**
   * Get all customers
   */
  async getAllCustomers() {
    const cached = getCached('customers');
    if (cached) return cached;
    try {
      const records = await tables.customers
        .select()
        .all();

      setCache('customers', records);
      return records;
    } catch (error) {
      console.error('Error getting all customers:', error);
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
        'Original Transcript/Form Data': engagementData.rawData || '',
        Business: engagementData.business || 'Great White Security',
      };

      // Add Client intake info (initial message/notes from customer)
      if (engagementData.notes) {
        fields['Client intake info'] = engagementData.notes;
      }

      // Add Lead Type if provided (single select: Service Call or Project)
      if (engagementData.leadType) {
        fields['Lead Type'] = engagementData.leadType;
      }

      // Add System Type if provided (multiple select: CCTV, Alarm, etc.)
      if (engagementData.systemType) {
        fields['System Type'] = Array.isArray(engagementData.systemType) ? engagementData.systemType : [engagementData.systemType];
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
      clearCache('engagements');
      return await tables.engagements.update(engagementId, updates);
    } catch (error) {
      console.error('Error updating engagement:', error);
      throw error;
    }
  }

  /**
   * Get engagement with customer data
   * Helper method that fetches engagement and its linked customer
   */
  async getEngagementWithCustomer(engagementId) {
    try {
      const engagement = await this.getEngagement(engagementId);

      if (!engagement) {
        return null;
      }

      // Get linked customer if exists
      let customer = null;
      const customerIds = engagement.fields.Customer;
      if (customerIds && customerIds.length > 0) {
        customer = await this.getCustomer(customerIds[0]);
      }

      return { engagement, customer };
    } catch (error) {
      console.error('Error getting engagement with customer:', error);
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
      // First try exact match (for already-normalized numbers)
      let records = await tables.techs
        .select({
          filterByFormula: `{Phone} = '${phone}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (records.length > 0) {
        return records[0];
      }

      // If no exact match, fetch all techs and normalize to compare
      const allTechs = await this.getAllTechs();

      for (const tech of allTechs) {
        const techPhone = tech.fields.Phone;

        if (techPhone) {
          const normalized = this.normalizePhone(techPhone);
          if (normalized === phone) {
            return tech;
          }
        }
      }

      return null;
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
    const cached = getCached('techs');
    if (cached) return cached;
    try {
      const records = await tables.techs
        .select()
        .all();

      setCache('techs', records);
      return records;
    } catch (error) {
      console.error('Error getting all techs:', error);
      throw error;
    }
  }

  /**
   * Get all engagements
   */
  async getAllEngagements() {
    const cached = getCached('engagements');
    if (cached) return cached;
    try {
      const records = await tables.engagements
        .select()
        .all();

      setCache('engagements', records);
      return records;
    } catch (error) {
      console.error('Error getting all engagements:', error);
      throw error;
    }
  }

  /**
   * Get all jobs
   */
  async getAllJobs() {
    const cached = getCached('jobs');
    if (cached) return cached;
    try {
      const records = await tables.jobs
        .select()
        .all();

      setCache('jobs', records);
      return records;
    } catch (error) {
      console.error('Error getting all jobs:', error);
      throw error;
    }
  }

  // ============ MESSAGES ============

  /**
   * Log a message in Airtable
   */
  async logMessage(messageData) {
    clearCache('messages');
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

      // Link to engagement if provided
      if (messageData.engagementId) {
        fields['Related Lead'] = [messageData.engagementId]; // Field still named 'Related Lead' in Airtable
      }

      // Link to customer if provided
      if (messageData.customerId) {
        fields['Related Customer'] = [messageData.customerId];
      }

      // Link to tech if provided
      if (messageData.techId) {
        fields['Related Tech'] = [messageData.techId];
      }

      // Set Read status: outbound messages are auto-read, inbound are unread
      if (messageData.direction === 'Inbound') {
        fields.Read = false;
      } else {
        fields.Read = true;
      }

      const records = await tables.messages.create([{ fields }]);
      return records[0];
    } catch (error) {
      console.error('Error logging message:', error);
      throw error;
    }
  }

  /**
   * Get all messages
   */
  async getAllMessages() {
    const cached = getCached('messages');
    if (cached) return cached;
    try {
      const records = await tables.messages
        .select({
          // Don't sort here - will sort in memory
        })
        .all();

      setCache('messages', records);
      return records;
    } catch (error) {
      console.error('Error getting all messages:', error);
      throw error;
    }
  }

  /**
   * Mark messages as read in Airtable (batch update in groups of 10)
   */
  async markMessagesAsRead(messageIds) {
    if (!messageIds || messageIds.length === 0) return;
    clearCache('messages');
    try {
      // Airtable batch update limit is 10 records at a time
      for (let i = 0; i < messageIds.length; i += 10) {
        const batch = messageIds.slice(i, i + 10);
        await tables.messages.update(
          batch.map(id => ({ id, fields: { Read: true } }))
        );
      }
      console.log(`✓ Marked ${messageIds.length} message(s) as read`);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  /**
   * Get the most recent outbound message linked to a tech (to find which engagement they're responding to)
   */
  async getRecentOutboundMessageForTech(techId) {
    try {
      const records = await tables.messages
        .select({
          filterByFormula: `AND({Related Tech} = '${techId}', {Direction} = 'Outbound')`,
          sort: [{ field: 'Created', direction: 'desc' }],
          maxRecords: 1,
        })
        .firstPage();

      return records.length > 0 ? records[0] : null;
    } catch (error) {
      console.error('Error getting recent message for tech:', error);
      return null;
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
  // ============ PROPOSALS ============

  /**
   * Create a new proposal
   */
  async createProposal(data) {
    clearCache('proposals');
    try {
      const records = await tables.proposals.create([{ fields: data }]);
      console.log('✓ Proposal created:', records[0].id);
      return records[0];
    } catch (error) {
      console.error('Error creating proposal:', error);
      throw error;
    }
  }

  /**
   * Get proposal by Airtable record ID
   */
  async getProposal(id) {
    try {
      return await tables.proposals.find(id);
    } catch (error) {
      console.error('Error getting proposal:', error);
      throw error;
    }
  }

  /**
   * Get proposal by Project Number
   */
  async getProposalByProjectNumber(projectNumber) {
    try {
      const records = await tables.proposals
        .select({
          filterByFormula: `{Project Number} = '${projectNumber}'`,
          maxRecords: 1,
        })
        .firstPage();

      return records[0] || null;
    } catch (error) {
      console.error('Error getting proposal by project number:', error);
      throw error;
    }
  }

  /**
   * Update proposal
   */
  async updateProposal(id, updates) {
    clearCache('proposals');
    try {
      return await tables.proposals.update(id, updates);
    } catch (error) {
      console.error('Error updating proposal:', error);
      throw error;
    }
  }

  // ============ SITE VISITS ============

  /**
   * Create a site visit record
   */
  async createSiteVisit(data) {
    try {
      const records = await tables.siteVisits.create([{ fields: data }]);
      console.log('✓ Site visit created:', records[0].id);
      return records[0];
    } catch (error) {
      console.error('Error creating site visit:', error);
      throw error;
    }
  }

  /**
   * Get all site visits for an engagement, sorted by date descending
   */
  async getSiteVisitsByEngagement(engagementId) {
    try {
      const records = await tables.siteVisits
        .select({
          filterByFormula: `RECORD_ID({Engagement}) = '${engagementId}'`,
          sort: [{ field: 'Visit Date', direction: 'desc' }],
        })
        .all();
      return records;
    } catch (error) {
      // If table doesn't exist yet or filter fails, try linked record approach
      try {
        const records = await tables.siteVisits
          .select({
            sort: [{ field: 'Visit Date', direction: 'desc' }],
          })
          .all();
        return records.filter(r => {
          const linked = r.fields.Engagement;
          return linked && linked.includes(engagementId);
        });
      } catch (fallbackError) {
        console.error('Error getting site visits:', fallbackError);
        return [];
      }
    }
  }

  /**
   * Get engagements for a specific customer
   */
  async getEngagementsByCustomer(customerId) {
    try {
      const allEngagements = await this.getAllEngagements();
      return allEngagements.filter(e => {
        const customerIds = e.fields.Customer;
        return customerIds && customerIds.includes(customerId);
      });
    } catch (error) {
      console.error('Error getting engagements by customer:', error);
      throw error;
    }
  }

  /**
   * Check if a project number already exists (optionally excluding a specific record)
   */
  async projectNumberExists(projectNumber, excludeRecordId) {
    try {
      const records = await tables.proposals
        .select({
          filterByFormula: `{Project Number} = '${projectNumber}'`,
          maxRecords: 10,
        })
        .firstPage();

      if (excludeRecordId) {
        return records.some(r => r.id !== excludeRecordId);
      }
      return records.length > 0;
    } catch (error) {
      console.error('Error checking project number:', error);
      throw error;
    }
  }

  /**
   * Get the next available project number
   */
  async getNextProjectNumber() {
    try {
      const allRecords = await this.getAllProposals();
      let maxNum = 0;
      for (const r of allRecords) {
        const pn = r.fields['Project Number'];
        if (pn) {
          const num = parseInt(pn, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
      return String(maxNum + 1).padStart(6, '0');
    } catch (error) {
      console.error('Error getting next project number:', error);
      throw error;
    }
  }

  /**
   * Get all proposals (cached 60s)
   */
  async getAllProposals() {
    const cached = getCached('proposals');
    if (cached) return cached;
    try {
      const records = await tables.proposals
        .select()
        .all();

      setCache('proposals', records);
      return records;
    } catch (error) {
      console.error('Error getting all proposals:', error);
      throw error;
    }
  }
}

module.exports = new AirtableService();
