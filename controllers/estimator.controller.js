const fs = require('fs');
const path = require('path');
const { wrapInLayout } = require('../utils/layout');

// Read the estimator HTML file once at startup
const estimatorHtmlPath = path.join(__dirname, '..', 'public', 'estimator-app.html');
let estimatorHtml = fs.readFileSync(estimatorHtmlPath, 'utf8');

// Dark theme CSS overrides — injected into the page to restyle the light estimator
const darkThemeCSS = `
  /* ===== GWS Hub Dark Theme Overrides ===== */
  :root {
    --primary-blue: #00d4ff;
    --light-blue: #00a7e1;
    --dark-text: #e0e6ed;
    --medium-text: #8899aa;
    --light-bg: #1a2332;
    --border-color: #2a3a4a;
    --shadow-sm: 0 2px 4px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
  }

  body {
    background: #1a2332 !important;
    color: #e0e6ed !important;
    padding-top: 0 !important;
  }

  .container {
    background: #0f1419 !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.4) !important;
  }

  .header {
    border-bottom-color: #2a3a4a !important;
    display: none !important;
  }

  h1 { color: #e0e6ed !important; }

  /* Markup controls */
  .markup-controls {
    background: linear-gradient(135deg, #1a2332 0%, #1e2a3a 100%) !important;
    border-color: #2a3a4a !important;
  }

  .markup-control label { color: #e0e6ed !important; }

  .markup-control input {
    background: #1a2332 !important;
    border-color: #00d4ff !important;
    color: #e0e6ed !important;
  }

  .markup-control input:focus {
    border-color: #00a7e1 !important;
    box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.15) !important;
  }

  .markup-control span { color: #8899aa !important; }

  /* PDF import section */
  .pdf-import-section {
    background: linear-gradient(135deg, #0f1a2a 0%, #0d1825 100%) !important;
    border-color: #2a3a4a !important;
  }

  .pdf-import-section h3 { color: #00d4ff !important; }

  .upload-box {
    border-color: #00d4ff !important;
    background: #1a2332 !important;
  }

  .upload-box:hover {
    border-color: #00a7e1 !important;
    background: #1e2a3a !important;
  }

  .upload-box p { color: #e0e6ed !important; }
  .upload-box p:last-of-type { color: #8899aa !important; }

  .upload-status.processing {
    background: #2a2a1a !important;
    color: #ffd93d !important;
    border-color: #4a4a2a !important;
  }
  .upload-status.success {
    background: #1a2a1a !important;
    color: #34c759 !important;
    border-color: #2a3a2a !important;
  }
  .upload-status.error {
    background: #2a1a1a !important;
    color: #ff6b6b !important;
    border-color: #3a2a2a !important;
  }

  /* Sections */
  .section {
    border-color: #2a3a4a !important;
    background: #0f1419 !important;
  }

  .section:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
  }

  .section.prominent {
    border-color: #00d4ff !important;
    background: linear-gradient(135deg, #0f1a2a 0%, #0d1825 100%) !important;
  }

  .section.prominent .section-title { color: #00d4ff !important; }
  .section-title { color: #e0e6ed !important; }

  /* Tables */
  .items-table th {
    background: linear-gradient(135deg, #1a2332 0%, #1e2a3a 100%) !important;
    color: #e0e6ed !important;
    border-bottom-color: #2a3a4a !important;
  }

  .items-table tbody tr:hover {
    background: #1a2332 !important;
  }

  .items-table td {
    border-bottom-color: #2a3a4a !important;
  }

  .items-table input {
    background: #1a2332 !important;
    border-color: #2a3a4a !important;
    color: #e0e6ed !important;
  }

  .items-table input:focus {
    border-color: #00a7e1 !important;
    box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1) !important;
  }

  .calculated {
    background: linear-gradient(135deg, #1a2332 0%, #1e2a3a 100%) !important;
    color: #e0e6ed !important;
  }

  /* Section totals */
  .section-totals {
    border-top-color: #2a3a4a !important;
  }

  .total-item {
    background: linear-gradient(135deg, #1a2332 0%, #1e2a3a 100%) !important;
    border-color: #2a3a4a !important;
  }

  .total-label { color: #8899aa !important; }
  .total-value { color: #e0e6ed !important; }

  /* Grand totals — keep the blue gradient */

  /* Client info */
  .client-info {
    background: linear-gradient(135deg, #1a2332 0%, #1e2a3a 100%) !important;
    border-color: #2a3a4a !important;
  }

  .client-info label { color: #e0e6ed !important; }

  .client-info input,
  .client-info textarea {
    background: #0f1419 !important;
    border-color: #2a3a4a !important;
    color: #e0e6ed !important;
  }

  .client-info input:focus,
  .client-info textarea:focus {
    border-color: #00a7e1 !important;
    box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.15) !important;
  }

  .client-info input::placeholder,
  .client-info textarea::placeholder {
    color: #5a6a7a !important;
  }

  /* Save status */
  #save-status { color: #34c759 !important; }

  /* Tabs */
  .tabs-container {
    border-bottom-color: #2a3a4a !important;
  }

  .tab {
    background: #1a2332 !important;
    color: #8899aa !important;
  }

  .tab:hover {
    background: #1e2a3a !important;
    color: #e0e6ed !important;
  }

  .tab.active {
    background: #0f1419 !important;
    color: #00d4ff !important;
    border-color: #2a3a4a !important;
    border-bottom-color: #0f1419 !important;
  }

  .tab-name.editing {
    background: #1a2332 !important;
    border-color: #00a7e1 !important;
    color: #e0e6ed !important;
  }

  .add-tab-btn {
    background: #0f1419 !important;
    border-color: #2a3a4a !important;
    color: #00d4ff !important;
  }

  .add-tab-btn:hover {
    border-color: #00d4ff !important;
    background: #1a2332 !important;
  }

  /* Saved quotes list */
  .saved-quotes {
    background: #0f1419 !important;
    border-color: #2a3a4a !important;
  }

  .saved-quote-item {
    background: #1a2332 !important;
  }

  .saved-quote-item:hover {
    background: #1e2a3a !important;
  }

  .saved-quote-details { color: #8899aa !important; }

  /* Totals panel toggle */
  .totals-panel-toggle {
    background: linear-gradient(135deg, #00d4ff 0%, #00a7e1 100%) !important;
    top: calc(50% + 26px) !important;
  }

  /* Edit hints */
  .edit-hint { color: rgba(255,255,255,0.7) !important; }

  /* Scrollbar styling */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #0f1419; }
  ::-webkit-scrollbar-thumb { background: #2a3a4a; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a4a5a; }

  /* Number inputs - remove spinner on dark bg for cleaner look */
  .items-table input[type="number"] { -moz-appearance: textfield; }
  .items-table input[type="number"]::-webkit-inner-spin-button,
  .items-table input[type="number"]::-webkit-outer-spin-button { opacity: 0.5; }
`;

