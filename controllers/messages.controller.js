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
    // Get all messages from Airtable
    const messages = await airtableService.getAllMessages();

    // Group messages by phone number (customer)
    const conversations = {};

    for (const msg of messages) {
      const fields = msg.fields;

      // Determine the customer phone (opposite of your Twilio number)
      const isOutbound = fields.Direction === 'Outbound';
      const customerPhone = isOutbound ? fields.To : fields.From;

      if (!customerPhone || customerPhone === 'Web Form') continue;

      if (!conversations[customerPhone]) {
        conversations[customerPhone] = {
          phone: customerPhone,
          messages: [],
          lastMessage: null,
          customerName: null,
          leadId: fields['Related Lead'] ? fields['Related Lead'][0] : null,
        };
      }

      conversations[customerPhone].messages.push({
        id: msg.id,
        direction: fields.Direction,
        content: fields.Content,
        timestamp: getTimestamp(msg),
        status: fields.Status,
      });
    }

    // Sort messages and get customer names
    const conversationsList = [];
    for (const phone in conversations) {
      const conv = conversations[phone];
      
      // Sort messages by timestamp
      conv.messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      conv.lastMessage = conv.messages[0];

      // Get customer name
      if (conv.leadId) {
        try {
          const result = await airtableService.getEngagementWithCustomer(conv.leadId);
          if (result && result.customer) {
            const firstName = result.customer.fields['First Name'] || '';
            const lastName = result.customer.fields['Last Name'] || '';
            conv.customerName = [firstName, lastName].filter(Boolean).join(' ');
          } else if (result && result.engagement) {
            conv.customerName = result.engagement.fields['First Name (from Customer)'] || phone;
          }
        } catch (err) {
          console.error('Error getting customer name:', err);
        }
      }

      if (!conv.customerName) {
        conv.customerName = phone;
      }

      conversationsList.push(conv);
    }

    // Sort by last message time
    conversationsList.sort((a, b) =>
      new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp)
    );

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
            background: #f5f5f5;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .header {
            background: #075e54;
            color: white;
            padding: 15px 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header h1 {
            font-size: 20px;
          }
          .conversations {
            flex: 1;
            overflow-y: auto;
            background: white;
          }
          .conversation {
            display: flex;
            align-items: center;
            padding: 15px 20px;
            border-bottom: 1px solid #e0e0e0;
            cursor: pointer;
            transition: background 0.2s;
          }
          .conversation:hover {
            background: #f5f5f5;
          }
          .conversation-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #25d366;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 20px;
            margin-right: 15px;
            flex-shrink: 0;
          }
          .conversation-content {
            flex: 1;
            min-width: 0;
          }
          .conversation-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .conversation-name {
            font-weight: 600;
            font-size: 16px;
            color: #111;
          }
          .conversation-time {
            font-size: 12px;
            color: #999;
          }
          .conversation-preview {
            color: #666;
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .conversation-preview.outbound {
            color: #999;
          }
          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #999;
          }
          .empty-state-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>💬 Messages</h1>
        </div>

        <div class="conversations">
          ${conversationsList.length === 0 ? `
            <div class="empty-state">
              <div class="empty-state-icon">💬</div>
              <h2>No conversations yet</h2>
              <p>Messages will appear here once you start communicating with clients.</p>
            </div>
          ` : conversationsList.map(conv => {
            const initials = conv.customerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
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
                    <div class="conversation-name">${conv.customerName}</div>
                    <div class="conversation-time">${timeAgo}</div>
                  </div>
                  <div class="conversation-preview ${lastMsg.direction === 'Outbound' ? 'outbound' : ''}">
                    ${preview.substring(0, 60)}${preview.length > 60 ? '...' : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
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
    const { to, message, leadId } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Send SMS via Twilio
    await twilioService.sendSMS(to, message, { leadId, type: 'manual' });

    // Log message
    await airtableService.logMessage({
      leadId: leadId,
      direction: 'Outbound',
      type: 'SMS',
      to: to,
      from: process.env.TWILIO_PHONE_NUMBER,
      content: message,
      status: 'Sent',
    });

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
            background: #075e54;
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
            background: #dcf8c6;
            align-self: flex-end;
            margin-left: auto;
          }
          .message.inbound {
            background: white;
            align-self: flex-start;
          }
          .message-time {
            font-size: 11px;
            color: #999;
            margin-top: 4px;
            text-align: right;
          }
          .message.inbound .message-time {
            text-align: left;
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
            border-color: #25d366;
          }
          .send-btn {
            background: #25d366;
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
            transition: background 0.2s;
          }
          .send-btn:hover {
            background: #20ba5a;
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
