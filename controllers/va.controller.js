const airtableService = require('../services/airtable.service');
const { wrapInLayout } = require('../utils/layout');

// ── Helper: determine where a service call is in its lifecycle ──
function getScStage(e, jobs) {
  const f = e.fields;
  const status = f.Status || '';
  const isSC = f['Confirmed Service Call Lead'];

  if (!isSC) return { stage: 'new-lead', priority: 0, action: 'confirm' };

  const engJobs = jobs.filter(j => {
    const linked = j.fields.Lead || j.fields.Engagement;
    return linked && (Array.isArray(linked) ? linked.includes(e.id) : linked === e.id);
  });
  const latestJob = engJobs.length > 0 ? engJobs[0] : null;
  const jobStatus = latestJob ? (latestJob.fields['Job Status'] || '') : '';

  switch (status) {
    case 'Disqualified':
      return { stage: 'disqualified', priority: 999, action: null };
    case 'New Lead':
      return { stage: 'new-lead', priority: 1, action: isSC ? 'call-lead' : 'confirm' };
    case 'Lead Contacted':
      return { stage: 'lead-contacted', priority: 10, action: 'next-steps' };
    case 'Waiting on Client':
      return { stage: 'waiting-on-client', priority: 65, action: null };
    case 'Site Visit Scheduled':
      return { stage: 'site-visit-scheduled', priority: 70, action: null };
    case 'Photos Requested':
      return { stage: 'photos-requested', priority: 60, action: null };
    case 'Check with Supplier That We Have Support':
      return { stage: 'check-supplier', priority: 50, action: null };
    case 'Tech Availability Check':
      return { stage: 'tech-availability-check', priority: 20, action: 'check-responses' };
    case 'Reviewing/ Quoting 👀':
      return { stage: 'reviewing-quoting', priority: 50, action: null };
    case 'Quote Sent':
    case 'Payment Link Sent': {
      const sentAt = f['Quote Sent At'];
      const hoursSinceSent = sentAt ? (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60) : 999;
      const stg = status === 'Quote Sent' ? 'quote-sent' : 'payment-link-sent';
      return { stage: stg, priority: hoursSinceSent > 4 ? 8 : 70, action: hoursSinceSent > 4 ? 'payment-followup' : null, sentAt };
    }
    case 'First Follow Up Call Made':
      return { stage: 'first-follow-up', priority: 40, action: null };
    case 'Payment Received ✅':
      return { stage: 'payment-received', priority: 5, action: 'assign-tech' };
    case 'Initial Parts Ordered':
      return { stage: 'initial-parts-ordered', priority: 75, action: null };
    case 'Tech Assigned 👷':
      return { stage: 'tech-assigned', priority: 25, action: 'waiting-schedule' };
    case 'Scheduled 📅': {
      const scheduledDate = latestJob && latestJob.fields['Scheduled Date'];
      const isToday = scheduledDate && new Date(scheduledDate).toDateString() === new Date().toDateString();
      return { stage: 'scheduled', priority: isToday ? 10 : 80, action: isToday ? 'send-completion' : null, scheduledDate };
    }
    case 'In Progress 🔧':
      return { stage: 'in-progress', priority: 10, action: null };
    case 'Completed ✨':
      return { stage: 'completed', priority: 15, action: 'review-or-followup' };
    case 'Return Visit Required':
      return { stage: 'return-visit-required', priority: 6, action: 'schedule-return' };
    case 'Return Visit Scheduled':
      return { stage: 'return-visit-scheduled', priority: 78, action: null };
    case 'Need to Bill Extras':
      return { stage: 'need-to-bill-extras', priority: 7, action: null };
    case 'Review Requested':
      return { stage: 'review-requested', priority: 90, action: null };
    case 'Positive Review Received':
      return { stage: 'positive-review-received', priority: 100, action: null };
    case 'No Review Received':
      return { stage: 'no-review-received', priority: 95, action: null };
    case "Didn't Ask for Review":
      return { stage: 'didnt-ask-review', priority: 95, action: null };
    case 'Lost':
      return { stage: 'lost', priority: 999, action: null };
    case 'Lost But Follow Up':
      return { stage: 'lost-but-follow-up', priority: 85, action: null };
    case 'Negative Review Received':
      return { stage: 'negative-review-received', priority: 100, action: null };
    case 'TRELLO LEADS TO ADD':
      return { stage: 'trello-leads', priority: 999, action: null };
    default:
      if (jobStatus === 'Completed') return { stage: 'completed', priority: 15, action: 'review-or-followup' };
      if (jobStatus === 'Scheduled') {
        const scheduledDate = latestJob && latestJob.fields['Scheduled Date'];
        return { stage: 'scheduled', priority: 80, action: null, scheduledDate };
      }
      if (jobStatus === 'Tech Assigned') return { stage: 'tech-assigned', priority: 25, action: 'waiting-schedule' };
      if (f['Tech Availability Requested']) return { stage: 'tech-availability-check', priority: 20, action: 'check-responses' };
      // Confirmed SC with no/unknown status — treat as needing a call
      return { stage: 'new-lead', priority: 1, action: isSC ? 'call-lead' : 'confirm' };
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Build action buttons for a task card ──
function cardActionHtml(card) {
  const esc = n => (n || '').replace(/'/g, "\\'");
  switch (card.action) {
    case 'confirm':
      return `<div class="card-actions">
        <button class="btn btn-primary" onclick="confirmLead('${card.id}', 'sc')">Service Call</button>
        <button class="btn btn-secondary" onclick="confirmLead('${card.id}', 'project')">Project</button>
        <button class="btn btn-ghost" onclick="dismissLead('${card.id}')">Skip</button>
      </div>`;
    case 'call-lead':
      return `<div class="card-actions">
        <a href="tel:${(card.phone || '').replace(/\s/g, '')}" class="btn btn-primary">Call ${escapeHtml(card.name.split(' ')[0])}</a>
        <a href="/send-message-form/${card.id}/request-photos" class="btn btn-secondary">Request Photos</a>
      </div>`;
    case 'next-steps':
      return `<div class="card-actions">
        <a href="/send-pricing-form/${card.id}" class="btn btn-primary">Send Payment Link</a>
        <a href="/send-tech-availability-form/${card.id}" class="btn btn-secondary">Check Tech Availability</a>
        <a href="/send-message-form/${card.id}/request-photos" class="btn btn-secondary">Request Photos</a>
      </div>`;
    case 'check-responses':
      return `<div class="card-actions">
        <a href="/send-pricing-form/${card.id}" class="btn btn-primary">Send Payment Link</a>
        <a href="/send-tech-availability-form/${card.id}" class="btn btn-secondary">Check More Techs</a>
      </div>`;
    case 'payment-followup':
      return `<div class="card-actions">
        <button class="btn btn-primary" onclick="showFollowUp('${card.id}', '${esc(card.name)}')">Send Reminder</button>
        <a href="/send-pricing-form/${card.id}" class="btn btn-secondary">Resend Payment Link</a>
      </div>`;
    case 'assign-tech':
      return `<div class="card-actions">
        <a href="/assign-tech/${card.id}" class="btn btn-primary">Assign Tech</a>
      </div>`;
    case 'send-completion':
      return `<div class="card-actions">
        <a href="/send-completion-form/${card.id}" class="btn btn-primary">Send Completion Form</a>
      </div>`;
    case 'review-or-followup':
      return `<div class="card-actions">
        <a href="/api/send-review-request/${card.id}" class="btn btn-primary">Request Google Review</a>
      </div>`;
    case 'schedule-return':
      return `<div class="card-actions">
        <a href="/send-tech-availability-form/${card.id}" class="btn btn-primary">Schedule Return Visit</a>
      </div>`;
    default:
      return '';
  }
}

// ══════════════════════════════════════════════
// GET /va — Daily wizard queue
// ══════════════════════════════════════════════
exports.showQueue = async (req, res) => {
  try {
    const [engagements, jobs] = await Promise.all([
      airtableService.getAllEngagements(),
      airtableService.getAllJobs(),
    ]);

    const scLeads = engagements.filter(e => {
      const f = e.fields;
      return f['Confirmed Service Call Lead'] || (f.Status === 'New Lead' && !f['Confirmed Project Lead']);
    });

    const cards = scLeads.map(e => {
      const f = e.fields;
      const stage = getScStage(e, jobs);
      const name = f['Customer Name'] || [f['First Name (from Customer)'], f['Last Name (from Customer)']].filter(Boolean).join(' ') || f['First Name'] || 'New Lead';
      const rawPhone = f['Mobile Phone (from Customer)'] || f['Phone (from Customer)'] || '';
      const phone = Array.isArray(rawPhone) ? rawPhone[0] || '' : rawPhone;
      const suburb = f['Address/Location'] || f.Suburb || '';
      const systemType = Array.isArray(f['System Type']) ? f['System Type'].join(', ') : (f['System Type'] || '');
      const source = f[' Source'] || '';
      const intake = f['Client intake info'] || f['Job Scope'] || f.Notes || '';
      const created = e._rawJson?.createdTime || '';
      const engNumber = f['Engagement Number'] || '';
      return {
        id: e.id, name, phone, suburb, systemType, source, engNumber,
        intake: intake.length > 200 ? intake.substring(0, 200) + '...' : intake,
        intakeFull: intake, created, createdAgo: timeAgo(created),
        ...stage,
      };
    });
    cards.sort((a, b) => a.priority - b.priority);

    // ── Wizard steps ──
    const wizardSteps = [
      { key: 'review', title: 'Review New Leads', desc: 'Confirm each lead as a Service Call, Project, or skip it.', filter: c => c.action === 'confirm' },
      { key: 'call', title: 'Call & Classify', desc: 'Call confirmed leads to get details and request photos.', filter: c => ['call-lead', 'next-steps'].includes(c.action) },
      { key: 'followups', title: 'Follow Ups', desc: "Chase up leads who haven't paid or responded.", filter: c => c.action === 'payment-followup' },
      { key: 'assign', title: 'Assign Techs', desc: 'Assign a technician to paid leads.', filter: c => c.action === 'assign-tech' },
      { key: 'today', title: "Today's Jobs", desc: 'Send completion forms for jobs happening today.', filter: c => c.action === 'send-completion' },
      { key: 'reviews', title: 'Request Reviews', desc: 'Ask happy clients for a Google review.', filter: c => c.action === 'review-or-followup' },
    ];

    const steps = wizardSteps.map((step, idx) => ({
      ...step, cards: cards.filter(step.filter), num: idx + 1,
    }));

    const activeSteps = steps.filter(s => s.cards.length > 0);
    const totalTasks = activeSteps.reduce((sum, s) => sum + s.cards.length, 0);
    const currentStep = activeSteps.length > 0 ? activeSteps[0] : null;

    // Progress
    const completedSteps = steps.filter(s => s.cards.length === 0).length;
    const progressPct = Math.round((completedSteps / steps.length) * 100);
    const progressLabel = currentStep ? `Step ${currentStep.num} of ${steps.length} — ${currentStep.title}` : 'All done!';

    // Render task card
    function renderCard(card) {
      return `<div class="task-card">
        <div class="tc-top">
          <div class="tc-name">${card.engNumber ? `<span style="color:#00d4ff;font-size:12px;font-weight:700;margin-right:6px">${escapeHtml(card.engNumber)}</span>` : ''}${escapeHtml(card.name)}</div>
          <span class="tc-time">${card.createdAgo}</span>
        </div>
        <div class="tc-meta">
          ${card.phone ? `<a href="tel:${card.phone.replace(/\s/g, '')}" class="tag tag-phone">${escapeHtml(card.phone)}</a>` : ''}
          ${card.systemType ? `<span class="tag">${escapeHtml(card.systemType)}</span>` : ''}
          ${card.suburb ? `<span class="tag">${escapeHtml(card.suburb)}</span>` : ''}
          ${card.source ? `<span class="tag tag-src">${escapeHtml(card.source)}</span>` : ''}
        </div>
        ${card.intake ? `<div class="tc-intake" onclick="this.classList.toggle('expanded')">
          <div class="intake-preview">${escapeHtml(card.intake)}</div>
          ${card.intakeFull.length > 200 ? `<div class="intake-full">${escapeHtml(card.intakeFull)}</div>` : ''}
        </div>` : ''}
        ${cardActionHtml(card)}
      </div>`;
    }

    // Steps HTML
    const stepsHtml = steps.map(step => {
      const empty = step.cards.length === 0;
      const isCurrent = currentStep && currentStep.key === step.key;
      const cls = empty ? 'step-done' : (isCurrent ? 'step-current' : 'step-pending');
      const icon = empty ? '<span class="step-icon done">&#10003;</span>' : (isCurrent ? '<span class="step-icon current">&#9654;</span>' : '<span class="step-icon pending">&#9654;</span>');
      const countLabel = empty ? 'Done' : `${step.cards.length} lead${step.cards.length !== 1 ? 's' : ''}`;

      return `<div class="wiz-step ${cls}" data-step="${step.key}">
        <div class="step-hdr" onclick="toggleStep('${step.key}')">
          ${icon}
          <span class="step-num">${step.num}.</span>
          <span class="step-ttl">${step.title}</span>
          <span class="step-cnt">${countLabel}</span>
        </div>
        <div class="step-body" ${isCurrent ? '' : 'style="display:none"'}>
          <p class="step-desc">${step.desc}</p>
          <div class="step-cards">${step.cards.map(renderCard).join('')}</div>
        </div>
      </div>`;
    }).join('');

    // Pipeline
    const pipeLanes = [
      { t: 'New Lead', c: '#00d4ff', s: ['new-lead'] },
      { t: 'Lead Contacted', c: '#ffa726', s: ['lead-contacted'] },
      { t: 'Waiting on Client', c: '#78909c', s: ['waiting-on-client'] },
      { t: 'Photos Requested', c: '#ab47bc', s: ['photos-requested'] },
      { t: 'Check Supplier', c: '#ff9800', s: ['check-supplier'] },
      { t: 'Tech Availability', c: '#ab47bc', s: ['tech-availability-check'] },
      { t: 'Reviewing / Quoting', c: '#78909c', s: ['reviewing-quoting'] },
      { t: 'Quote Sent', c: '#ce93d8', s: ['quote-sent'] },
      { t: 'Payment Link Sent', c: '#ce93d8', s: ['payment-link-sent'] },
      { t: 'Follow Up', c: '#ffa726', s: ['first-follow-up'] },
      { t: 'Payment Received', c: '#66bb6a', s: ['payment-received'] },
      { t: 'Parts Ordered', c: '#66bb6a', s: ['initial-parts-ordered'] },
      { t: 'Tech Assigned', c: '#ab47bc', s: ['tech-assigned'] },
      { t: 'Scheduled', c: '#42a5f5', s: ['scheduled'] },
      { t: 'In Progress', c: '#ffca28', s: ['in-progress'] },
      { t: 'Completed', c: '#26a69a', s: ['completed'] },
      { t: 'Return Visit', c: '#ff7043', s: ['return-visit-required', 'return-visit-scheduled'] },
      { t: 'Bill Extras', c: '#ffa726', s: ['need-to-bill-extras'] },
      { t: 'Review Requested', c: '#66bb6a', s: ['review-requested'] },
      { t: 'Positive Review', c: '#4caf50', s: ['positive-review-received'] },
      { t: 'No Review', c: '#78909c', s: ['no-review-received', 'didnt-ask-review'] },
      { t: 'Lost', c: '#ef5350', s: ['lost', 'lost-but-follow-up'] },
      { t: 'Negative Review', c: '#ff7043', s: ['negative-review-received'] },
    ];

    const pipeHtml = pipeLanes.map(l => {
      const n = cards.filter(c => l.s.includes(c.stage)).length;
      return `<div class="pl"><span class="pl-dot" style="background:${l.c}"></span><span class="pl-t">${l.t}</span><span class="pl-n" ${n > 0 ? `style="background:${l.c}20;color:${l.c}"` : ''}>${n}</span></div>`;
    }).join('');

    const allDone = totalTasks === 0 ? `<div class="all-done">
      <div class="all-done-icon">&#10003;</div>
      <h2>All caught up!</h2>
      <p>No tasks need your attention right now.</p>
    </div>` : '';

    const bodyHtml = `<div class="va-queue">
      <div class="progress-wrap">
        <div class="progress-label">${progressLabel}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
        <div class="progress-sub">${totalTasks} task${totalTasks !== 1 ? 's' : ''} remaining</div>
      </div>
      ${allDone}
      <div class="wiz-steps">${stepsHtml}</div>
      <div class="pipe-section">
        <div class="pipe-toggle" onclick="var b=document.getElementById('pipeBody');b.style.display=b.style.display==='none'?'block':'none';this.querySelector('.pipe-chev').classList.toggle('open')">
          <span class="pipe-chev">&#9654;</span> View Pipeline <span class="pipe-total">${cards.length} leads</span>
        </div>
        <div id="pipeBody" style="display:none"><div class="pipe-grid">${pipeHtml}</div></div>
      </div>
      <div id="followupModal" class="modal" style="display:none">
        <div class="modal-content">
          <div class="modal-hdr"><h3>Send Payment Reminder</h3><button class="modal-x" onclick="closeModal()">&times;</button></div>
          <div class="modal-bd"><p>Sending reminder to <strong id="followupName"></strong></p><textarea id="followupMessage" rows="4" placeholder="Custom message (optional)..."></textarea></div>
          <div class="modal-ft"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="followupSend">Send Reminder</button></div>
        </div>
      </div>
      <div id="confirmModal" class="modal" style="display:none">
        <div class="modal-content">
          <div class="modal-hdr"><h3 id="confirmTitle">Confirm</h3><button class="modal-x" onclick="closeModal()">&times;</button></div>
          <div class="modal-bd"><p id="confirmMessage"></p></div>
          <div class="modal-ft"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="confirmBtn">Confirm</button></div>
        </div>
      </div>
      <div id="toast" class="toast"></div>
    </div>`;

    const customStyles = `
      .va-queue{max-width:700px;margin:0 auto;padding:20px}
      .progress-wrap{margin-bottom:28px}
      .progress-label{font-size:15px;font-weight:600;color:#c0c8d0;margin-bottom:8px}
      .progress-track{height:6px;background:#1e2a3a;border-radius:3px;overflow:hidden}
      .progress-fill{height:100%;background:#00d4ff;border-radius:3px;transition:width .5s}
      .progress-sub{font-size:12px;color:#5a6a7a;margin-top:6px}
      .all-done{text-align:center;padding:50px 20px 30px}
      .all-done-icon{width:64px;height:64px;border-radius:50%;background:#66bb6a20;color:#66bb6a;font-size:32px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px}
      .all-done h2{color:#fff;font-size:22px;margin-bottom:8px}
      .all-done p{color:#5a6a7a;font-size:14px}
      .wiz-steps{display:flex;flex-direction:column;gap:2px;margin-bottom:32px}
      .wiz-step{background:#0d1117;border:1px solid #1e2a3a;border-radius:10px;overflow:hidden;transition:border-color .2s}
      .wiz-step.step-current{border-color:#00d4ff40}
      .wiz-step.step-done{opacity:.45}
      .step-hdr{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;user-select:none}
      .step-hdr:hover{background:#0f1419}
      .step-icon{width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
      .step-icon.done{background:#66bb6a20;color:#66bb6a;font-size:13px}
      .step-icon.current{background:#00d4ff20;color:#00d4ff;font-size:9px}
      .step-icon.pending{background:#1e2a3a;color:#5a6a7a;font-size:9px}
      .step-num{font-size:13px;color:#5a6a7a;font-weight:600}
      .step-ttl{font-size:15px;font-weight:600;color:#e0e6ed;flex:1}
      .step-done .step-ttl{color:#5a6a7a}
      .step-cnt{font-size:12px;color:#5a6a7a;background:#1a2332;padding:2px 10px;border-radius:10px}
      .step-current .step-cnt{background:#00d4ff20;color:#00d4ff}
      .step-body{padding:0 18px 18px}
      .step-desc{font-size:13px;color:#5a6a7a;margin-bottom:14px}
      .step-cards{display:flex;flex-direction:column;gap:10px}
      .task-card{background:#0f1419;border:1px solid #2a3a4a;border-radius:10px;padding:16px 18px;transition:border-color .2s}
      .task-card:hover{border-color:#3a5a6a}
      .tc-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
      .tc-name{font-size:17px;font-weight:600;color:#fff}
      .tc-time{font-size:12px;color:#5a6a7a;flex-shrink:0}
      .tc-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
      .tag{font-size:12px;color:#6a7a8a;background:#1a2332;padding:3px 8px;border-radius:4px;text-decoration:none}
      .tag-phone{color:#00d4ff;cursor:pointer}.tag-phone:hover{background:#00d4ff20}
      .tag-src{color:#5a6a7a;font-style:italic}
      .tc-intake{font-size:12px;color:#5a6a7a;font-style:italic;cursor:pointer;line-height:1.5;margin-bottom:6px}
      .tc-intake .intake-full{display:none}.tc-intake .intake-preview{display:block}
      .tc-intake.expanded .intake-full{display:block}.tc-intake.expanded .intake-preview{display:none}
      .card-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:8px}
      .btn{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:4px;transition:all .2s}
      .btn-primary{background:#00d4ff;color:#0f1419}.btn-primary:hover{background:#00b8d9}
      .btn-secondary{background:#1a2332;color:#8899aa;border:1px solid #2a3a4a}.btn-secondary:hover{color:#e0e6ed;border-color:#3a4a5a}
      .btn-ghost{background:none;color:#5a6a7a}.btn-ghost:hover{color:#8899aa}
      .pipe-section{margin-top:8px}
      .pipe-toggle{font-size:13px;color:#5a6a7a;cursor:pointer;padding:12px 0;display:flex;align-items:center;gap:8px;user-select:none}
      .pipe-toggle:hover{color:#8899aa}
      .pipe-chev{font-size:10px;transition:transform .2s;display:inline-block}.pipe-chev.open{transform:rotate(90deg)}
      .pipe-total{font-size:11px;background:#1a2332;padding:2px 8px;border-radius:8px}
      .pipe-grid{display:flex;flex-direction:column;gap:1px;padding:12px 0}
      .pl{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px}.pl:hover{background:#0f1419}
      .pl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
      .pl-t{font-size:12px;color:#6a7a8a;flex:1}
      .pl-n{font-size:11px;color:#3a4a5a;min-width:20px;text-align:center;padding:1px 6px;border-radius:8px;font-weight:600}
      .modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center}
      .modal-content{background:#0f1419;border:1px solid #2a3a4a;border-radius:12px;width:100%;max-width:480px;margin:20px}
      .modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2a3a4a}
      .modal-hdr h3{font-size:16px;color:#fff}
      .modal-x{background:none;border:none;color:#5a6a7a;font-size:24px;cursor:pointer}.modal-x:hover{color:#fff}
      .modal-bd{padding:20px;color:#8899aa;font-size:14px}
      .modal-bd textarea{width:100%;background:#1a2332;border:1px solid #2a3a4a;border-radius:8px;color:#e0e6ed;padding:10px 12px;font-size:14px;resize:vertical;margin-top:10px;font-family:inherit}
      .modal-bd textarea:focus{outline:none;border-color:#00d4ff}
      .modal-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #2a3a4a}
      .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#66bb6a;color:#0f1419;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;opacity:0;transition:opacity .3s;pointer-events:none;z-index:3000}
      .toast.show{opacity:1}
      @media(max-width:600px){.va-queue{padding:12px}.tc-name{font-size:15px}.card-actions{flex-direction:column}.card-actions .btn{width:100%;justify-content:center}}
    `;

    const customScripts = `<script>
      setTimeout(()=>location.reload(),60000);
      function toggleStep(k){var s=document.querySelector('[data-step="'+k+'"]'),b=s.querySelector('.step-body');b.style.display=b.style.display==='none'?'':'none'}
      function showToast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
      function closeModal(){document.querySelectorAll('.modal').forEach(m=>m.style.display='none')}
      function confirmLead(id,type){var l=type==='sc'?'Service Call':'Project';document.getElementById('confirmTitle').textContent='Confirm as '+l+'?';document.getElementById('confirmMessage').textContent='This will mark the lead as a confirmed '+l+'.';document.getElementById('confirmModal').style.display='flex';document.getElementById('confirmBtn').onclick=async()=>{closeModal();try{var r=await fetch('/va/confirm-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engagementId:id,type})});if(r.ok){showToast('Lead confirmed as '+l);setTimeout(()=>location.reload(),1000)}else showToast('Error confirming lead')}catch(e){showToast('Error: '+e.message)}}}
      function dismissLead(id){document.getElementById('confirmTitle').textContent='Skip this lead?';document.getElementById('confirmMessage').textContent='This will mark the lead as Lost. You can undo this in Airtable.';document.getElementById('confirmModal').style.display='flex';document.getElementById('confirmBtn').onclick=async()=>{closeModal();try{var r=await fetch('/va/dismiss-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engagementId:id})});if(r.ok){showToast('Lead dismissed');setTimeout(()=>location.reload(),1000)}else showToast('Error')}catch(e){showToast('Error: '+e.message)}}}
      var followUpEngId=null;
      function showFollowUp(id,name){followUpEngId=id;document.getElementById('followupName').textContent=name;document.getElementById('followupMessage').value='';document.getElementById('followupModal').style.display='flex'}
      document.getElementById('followupSend').addEventListener('click',async()=>{var m=document.getElementById('followupMessage').value;closeModal();try{var r=await fetch('/va/send-followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engagementId:followUpEngId,message:m})});if(r.ok){showToast('Reminder sent!');setTimeout(()=>location.reload(),1000)}else showToast('Error')}catch(e){showToast('Error: '+e.message)}});
    </script>`;

    res.send(wrapInLayout('Service Call Queue', bodyHtml, 'queue', {
      customStyles, customScripts, role: req.session.role || 'admin',
    }));
  } catch (error) {
    console.error('VA Queue error:', error);
    res.status(500).send('Error loading queue: ' + error.message);
  }
};

// ══════════════════════════════════════════════
// POST /va/confirm-lead
// ══════════════════════════════════════════════
exports.confirmLead = async (req, res) => {
  try {
    const { engagementId, type } = req.body;
    const updates = type === 'sc'
      ? { 'Confirmed Service Call Lead': true }
      : { 'Confirmed Project Lead': true };
    await airtableService.updateEngagement(engagementId, updates);

    // Assign engagement number
    const engNumber = await airtableService.assignEngagementNumber(engagementId, type);
    console.log(`Assigned engagement number: ${engNumber}`);

    res.json({ ok: true, engagementNumber: engNumber });
  } catch (error) {
    console.error('Confirm lead error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ══════════════════════════════════════════════
// POST /va/dismiss-lead
// ══════════════════════════════════════════════
exports.dismissLead = async (req, res) => {
  try {
    const { engagementId } = req.body;
    await airtableService.updateEngagement(engagementId, { Status: 'Lost' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Dismiss lead error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ══════════════════════════════════════════════
// POST /va/send-followup — payment reminder
// ══════════════════════════════════════════════
exports.sendFollowUp = async (req, res) => {
  try {
    const { engagementId, message } = req.body;
    const { engagement, customer } = await airtableService.getEngagementWithCustomer(engagementId);
    const f = engagement.fields;
    const firstName = (customer && customer.fields['First Name']) || f['First Name (from Customer)'] || 'there';
    let phone = (customer && (customer.fields['Mobile Phone'] || customer.fields.Phone)) ||
                f['Mobile Phone (from Customer)'] || f['Phone (from Customer)'];
    if (!phone) return res.status(400).json({ error: 'No phone number' });
    const twilioService = require('../services/twilio.service');
    const defaultMsg = `Hi ${firstName}, just following up on our earlier message. Did you have any questions about the service call? We're ready to get this sorted for you whenever you'd like to proceed. - Great White Security`;
    const finalMsg = message && message.trim() ? message.trim() : defaultMsg;
    await twilioService.sendSMS(phone, finalMsg);
    await airtableService.logMessage({
      direction: 'Outbound', type: 'SMS', to: phone,
      from: process.env.TWILIO_PHONE_NUMBER, content: finalMsg, engagement: engagementId,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Follow-up error:', error);
    res.status(500).json({ error: error.message });
  }
};
