const airtableService = require('../services/airtable.service');
const stripeService = require('../services/stripe.service');
const { wrapInLayout } = require('../utils/layout');

/**
 * Show business dashboard
 * GET /dashboard
 */
exports.showDashboard = async (req, res) => {
  try {
    const [engagements, jobs, customers, messages, techs] = await Promise.all([
      airtableService.getAllEngagements(),
      airtableService.getAllJobs(),
      airtableService.getAllCustomers(),
      airtableService.getAllMessages(),
      airtableService.getAllTechs(),
    ]);

    // ── Stripe Financial Data ──
    let stripeData = null;
    try {
      const [balance, charges, payouts, monthlyRevenue] = await Promise.all([
        stripeService.getBalance(),
        stripeService.getRecentCharges(10),
        stripeService.getPayouts(5),
        stripeService.getMonthlyRevenue(6),
      ]);
      stripeData = { balance, charges, payouts, monthlyRevenue };
    } catch (err) {
      console.error('Stripe dashboard data error:', err);
    }

    // ── KPI Cards ──
    const actualLeads = engagements.filter(e => e.fields['Actual Lead']);
    const totalLeads = actualLeads.length;

    const paidStatuses = ['Initial Parts Ordered', 'Completed ✨', 'Positive Review Received', 'Negative Review Received'];
    let totalRevenue = 0;
    let convertedCount = 0;
    actualLeads.forEach(e => {
      const f = e.fields;
      const sca = parseFloat(f['Service Call Amount']) || 0;
      const pv = parseFloat(f['Project Value']) || 0;
      if (paidStatuses.includes(f.Status)) {
        totalRevenue += sca + pv;
        convertedCount++;
      }
    });

    // Use Stripe total revenue if available, Airtable as fallback
    const stripeTotal = stripeData
      ? stripeData.charges.reduce((sum, c) => sum + c.amount, 0)
      : null;
    const displayRevenue = stripeTotal !== null ? stripeTotal : totalRevenue;

    const conversionRate = totalLeads > 0 ? ((convertedCount / totalLeads) * 100).toFixed(1) : '0.0';

    const activeJobStatuses = ['Pending', 'Scheduled', 'Tech Assigned', 'In Progress'];
    const activeJobs = jobs.filter(j => activeJobStatuses.includes(j.fields['Job Status'])).length;

    // ── Lead Pipeline ──
    const leadStatuses = ['New Lead', 'Lead Contacted', 'Site Visit Scheduled', 'Photos Requested', 'Quote Sent', 'Initial Parts Ordered', 'Completed ✨', 'Positive Review Received', 'Negative Review Received', 'Lost'];
    const leadPipeline = {};
    leadStatuses.forEach(s => { leadPipeline[s] = 0; });
    actualLeads.forEach(e => {
      const s = e.fields.Status;
      if (s in leadPipeline) leadPipeline[s]++;
    });
    const maxLeadCount = Math.max(...Object.values(leadPipeline), 1);

    // ── Revenue ──
    let totalQuoted = 0;
    let totalPaid = 0;
    let pendingPayments = 0;
    engagements.forEach(e => {
      const f = e.fields;
      const amount = (parseFloat(f['Service Call Amount']) || 0) + (parseFloat(f['Project Value']) || 0);
      if (amount > 0) totalQuoted += amount;
      if (paidStatuses.includes(f.Status)) {
        totalPaid += amount;
      } else if (['Quote Sent'].includes(f.Status)) {
        pendingPayments += amount;
      }
    });

    // ── Lead Sources ──
    const leadSources = {};
    actualLeads.forEach(e => {
      const source = e.fields[' Source'] || 'Unknown';
      leadSources[source] = (leadSources[source] || 0) + 1;
    });
    const sortedSources = Object.entries(leadSources).sort((a, b) => b[1] - a[1]);
    const maxSourceCount = sortedSources.length > 0 ? sortedSources[0][1] : 1;

    // ── Jobs Overview ──
    const jobStatuses = ['Draft', 'Pending', 'Scheduled', 'Tech Assigned', 'In Progress', 'Payment Received', 'Completed'];
    const jobsOverview = {};
    jobStatuses.forEach(s => { jobsOverview[s] = 0; });
    jobs.forEach(j => {
      const s = j.fields['Job Status'];
      if (s in jobsOverview) jobsOverview[s]++;
    });

    // ── Recent Activity ──
    const now = new Date();

    const recentLeads = engagements
      .map(e => ({
        type: 'lead',
        name: e.fields['Customer Name'] || e.fields['First Name'] || 'New Lead',
        status: e.fields.Status || 'Unknown',
        time: new Date(e._rawJson?.createdTime || Date.now()),
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 10);

    const recentMessages = messages
      .map(m => ({
        type: 'message',
        name: m.fields.From || 'Unknown',
        status: `${m.fields.Direction || ''} ${m.fields.Type || 'SMS'}`.trim(),
        time: new Date(m.fields.Timestamp || m.fields.Created || m._rawJson?.createdTime || Date.now()),
      }))
      .filter(m => m.status.toLowerCase().includes('inbound'))
      .sort((a, b) => b.time - a.time)
      .slice(0, 10);

    const recentActivity = [...recentLeads, ...recentMessages]
      .sort((a, b) => b.time - a.time)
      .slice(0, 15);

    // ── Tech Utilization ──
    const techJobCounts = {};
    const techNames = {};
    const techAvailability = {};

    techs.forEach(t => {
      const name = t.fields.Name || [t.fields['First Name'], t.fields['Last Name']].filter(Boolean).join(' ') || 'Unknown';
      techNames[t.id] = name;
      techJobCounts[t.id] = 0;
      techAvailability[t.id] = t.fields['Availability Status'] || 'Unknown';
    });

    jobs.forEach(j => {
      const assignedTech = j.fields['Assigned Tech'];
      if (assignedTech && assignedTech.length > 0) {
        const techId = assignedTech[0];
        if (techId in techJobCounts) {
          techJobCounts[techId]++;
        }
      }
    });

    // ── Time Period Boundaries ──
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // ── Sales Activity Tracker ──
    const salesActivity = {
      leads:       { today: 0, week: 0, month: 0, year: 0 },
      quotesOut:   { today: 0, week: 0, month: 0, year: 0 },
      quotesValue: { today: 0, week: 0, month: 0, year: 0 },
      dealsClosed: { today: 0, week: 0, month: 0, year: 0 },
      dealsValue:  { today: 0, week: 0, month: 0, year: 0 },
    };

    const quotedOrBeyond = ['Quote Sent', 'Initial Parts Ordered', 'Completed ✨', 'Positive Review Received', 'Negative Review Received'];
    const closedStatuses = ['Initial Parts Ordered', 'Completed ✨', 'Positive Review Received', 'Negative Review Received'];

    actualLeads.forEach(e => {
      const f = e.fields;
      const created = new Date(e._rawJson?.createdTime || Date.now());
      const quoteAmount = parseFloat(f['Quote Amount']) || 0;
      const totalInvoiced = parseFloat(f['Total Invoiced']) || 0;
      const dealAmount = totalInvoiced > 0 ? totalInvoiced
        : (parseFloat(f['Service Call Amount']) || 0) + (parseFloat(f['Project Value']) || 0);

      const periods = [];
      if (created >= startOfDay) periods.push('today');
      if (created >= startOfWeek) periods.push('week');
      if (created >= startOfMonth) periods.push('month');
      if (created >= startOfYear) periods.push('year');

      periods.forEach(p => {
        salesActivity.leads[p]++;

        // Quoted or beyond = a quote went out
        if (quotedOrBeyond.includes(f.Status) && quoteAmount > 0) {
          salesActivity.quotesOut[p]++;
          salesActivity.quotesValue[p] += quoteAmount;
        }

        // Closed deal
        if (closedStatuses.includes(f.Status)) {
          salesActivity.dealsClosed[p]++;
          salesActivity.dealsValue[p] += dealAmount;
        }
      });
    });

    // Keep backward compat vars
    const leadsThisWeek = salesActivity.leads.week;
    const leadsThisMonth = salesActivity.leads.month;

    // ── NEW: Revenue This Month ──
    let revenueThisMonth = 0;
    if (stripeData && stripeData.monthlyRevenue.length > 0) {
      revenueThisMonth = stripeData.monthlyRevenue[stripeData.monthlyRevenue.length - 1].total;
    } else {
      engagements.forEach(e => {
        const f = e.fields;
        if (paidStatuses.includes(f.Status)) {
          const created = new Date(e._rawJson?.createdTime || Date.now());
          if (created >= startOfMonth) {
            revenueThisMonth += (parseFloat(f['Service Call Amount']) || 0) + (parseFloat(f['Project Value']) || 0);
          }
        }
      });
    }

    // ── NEW: Completed Jobs Count ──
    const completedJobsCount = jobsOverview['Completed'] || 0;

    // ── NEW: Available Techs Count ──
    const availableTechsCount = Object.values(techAvailability).filter(a => a === 'Available').length;

    // ── NEW: Average Job Value & Collection Rate ──
    const averageJobValue = convertedCount > 0 ? totalPaid / convertedCount : 0;
    const collectionRate = totalQuoted > 0 ? ((totalPaid / totalQuoted) * 100).toFixed(1) : '0.0';

    // ── NEW: Attention Items ──
    const attentionItems = [];
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    engagements.forEach(e => {
      const f = e.fields;
      const created = new Date(e._rawJson?.createdTime || Date.now());
      const name = f['Customer Name'] || f['First Name'] || 'Unknown';
      const daysAgo = Math.floor((now - created) / (24 * 60 * 60 * 1000));

      if (f.Status === 'Quote Sent' && created < threeDaysAgo) {
        attentionItems.push({ icon: '&#9888;', color: '#ffa726', text: `${name} — Quote sent ${daysAgo} days ago, no payment` });
      }
      if (f.Status === 'New Lead' && created < oneDayAgo) {
        attentionItems.push({ icon: '&#9679;', color: '#ef5350', text: `New Lead ${name} — not contacted, ${daysAgo}d ago` });
      }
    });

    jobs.forEach(j => {
      const f = j.fields;
      if (['Pending', 'Scheduled'].includes(f['Job Status'])) {
        const assigned = f['Assigned Tech'];
        if (!assigned || assigned.length === 0) {
          const jobName = f['Job Name'] || f['Job Title'] || 'Job';
          attentionItems.push({ icon: '&#9888;', color: '#ab47bc', text: `${jobName} ${f['Job Status']} — no tech assigned` });
        }
      }
    });

    if (stripeData && stripeData.monthlyRevenue.length >= 2) {
      const lastMonth = stripeData.monthlyRevenue[stripeData.monthlyRevenue.length - 2].total;
      if (lastMonth > 0) {
        const pctOfLast = Math.round((revenueThisMonth / lastMonth) * 100);
        if (pctOfLast < 75) {
          attentionItems.push({ icon: '&#9660;', color: '#ef5350', text: `Revenue at ${pctOfLast}% of last month` });
        }
      }
    }

    // Completed engagements with no costs recorded
    engagements.forEach(e => {
      const f = e.fields;
      const name = f['Customer Name'] || f['First Name'] || 'Unknown';
      const totalInvoiced = parseFloat(f['Total Invoiced']) || 0;
      const totalCost = parseFloat(f['Total Cost']) || 0;
      if (f.Status === 'Completed ✨' && totalInvoiced > 0 && totalCost === 0) {
        attentionItems.push({ icon: '&#9888;', color: '#ff7043', text: `${name} — completed, no costs recorded` });
      }
    });

    // ── NEW: Profitability & Cost Metrics ──
    let totalProfit = 0;
    let marginSum = 0;
    let marginCount = 0;
    let missingCostsCount = 0;
    let totalVariation = 0;
    const costBreakdown = { parts: 0, labor: 0, travel: 0, other: 0 };
    let pipelineValue = 0;
    const openStatuses = ['New Lead', 'Lead Contacted', 'Site Visit Scheduled', 'Photos Requested', 'Quote Sent'];

    engagements.forEach(e => {
      const f = e.fields;
      const totalInvoiced = parseFloat(f['Total Invoiced']) || 0;
      const totalCost = parseFloat(f['Total Cost']) || 0;
      const profit = parseFloat(f['Profit']) || 0;
      const profitMargin = parseFloat(f['Profit Margin']) || 0;
      const quoteAmount = parseFloat(f['Quote Amount']) || 0;

      // Accumulate cost breakdown for all engagements
      costBreakdown.parts += parseFloat(f['Parts Cost']) || 0;
      costBreakdown.labor += parseFloat(f['Labor Cost']) || 0;
      costBreakdown.travel += parseFloat(f['Travel Cost']) || 0;
      costBreakdown.other += parseFloat(f['Other Costs']) || 0;

      // Profit: only engagements with invoiced revenue
      if (totalInvoiced > 0) {
        totalProfit += profit;
      }

      // Margin: only completed engagements
      if (f.Status === 'Completed ✨' && totalInvoiced > 0) {
        marginSum += profitMargin;
        marginCount++;

        // Missing costs: completed, invoiced but no costs entered
        if (totalCost === 0) {
          missingCostsCount++;
        }
      }

      // Variation: positive difference between invoiced and quoted
      if (totalInvoiced > 0 && quoteAmount > 0) {
        const variation = totalInvoiced - quoteAmount;
        if (variation > 0) totalVariation += variation;
      }

      // Pipeline value: open (non-completed, non-lost) engagements
      if (openStatuses.includes(f.Status) && quoteAmount > 0) {
        pipelineValue += quoteAmount;
      }
    });

    const avgMargin = marginCount > 0 ? (marginSum / marginCount).toFixed(1) : '0.0';

    // Quoted vs Actual: recent completed engagements for comparison chart
    const quotedVsActual = engagements
      .filter(e => {
        const f = e.fields;
        return f.Status === 'Completed ✨' && (parseFloat(f['Quote Amount']) || 0) > 0;
      })
      .map(e => {
        const f = e.fields;
        return {
          name: f['Customer Name'] || f['First Name'] || 'Job',
          quoted: parseFloat(f['Quote Amount']) || 0,
          invoiced: parseFloat(f['Total Invoiced']) || 0,
          cost: parseFloat(f['Total Cost']) || 0,
        };
      })
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, 8);

    // ── NEW: Conversion Funnel ──
    const funnelStages = ['All Leads', 'Contacted', 'Quote Sent', 'Paid/Ordered', 'Completed'];
    const stageThresholds = {
      'All Leads': leadStatuses,
      'Contacted': ['Lead Contacted', 'Site Visit Scheduled', 'Photos Requested', 'Quote Sent', 'Initial Parts Ordered', 'Completed ✨', 'Positive Review Received', 'Negative Review Received'],
      'Quote Sent': ['Quote Sent', 'Initial Parts Ordered', 'Completed ✨', 'Positive Review Received', 'Negative Review Received'],
      'Paid/Ordered': ['Initial Parts Ordered', 'Completed ✨', 'Positive Review Received', 'Negative Review Received'],
      'Completed': ['Completed ✨', 'Positive Review Received', 'Negative Review Received'],
    };
    const conversionFunnel = funnelStages.map(stage => {
      const validStatuses = stageThresholds[stage];
      const count = actualLeads.filter(e => validStatuses.includes(e.fields.Status)).length;
      return { stage, count };
    });
    const maxFunnelCount = Math.max(...conversionFunnel.map(f => f.count), 1);

    // ── NEW: Recent Leads List (top 15 with source + lead type) ──
    const recentLeadsList = actualLeads
      .map(e => ({
        name: e.fields['Customer Name'] || e.fields['First Name'] || 'New Lead',
        status: e.fields.Status || 'Unknown',
        source: e.fields[' Source'] || 'Unknown',
        leadType: e.fields['Lead Type'] || e.fields['Service Type'] || '-',
        time: new Date(e._rawJson?.createdTime || Date.now()),
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 15);

    // ── Format helpers ──
    const fmtCurrency = (v) => '$' + v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtTime = (d) => {
      const diff = now - d;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    };

    const statusColors = {
      'New Lead': '#00d4ff',
      'Lead Contacted': '#ffa726',
      'Site Visit Scheduled': '#42a5f5',
      'Photos Requested': '#ab47bc',
      'Quote Sent': '#ce93d8',
      'Initial Parts Ordered': '#66bb6a',
      'Completed ✨': '#26a69a',
      'Positive Review Received': '#4caf50',
      'Negative Review Received': '#ff7043',
      'Lost': '#ef5350',
    };

    const jobStatusColors = {
      'Draft': '#78909c',
      'Pending': '#ffa726',
      'Scheduled': '#42a5f5',
      'Tech Assigned': '#ab47bc',
      'In Progress': '#ffca28',
      'Payment Received': '#66bb6a',
      'Completed': '#26a69a',
    };

    const availabilityColors = {
      'Available': '#66bb6a',
      'Busy': '#ffa726',
      'Unavailable': '#ef5350',
      'Unknown': '#78909c',
    };

    const payoutStatusColors = {
      paid: '#66bb6a',
      pending: '#ffa726',
      in_transit: '#42a5f5',
      canceled: '#78909c',
      failed: '#ef5350',
    };

    // ── Build HTML Components ──

    // Lead pipeline bars (full — all 7 statuses)
    const leadPipelineBars = leadStatuses.map(s => {
      const count = leadPipeline[s];
      const pct = maxLeadCount > 0 ? (count / maxLeadCount) * 100 : 0;
      const color = statusColors[s] || '#00d4ff';
      return `
        <div class="bar-row">
          <span class="bar-label">${s}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="bar-value">${count}</span>
        </div>`;
    }).join('');

    // Pipeline snapshot (non-zero only, for overview)
    const pipelineSnapshotBars = leadStatuses
      .filter(s => leadPipeline[s] > 0)
      .map(s => {
        const count = leadPipeline[s];
        const pct = maxLeadCount > 0 ? (count / maxLeadCount) * 100 : 0;
        const color = statusColors[s] || '#00d4ff';
        return `
        <div class="bar-row">
          <span class="bar-label">${s}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="bar-value">${count}</span>
        </div>`;
      }).join('') || '<p class="empty-state">No pipeline data</p>';

    // Revenue bars
    const revenueMaxVal = Math.max(totalQuoted, totalPaid, 1);
    const revenueBars = `
      <div class="bar-row">
        <span class="bar-label">Quoted</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(totalQuoted / revenueMaxVal) * 100}%;background:#ab47bc"></div>
        </div>
        <span class="bar-value">${fmtCurrency(totalQuoted)}</span>
      </div>
      <div class="bar-row">
        <span class="bar-label">Paid</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(totalPaid / revenueMaxVal) * 100}%;background:#66bb6a"></div>
        </div>
        <span class="bar-value">${fmtCurrency(totalPaid)}</span>
      </div>
      <div class="bar-row">
        <span class="bar-label">Pending</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(pendingPayments / revenueMaxVal) * 100}%;background:#ffa726"></div>
        </div>
        <span class="bar-value">${fmtCurrency(pendingPayments)}</span>
      </div>`;

    // Lead source bars
    const leadSourceBars = sortedSources.length > 0
      ? sortedSources.map(([source, count]) => {
          const pct = (count / maxSourceCount) * 100;
          return `
        <div class="bar-row">
          <span class="bar-label">${source}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:#00d4ff"></div>
          </div>
          <span class="bar-value">${count}</span>
        </div>`;
        }).join('')
      : '<p class="empty-state">No data yet</p>';

    // Jobs bar chart (horizontal bars, matching pipeline style)
    const maxJobCount = Math.max(...Object.values(jobsOverview), 1);
    const jobsBarChart = jobStatuses.map(s => {
      const count = jobsOverview[s];
      const pct = maxJobCount > 0 ? (count / maxJobCount) * 100 : 0;
      const color = jobStatusColors[s] || '#78909c';
      return `
        <div class="bar-row">
          <span class="bar-label">${s}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="bar-value">${count}</span>
        </div>`;
    }).join('');

    // Recent activity list (15 items)
    const recentActivityList = recentActivity.length > 0
      ? recentActivity.map(a => {
          const icon = a.type === 'lead' ? '&#9679;' : '&#9993;';
          const color = a.type === 'lead' ? '#00d4ff' : '#ffa726';
          return `
        <div class="activity-item">
          <span class="activity-icon" style="color:${color}">${icon}</span>
          <div class="activity-details">
            <span class="activity-name">${a.name}</span>
            <span class="activity-status">${a.status}</span>
          </div>
          <span class="activity-time">${fmtTime(a.time)}</span>
        </div>`;
        }).join('')
      : '<p class="empty-state">No recent activity</p>';

    // Tech utilization list
    const techUtilList = Object.keys(techNames).length > 0
      ? Object.keys(techNames).map(id => {
          const avail = techAvailability[id];
          const dotColor = availabilityColors[avail] || '#78909c';
          return `
        <div class="tech-row">
          <span class="tech-dot" style="background:${dotColor}"></span>
          <span class="tech-name">${techNames[id]}</span>
          <span class="tech-jobs">${techJobCounts[id]} job${techJobCounts[id] !== 1 ? 's' : ''}</span>
          <span class="tech-status" style="color:${dotColor}">${avail}</span>
        </div>`;
        }).join('')
      : '<p class="empty-state">No techs found</p>';

    // Tech availability summary
    const availCounts = { Available: 0, Busy: 0, Unavailable: 0 };
    Object.values(techAvailability).forEach(a => {
      if (a in availCounts) availCounts[a]++;
    });

    // Conversion funnel bars
    const funnelColors = { 'All Leads': '#00d4ff', 'Contacted': '#ffa726', 'Quote Sent': '#ce93d8', 'Paid/Ordered': '#66bb6a', 'Completed': '#26a69a' };
    const conversionFunnelHtml = conversionFunnel.map(f => {
      const pct = maxFunnelCount > 0 ? (f.count / maxFunnelCount) * 100 : 0;
      const color = funnelColors[f.stage] || '#00d4ff';
      return `
        <div class="funnel-step">
          <span class="bar-label">${f.stage}</span>
          <div class="bar-track">
            <div class="funnel-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="bar-value">${f.count}</span>
        </div>`;
    }).join('');

    // Recent leads list (15 items with source, lead type, status dot)
    const recentLeadsListHtml = recentLeadsList.length > 0
      ? recentLeadsList.map(l => {
          const dotColor = statusColors[l.status] || '#78909c';
          return `
        <div class="activity-item">
          <span class="activity-icon" style="color:${dotColor}">&#9679;</span>
          <div class="activity-details">
            <span class="activity-name">${l.name}</span>
            <span class="activity-status">${l.source} &middot; ${l.leadType}</span>
          </div>
          <span class="tech-status" style="color:${dotColor}">${l.status}</span>
          <span class="activity-time">${fmtTime(l.time)}</span>
        </div>`;
        }).join('')
      : '<p class="empty-state">No leads yet</p>';

    // Attention items HTML
    const attentionHtml = attentionItems.length > 0
      ? attentionItems.map(a => `
        <div class="attention-item">
          <span class="attention-icon" style="color:${a.color}">${a.icon}</span>
          <span class="attention-text">${a.text}</span>
        </div>`).join('')
      : '<div class="attention-item"><span class="attention-icon" style="color:#66bb6a">&#10003;</span><span class="attention-text">All clear — nothing needs immediate attention</span></div>';

    // Mini sparkline (last 3 months revenue)
    let sparklineHtml = '';
    if (stripeData && stripeData.monthlyRevenue.length > 0) {
      const last3 = stripeData.monthlyRevenue.slice(-3);
      const maxSpark = Math.max(...last3.map(m => m.total), 1);
      sparklineHtml = `
        <div class="month-chart" style="height:120px">
          ${last3.map(m => {
            const pct = (m.total / maxSpark) * 100;
            return `
            <div class="month-col">
              <span class="month-amount">${fmtCurrency(m.total)}</span>
              <div class="month-bar-track">
                <div class="month-bar-fill" style="height:${pct}%"></div>
              </div>
              <span class="month-label">${m.month}</span>
            </div>`;
          }).join('')}
        </div>`;
    } else {
      sparklineHtml = '<p class="empty-state">No revenue data</p>';
    }

    // ── Stripe components for Financials tab ──
    let stripeBalanceKpis = '';
    let monthlyRevenueChart = '';
    let recentPaymentsCard = '';
    let payoutsCard = '';
    let stripeNote = '';

    if (stripeData) {
      stripeBalanceKpis = `
        <div class="kpi-card" style="border-top:3px solid #66bb6a">
          <span class="kpi-value" style="color:#66bb6a">${fmtCurrency(stripeData.balance.available)}</span>
          <span class="kpi-label">Stripe Available</span>
        </div>
        <div class="kpi-card" style="border-top:3px solid #ffa726">
          <span class="kpi-value" style="color:#ffa726">${fmtCurrency(stripeData.balance.pending)}</span>
          <span class="kpi-label">Stripe Pending</span>
        </div>`;

      const maxMonthly = Math.max(...stripeData.monthlyRevenue.map(m => m.total), 1);
      const monthlyBars = stripeData.monthlyRevenue.map(m => {
        const pct = (m.total / maxMonthly) * 100;
        return `
          <div class="month-col">
            <span class="month-amount">${fmtCurrency(m.total)}</span>
            <div class="month-bar-track">
              <div class="month-bar-fill" style="height:${pct}%"></div>
            </div>
            <span class="month-label">${m.month}</span>
          </div>`;
      }).join('');

      monthlyRevenueChart = `
        <div class="card" style="grid-column:1/-1">
          <h2>Monthly Revenue (Stripe)</h2>
          <div class="month-chart" style="height:280px">
            ${monthlyBars}
          </div>
        </div>`;

      const paymentsList = stripeData.charges.length > 0
        ? stripeData.charges.map(c => {
            const date = c.created.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
            return `
          <div class="payment-item">
            <span class="payment-dot" style="background:#66bb6a"></span>
            <div class="payment-details">
              <span class="payment-name">${c.customerName}</span>
              <span class="payment-email">${c.customerEmail}</span>
            </div>
            <span class="payment-amount">${fmtCurrency(c.amount)}</span>
            <span class="payment-date">${date}</span>
          </div>`;
          }).join('')
        : '<p class="empty-state">No recent charges</p>';

      recentPaymentsCard = `
        <div class="card">
          <h2>Recent Payments (Stripe)</h2>
          <div class="payments-list">
            ${paymentsList}
          </div>
        </div>`;

      const payoutsList = stripeData.payouts.length > 0
        ? stripeData.payouts.map(p => {
            const arrival = p.arrivalDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
            const statusColor = payoutStatusColors[p.status] || '#78909c';
            const statusLabel = p.status.replace('_', ' ');
            return `
          <div class="payout-item">
            <span class="payout-amount">${fmtCurrency(p.amount)}</span>
            <span class="payout-status" style="color:${statusColor}">${statusLabel}</span>
            <span class="payout-date">Arrives ${arrival}</span>
          </div>`;
          }).join('')
        : '<p class="empty-state">No recent payouts</p>';

      payoutsCard = `
        <div class="card">
          <h2>Payouts (Stripe)</h2>
          ${payoutsList}
        </div>`;
    } else {
      stripeNote = `
        <div class="stripe-unavailable">
          Stripe data unavailable — showing Airtable data only
        </div>`;
    }

    // ── Profitability HTML Components ──

    // Profitability KPI row
    const profitColor = totalProfit >= 0 ? '#66bb6a' : '#ef5350';
    const profitabilityKpis = `
      <div class="kpi-row">
        <div class="kpi-card" style="border-top:3px solid ${profitColor}">
          <span class="kpi-value" style="color:${profitColor}">${fmtCurrency(totalProfit)}</span>
          <span class="kpi-label">Total Profit</span>
        </div>
        <div class="kpi-card" style="border-top:3px solid #42a5f5">
          <span class="kpi-value" style="color:#42a5f5">${avgMargin}%</span>
          <span class="kpi-label">Avg Profit Margin</span>
        </div>
        <div class="kpi-card" style="border-top:3px solid #ab47bc">
          <span class="kpi-value" style="color:#ab47bc">${fmtCurrency(pipelineValue)}</span>
          <span class="kpi-label">Pipeline Value</span>
        </div>
        <div class="kpi-card" style="border-top:3px solid ${missingCostsCount > 0 ? '#ff7043' : '#66bb6a'}">
          <span class="kpi-value" style="color:${missingCostsCount > 0 ? '#ff7043' : '#66bb6a'}">${missingCostsCount}</span>
          <span class="kpi-label">Missing Costs</span>
        </div>
      </div>`;

    // Quoted vs Invoiced vs Cost grouped bar chart
    const qvaMaxVal = Math.max(...quotedVsActual.map(q => Math.max(q.quoted, q.invoiced, q.cost)), 1);
    const quotedVsActualHtml = quotedVsActual.length > 0
      ? quotedVsActual.map(q => {
          const qPct = (q.quoted / qvaMaxVal) * 100;
          const iPct = (q.invoiced / qvaMaxVal) * 100;
          const cPct = (q.cost / qvaMaxVal) * 100;
          const shortName = q.name.length > 18 ? q.name.substring(0, 18) + '...' : q.name;
          return `
          <div class="grouped-bar-row">
            <span class="grouped-bar-label">${shortName}</span>
            <div class="grouped-bar-set">
              <div class="grouped-bar-item">
                <div class="bar-track"><div class="bar-fill" style="width:${qPct}%;background:#ab47bc"></div></div>
                <span class="grouped-bar-val">${fmtCurrency(q.quoted)}</span>
              </div>
              <div class="grouped-bar-item">
                <div class="bar-track"><div class="bar-fill" style="width:${iPct}%;background:#66bb6a"></div></div>
                <span class="grouped-bar-val">${fmtCurrency(q.invoiced)}</span>
              </div>
              <div class="grouped-bar-item">
                <div class="bar-track"><div class="bar-fill" style="width:${cPct}%;background:#ef5350"></div></div>
                <span class="grouped-bar-val">${fmtCurrency(q.cost)}</span>
              </div>
            </div>
          </div>`;
        }).join('')
      : '<p class="empty-state">No completed engagements with quotes yet</p>';

    // Cost breakdown bar chart
    const costValues = [costBreakdown.parts, costBreakdown.labor, costBreakdown.travel, costBreakdown.other];
    const maxCostVal = Math.max(...costValues, 1);
    const costBreakdownLabels = ['Parts', 'Labor', 'Travel', 'Other'];
    const costBreakdownColors = ['#42a5f5', '#ffa726', '#ab47bc', '#78909c'];
    const costBreakdownHtml = costValues.some(v => v > 0)
      ? costBreakdownLabels.map((label, i) => {
          const val = costValues[i];
          const pct = (val / maxCostVal) * 100;
          return `
          <div class="bar-row">
            <span class="bar-label">${label}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct}%;background:${costBreakdownColors[i]}"></div>
            </div>
            <span class="bar-value">${fmtCurrency(val)}</span>
          </div>`;
        }).join('')
      : '<p class="empty-state">No cost data recorded yet</p>';

    // ── Build Tab HTML ──

    // Tab 1: Overview
    const sa = salesActivity;
    const overviewTabHtml = `
      <div class="kpi-row">
        <div class="kpi-card">
          <span class="kpi-value">${fmtCurrency(revenueThisMonth)}</span>
          <span class="kpi-label">Revenue This Month${stripeData ? ' (Stripe)' : ''}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">${totalLeads}</span>
          <span class="kpi-label">Total Leads</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">${conversionRate}%</span>
          <span class="kpi-label">Conversion Rate</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">${activeJobs}</span>
          <span class="kpi-label">Active Jobs</span>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px">
        <h2>Sales Activity</h2>
        <div class="activity-table-wrap">
          <table class="activity-table">
            <thead>
              <tr>
                <th></th>
                <th>Today</th>
                <th>This Week</th>
                <th>This Month</th>
                <th>This Year</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="row-label">New Leads</td>
                <td>${sa.leads.today}</td>
                <td>${sa.leads.week}</td>
                <td>${sa.leads.month}</td>
                <td>${sa.leads.year}</td>
              </tr>
              <tr>
                <td class="row-label">Quotes Sent</td>
                <td>${sa.quotesOut.today}</td>
                <td>${sa.quotesOut.week}</td>
                <td>${sa.quotesOut.month}</td>
                <td>${sa.quotesOut.year}</td>
              </tr>
              <tr>
                <td class="row-label">Quotes Value</td>
                <td>${fmtCurrency(sa.quotesValue.today)}</td>
                <td>${fmtCurrency(sa.quotesValue.week)}</td>
                <td>${fmtCurrency(sa.quotesValue.month)}</td>
                <td>${fmtCurrency(sa.quotesValue.year)}</td>
              </tr>
              <tr>
                <td class="row-label">Deals Closed</td>
                <td>${sa.dealsClosed.today}</td>
                <td>${sa.dealsClosed.week}</td>
                <td>${sa.dealsClosed.month}</td>
                <td>${sa.dealsClosed.year}</td>
              </tr>
              <tr>
                <td class="row-label">Deals Value</td>
                <td>${fmtCurrency(sa.dealsValue.today)}</td>
                <td>${fmtCurrency(sa.dealsValue.week)}</td>
                <td>${fmtCurrency(sa.dealsValue.month)}</td>
                <td>${fmtCurrency(sa.dealsValue.year)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid" style="margin-bottom:24px">
        <div class="card">
          <h2>Revenue (Last 3 Months)</h2>
          ${sparklineHtml}
        </div>
        <div class="card">
          <h2>Pipeline Snapshot</h2>
          ${pipelineSnapshotBars}
        </div>
      </div>

      <div class="attention-card">
        <h2>Attention Needed</h2>
        ${attentionHtml}
      </div>`;

    // Tab 2: Sales & Leads
    const salesTabHtml = `
      <div class="new-leads-row">
        <div class="new-leads-card">
          <span class="nl-label">New Leads Today</span>
          <span class="nl-value">${sa.leads.today}</span>
        </div>
        <div class="new-leads-card">
          <span class="nl-label">New Leads This Week</span>
          <span class="nl-value">${leadsThisWeek}</span>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px">
        <h2>Lead Pipeline</h2>
        ${leadPipelineBars}
      </div>

      <div class="grid" style="margin-bottom:24px">
        <div class="card">
          <h2>Lead Sources</h2>
          ${leadSourceBars}
        </div>
        <div class="card">
          <h2>Conversion Funnel</h2>
          ${conversionFunnelHtml}
        </div>
      </div>

      <div class="card">
        <h2>Recent Leads</h2>
        <div class="activity-list">
          ${recentLeadsListHtml}
        </div>
      </div>`;

    // Tab 3: Financials
    const financialsTabHtml = `
      ${stripeNote}
      <div class="kpi-row">
        ${stripeData ? stripeBalanceKpis : ''}
        <div class="kpi-card" style="border-top:3px solid #ab47bc">
          <span class="kpi-value" style="color:#ab47bc">${fmtCurrency(totalQuoted)}</span>
          <span class="kpi-label">Total Quoted</span>
        </div>
        <div class="kpi-card" style="border-top:3px solid #ffa726">
          <span class="kpi-value" style="color:#ffa726">${fmtCurrency(pendingPayments)}</span>
          <span class="kpi-label">Pending Payments</span>
        </div>
      </div>

      ${stripeData ? `<div class="grid" style="margin-bottom:24px">${monthlyRevenueChart}</div>` : ''}

      <div class="grid" style="margin-bottom:24px">
        <div class="card">
          <h2>Revenue Breakdown</h2>
          ${revenueBars}
        </div>
        <div class="card">
          <h2>Financial Metrics</h2>
          <div class="status-card" style="border-left:3px solid #66bb6a">
            <span class="status-card-label">Average Job Value</span>
            <span class="status-card-value" style="color:#66bb6a">${fmtCurrency(averageJobValue)}</span>
          </div>
          <div class="status-card" style="border-left:3px solid #42a5f5">
            <span class="status-card-label">Collection Rate</span>
            <span class="status-card-value" style="color:#42a5f5">${collectionRate}%</span>
          </div>
          <div class="status-card" style="border-left:3px solid #ab47bc">
            <span class="status-card-label">Total Paid</span>
            <span class="status-card-value" style="color:#ab47bc">${fmtCurrency(totalPaid)}</span>
          </div>
          <div class="status-card" style="border-left:3px solid #ffa726">
            <span class="status-card-label">Converted Leads</span>
            <span class="status-card-value" style="color:#ffa726">${convertedCount}</span>
          </div>
        </div>
      </div>

      ${stripeData ? `
      <div class="grid" style="margin-bottom:24px">
        ${recentPaymentsCard}
        ${payoutsCard}
      </div>` : ''}

      <div style="border-top:2px solid #2a3a4a;margin:32px 0 24px;padding-top:24px">
        <h2 style="color:#fff;font-size:18px;margin-bottom:16px">Job Profitability</h2>
      </div>

      ${profitabilityKpis}

      <div class="grid" style="margin-bottom:24px">
        <div class="card">
          <h2>Quoted vs Invoiced vs Cost</h2>
          <div style="display:flex;gap:16px;margin-bottom:12px;font-size:11px">
            <span><span style="display:inline-block;width:10px;height:10px;background:#ab47bc;border-radius:2px;margin-right:4px"></span>Quoted</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#66bb6a;border-radius:2px;margin-right:4px"></span>Invoiced</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#ef5350;border-radius:2px;margin-right:4px"></span>Cost</span>
          </div>
          ${quotedVsActualHtml}
        </div>
        <div class="card">
          <h2>Cost Breakdown</h2>
          ${costBreakdownHtml}
        </div>
      </div>`;

    // Tab 4: Operations
    const operationsTabHtml = `
      <div class="kpi-row-3">
        <div class="kpi-card">
          <span class="kpi-value">${activeJobs}</span>
          <span class="kpi-label">Active Jobs</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value" style="color:#26a69a">${completedJobsCount}</span>
          <span class="kpi-label">Completed Jobs</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value" style="color:#66bb6a">${availableTechsCount}</span>
          <span class="kpi-label">Available Techs</span>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px">
        <h2>Jobs by Status</h2>
        ${jobsBarChart}
      </div>

      <div class="grid" style="margin-bottom:24px">
        <div class="card">
          <h2>Tech Utilization</h2>
          ${techUtilList}
        </div>
        <div class="card">
          <h2>Tech Availability</h2>
          <div class="status-card" style="border-left:3px solid #66bb6a">
            <span class="status-card-label">Available</span>
            <span class="status-card-value" style="color:#66bb6a">${availCounts.Available}</span>
          </div>
          <div class="status-card" style="border-left:3px solid #ffa726">
            <span class="status-card-label">Busy</span>
            <span class="status-card-value" style="color:#ffa726">${availCounts.Busy}</span>
          </div>
          <div class="status-card" style="border-left:3px solid #ef5350">
            <span class="status-card-label">Unavailable</span>
            <span class="status-card-value" style="color:#ef5350">${availCounts.Unavailable}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Recent Activity</h2>
        <div class="activity-list">
          ${recentActivityList}
        </div>
      </div>`;

    const lastUpdated = now.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

    const dashboardStyles = `
    .header { background:#0f1419; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; border-bottom:1px solid #2a3a4a; }
    .header h1 { font-size:22px; color:#fff; }
    .header-right { display:flex; align-items:center; gap:16px; }
    .header-time { color:#8899aa; font-size:13px; }
    .refresh-btn { background:#00d4ff; color:#0f1419; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px; }
    .refresh-btn:hover { background:#00b8d9; }
    .container { max-width:1280px; margin:0 auto; padding:24px; }

    .tab-nav { display:flex; gap:0; margin-bottom:24px; border-bottom:2px solid #2a3a4a; overflow-x:auto; -webkit-overflow-scrolling:touch; }
    .tab-btn { background:none; border:none; color:#8899aa; font-size:14px; font-weight:600; padding:12px 24px; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; white-space:nowrap; transition:color .2s, border-color .2s; }
    .tab-btn:hover { color:#e0e6ed; }
    .tab-btn.active { color:#00d4ff; border-bottom-color:#00d4ff; }
    .tab-panel { display:none; }
    .tab-panel.active { display:block; }

    .kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
    .kpi-row-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:24px; }
    .kpi-card { background:#0f1419; border-radius:10px; padding:20px; text-align:center; border:1px solid #2a3a4a; }
    .kpi-value { font-size:32px; font-weight:bold; color:#00d4ff; display:block; margin-bottom:4px; }
    .kpi-label { font-size:13px; color:#8899aa; text-transform:uppercase; letter-spacing:1px; }

    .new-leads-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
    .new-leads-card { background:#0f1419; border-radius:10px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; border:1px solid #2a3a4a; }
    .new-leads-card .nl-label { font-size:14px; color:#8899aa; }
    .new-leads-card .nl-value { font-size:24px; font-weight:bold; color:#42a5f5; }

    .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
    .card { background:#0f1419; border-radius:10px; padding:20px; border:1px solid #2a3a4a; }
    .card h2 { font-size:16px; color:#fff; margin-bottom:16px; padding-bottom:8px; border-bottom:1px solid #2a3a4a; }

    .attention-card { background:#0f1419; border-radius:10px; padding:20px; border:1px solid #2a3a4a; border-left:3px solid #ffa726; }
    .attention-card h2 { font-size:16px; color:#fff; margin-bottom:16px; padding-bottom:8px; border-bottom:1px solid #2a3a4a; }
    .attention-item { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #1a2332; }
    .attention-item:last-child { border-bottom:none; }
    .attention-icon { font-size:16px; flex-shrink:0; width:20px; text-align:center; }
    .attention-text { font-size:13px; color:#e0e6ed; }

    .funnel-step { display:flex; align-items:center; margin-bottom:10px; gap:10px; }
    .funnel-bar { height:100%; border-radius:4px; min-width:2px; transition:width .3s; }

    .bar-row { display:flex; align-items:center; margin-bottom:10px; gap:10px; }
    .bar-label { width:100px; font-size:12px; color:#8899aa; flex-shrink:0; text-align:right; }
    .bar-track { flex:1; height:20px; background:#1a2332; border-radius:4px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:4px; transition:width .3s; min-width:2px; }
    .bar-value { width:70px; font-size:13px; font-weight:bold; color:#e0e6ed; flex-shrink:0; }

    .status-card { background:#1a2332; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .status-card-label { font-size:13px; color:#8899aa; }
    .status-card-value { font-size:18px; font-weight:bold; }

    .activity-list { max-height:400px; overflow-y:auto; }
    .activity-item { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #1a2332; }
    .activity-icon { font-size:16px; flex-shrink:0; }
    .activity-details { flex:1; display:flex; flex-direction:column; }
    .activity-name { font-size:13px; color:#e0e6ed; }
    .activity-status { font-size:11px; color:#8899aa; }
    .activity-time { font-size:11px; color:#5a6a7a; flex-shrink:0; }

    .tech-row { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #1a2332; }
    .tech-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .tech-name { flex:1; font-size:13px; color:#e0e6ed; }
    .tech-jobs { font-size:12px; color:#8899aa; }
    .tech-status { font-size:11px; flex-shrink:0; width:80px; text-align:right; }

    .empty-state { color:#5a6a7a; font-size:13px; font-style:italic; padding:16px 0; text-align:center; }

    .activity-table-wrap { overflow-x:auto; }
    .activity-table { width:100%; border-collapse:collapse; font-size:13px; }
    .activity-table th { text-align:center; color:#8899aa; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:1px; padding:8px 12px; border-bottom:1px solid #2a3a4a; }
    .activity-table td { text-align:center; padding:10px 12px; border-bottom:1px solid #1a2332; color:#e0e6ed; font-weight:600; font-size:15px; }
    .activity-table .row-label { text-align:left; color:#8899aa; font-weight:400; font-size:13px; width:120px; }
    .activity-table tbody tr:hover { background:#1a2332; }

    .grouped-bar-row { margin-bottom:16px; }
    .grouped-bar-label { display:block; font-size:12px; color:#8899aa; margin-bottom:6px; }
    .grouped-bar-set { display:flex; flex-direction:column; gap:3px; }
    .grouped-bar-item { display:flex; align-items:center; gap:8px; }
    .grouped-bar-item .bar-track { flex:1; height:14px; }
    .grouped-bar-val { font-size:11px; color:#8899aa; width:65px; flex-shrink:0; }

    .stripe-unavailable { background:#0f1419; border:1px solid #2a3a4a; border-radius:10px; padding:12px 20px; margin-bottom:24px; color:#5a6a7a; font-size:13px; font-style:italic; text-align:center; }

    .month-chart { display:flex; align-items:flex-end; justify-content:space-around; gap:12px; height:200px; padding:16px 0; }
    .month-col { display:flex; flex-direction:column; align-items:center; flex:1; height:100%; }
    .month-amount { font-size:11px; color:#8899aa; margin-bottom:6px; }
    .month-bar-track { flex:1; width:100%; max-width:48px; background:#1a2332; border-radius:4px; overflow:hidden; display:flex; align-items:flex-end; }
    .month-bar-fill { width:100%; background:linear-gradient(to top,#00d4ff,#42a5f5); border-radius:4px; min-height:2px; transition:height .3s; }
    .month-label { font-size:12px; color:#8899aa; margin-top:6px; }

    .payments-list { max-height:320px; overflow-y:auto; }
    .payment-item { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #1a2332; }
    .payment-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .payment-details { flex:1; display:flex; flex-direction:column; }
    .payment-name { font-size:13px; color:#e0e6ed; }
    .payment-email { font-size:11px; color:#5a6a7a; }
    .payment-amount { font-size:14px; font-weight:bold; color:#66bb6a; flex-shrink:0; }
    .payment-date { font-size:11px; color:#5a6a7a; flex-shrink:0; width:60px; text-align:right; }

    .payout-item { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #1a2332; }
    .payout-amount { font-size:14px; font-weight:bold; color:#e0e6ed; width:90px; flex-shrink:0; }
    .payout-status { font-size:12px; text-transform:capitalize; flex:1; }
    .payout-date { font-size:11px; color:#5a6a7a; flex-shrink:0; }

    @media (max-width:768px) {
      .kpi-row { grid-template-columns:repeat(2,1fr); }
      .kpi-row-3 { grid-template-columns:1fr; }
      .new-leads-row { grid-template-columns:1fr; }
      .grid { grid-template-columns:1fr; }
      .header { flex-direction:column; align-items:flex-start; }
      .bar-label { width:70px; font-size:11px; }
      .bar-value { width:55px; font-size:12px; }
      .tab-nav { gap:0; }
      .tab-btn { padding:10px 16px; font-size:13px; }
      .month-chart { height:160px; }
    }
    `;

    const dashboardBody = `
  <div class="header">
    <h1>Dashboard</h1>
    <div class="header-right">
      <span class="header-time">Last updated: ${lastUpdated}</span>
      <button class="refresh-btn" onclick="location.reload()">Refresh</button>
    </div>
  </div>

  <div class="container">
    <div class="tab-nav">
      <button class="tab-btn active" data-tab="overview">Overview</button>
      <button class="tab-btn" data-tab="sales">Sales &amp; Leads</button>
      <button class="tab-btn" data-tab="financials">Financials</button>
      <button class="tab-btn" data-tab="operations">Operations</button>
    </div>

    <div id="tab-overview" class="tab-panel active">
      ${overviewTabHtml}
    </div>

    <div id="tab-sales" class="tab-panel">
      ${salesTabHtml}
    </div>

    <div id="tab-financials" class="tab-panel">
      ${financialsTabHtml}
    </div>

    <div id="tab-operations" class="tab-panel">
      ${operationsTabHtml}
    </div>
  </div>`;

    const dashboardScripts = `
  <script>
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('tab-' + btn.getAttribute('data-tab')).classList.add('active');
      });
    });
    setTimeout(function(){ location.reload(); }, 300000);
  </script>`;

    res.send(wrapInLayout('Dashboard', dashboardBody, 'dashboard', { customStyles: dashboardStyles, customScripts: dashboardScripts }));
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html><head><title>Dashboard Error</title>
      <style>body{background:#1a2332;color:#e0e6ed;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .error-box{background:#0f1419;border:1px solid #ef5350;border-radius:10px;padding:40px;text-align:center;max-width:500px;}
      h1{color:#ef5350;margin-bottom:12px;}p{color:#8899aa;margin-bottom:20px;}
      a{color:#00d4ff;text-decoration:none;}a:hover{text-decoration:underline;}</style></head>
      <body><div class="error-box"><h1>Dashboard Error</h1><p>Unable to load dashboard data. Please try again.</p><a href="/dashboard">Retry</a></div></body></html>
    `);
  }
};