// Engagement picker HTML to inject into the client info section
const engagementPickerHTML = `
        <div class="engagement-picker" style="margin-bottom:20px; padding:20px; background:linear-gradient(135deg,#0a1628 0%,#0f1e30 100%); border:2px solid #00d4ff; border-radius:12px;">
          <label style="display:block; font-weight:700; margin-bottom:10px; font-size:14px; color:#00d4ff; text-transform:uppercase; letter-spacing:0.5px;">Link to Engagement</label>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="engagement-select" style="flex:1; min-width:200px; padding:12px 14px; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px; color:#e0e6ed; font-size:15px; cursor:pointer;">
              <option value="">-- Select Engagement --</option>
            </select>
            <button onclick="saveQuoteToEngagement()" class="save-btn" style="white-space:nowrap;">Save to Engagement</button>
            <button onclick="loadQuoteFromEngagement()" class="load-btn" style="white-space:nowrap;">Load from Engagement</button>
            <span id="engagement-status" style="color:#34c759; font-weight:600; font-size:13px;"></span>
          </div>
          <div id="mode-toggle-row" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid #2a3a4a;">
            <div style="display:flex; align-items:center; gap:12px;">
              <label style="font-weight:700; font-size:13px; color:#8899aa; text-transform:uppercase; letter-spacing:0.5px;">Mode:</label>
              <div style="display:flex; background:#1a2332; border:2px solid #2a3a4a; border-radius:8px; overflow:hidden;">
                <button id="mode-estimate" onclick="switchMode('estimate')" style="padding:8px 20px; background:#00d4ff; color:#0a0e27; border:none; font-weight:700; font-size:13px; cursor:pointer;">Estimate</button>
                <button id="mode-actuals" onclick="switchMode('actuals')" style="padding:8px 20px; background:transparent; color:#8899aa; border:none; font-weight:700; font-size:13px; cursor:pointer;">Actuals</button>
              </div>
              <button id="save-actuals-btn" onclick="saveActualsToEngagement()" class="save-btn" style="display:none; white-space:nowrap; background:linear-gradient(135deg,#ff6b6b,#ee5a5a);">Save Actuals</button>
              <span id="actuals-status" style="color:#34c759; font-weight:600; font-size:13px;"></span>
            </div>
          </div>
          <div id="comparison-panel" style="display:none; margin-top:15px; padding:15px; background:#0f1419; border:1px solid #2a3a4a; border-radius:8px;">
            <label style="display:block; font-weight:700; margin-bottom:10px; font-size:13px; color:#00d4ff; text-transform:uppercase; letter-spacing:0.5px;">Estimated vs Actual</label>
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead><tr style="border-bottom:1px solid #2a3a4a;">
                <th style="text-align:left; padding:6px 8px; color:#8899aa;">Category</th>
                <th style="text-align:right; padding:6px 8px; color:#8899aa;">Estimated</th>
                <th style="text-align:right; padding:6px 8px; color:#8899aa;">Actual</th>
                <th style="text-align:right; padding:6px 8px; color:#8899aa;">Variance</th>
              </tr></thead>
              <tbody id="comparison-body"></tbody>
            </table>
            <div id="comparison-summary" style="margin-top:12px; padding-top:12px; border-top:1px solid #2a3a4a; display:flex; gap:20px; flex-wrap:wrap;"></div>
          </div>
          <div id="supplier-docs-panel" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid #2a3a4a;">
            <label style="display:block; font-weight:700; margin-bottom:8px; font-size:13px; color:#8899aa; text-transform:uppercase; letter-spacing:0.5px;">Supplier Documents</label>
            <div id="supplier-docs-list" style="display:flex; flex-direction:column; gap:6px;"></div>
          </div>
        </div>
`;

