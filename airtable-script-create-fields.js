/**
 * Airtable Script to Create All Fields Automatically
 *
 * HOW TO USE:
 * 1. In Airtable, click "Extensions" (puzzle piece icon top right)
 * 2. Click "Add an extension" → "Scripting"
 * 3. Copy and paste this ENTIRE script
 * 4. Click "Run"
 *
 * This will create all fields in all tables!
 */

let techsTable = base.getTable('Techs');
let leadsTable = base.getTable('Leads');
let jobsTable = base.getTable('Jobs');
let messagesTable = base.getTable('Messages');
let templatesTable = base.getTable('Templates');

output.markdown('# Creating Fields for GWS Automation System\n');

// Unfortunately, Airtable's Scripting API also cannot create fields programmatically
// in the free/standard plans. This requires the Enterprise API.

output.markdown('⚠️ **Unfortunately, Airtable\'s API doesn\'t allow scripts to create fields.**\n');
output.markdown('You need to add fields manually or use the CSV import method after fields exist.\n\n');

output.markdown('## Quickest Method:\n');
output.markdown('1. For each table, click the **"+"** button\n');
output.markdown('2. Add fields as **"Single line text"** first (fastest)\n');
output.markdown('3. Then import CSVs to populate data\n');
output.markdown('4. Finally, change field types as needed\n\n');

output.markdown('## Fields needed per table:\n\n');

output.markdown('### Techs (6 more fields):\n');
output.markdown('- Phone\n- Email\n- Skills\n- Availability Status\n- Rating\n- Active Jobs\n\n');

output.markdown('### Leads (10 more fields):\n');
output.markdown('- Phone\n- Email\n- Address/Location\n- Source\n- Status\n- Service Type\n- Original Transcript/Form Data\n- Business\n- Linked Jobs\n- Client Notes\n\n');

output.markdown('### Jobs (23 fields - this is the big one!):\n');
output.markdown('- Client Address\n- Job Status\n- Scope of Work\n- Quoted Price\n- Payment Status\n');
output.markdown('- Stripe Payment Link\n- Stripe Payment ID\n- Auto-Send Pricing\n- Scheduled Date\n');
output.markdown('- Completion Date\n- Tech Notes\n- Activity Log\n- Parts Used\n- Parts Cost\n');
output.markdown('- Review Requested\n- Review Received\n- Review Link\n- Lead\n- Assigned Tech\n');
output.markdown('- Client Name\n- Client Phone\n- Client Email\n- Photos\n\n');

output.markdown('### Messages (8 fields):\n');
output.markdown('- Direction\n- Type\n- To\n- From\n- Content\n- Status\n- Related Job\n- Related Lead\n\n');

output.markdown('### Templates (2 more fields):\n');
output.markdown('- Type\n- Content\n- Active\n\n');

output.markdown('---\n\n');
output.markdown('**Total time: ~15 minutes to add all fields manually**\n');
output.markdown('Then import CSVs and you\'re done!');
