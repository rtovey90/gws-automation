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
      } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = '#ff6b6b';
        setTimeout(() => { statusEl.textContent = ''; }, 5000);
      }
    }

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
