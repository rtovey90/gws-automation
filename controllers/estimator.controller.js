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
              <button id="save-actuals-btn" onclick="saveActualsToEngagement()" class="save-btn" style="display:none; white-space:nowrap; background:linear-gradient(135deg,#00d4ff,#00a7e1); color:#0a0e27;">Save Actuals</button>
              <span id="actuals-status" style="color:#34c759; font-weight:600; font-size:13px;"></span>
            </div>
          </div>
          <div id="supplier-docs-panel" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid #2a3a4a;">
            <div id="supplier-quotes-section" style="display:none; margin-bottom:12px;">
              <label style="display:block; font-weight:700; margin-bottom:8px; font-size:13px; color:#00d4ff; text-transform:uppercase; letter-spacing:0.5px;">Supplier Quotes</label>
              <div id="supplier-quotes-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            </div>
            <div id="supplier-invoices-section" style="display:none;">
              <label style="display:block; font-weight:700; margin-bottom:8px; font-size:13px; color:#ffa726; text-transform:uppercase; letter-spacing:0.5px;">Supplier Invoices</label>
              <div id="supplier-invoices-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            </div>
          </div>
        </div>
`;

const comparisonPanelHTML = `
  <button id="actuals-panel-toggle" onclick="toggleActualsPanel()" style="display:none; position:fixed; left:0; top:50%; transform:translateY(-50%); background:linear-gradient(135deg,#00d4ff,#00a7e1); color:#0a0e27; border:none; padding:15px 12px; border-radius:0 12px 12px 0; cursor:pointer; font-size:13px; font-weight:700; writing-mode:vertical-rl; text-orientation:mixed; box-shadow:4px 0 15px rgba(0,212,255,0.3); z-index:999; transition:all .3s ease;">EST vs ACTUAL</button>
  <div id="actuals-panel" style="position:fixed; left:0; top:0; width:340px; height:100vh; background:linear-gradient(180deg,#1a1a2e,#16213e); box-shadow:4px 0 20px rgba(0,0,0,0.3); z-index:1000; overflow-y:auto; transform:translateX(-100%); transition:transform .3s ease; display:flex; flex-direction:column;">
    <div style="padding:16px 20px; background:linear-gradient(135deg,#00d4ff,#00a7e1); color:#0a0e27; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
      <h2 style="font-size:18px; font-weight:700; margin:0;">Estimated vs Actual</h2>
      <button onclick="toggleActualsPanel()" style="background:rgba(10,14,39,0.2); border:none; color:#0a0e27; width:30px; height:30px; border-radius:50%; cursor:pointer; font-size:18px;">&times;</button>
    </div>
    <div style="padding:16px 20px; flex:1;">
      <div style="margin-bottom:16px;">
        <label style="display:block; font-size:11px; color:#8899aa; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Compare against</label>
        <select id="compare-tab-select" onchange="updateComparison(window._lastFinancialData || {})" style="width:100%; padding:8px 12px; background:#1a2332; border:1px solid #2a3a4a; border-radius:6px; color:#e0e6ed; font-size:13px;"></select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block; font-size:11px; color:#8899aa; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Total Invoiced (override)</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <div style="position:relative; flex:1;">
            <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#5a6a7a; font-size:14px;">$</span>
            <input type="number" id="invoiced-override" placeholder="0.00" step="0.01" min="0" style="width:100%; padding:8px 12px 8px 24px; background:#1a2332; border:1px solid #2a3a4a; border-radius:6px; color:#e0e6ed; font-size:14px; font-weight:600;" oninput="recalcFromInvoiced()">
          </div>
          <button onclick="saveInvoicedOverride()" style="padding:8px 14px; background:#00d4ff; color:#0a0e27; border:none; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">Save</button>
        </div>
        <div id="invoiced-save-status" style="font-size:11px; margin-top:4px; min-height:14px;"></div>
      </div>
      <div id="comp-summary-cards" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;"></div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead><tr style="border-bottom:1px solid #2a3a4a;">
          <th style="text-align:left; padding:6px; color:#8899aa;">Category</th>
          <th style="text-align:right; padding:6px; color:#8899aa;">Est</th>
          <th style="text-align:right; padding:6px; color:#8899aa;">Act</th>
          <th style="text-align:right; padding:6px; color:#8899aa;">Var</th>
        </tr></thead>
        <tbody id="comparison-body"></tbody>
      </table>
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
      actBtn.style.background = mode === 'actuals' ? '#00d4ff' : 'transparent';
      actBtn.style.color = mode === 'actuals' ? '#0a0e27' : '#8899aa';

      // Show/hide actuals controls
      document.getElementById('save-actuals-btn').style.display = mode === 'actuals' ? 'inline-block' : 'none';

      // Hide markup controls in actuals mode
      const markupControls = document.querySelector('.markup-controls');
      if (markupControls) markupControls.style.display = mode === 'actuals' ? 'none' : '';

      if (mode === 'actuals') {
        // Save current estimate data as snapshot for comparison
        if (activeTabId) saveTabState(activeTabId);
        estimateSnapshot = JSON.parse(JSON.stringify(tabs));
        populateCompareTabSelect();

        // Load actuals data
        loadActualsFromEngagement(engagementId);
      } else {
        // Switch back to estimate - restore saved estimate
        var actualsToggle = document.getElementById('actuals-panel-toggle');
        var actualsPanel = document.getElementById('actuals-panel');
        if (actualsToggle) actualsToggle.style.display = 'none';
        if (actualsPanel) actualsPanel.style.transform = 'translateX(-100%)';
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

      // Reset invoiced input so it repopulates from fresh data
      var invoicedInput = document.getElementById('invoiced-override');
      if (invoicedInput) invoicedInput.value = '';

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

    function toggleActualsPanel() {
      var panel = document.getElementById('actuals-panel');
      var toggle = document.getElementById('actuals-panel-toggle');
      if (!panel) return;
      var isOpen = panel.style.transform === 'translateX(0px)' || panel.style.transform === 'translateX(0)';
      panel.style.transform = isOpen ? 'translateX(-100%)' : 'translateX(0)';
      if (toggle) toggle.style.display = isOpen ? 'block' : 'none';
    }

    function populateCompareTabSelect() {
      var sel = document.getElementById('compare-tab-select');
      if (!sel || !estimateSnapshot) return;
      var tabIds = Object.keys(estimateSnapshot);
      sel.innerHTML = tabIds.map(id => '<option value="' + id + '">' + (estimateSnapshot[id].name || id) + '</option>').join('');
      // Default to last (rightmost) tab
      if (tabIds.length > 0) sel.value = tabIds[tabIds.length - 1];
    }

    function updateComparison(financialData) {
      var toggle = document.getElementById('actuals-panel-toggle');
      var tbody = document.getElementById('comparison-body');
      var cards = document.getElementById('comp-summary-cards');

      if (!estimateSnapshot) { if (toggle) toggle.style.display = 'none'; return; }
      if (toggle && toggle.style.display === 'none') toggle.style.display = 'block';

      // Use only the selected estimate tab for comparison
      var sel = document.getElementById('compare-tab-select');
      var selectedTabId = sel ? sel.value : Object.keys(estimateSnapshot)[Object.keys(estimateSnapshot).length - 1];
      var selectedTab = estimateSnapshot[selectedTabId];

      var estimated = { parts: 0, labour: 0, cable: 0, misc: 0 };
      if (selectedTab) {
        ['parts', 'labour', 'cable', 'misc'].forEach(function(section) {
          (selectedTab.items[section] || []).forEach(function(item) {
            estimated[section] += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
          });
        });
      }

      // Calculate actual costs from current tabs
      var actual = { parts: 0, labour: 0, cable: 0, misc: 0 };
      Object.values(tabs).forEach(function(tab) {
        ['parts', 'labour', 'cable', 'misc'].forEach(function(section) {
          (tab.items[section] || []).forEach(function(item) {
            actual[section] += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
          });
        });
      });

      var labels = { parts: 'Parts', labour: 'Labour', cable: 'Cable', misc: 'Misc' };
      var totalEst = 0, totalAct = 0;

      if (tbody) {
        tbody.innerHTML = ['parts', 'labour', 'cable', 'misc'].map(function(cat) {
          var est = estimated[cat];
          var act = actual[cat];
          totalEst += est;
          totalAct += act;
          var diff = act - est;
          var pct = est > 0 ? ((diff / est) * 100).toFixed(1) : '0.0';
          var color = diff > 0 ? '#ff6b6b' : diff < 0 ? '#34c759' : '#5a6a7a';
          var sign = diff > 0 ? '+' : '';
          return '<tr style="border-bottom:1px solid #1a2332;">' +
            '<td style="padding:6px;color:#e0e6ed;">' + labels[cat] + '</td>' +
            '<td style="padding:6px;text-align:right;color:#e0e6ed;">$' + est.toFixed(0) + '</td>' +
            '<td style="padding:6px;text-align:right;color:#e0e6ed;">$' + act.toFixed(0) + '</td>' +
            '<td style="padding:6px;text-align:right;color:' + color + ';font-size:11px;">' + sign + '$' + diff.toFixed(0) + '</td>' +
            '</tr>';
        }).join('') +
          '<tr style="border-top:2px solid #00d4ff;font-weight:700;">' +
          '<td style="padding:6px;color:#00d4ff;">Total</td>' +
          '<td style="padding:6px;text-align:right;color:#e0e6ed;">$' + totalEst.toFixed(0) + '</td>' +
          '<td style="padding:6px;text-align:right;color:#e0e6ed;">$' + totalAct.toFixed(0) + '</td>' +
          '<td style="padding:6px;text-align:right;color:' + (totalAct > totalEst ? '#ff6b6b' : '#34c759') + ';">' + (totalAct > totalEst ? '+' : '') + '$' + (totalAct - totalEst).toFixed(0) + '</td>' +
          '</tr>';
      }

      // Summary cards — use override input if user has typed a value, else financialData
      var invoicedInput = document.getElementById('invoiced-override');
      var invoiced = financialData.totalInvoiced || 0;
      if (invoicedInput) {
        if (invoicedInput.value === '' && invoiced > 0) {
          invoicedInput.value = invoiced;
        }
        if (invoicedInput.value !== '') {
          invoiced = parseFloat(invoicedInput.value) || 0;
        }
      }
      var quoted = financialData.quoteAmount || 0;
      var profit = invoiced - totalAct;
      var margin = invoiced > 0 ? ((profit / invoiced) * 100).toFixed(1) : '0.0';
      var variance = totalAct - totalEst;

      if (cards) {
        var card = function(label, val, color) {
          return '<div style="background:#0f1419;border:1px solid #2a3a4a;border-radius:8px;padding:10px 12px;text-align:center;">' +
            '<div style="color:#5a6a7a;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">' + label + '</div>' +
            '<div style="color:' + (color || '#e0e6ed') + ';font-size:18px;font-weight:700;margin-top:2px;">' + val + '</div></div>';
        };
        cards.innerHTML =
          card('Estimated', '$' + totalEst.toLocaleString(undefined, {maximumFractionDigits:0})) +
          card('Actual', '$' + totalAct.toLocaleString(undefined, {maximumFractionDigits:0})) +
          card('Variance', (variance >= 0 ? '+' : '') + '$' + variance.toFixed(0), variance > 0 ? '#ff6b6b' : '#34c759') +
          card('Quoted', '$' + quoted.toLocaleString(undefined, {maximumFractionDigits:0})) +
          card('Invoiced', '$' + invoiced.toLocaleString(undefined, {maximumFractionDigits:0}), '#00d4ff') +
          card('Profit', '$' + profit.toFixed(0), profit >= 0 ? '#34c759' : '#ff6b6b') +
          card('Margin', margin + '%', parseFloat(margin) >= 20 ? '#34c759' : '#ff6b6b') +
          card('Cost vs Quote', totalEst > 0 ? ((totalAct / totalEst) * 100).toFixed(0) + '%' : '--', totalAct > totalEst ? '#ff6b6b' : '#34c759');
      }
    }

    function recalcFromInvoiced() {
      updateComparison(window._lastFinancialData || {});
    }

    async function saveInvoicedOverride() {
      var engagementId = document.getElementById('engagement-select').value;
      if (!engagementId) { alert('Please select an engagement first'); return; }
      var val = parseFloat(document.getElementById('invoiced-override').value);
      if (isNaN(val) || val < 0) { alert('Enter a valid amount'); return; }

      var statusEl = document.getElementById('invoiced-save-status');
      statusEl.textContent = 'Saving...';
      statusEl.style.color = '#ffd93d';

      try {
        var response = await fetch('/api/estimator/save-invoiced', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engagementId: engagementId, totalInvoiced: val })
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Save failed');
        window._lastFinancialData = window._lastFinancialData || {};
        window._lastFinancialData.totalInvoiced = val;
        updateComparison(window._lastFinancialData);
        statusEl.textContent = 'Saved';
        statusEl.style.color = '#34c759';
        setTimeout(function() { statusEl.textContent = ''; }, 3000);
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = '#ff6b6b';
      }
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
      if (!panel) return;

      try {
        const response = await fetch('/api/estimator/supplier-docs/' + engagementId);
        if (!response.ok) { panel.style.display = 'none'; return; }
        const docs = await response.json();

        if (docs.length === 0) { panel.style.display = 'none'; return; }

        panel.style.display = 'block';

        const quotes = docs.map((d, i) => ({...d, _idx: i})).filter(d => d.mode !== 'actuals');
        const invoices = docs.map((d, i) => ({...d, _idx: i})).filter(d => d.mode === 'actuals');

        function renderDocRow(doc) {
          const date = new Date(doc.parsedAt).toLocaleDateString('en-AU', { day:'numeric', month:'short' });
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#1a2332;border:1px solid #2a3a4a;border-radius:6px;font-size:13px;">' +
            '<a href="' + doc.cloudinaryUrl + '" target="_blank" style="display:flex;align-items:center;gap:8px;flex:1;color:#e0e6ed;text-decoration:none;overflow:hidden;">' +
            '<span style="color:#00d4ff;">PDF</span>' +
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (doc.supplier || doc.filename) + '</span>' +
            '<span style="color:#8899aa;font-size:11px;">' + date + '</span>' +
            '</a>' +
            '<button onclick="deleteSupplierDoc(' + doc._idx + ')" style="background:none;border:none;color:#5a6a7a;cursor:pointer;font-size:16px;padding:2px 6px;line-height:1;" title="Remove">&times;</button>' +
            '</div>';
        }

        var quotesSection = document.getElementById('supplier-quotes-section');
        var quotesListEl = document.getElementById('supplier-quotes-list');
        var invoicesSection = document.getElementById('supplier-invoices-section');
        var invoicesListEl = document.getElementById('supplier-invoices-list');

        if (quotes.length > 0) {
          quotesSection.style.display = 'block';
          quotesListEl.innerHTML = quotes.map(renderDocRow).join('');
        } else {
          quotesSection.style.display = 'none';
        }

        if (invoices.length > 0) {
          invoicesSection.style.display = 'block';
          invoicesListEl.innerHTML = invoices.map(renderDocRow).join('');
        } else {
          invoicesSection.style.display = 'none';
        }
      } catch (e) {
        panel.style.display = 'none';
      }
    }

    async function deleteSupplierDoc(index) {
      if (!confirm('Remove this document?')) return;
      const engagementId = document.getElementById('engagement-select').value;
      if (!engagementId) return;
      try {
        const resp = await fetch('/api/estimator/supplier-docs/' + engagementId + '/' + index, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Delete failed');
        loadSupplierDocs(engagementId);
      } catch (e) {
        alert('Failed to remove document');
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

  // Inject actuals comparison panel
  bodyContent += comparisonPanelHTML;

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
