const airtableService = require('../services/airtable.service');
const { wrapInLayout } = require('../utils/layout');

/**
 * Show engagement activity timeline
 * GET /engagement/:id
 */
exports.showTimeline = async (req, res) => {
  try {
    const engagementId = req.params.id;

    // Fetch engagement, customer, and all messages in parallel
    const [engData, allMessages] = await Promise.all([
      airtableService.getEngagementWithCustomer(engagementId),
      airtableService.getAllMessages(),
    ]);

    if (!engData || !engData.engagement) {
      return res.status(404).send('<h1>Engagement not found</h1>');
    }

    const { engagement, customer } = engData;
    const f = engagement.fields;

    // Client info
    const clientName = f['Customer Name'] || f['First Name'] || customer?.fields?.['First Name'] || 'Unknown';
    const clientPhone = f['Phone (from Customer)']?.[0] || customer?.fields?.Phone || '';
    const clientAddress = f['Address (from Customer)']?.[0] || customer?.fields?.Address || '';
    const status = f.Status || 'Unknown';

    // Filter messages for this engagement
    const engMessages = allMessages.filter(m => {
      const linked = m.fields['Related Lead'];
      return linked && linked.includes(engagementId);
    });

    // Sort chronologically (oldest first — chat style)
    engMessages.sort((a, b) => {
      const timeA = new Date(a.fields.Timestamp || a._rawJson?.createdTime || 0);
      const timeB = new Date(b.fields.Timestamp || b._rawJson?.createdTime || 0);
      return timeA - timeB;
    });

    // Build timeline items
    const timelineItems = engMessages.map(m => {
      const mf = m.fields;
      const direction = mf.Direction || '';
      const type = mf.Type || 'SMS';
      const content = mf.Content || '';
      const from = mf.From || '';
      const time = new Date(mf.Timestamp || m._rawJson?.createdTime || Date.now());
      const timeStr = time.toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: 'Australia/Perth',
      });

      if (type === 'System' && direction === 'Internal') {
        // System event — centered gray
        return `
          <div class="tl-item tl-system">
            <div class="tl-system-dot"></div>
            <div class="tl-system-content">
              <span class="tl-system-text">${escapeHtml(content)}</span>
              <span class="tl-time">${timeStr}</span>
            </div>
          </div>`;
      }

      if (type === 'Note' && direction === 'Internal') {
        // Internal note — left-aligned, amber accent
        const authorName = from.includes('@') ? from.split('@')[0] : from;
        return `
          <div class="tl-item tl-note">
            <div class="tl-bubble tl-bubble-note">
              <div class="tl-note-header">
                <span class="tl-note-author">${escapeHtml(authorName)}</span>
                <span class="tl-time">${timeStr}</span>
              </div>
              <div class="tl-content">${escapeHtml(content)}</div>
            </div>
          </div>`;
      }

      if (direction === 'Outbound') {
        // Outbound SMS/Email — right-aligned blue
        return `
          <div class="tl-item tl-outbound">
            <div class="tl-bubble tl-bubble-out">
              <div class="tl-content">${escapeHtml(content)}</div>
              <span class="tl-time">${timeStr}</span>
            </div>
          </div>`;
      }

      if (direction === 'Inbound') {
        // Inbound SMS/Email — left-aligned dark
        return `
          <div class="tl-item tl-inbound">
            <div class="tl-bubble tl-bubble-in">
              <div class="tl-meta">${escapeHtml(from)}</div>
              <div class="tl-content">${escapeHtml(content)}</div>
              <span class="tl-time">${timeStr}</span>
            </div>
          </div>`;
      }

      // Fallback for unknown direction
      return `
        <div class="tl-item tl-inbound">
          <div class="tl-bubble tl-bubble-in">
            <div class="tl-meta">${escapeHtml(from)} (${direction} ${type})</div>
            <div class="tl-content">${escapeHtml(content)}</div>
            <span class="tl-time">${timeStr}</span>
          </div>
        </div>`;
    }).join('');

    // Status badge color
    const statusColors = {
      'New Lead': '#00d4ff',
      'Lead Contacted': '#ffa726',
      'Tech Assigned 👷': '#ab47bc',
      'Scheduled 📅': '#42a5f5',
      'Photos Requested': '#ab47bc',
      'Quote Sent': '#ce93d8',
      'Payment Link Sent': '#ce93d8',
      'Payment Received ✅': '#66bb6a',
      'Initial Parts Ordered': '#66bb6a',
      'Completed ✨': '#26a69a',
      'Positive Review Received': '#4caf50',
      'Negative Review Received': '#ff7043',
      'Lost': '#ef5350',
    };
    const badgeColor = statusColors[status] || '#78909c';

    const timelineStyles = `
    .tl-header { background:#0f1419; padding:20px 24px; border-bottom:1px solid #2a3a4a; }
    .tl-header-top { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
    .tl-back { color:#8899aa; text-decoration:none; font-size:13px; transition:color .2s; }
    .tl-back:hover { color:#00d4ff; }
    .tl-header h1 { font-size:22px; color:#fff; flex:1; }
    .tl-badge { display:inline-block; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; color:#0f1419; }
    .tl-header-meta { display:flex; gap:20px; font-size:13px; color:#8899aa; flex-wrap:wrap; }
    .tl-header-meta span { display:flex; align-items:center; gap:4px; }

    .tl-container { max-width:800px; margin:0 auto; padding:24px; }
    .tl-feed { display:flex; flex-direction:column; gap:8px; padding-bottom:100px; min-height:200px; }
    .tl-empty { text-align:center; color:#5a6a7a; font-size:14px; padding:60px 0; font-style:italic; }

    .tl-item { display:flex; }

    /* Outbound — right aligned */
    .tl-outbound { justify-content:flex-end; }
    .tl-bubble-out { background:#1a3a5c; border:1px solid #2a5a8a; border-radius:12px 12px 4px 12px; padding:10px 14px; max-width:75%; }
    .tl-bubble-out .tl-content { color:#e0e6ed; font-size:14px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .tl-bubble-out .tl-time { display:block; text-align:right; margin-top:6px; font-size:11px; color:#5a7a9a; }

    /* Inbound — left aligned */
    .tl-inbound { justify-content:flex-start; }
    .tl-bubble-in { background:#1a2332; border:1px solid #2a3a4a; border-radius:12px 12px 12px 4px; padding:10px 14px; max-width:75%; }
    .tl-bubble-in .tl-meta { font-size:11px; color:#8899aa; margin-bottom:4px; }
    .tl-bubble-in .tl-content { color:#e0e6ed; font-size:14px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .tl-bubble-in .tl-time { display:block; margin-top:6px; font-size:11px; color:#5a6a7a; }

    /* System event — centered */
    .tl-system { justify-content:center; padding:8px 0; }
    .tl-system-dot { width:8px; height:8px; border-radius:50%; background:#3a4a5a; flex-shrink:0; margin-top:4px; }
    .tl-system-content { display:flex; align-items:center; gap:8px; }
    .tl-system-text { font-size:12px; color:#6a7a8a; font-style:italic; }
    .tl-system .tl-time { font-size:11px; color:#4a5a6a; }

    /* Note — left aligned, amber accent */
    .tl-note { justify-content:flex-start; }
    .tl-bubble-note { background:#2a2416; border:1px solid #4a3a1a; border-left:3px solid #ffa726; border-radius:4px 12px 12px 4px; padding:10px 14px; max-width:75%; }
    .tl-note-header { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
    .tl-note-author { font-size:12px; font-weight:600; color:#ffa726; }
    .tl-bubble-note .tl-time { font-size:11px; color:#6a5a3a; }
    .tl-bubble-note .tl-content { color:#e0d6c4; font-size:14px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }

    /* Sticky note input */
    .tl-input-bar { position:fixed; bottom:0; left:0; right:0; background:#0f1419; border-top:1px solid #2a3a4a; padding:12px 24px; z-index:100; }
    .tl-input-wrap { max-width:800px; margin:0 auto; display:flex; gap:10px; }
    .tl-input-wrap textarea { flex:1; background:#1a2332; border:1px solid #2a3a4a; border-radius:8px; color:#e0e6ed; padding:10px 14px; font-size:14px; font-family:inherit; resize:none; outline:none; min-height:42px; max-height:120px; transition:border-color .2s; }
    .tl-input-wrap textarea:focus { border-color:#00d4ff; }
    .tl-input-wrap textarea::placeholder { color:#5a6a7a; }
    .tl-send-btn { background:#00d4ff; color:#0f1419; border:none; border-radius:8px; padding:0 20px; font-weight:bold; font-size:14px; cursor:pointer; transition:background .2s; flex-shrink:0; }
    .tl-send-btn:hover { background:#00b8d9; }
    .tl-send-btn:disabled { background:#2a3a4a; color:#5a6a7a; cursor:not-allowed; }

    @media (max-width:768px) {
      .tl-container { padding:16px; }
      .tl-bubble-out, .tl-bubble-in, .tl-bubble-note { max-width:90%; }
      .tl-header-meta { flex-direction:column; gap:4px; }
    }
    `;

    const timelineBody = `
    <div class="tl-header">
      <div class="tl-header-top">
        <a href="/dashboard" class="tl-back">&larr; Dashboard</a>
      </div>
      <div class="tl-header-top">
        <h1>${escapeHtml(clientName)}</h1>
        <span class="tl-badge" style="background:${badgeColor}">${escapeHtml(status)}</span>
      </div>
      <div class="tl-header-meta">
        ${clientPhone ? `<span>&#128222; ${escapeHtml(clientPhone)}</span>` : ''}
        ${clientAddress ? `<span>&#128205; ${escapeHtml(clientAddress)}</span>` : ''}
      </div>
    </div>

    <div class="tl-container">
      <div class="tl-feed" id="tl-feed">
        ${timelineItems || '<div class="tl-empty">No activity yet</div>'}
      </div>
    </div>

    <div class="tl-input-bar">
      <div class="tl-input-wrap">
        <textarea id="note-input" placeholder="Add a note..." rows="1"></textarea>
        <button class="tl-send-btn" id="send-note-btn" onclick="addNote()">Add Note</button>
      </div>
    </div>`;

    const timelineScripts = `
    <script>
      // Auto-scroll to bottom
      (function() {
        var feed = document.getElementById('tl-feed');
        if (feed) window.scrollTo(0, document.body.scrollHeight);
      })();

      // Auto-resize textarea
      var ta = document.getElementById('note-input');
      ta.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      });

      // Submit on Enter (Shift+Enter for newline)
      ta.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          addNote();
        }
      });

      async function addNote() {
        var input = document.getElementById('note-input');
        var btn = document.getElementById('send-note-btn');
        var text = input.value.trim();
        if (!text) return;

        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
          var resp = await fetch('/api/engagement/${engagementId}/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
          });

          if (!resp.ok) throw new Error('Failed');

          // Append note to feed immediately
          var feed = document.getElementById('tl-feed');
          var empty = feed.querySelector('.tl-empty');
          if (empty) empty.remove();

          var now = new Date().toLocaleString('en-AU', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
          });

          var data = await resp.json();
          var author = (data.author || 'you').split('@')[0];

          var div = document.createElement('div');
          div.className = 'tl-item tl-note';
          div.innerHTML = '<div class="tl-bubble tl-bubble-note">' +
            '<div class="tl-note-header">' +
            '<span class="tl-note-author">' + author + '</span>' +
            '<span class="tl-time">' + now + '</span>' +
            '</div>' +
            '<div class="tl-content">' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>') + '</div>' +
            '</div>';
          feed.appendChild(div);

          input.value = '';
          input.style.height = 'auto';
          window.scrollTo(0, document.body.scrollHeight);
        } catch (err) {
          alert('Failed to add note. Please try again.');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Add Note';
        }
      }
    </script>`;

    res.send(wrapInLayout(clientName + ' - Timeline', timelineBody, '', { customStyles: timelineStyles, customScripts: timelineScripts }));
  } catch (error) {
    console.error('Timeline error:', error);
    res.status(500).send('<h1>Error loading timeline</h1>');
  }
};

/**
 * Add a note to an engagement's timeline
 * POST /api/engagement/:id/note
 */
exports.addNote = async (req, res) => {
  try {
    const engagementId = req.params.id;
    const { content } = req.body;
    const author = req.session?.userEmail || 'unknown';

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    await airtableService.logActivity(engagementId, content.trim(), {
      type: 'Note',
      author,
    });

    res.json({ success: true, author });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
