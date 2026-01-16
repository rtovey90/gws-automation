const Airtable = require('airtable');

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

// Table references
const tables = {
  customers: base(process.env.AIRTABLE_CUSTOMERS_TABLE),
  engagements: base(process.env.AIRTABLE_ENGAGEMENTS_TABLE),
  leads: base(process.env.AIRTABLE_ENGAGEMENTS_TABLE), // Alias for backward compatibility
  jobs: base(process.env.AIRTABLE_JOBS_TABLE),
  techs: base(process.env.AIRTABLE_TECHS_TABLE),
  messages: base(process.env.AIRTABLE_MESSAGES_TABLE),
  templates: base(process.env.AIRTABLE_TEMPLATES_TABLE),
  products: base(process.env.AIRTABLE_PRODUCTS_TABLE || 'Products'),
};

module.exports = { base, tables };
