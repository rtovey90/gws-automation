const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

/**
 * Lead Management Controllers - Handle tech availability checks
 */

/**
 * Check tech availability for a lead
 * POST /api/check-tech-availability OR GET /api/check-tech-availability/:leadId
 * Body: { leadId } OR Params: { leadId }
 */
exports.checkTechAvailability = async (req, res) => {
  try {
    const leadId = (req.body && req.body.leadId) || (req.params && req.params.leadId);

    console.log('Request method:', req.method);
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Extracted leadId:', leadId);

    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    console.log(`📋 Checking tech availability for lead: ${leadId}`);

    // Get lead details
    const lead = await airtableService.getLead(leadId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get all available techs
    const techs = await airtableService.getAvailableTechs();

    if (techs.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No available techs found',
        count: 0
      });
    }

    console.log(`📤 Sending availability check to ${techs.length} techs`);

    // Send SMS to each tech
    const results = [];
    for (const tech of techs) {
      try {
        const yesLink = `${process.env.BASE_URL}/tech-availability/${leadId}/${tech.id}/yes`;
        const noLink = `${process.env.BASE_URL}/tech-availability/${leadId}/${tech.id}/no`;

        const techName = tech.fields['First Name'] || tech.fields.Name;

        const message = `Hey ${techName}, got a service call this week if you're available.

Location: ${lead.fields['Address/Location'] || 'TBD'}
Service: ${lead.fields['Lead Type'] || 'Security work'}

Please make your selection:

👍 YES - I'm available
${yesLink}

👎 NO - Not available
${noLink}

Or just reply YES or NO to this message`;

        await twilioService.sendSMS(
          tech.fields.Phone,
          message,
          { leadId, techId: tech.id, type: 'availability_check' }
        );

        const displayName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || tech.fields.Name;
        results.push({ techId: tech.id, tech: displayName, status: 'sent' });
        console.log(`  ✓ Sent to ${displayName}`);
      } catch (error) {
        console.error(`  ✗ Failed to send to tech ${tech.id}:`, error.message);
        results.push({ techId: tech.id, status: 'failed', error: error.message });
      }
    }

    // Update lead to mark availability requested
    await airtableService.updateLead(leadId, {
      'Tech Availability Requested': true,
      'Tech Availability Responses': `Availability check sent to ${techs.length} techs at ${new Date().toISOString()}`
    });

    res.status(200).json({
      success: true,
      leadId,
      techsContacted: techs.length,
      results,
    });
  } catch (error) {
    console.error('Error checking tech availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Tech responds to availability check (via link)
 * GET /tech-availability/:leadId/:techId/:response
 */
exports.handleAvailabilityResponse = async (req, res) => {
  try {
    const { leadId, techId, response } = req.params;

    console.log(`📋 Tech ${techId} responded ${response.toUpperCase()} for lead ${leadId}`);

    // Get lead and tech details
    const lead = await airtableService.getLead(leadId);
    const tech = await airtableService.getTech(techId);

    if (!lead || !tech) {
      return res.status(404).send('Lead or tech not found');
    }

    // Update lead with response
    const existingResponses = lead.fields['Tech Availability Responses'] || '';
    const techDisplayName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || tech.fields.Name;
    const newResponse = `\n[${new Date().toLocaleString()}] ${techDisplayName}: ${response.toUpperCase()}`;

    const updates = {
      'Tech Availability Responses': existingResponses + newResponse
    };

    // If YES, add to Available Techs
    if (response.toLowerCase() === 'yes') {
      const existingTechs = lead.fields['Available Techs'] || [];
      updates['Available Techs'] = [...existingTechs, techId];
    }

    await airtableService.updateLead(leadId, updates);

    // Log message
    await airtableService.logMessage({
      leadId: leadId,
      direction: 'Inbound',
      type: 'SMS',
      from: tech.fields.Phone,
      to: 'System',
      content: `Availability response: ${response.toUpperCase()}`,
      status: 'Received',
    });

    // Notify admin
    try {
      const techDisplayName = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || tech.fields.Name;
      const leadDisplayName = [lead.fields['First Name'], lead.fields['Last Name']].filter(Boolean).join(' ');

      await twilioService.sendSMS(
        process.env.ADMIN_PHONE,
        `📋 ${techDisplayName} is ${response.toUpperCase() === 'YES' ? '✅ AVAILABLE' : '❌ NOT AVAILABLE'} for:\n\n${leadDisplayName} - ${lead.fields['Address/Location']}\n\nView in Airtable`,
        { leadId, techId }
      );
    } catch (smsError) {
      console.error('Error sending admin notification:', smsError);
    }

    // Show confirmation page
    const isYes = response.toLowerCase() === 'yes';
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Response Recorded</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
          }
          .message {
            background: ${isYes ? '#d4edda' : '#f8d7da'};
            border: 2px solid ${isYes ? '#28a745' : '#dc3545'};
            padding: 30px;
            border-radius: 10px;
          }
          h1 { color: ${isYes ? '#155724' : '#721c24'}; }
          p { font-size: 18px; color: ${isYes ? '#155724' : '#721c24'}; }
        </style>
      </head>
      <body>
        <div class="message">
          <h1>${isYes ? '✅' : '❌'} ${isYes ? 'Thanks!' : 'No worries'}</h1>
          <p>Your response has been recorded.</p>
          ${isYes ? '<p>Ricky will be in touch if this job goes ahead!</p>' : '<p>Thanks for letting us know. Catch you on the next one!</p>'}
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error handling availability response:', error);
    res.status(500).send('Error recording response. Please contact Ricky.');
  }
};

module.exports = exports;
