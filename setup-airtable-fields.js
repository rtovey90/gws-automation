require('dotenv').config();
const Airtable = require('airtable');

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

/**
 * This script sets up all the fields in your Airtable base automatically
 *
 * NOTE: Airtable's standard API doesn't support creating fields directly.
 * Instead, this script will:
 * 1. Create sample records with all the fields we need
 * 2. When you create the first record, Airtable will auto-create the fields
 *
 * For full automation, you'd need to use Airtable's Metadata API (enterprise feature)
 * or use their Base Schema API (beta).
 */

async function setupTechsTable() {
  console.log('📋 Setting up Techs table...');

  try {
    const records = await base('Techs').create([
      {
        fields: {
          Name: 'Sample Tech - DELETE ME',
          Phone: '+61400000000',
          Email: 'sample@example.com',
          Skills: 'Bosch Alarms, Hikvision CCTV',
          'Availability Status': 'Available',
          Rating: 5,
          Notes: 'This is a sample record to create the field structure. Delete this record after verifying all fields appear correctly.',
        },
      },
    ]);

    console.log('✅ Techs table sample record created!');
    console.log('   Record ID:', records[0].id);
    return true;
  } catch (error) {
    console.error('❌ Error setting up Techs:', error.message);
    return false;
  }
}

async function setupLeadsTable() {
  console.log('📋 Setting up Leads table...');

  try {
    const records = await base('Leads').create([
      {
        fields: {
          Name: 'Sample Lead - DELETE ME',
          Phone: '+61400000001',
          Email: 'sample.lead@example.com',
          'Address/Location': '123 Sample St, Perth',
          Source: 'Form',
          Status: 'New',
          'Service Type': 'CCTV',
          Notes: 'Sample notes',
          'Original Transcript/Form Data': 'Sample data',
          Business: 'Great White Security',
          'Client Notes': 'This is a sample record. Delete after setup.',
        },
      },
    ]);

    console.log('✅ Leads table sample record created!');
    console.log('   Record ID:', records[0].id);
    return true;
  } catch (error) {
    console.error('❌ Error setting up Leads:', error.message);
    console.log('   Make sure these fields exist: Name, Phone, Email, Address/Location, Source, Status, Service Type, Notes, Original Transcript/Form Data, Business, Client Notes');
    return false;
  }
}

async function setupJobsTable() {
  console.log('📋 Setting up Jobs table...');

  try {
    const records = await base('Jobs').create([
      {
        fields: {
          'Client Address': '123 Sample St, Perth',
          'Job Status': 'Draft',
          'Scope of Work': 'Sample scope - install camera system',
          'Quoted Price': 500,
          'Payment Status': 'Not Sent',
          'Stripe Payment Link': 'https://example.com',
          'Stripe Payment ID': 'sample_id',
          'Auto-Send Pricing': false,
          'Tech Notes': 'Sample tech notes',
          'Activity Log': '[2026-01-13] Sample log entry',
          'Parts Used': 'Sample parts',
          'Parts Cost': 100,
          'Review Requested': false,
          'Review Received': false,
          'Review Link': 'https://example.com',
        },
      },
    ]);

    console.log('✅ Jobs table sample record created!');
    console.log('   Record ID:', records[0].id);
    return true;
  } catch (error) {
    console.error('❌ Error setting up Jobs:', error.message);
    console.log('   Make sure all fields exist in Jobs table');
    return false;
  }
}

async function setupMessagesTable() {
  console.log('📋 Setting up Messages table...');

  try {
    const records = await base('Messages').create([
      {
        fields: {
          Direction: 'Outbound',
          Type: 'SMS',
          To: '+61400000000',
          From: '+61400000001',
          Content: 'Sample message content',
          Status: 'Sent',
        },
      },
    ]);

    console.log('✅ Messages table sample record created!');
    console.log('   Record ID:', records[0].id);
    return true;
  } catch (error) {
    console.error('❌ Error setting up Messages:', error.message);
    return false;
  }
}

async function setupTemplatesTable() {
  console.log('📋 Setting up Templates table...');

  try {
    const records = await base('Templates').create([
      {
        fields: {
          Name: 'Sample Template - DELETE ME',
          Type: 'SMS to Tech',
          Content: 'Hey {{TECH_NAME}}, sample template message',
          Active: true,
        },
      },
    ]);

    console.log('✅ Templates table sample record created!');
    console.log('   Record ID:', records[0].id);
    return true;
  } catch (error) {
    console.error('❌ Error setting up Templates:', error.message);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Starting Airtable Setup...\n');
  console.log('Base ID:', process.env.AIRTABLE_BASE_ID);
  console.log('API Key:', process.env.AIRTABLE_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('\n');

  if (!process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY === 'your_airtable_api_key_here') {
    console.error('❌ AIRTABLE_API_KEY not set in .env file!');
    console.log('\nPlease:');
    console.log('1. Go to https://airtable.com/create/tokens');
    console.log('2. Create a new token with data.records:read and data.records:write scopes');
    console.log('3. Add it to your .env file as AIRTABLE_API_KEY');
    process.exit(1);
  }

  const results = {
    techs: await setupTechsTable(),
    leads: await setupLeadsTable(),
    jobs: await setupJobsTable(),
    messages: await setupMessagesTable(),
    templates: await setupTemplatesTable(),
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 SETUP SUMMARY');
  console.log('='.repeat(50));
  console.log('Techs:    ', results.techs ? '✅' : '❌');
  console.log('Leads:    ', results.leads ? '✅' : '❌');
  console.log('Jobs:     ', results.jobs ? '✅' : '❌');
  console.log('Messages: ', results.messages ? '✅' : '❌');
  console.log('Templates:', results.templates ? '✅' : '❌');
  console.log('='.repeat(50));

  const allSuccess = Object.values(results).every(r => r === true);

  if (allSuccess) {
    console.log('\n✅ ALL TABLES SET UP SUCCESSFULLY!\n');
    console.log('Next steps:');
    console.log('1. Go to Airtable and verify all fields appear correctly');
    console.log('2. Delete the sample records (they all say "DELETE ME")');
    console.log('3. Add your real techs to the Techs table');
    console.log('4. Run: npm start');
  } else {
    console.log('\n⚠️  Some tables had errors. Check the messages above.');
    console.log('\nThis likely means you need to manually create the fields first.');
    console.log('Use the QUICK-FIELD-SETUP.md guide.');
  }
}

main().catch(console.error);
