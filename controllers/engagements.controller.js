const airtableService = require('../services/airtable.service');
const { wrapInLayout } = require('../utils/layout');

/**
 * Create new engagement for a customer (called from Airtable button)
 * GET /api/create-engagement?customerId={customerId}
 */
exports.createEngagement = async (req, res) => {
  try {
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .error { color: #dc3545; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Error</h1>
          <p>Missing customer ID</p>
        </body>
        </html>
      `);
    }

    console.log(`➕ Creating new engagement for customer: ${customerId}`);

    // Get customer details to show in confirmation
    const customer = await airtableService.getCustomer(customerId);

    if (!customer) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .error { color: #dc3545; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Error</h1>
          <p>Customer not found</p>
        </body>
        </html>
      `);
    }

    const customerName = [customer.fields['First Name'], customer.fields['Last Name']].filter(Boolean).join(' ');

    // Create new engagement
    const engagement = await airtableService.createEngagement({
      customerId: customerId, // Link to customer record
      status: 'New Lead',
    });

    console.log(`✓ Created engagement ${engagement.id} for ${customerName}`);

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Engagement Created</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            max-width: 500px;
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
          }
          .success-icon {
            font-size: 72px;
            margin-bottom: 20px;
          }
          h1 {
            color: #28a745;
            font-size: 28px;
            margin-bottom: 15px;
          }
          .customer-name {
            color: #666;
            font-size: 18px;
            margin-bottom: 30px;
          }
          .info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            text-align: left;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
          }
          .info-label {
            font-weight: 600;
            color: #666;
          }
          .info-value {
            color: #333;
          }
          .message {
            color: #666;
            margin-top: 20px;
            font-size: 14px;
          }
          .engagement-id {
            font-family: monospace;
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Engagement Created!</h1>
          <p class="customer-name">For: ${customerName}</p>

          <div class="info">
            <div class="info-row">
              <span class="info-label">Engagement ID:</span>
              <span class="info-value engagement-id">${engagement.id}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Status:</span>
              <span class="info-value">New Lead</span>
            </div>
            <div class="info-row">
              <span class="info-label">Customer:</span>
              <span class="info-value">${customerName}</span>
            </div>
          </div>

          <p class="message">
            Go back to Airtable to add Job Scope and other details.
          </p>
          <p class="message" style="margin-top: 30px; color: #999;">
            You can close this window.
          </p>
        </div>

        <script>
          // Auto-close after 3 seconds
          setTimeout(() => {
            window.close();
          }, 3000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error creating engagement:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
          }
          .error { color: #dc3545; font-size: 24px; }
          .details {
            background: #f8f9fa;
            padding: 15px;
            margin-top: 20px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <h1 class="error">❌ Error</h1>
        <p>Failed to create engagement</p>
        <div class="details">${error.message}</div>
      </body>
      </html>
    `);
  }
};

/**
 * Show engagements list
 * GET /engagements
 */
exports.showList = async (req, res) => {
  try {
    const [engagements, customers, allTechs] = await Promise.all([
      airtableService.getAllEngagements(),
      airtableService.getAllCustomers(),
      airtableService.getAllTechs(),
    ]);

    const customerById = {};
    customers.forEach(c => { customerById[c.id] = c; });
    const techById = {};
    allTechs.forEach(t => { techById[t.id] = t; });

    const rows = engagements.map(e => {
      const f = e.fields;
      const custId = f.Customer && f.Customer[0];
      const cust = custId && customerById[custId];
      const name = f['Customer Name'] || (cust && [cust.fields['First Name'], cust.fields['Last Name']].filter(Boolean).join(' ')) || f['First Name'] || 'Unknown';
      const engNum = f['Engagement Number'] || '';
      const status = f.Status || '';
      const invoiced = parseFloat(f['Total Invoiced']) || 0;
      const cost = parseFloat(f['Total Cost']) || 0;
      const profit = invoiced - cost;
      const techIds = f['Assigned Tech Name'] || [];
      const techNames = techIds.map(tid => {
        const t = techById[tid];
        return t ? (t.fields['First Name'] || '') : '';
      }).filter(Boolean).join(', ');
      const created = f['Created'] || e._rawJson?.createdTime || '';
      const type = engNum.startsWith('SC') ? 'sc' : engNum.startsWith('PR') ? 'pr' : '';
      return { id: e.id, name, engNum, status, invoiced, cost, profit, techNames, created, type };
    }).filter(r => r.engNum).sort((a, b) => {
      // Sort by numeric part of engagement number descending (highest first)
      const numA = parseInt(a.engNum.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.engNum.replace(/\D/g, '')) || 0;
      return numB - numA;
    });

    const rowsJSON = JSON.stringify(rows).replace(/`/g, '\\u0060').replace(/\$\{/g, '\\u0024{').replace(/</g, '\\u003c');

    const styles = `<style>
    .eng-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:20px; }
    .eng-search { flex:1; min-width:200px; padding:10px 14px; background:#0f1419; border:1px solid #2a3a4a; border-radius:8px; color:#e0e6ed; font-size:14px; }
    .eng-search:focus { outline:none; border-color:#00d4ff; }
    .eng-filter { background:#0f1419; border:1px solid #2a3a4a; color:#8899aa; padding:8px 14px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; }
    .eng-filter:hover { border-color:#00d4ff; color:#e0e6ed; }
    .eng-filter.active { background:#00d4ff; color:#0a0e27; border-color:#00d4ff; }
    .eng-table { width:100%; border-collapse:collapse; }
    .eng-table th { text-align:left; padding:10px 12px; font-size:11px; color:#6a7a8a; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid #2a3a4a; }
    .eng-table td { padding:10px 12px; border-bottom:1px solid #1e2a3a; font-size:13px; }
    .eng-table tr:hover { background:#1a2332; cursor:pointer; }
    .eng-table a { color:#00d4ff; text-decoration:none; font-weight:600; }
    .eng-table a:hover { text-decoration:underline; }
    .type-sc { color:#00d4ff; }
    .type-pr { color:#ce93d8; }
    .eng-positive { color:#34c759; }
    .eng-negative { color:#ef5350; }
    .eng-zero { color:#556677; }
    </style>`;

    const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h1 style="margin:0;font-size:22px;color:#e0e6ed">Engagements</h1>
      <span style="color:#8899aa;font-size:13px" id="eng-count"></span>
    </div>
    <div class="eng-controls">
      <input type="text" class="eng-search" id="eng-search" placeholder="Search by name, number, status, or tech...">
      <button class="eng-filter active" data-filter="all">All</button>
      <button class="eng-filter" data-filter="sc">Service Calls</button>
      <button class="eng-filter" data-filter="pr">Projects</button>
      <button class="eng-filter" data-filter="needs-costs">Needs Costs</button>
    </div>
    <div style="overflow-x:auto">
      <table class="eng-table">
        <thead><tr>
          <th>#</th>
          <th>Customer</th>
          <th>Status</th>
          <th>Tech</th>
          <th style="text-align:right">Invoiced</th>
          <th style="text-align:right">Cost</th>
          <th style="text-align:right">Profit</th>
        </tr></thead>
        <tbody id="eng-tbody"></tbody>
      </table>
    </div>`;

    const scripts = `<script>
    var ALL_ROWS = ${rowsJSON};
    var currentFilter = 'all';
    var searchTerm = '';

    function render() {
      var rows = ALL_ROWS.filter(function(r) {
        if (currentFilter === 'sc' && r.type !== 'sc') return false;
        if (currentFilter === 'pr' && r.type !== 'pr') return false;
        if (currentFilter === 'needs-costs' && !(r.invoiced > 0 && r.cost === 0)) return false;
        if (searchTerm) {
          var s = searchTerm.toLowerCase();
          var hay = (r.name + ' ' + r.engNum + ' ' + r.status + ' ' + r.techNames).toLowerCase();
          if (hay.indexOf(s) === -1) return false;
        }
        return true;
      });
      document.getElementById('eng-count').textContent = rows.length + ' of ' + ALL_ROWS.length;
      var html = '';
      rows.forEach(function(r) {
        var typeClass = r.type === 'sc' ? 'type-sc' : r.type === 'pr' ? 'type-pr' : '';
        var inv = r.invoiced > 0 ? '$' + r.invoiced.toFixed(2) : '--';
        var cost = r.cost > 0 ? '$' + r.cost.toFixed(2) : '--';
        var profitVal = r.invoiced > 0 && r.cost > 0 ? r.profit : null;
        var profitStr = profitVal !== null ? '$' + profitVal.toFixed(2) : '--';
        var profitClass = profitVal !== null ? (profitVal > 0 ? 'eng-positive' : profitVal < 0 ? 'eng-negative' : 'eng-zero') : 'eng-zero';
        html += '<tr onclick="location.href=\\'/engagement/' + r.id + '\\'">' +
          '<td><a href="/engagement/' + r.id + '" class="' + typeClass + '">' + r.engNum + '</a></td>' +
          '<td style="color:#e0e6ed">' + r.name + '</td>' +
          '<td style="color:#8899aa;font-size:12px">' + r.status + '</td>' +
          '<td style="color:#8899aa;font-size:12px">' + r.techNames + '</td>' +
          '<td style="text-align:right;font-family:monospace">' + inv + '</td>' +
          '<td style="text-align:right;font-family:monospace">' + cost + '</td>' +
          '<td class="' + profitClass + '" style="text-align:right;font-family:monospace;font-weight:600">' + profitStr + '</td>' +
        '</tr>';
      });
      document.getElementById('eng-tbody').innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:#556677;padding:40px">No engagements found</td></tr>';
    }

    document.getElementById('eng-search').addEventListener('input', function() {
      searchTerm = this.value;
      render();
    });
    document.querySelectorAll('.eng-filter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.eng-filter').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        render();
      });
    });
    render();
    </script>`;

    res.send(wrapInLayout('Engagements', body, 'engagements', { customStyles: styles, customScripts: scripts }));
  } catch (error) {
    console.error('Engagements list error:', error);
    res.status(500).send('<h1>Error loading engagements</h1>');
  }
};

module.exports = exports;