// Extra JS to inject for engagement save/load
const engagementJS = `
    // ========== ENGAGEMENT SAVE/LOAD ==========
    let engagementsLoaded = false;

    async function loadEngagementsList() {
      if (engagementsLoaded) return;
      try {
        const response = await fetch('/api/estimator/engagements');
        if (!response.ok) throw new Error('Failed to load engagements');
        const engagements = await response.json();
        const select = document.getElementById('engagement-select');

        engagements.forEach(eng => {
          const opt = document.createElement('option');
          opt.value = eng.id;
          opt.textContent = eng.name + (eng.status ? ' (' + eng.status + ')' : '');
          select.appendChild(opt);
        });

        engagementsLoaded = true;

        // Check URL params for auto-select
        const urlParams = new URLSearchParams(window.location.search);
        const engId = urlParams.get('engagement');
        if (engId) {
          select.value = engId;
          loadQuoteFromEngagement();
        }
      } catch (error) {
        console.error('Failed to load engagements:', error);
      }
    }

    async function saveQuoteToEngagement() {
      const engagementId = document.getElementById('engagement-select').value;
      if (!engagementId) {
        alert('Please select an engagement first');
        return;
      }

      // Save current tab state
      if (activeTabId) {
        saveTabState(activeTabId);
      }

      const quoteData = {
        projectName: document.getElementById('project-name').value,
        quoteDate: document.getElementById('quote-date').value,
        clientName: document.getElementById('client-name').value,
        clientAddress: document.getElementById('client-address').value,
        tabs: tabs,
        activeTabId: activeTabId,
        savedDate: new Date().toISOString()
      };

      const statusEl = document.getElementById('engagement-status');
      statusEl.textContent = 'Saving...';
      statusEl.style.color = '#ffd93d';

      try {
        const response = await fetch('/api/estimator/save-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engagementId, quoteData })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Save failed');
        }

        const result = await response.json();
        statusEl.textContent = 'Saved! Quote: $' + result.summary.quoteAmount.toLocaleString();
        statusEl.style.color = '#34c759';
        setTimeout(() => { statusEl.textContent = ''; }, 5000);

        // Show "Create Proposal" button
        let proposalBtn = document.getElementById('create-proposal-btn');
        if (!proposalBtn) {
          proposalBtn = document.createElement('a');
          proposalBtn.id = 'create-proposal-btn';
          proposalBtn.style.cssText = 'display:inline-block; margin-left:10px; padding:10px 18px; background:linear-gradient(135deg,#00d4ff,#00a7e1); color:#0a0e27; font-weight:700; border-radius:8px; text-decoration:none; font-size:13px; vertical-align:middle;';
          statusEl.parentElement.appendChild(proposalBtn);
        }
        proposalBtn.href = '/admin/proposals/new/' + engagementId;
        proposalBtn.textContent = 'Create Proposal';
      } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = '#ff6b6b';
        setTimeout(() => { statusEl.textContent = ''; }, 5000);
      }
    }

    async function loadQuoteFromEngagement() {
      const engagementId = document.getElementById('engagement-select').value;
      if (!engagementId) {
        alert('Please select an engagement first');
        return;
      }

      const statusEl = document.getElementById('engagement-status');
      statusEl.textContent = 'Loading...';
      statusEl.style.color = '#ffd93d';

      try {
        const response = await fetch('/api/estimator/load-quote/' + engagementId);
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Load failed');
        }

        const quote = await response.json();

        // Load project info
        document.getElementById('project-name').value = quote.projectName || '';
        document.getElementById('quote-date').value = quote.quoteDate || getTodayDate();
        document.getElementById('client-name').value = quote.clientName || '';
        document.getElementById('client-address').value = quote.clientAddress || '';

        // Load tabs
        if (quote.tabs) {
          tabs = quote.tabs;
          tabCounter = Object.keys(tabs).length;
          activeTabId = quote.activeTabId || Object.keys(tabs)[0];
          loadTabState(activeTabId);
          renderTabs();
        }

        statusEl.textContent = 'Loaded!';
        statusEl.style.color = '#34c759';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);

        // Show mode toggle (estimate has been loaded, actuals mode now available)
        document.getElementById('mode-toggle-row').style.display = 'block';

        // Load supplier docs for this engagement
        loadSupplierDocs(engagementId);
      } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = '#ff6b6b';
        setTimeout(() => { statusEl.textContent = ''; }, 5000);
      }
    }

    // ========== MODE SWITCHING (ESTIMATE vs ACTUALS) ==========
    window.estimatorMode = 'estimate';
    let estimateSnapshot = null; // Saved estimate data for comparison

    function switchMode(mode) {
      const engagementId = document.getElementById('engagement-select').value;
      if (mode === 'actuals' && !engagementId) {
        alert('Please select an engagement first');
        return;
      }

      window.estimatorMode = mode;

      // Update toggle buttons
      const estBtn = document.getElementById('mode-estimate');
      const actBtn = document.getElementById('mode-actuals');
      estBtn.style.background = mode === 'estimate' ? '#00d4ff' : 'transparent';
      estBtn.style.color = mode === 'estimate' ? '#0a0e27' : '#8899aa';
      actBtn.style.background = mode === 'actuals' ? '#ff6b6b' : 'transparent';
      actBtn.style.color = mode === 'actuals' ? '#fff' : '#8899aa';

      // Show/hide actuals controls
      document.getElementById('save-actuals-btn').style.display = mode === 'actuals' ? 'inline-block' : 'none';

      // Hide markup controls in actuals mode
      const markupControls = document.querySelector('.markup-controls');
      if (markupControls) markupControls.style.display = mode === 'actuals' ? 'none' : '';

      if (mode === 'actuals') {
        // Save current estimate data as snapshot for comparison
        if (activeTabId) saveTabState(activeTabId);
        estimateSnapshot = JSON.parse(JSON.stringify(tabs));

        // Load actuals data
        loadActualsFromEngagement(engagementId);
      } else {
        // Switch back to estimate - restore saved estimate
        document.getElementById('comparison-panel').style.display = 'none';
        if (estimateSnapshot) {
          tabs = JSON.parse(JSON.stringify(estimateSnapshot));
          if (activeTabId && tabs[activeTabId]) loadTabState(activeTabId);
          else { activeTabId = Object.keys(tabs)[0]; loadTabState(activeTabId); }
          renderTabs();
        }
      }
    }

    async function loadActualsFromEngagement(engagementId) {
      const statusEl = document.getElementById('actuals-status');
      statusEl.textContent = 'Loading actuals...';
      statusEl.style.color = '#ffd93d';

      try {
        const response = await fetch('/api/estimator/load-actuals/' + engagementId);
        if (!response.ok) throw new Error('Failed to load actuals');
        const data = await response.json();

        if (data.actualsData && data.actualsData.tabs) {
          // Load existing actuals into the UI
          tabs = data.actualsData.tabs;
          tabCounter = Object.keys(tabs).length;
          activeTabId = data.actualsData.activeTabId || Object.keys(tabs)[0];
          loadTabState(activeTabId);
          renderTabs();
          statusEl.textContent = 'Actuals loaded';
        } else {
          // No actuals yet — start fresh with empty tabs matching estimate structure
          if (estimateSnapshot) {
            const freshTabs = {};
            Object.keys(estimateSnapshot).forEach(tabId => {
              freshTabs[tabId] = {
                name: estimateSnapshot[tabId].name,
                labourMarkup: 0,
                materialsMarkup: 0,
                paymentTerm: estimateSnapshot[tabId].paymentTerm || 24,
                items: { parts: [], labour: [], cable: [], misc: [] }
              };
            });
            tabs = freshTabs;
            activeTabId = Object.keys(tabs)[0];
            loadTabState(activeTabId);
            renderTabs();
          }
          statusEl.textContent = 'Enter actual costs';
        }
        statusEl.style.color = '#34c759';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);

        // Show comparison panel
        window._lastFinancialData = data;
        updateComparison(data);
      } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = '#ff6b6b';
      }
    }

    function updateComparison(financialData) {
      const panel = document.getElementById('comparison-panel');
      const tbody = document.getElementById('comparison-body');
      const summary = document.getElementById('comparison-summary');

      if (!estimateSnapshot) { panel.style.display = 'none'; return; }
      panel.style.display = 'block';

      // Calculate estimated costs per category from snapshot
      const estimated = { parts: 0, labour: 0, cable: 0, misc: 0 };
      Object.values(estimateSnapshot).forEach(tab => {
        ['parts', 'labour', 'cable', 'misc'].forEach(section => {
          (tab.items[section] || []).forEach(item => {
            estimated[section] += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
          });
        });
      });

      // Calculate actual costs from current tabs
      const actual = { parts: 0, labour: 0, cable: 0, misc: 0 };
      Object.values(tabs).forEach(tab => {
        ['parts', 'labour', 'cable', 'misc'].forEach(section => {
          (tab.items[section] || []).forEach(item => {
            actual[section] += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
          });
        });
      });

      const labels = { parts: 'Parts', labour: 'Labour', cable: 'Cable', misc: 'Misc' };
      let totalEst = 0, totalAct = 0;

      tbody.innerHTML = ['parts', 'labour', 'cable', 'misc'].map(cat => {
        const est = estimated[cat];
        const act = actual[cat];
        totalEst += est;
        totalAct += act;
        const diff = act - est;
        const pct = est > 0 ? ((diff / est) * 100).toFixed(1) : '0.0';
        const color = diff > 0 ? '#ff6b6b' : diff < 0 ? '#34c759' : '#8899aa';
        const sign = diff > 0 ? '+' : '';
        return '<tr style="border-bottom:1px solid #1a2332;">' +
          '<td style="padding:6px 8px;color:#e0e6ed;">' + labels[cat] + '</td>' +
          '<td style="padding:6px 8px;text-align:right;color:#e0e6ed;">$' + est.toFixed(2) + '</td>' +
          '<td style="padding:6px 8px;text-align:right;color:#e0e6ed;">$' + act.toFixed(2) + '</td>' +
          '<td style="padding:6px 8px;text-align:right;color:' + color + ';">' + sign + '$' + diff.toFixed(2) + ' (' + sign + pct + '%)</td>' +
          '</tr>';
      }).join('') +
        '<tr style="border-top:2px solid #00d4ff;font-weight:700;">' +
        '<td style="padding:8px;color:#00d4ff;">TOTAL</td>' +
        '<td style="padding:8px;text-align:right;color:#e0e6ed;">$' + totalEst.toFixed(2) + '</td>' +
        '<td style="padding:8px;text-align:right;color:#e0e6ed;">$' + totalAct.toFixed(2) + '</td>' +
        '<td style="padding:8px;text-align:right;color:' + (totalAct > totalEst ? '#ff6b6b' : '#34c759') + ';">' + (totalAct > totalEst ? '+' : '') + '$' + (totalAct - totalEst).toFixed(2) + '</td>' +
        '</tr>';

      // Financial summary
      const invoiced = financialData.totalInvoiced || 0;
      const quoted = financialData.quoteAmount || 0;
      const profit = invoiced - totalAct;
      const margin = invoiced > 0 ? ((profit / invoiced) * 100).toFixed(1) : '0.0';

      summary.innerHTML =
        '<div style="text-align:center;"><div style="color:#8899aa;font-size:11px;text-transform:uppercase;">Quoted</div><div style="color:#e0e6ed;font-size:18px;font-weight:700;">$' + quoted.toLocaleString() + '</div></div>' +
        '<div style="text-align:center;"><div style="color:#8899aa;font-size:11px;text-transform:uppercase;">Invoiced</div><div style="color:#00d4ff;font-size:18px;font-weight:700;">$' + invoiced.toLocaleString() + '</div></div>' +
        '<div style="text-align:center;"><div style="color:#8899aa;font-size:11px;text-transform:uppercase;">Actual Cost</div><div style="color:#e0e6ed;font-size:18px;font-weight:700;">$' + totalAct.toFixed(0) + '</div></div>' +
        '<div style="text-align:center;"><div style="color:#8899aa;font-size:11px;text-transform:uppercase;">Profit</div><div style="color:' + (profit >= 0 ? '#34c759' : '#ff6b6b') + ';font-size:18px;font-weight:700;">$' + profit.toFixed(0) + '</div></div>' +
        '<div style="text-align:center;"><div style="color:#8899aa;font-size:11px;text-transform:uppercase;">Margin</div><div style="color:' + (parseFloat(margin) >= 20 ? '#34c759' : '#ff6b6b') + ';font-size:18px;font-weight:700;">' + margin + '%</div></div>';
    }

    async function saveActualsToEngagement() {
      const engagementId = document.getElementById('engagement-select').value;
      if (!engagementId) { alert('Please select an engagement first'); return; }

      // Save current tab state
      if (activeTabId) saveTabState(activeTabId);

      // Calculate costs per category
      const costs = { parts: 0, labour: 0, cable: 0, misc: 0 };
      Object.values(tabs).forEach(tab => {
        ['parts', 'labour', 'cable', 'misc'].forEach(section => {
          (tab.items[section] || []).forEach(item => {
            costs[section] += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
          });
        });
      });

      const statusEl = document.getElementById('actuals-status');
      statusEl.textContent = 'Saving...';
      statusEl.style.color = '#ffd93d';

      try {
        const response = await fetch('/api/estimator/save-actuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            engagementId,
            actualsData: {
              tabs: tabs,
              activeTabId: activeTabId,
              savedDate: new Date().toISOString()
            },
            partsCost: costs.parts,
            laborCost: costs.labour,
            travelCost: costs.cable, // cable maps to travel in the financial fields
            otherCosts: costs.misc,
          })
        });

        if (!response.ok) throw new Error((await response.json()).error || 'Save failed');

        const result = await response.json();
        statusEl.textContent = 'Actuals saved! Profit: $' + result.summary.profit.toFixed(0);
        statusEl.style.color = '#34c759';

        // Update comparison panel with fresh data
        updateComparison(result.summary);

        setTimeout(() => { statusEl.textContent = ''; }, 5000);
      } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = '#ff6b6b';
      }
    }

    async function loadSupplierDocs(engagementId) {
      const panel = document.getElementById('supplier-docs-panel');
      const list = document.getElementById('supplier-docs-list');
      if (!panel || !list) return;

      try {
        const response = await fetch('/api/estimator/supplier-docs/' + engagementId);
        if (!response.ok) { panel.style.display = 'none'; return; }
        const docs = await response.json();

        if (docs.length === 0) { panel.style.display = 'none'; return; }

        panel.style.display = 'block';
        list.innerHTML = docs.map(doc => {
          const date = new Date(doc.parsedAt).toLocaleDateString('en-AU', { day:'numeric', month:'short' });
          const type = doc.mode === 'actuals' ? '<span style="color:#ff6b6b;font-size:11px;margin-left:6px;">ACTUAL</span>' : '';
          return '<a href="' + doc.cloudinaryUrl + '" target="_blank" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#1a2332;border:1px solid #2a3a4a;border-radius:6px;color:#e0e6ed;text-decoration:none;font-size:13px;">' +
            '<span style="color:#ff6b6b;">PDF</span>' +
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (doc.supplier || doc.filename) + type + '</span>' +
            '<span style="color:#8899aa;font-size:11px;">' + date + '</span>' +
            '</a>';
        }).join('');
      } catch (e) {
        panel.style.display = 'none';
      }
    }

    // Load supplier docs when engagement changes
    document.getElementById('engagement-select').addEventListener('change', function() {
      const engId = this.value;
      if (engId) loadSupplierDocs(engId);
      else document.getElementById('supplier-docs-panel').style.display = 'none';
    });

    // Load engagements list on page load
    loadEngagementsList();
`;

