const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

// Helper function to get timestamp from Airtable record
function getTimestamp(msg) {
  try {
    // Try Timestamp field first, then Created, then use createdTime
    if (msg.fields && msg.fields.Timestamp) return new Date(msg.fields.Timestamp);
    if (msg.fields && msg.fields.Created) return new Date(msg.fields.Created);
    if (msg._rawJson && msg._rawJson.createdTime) return new Date(msg._rawJson.createdTime);
    // Fallback to now
    return new Date();
  } catch (e) {
    return new Date();
  }
}

/**
 * Show messages inbox with all conversations
 * GET /messages
 */
exports.showInbox = async (req, res) => {
  try {
    // Get all messages, customers, and techs from Airtable
    const messages = await airtableService.getAllMessages();
    const allCustomers = await airtableService.getAllCustomers();
    const allTechs = await airtableService.getAllTechs();

    // Build phone lookup maps
    const customerPhoneMap = {};
    const techPhoneMap = {};

    for (const customer of allCustomers) {
      const mobilePhone = customer.fields['Mobile Phone'];
      const phone = customer.fields.Phone;
      const name = [customer.fields['First Name'], customer.fields['Last Name']].filter(Boolean).join(' ') || 'Customer';

      if (mobilePhone) customerPhoneMap[mobilePhone] = { id: customer.id, name, type: 'customer' };
      if (phone) customerPhoneMap[phone] = { id: customer.id, name, type: 'customer' };
    }

    for (const tech of allTechs) {
      const phone = tech.fields.Phone;
      const name = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || tech.fields.Name || 'Tech';

      if (phone) techPhoneMap[phone] = { id: tech.id, name, type: 'tech' };
    }

    // Group messages by phone number
    const conversations = {};

    for (const msg of messages) {
      const fields = msg.fields;

      // Determine the contact phone (opposite of your Twilio number)
      const isOutbound = fields.Direction === 'Outbound';
      const contactPhone = isOutbound ? fields.To : fields.From;

      if (!contactPhone || contactPhone === 'Web Form') continue;

      if (!conversations[contactPhone]) {
        // Determine contact type and name
        let contactInfo = customerPhoneMap[contactPhone] || techPhoneMap[contactPhone];

        conversations[contactPhone] = {
          phone: contactPhone,
          messages: [],
          lastMessage: null,
          contactName: contactInfo ? contactInfo.name : contactPhone,
          contactType: contactInfo ? contactInfo.type : 'unknown',
          leadId: fields['Related Lead'] ? fields['Related Lead'][0] : null,
        };
      }

      conversations[contactPhone].messages.push({
        id: msg.id,
        direction: fields.Direction,
        content: fields.Content,
        timestamp: getTimestamp(msg),
        status: fields.Status,
      });
    }

    // Sort messages and create conversation lists by type
    const customersConversations = [];
    const techsConversations = [];
    const suppliersConversations = []; // Empty for now

    for (const phone in conversations) {
      const conv = conversations[phone];

      // Sort messages by timestamp
      conv.messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      conv.lastMessage = conv.messages[0];

      // Add to appropriate list
      if (conv.contactType === 'customer') {
        customersConversations.push(conv);
      } else if (conv.contactType === 'tech') {
        techsConversations.push(conv);
      } else {
        // Unknown numbers go to customers for now
        customersConversations.push(conv);
      }
    }

    // Sort each list by last message time
    const sortByLastMessage = (a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
    customersConversations.sort(sortByLastMessage);
    techsConversations.sort(sortByLastMessage);
    suppliersConversations.sort(sortByLastMessage);

    // Helper function for time display
    const getTimeAgo = (timestamp) => {
      const now = new Date();
      const date = new Date(timestamp);
      const diff = now - date;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'Just now';
      if (minutes < 60) return minutes + 'm';
      if (hours < 24) return hours + 'h';
      if (days < 7) return days + 'd';
      return date.toLocaleDateString();
    };

    // Helper to render conversation list
    const renderConversations = (conversations) => {
      if (conversations.length === 0) {
        return `
          <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h2>No conversations yet</h2>
            <p>Messages will appear here once you start communicating.</p>
          </div>
        `;
      }

      return conversations.map(conv => {
        const initials = conv.contactName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const lastMsg = conv.lastMessage;
        const preview = lastMsg.direction === 'Outbound'
          ? `You: ${lastMsg.content}`
          : lastMsg.content;
        const timeAgo = getTimeAgo(lastMsg.timestamp);

        return `
          <div class="conversation" onclick="window.location.href='/messages/${encodeURIComponent(conv.phone)}'">
            <div class="conversation-avatar">${initials}</div>
            <div class="conversation-content">
              <div class="conversation-header">
                <div class="conversation-name">${conv.contactName}</div>
                <div class="conversation-time">${timeAgo}</div>
              </div>
              <div class="conversation-preview ${lastMsg.direction === 'Outbound' ? 'outbound' : ''}">
                ${preview.substring(0, 60)}${preview.length > 60 ? '...' : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    // Render inbox
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Messages - GWS</title>
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
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .header {
            background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
            color: white;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .header h1 {
            font-size: 24px;
            font-weight: 700;
          }
          .tabs {
            display: flex;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 4px;
            margin-top: 15px;
            gap: 4px;
          }
          .tab {
            flex: 1;
            padding: 10px 16px;
            border: none;
            background: transparent;
            color: rgba(255,255,255,0.7);
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.3s;
          }
          .tab.active {
            background: white;
            color: #4F46E5;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .tab:hover:not(.active) {
            background: rgba(255,255,255,0.15);
            color: white;
          }
          .tab-count {
            font-size: 12px;
            opacity: 0.8;
            margin-left: 6px;
          }
          .conversations-container {
            flex: 1;
            overflow-y: auto;
            background: white;
            margin: 20px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          .tab-content {
            display: none;
          }
          .tab-content.active {
            display: block;
          }
          .conversation {
            display: flex;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            transition: all 0.2s;
          }
          .conversation:last-child {
            border-bottom: none;
          }
          .conversation:hover {
            background: linear-gradient(90deg, #f8f9ff 0%, #f5f3ff 100%);
          }
          .conversation-avatar {
            width: 54px;
            height: 54px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 20px;
            margin-right: 16px;
            flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          .conversation-content {
            flex: 1;
            min-width: 0;
          }
          .conversation-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
          }
          .conversation-name {
            font-weight: 600;
            font-size: 16px;
            color: #1a202c;
          }
          .conversation-time {
            font-size: 12px;
            color: #a0aec0;
            font-weight: 500;
          }
          .conversation-preview {
            color: #718096;
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .conversation-preview.outbound {
            color: #a0aec0;
          }
          .empty-state {
            text-align: center;
            padding: 80px 20px;
            color: #a0aec0;
          }
          .empty-state-icon {
            font-size: 72px;
            margin-bottom: 24px;
            opacity: 0.5;
          }
          .empty-state h2 {
            color: #4a5568;
            font-size: 20px;
            margin-bottom: 8px;
          }
          .empty-state p {
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>💬 Messages</h1>
          <div class="tabs">
            <button class="tab active" onclick="switchTab('customers')">
              Customers <span class="tab-count">${customersConversations.length}</span>
            </button>
            <button class="tab" onclick="switchTab('techs')">
              Techs <span class="tab-count">${techsConversations.length}</span>
            </button>
            <button class="tab" onclick="switchTab('suppliers')">
              Suppliers <span class="tab-count">${suppliersConversations.length}</span>
            </button>
          </div>
        </div>

        <div class="conversations-container">
          <div class="tab-content active" id="customers">
            ${renderConversations(customersConversations)}
          </div>
          <div class="tab-content" id="techs">
            ${renderConversations(techsConversations)}
          </div>
          <div class="tab-content" id="suppliers">
            ${renderConversations(suppliersConversations)}
          </div>
        </div>

        <script>
          function switchTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(tab => {
              tab.classList.remove('active');
            });
            event.target.closest('.tab').classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
              content.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing inbox:', error);
    res.status(500).send('Error loading messages');
  }
};

/**
 * Send SMS in a conversation
 * POST /api/send-sms-conversation
 */
exports.sendSMS = async (req, res) => {
  try {
    const engagementId = req.body.leadId;
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Send SMS via Twilio (this also logs to Airtable)
    await twilioService.sendSMS(to, message, { leadId: engagementId, type: 'manual' });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

module.exports = exports;

/**
 * Show conversation thread with specific customer
 * GET /messages/:phone
 */
exports.showConversation = async (req, res) => {
  try {
    const { phone } = req.params;
    const decodedPhone = decodeURIComponent(phone);

    // Get all messages for this phone number
    const allMessages = await airtableService.getAllMessages();
    const messages = allMessages.filter(msg => {
      const fields = msg.fields;
      return fields.To === decodedPhone || fields.From === decodedPhone;
    });

    // Sort by timestamp
    messages.sort((a, b) => getTimestamp(a) - getTimestamp(b));

    // Get customer info
    let customerName = decodedPhone;
    let leadId = null;

    if (messages.length > 0 && messages[0].fields['Related Lead']) {
      leadId = messages[0].fields['Related Lead'][0];
      try {
        const result = await airtableService.getEngagementWithCustomer(leadId);
        if (result && result.customer) {
          const firstName = result.customer.fields['First Name'] || '';
          const lastName = result.customer.fields['Last Name'] || '';
          customerName = [firstName, lastName].filter(Boolean).join(' ') || decodedPhone;
        } else if (result && result.engagement) {
          customerName = result.engagement.fields['First Name (from Customer)'] || decodedPhone;
        }
      } catch (err) {
        console.error('Error getting customer name:', err);
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${customerName} - Messages</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #e5ddd5;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .header {
            background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .back-btn {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            margin-right: 15px;
            padding: 0;
          }
          .header-info {
            flex: 1;
          }
          .header-name {
            font-size: 18px;
            font-weight: 600;
          }
          .header-phone {
            font-size: 13px;
            opacity: 0.8;
          }
          .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
          }
          .message {
            max-width: 65%;
            margin-bottom: 10px;
            padding: 8px 12px;
            border-radius: 8px;
            word-wrap: break-word;
          }
          .message.outbound {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            align-self: flex-end;
            margin-left: auto;
          }
          .message.inbound {
            background: #f0f4f8;
            color: #2d3748;
            align-self: flex-start;
          }
          .message-time {
            font-size: 11px;
            color: #999;
            margin-top: 4px;
            text-align: right;
          }
          .message.outbound .message-time {
            color: rgba(255,255,255,0.8);
          }
          .message.inbound .message-time {
            text-align: left;
            color: #a0aec0;
          }
          .input-container {
            background: #f0f0f0;
            padding: 10px 20px;
            display: flex;
            gap: 10px;
            border-top: 1px solid #ddd;
          }
          .input-container textarea {
            flex: 1;
            padding: 10px 15px;
            border: 1px solid #ddd;
            border-radius: 20px;
            font-family: inherit;
            font-size: 15px;
            resize: none;
            max-height: 100px;
          }
          .input-container textarea:focus {
            outline: none;
            border-color: #667eea;
          }
          .send-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 50%;
            width: 45px;
            height: 45px;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }
          .send-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
          }
          .send-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #999;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <button class="back-btn" onclick="window.location.href='/messages'">←</button>
          <div class="header-info">
            <div class="header-name">${customerName}</div>
            <div class="header-phone">${decodedPhone}</div>
          </div>
        </div>

        <div class="messages-container" id="messagesContainer">
          ${messages.length === 0 ? `
            <div class="empty-state">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ` : messages.map(msg => {
            const fields = msg.fields;
            const isOutbound = fields.Direction === 'Outbound';
            const timestamp = getTimestamp(msg);
            const timeStr = timestamp.toLocaleTimeString('en-AU', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });

            return `
              <div class="message ${isOutbound ? 'outbound' : 'inbound'}">
                <div class="message-content">${fields.Content}</div>
                <div class="message-time">${timeStr}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="input-container">
          <textarea
            id="messageInput"
            placeholder="Type a message..."
            rows="1"
            onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }"
          ></textarea>
          <button class="send-btn" id="sendBtn" onclick="sendMessage()">➤</button>
        </div>

        <script>
          const messagesContainer = document.getElementById('messagesContainer');
          const messageInput = document.getElementById('messageInput');
          const sendBtn = document.getElementById('sendBtn');

          // Scroll to bottom on load
          messagesContainer.scrollTop = messagesContainer.scrollHeight;

          // Auto-resize textarea
          messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
          });

          async function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) return;

            sendBtn.disabled = true;
            messageInput.disabled = true;

            try {
              const response = await fetch('/api/send-sms-conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: '${decodedPhone}',
                  message: message,
                  leadId: ${leadId ? `'${leadId}'` : 'null'}
                })
              });

              if (response.ok) {
                // Add message to UI
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-AU', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                });

                const messageEl = document.createElement('div');
                messageEl.className = 'message outbound';
                messageEl.innerHTML = \`
                  <div class="message-content">\${message}</div>
                  <div class="message-time">\${timeStr}</div>
                \`;

                messagesContainer.appendChild(messageEl);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                messageInput.value = '';
                messageInput.style.height = 'auto';
              } else {
                alert('Failed to send message. Please try again.');
              }
            } catch (error) {
              alert('Error sending message: ' + error.message);
            } finally {
              sendBtn.disabled = false;
              messageInput.disabled = false;
              messageInput.focus();
            }
          }

          // Auto-refresh every 30 seconds to get new messages
          setInterval(() => {
            window.location.reload();
          }, 30000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing conversation:', error);
    res.status(500).send('Error loading conversation');
  }
};