exports.showEstimator = (req, res) => {
  // Extract content between <body> and </body>
  const bodyStart = estimatorHtml.indexOf('<body>');
  const bodyEnd = estimatorHtml.indexOf('</body>');
  let bodyContent = estimatorHtml.substring(bodyStart + 6, bodyEnd);

  // Extract the original CSS from <style> tag
  const styleStart = estimatorHtml.indexOf('<style>');
  const styleEnd = estimatorHtml.indexOf('</style>');
  const originalCSS = estimatorHtml.substring(styleStart + 7, styleEnd);

  // Inject engagement picker before the Client Information section
  bodyContent = bodyContent.replace(
    '<!-- Client Information -->',
    '<!-- Engagement Picker -->\n' + engagementPickerHTML + '\n        <!-- Client Information -->'
  );

  // Inject engagement JS before the closing </script> tag
  // Use a function replacer to avoid $' special replacement pattern issues
  bodyContent = bodyContent.replace(
    '</script>',
    () => engagementJS + '\n    </script>'
  );

  // Combine original CSS + dark overrides
  const combinedCSS = originalCSS + '\n' + darkThemeCSS;

  // Check for engagement URL param and pass to layout
  res.send(wrapInLayout('Estimator', bodyContent, 'estimator', {
    customStyles: combinedCSS,
  }));
};
