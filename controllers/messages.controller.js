const { wrapInLayout } = require('../utils/layout');
const airtableService = require('../services/airtable.service');
const twilioService = require('../services/twilio.service');

// Helper function to normalize Australian phone numbers
// Converts all formats to +61XXXXXXXXX for consistent matching
function normalizePhone(phone) {
  if (!phone) return phone;

  // Remove all spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // If starts with 0, replace with +61
  if (cleaned.startsWith('0')) {
    cleaned = '+61' + cleaned.substring(1);
  }
  // If starts with 61 but no +, add the +
  else if (cleaned.startsWith('61') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  // If doesn't start with +61 or 0, assume it needs +61
  else if (!cleaned.startsWith('+61')) {
    cleaned = '+61' + cleaned;
  }

  return cleaned;
}

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

    // Build phone lookup maps (normalized)
    const customerPhoneMap = {};
    const techPhoneMap = {};

    for (const customer of allCustomers) {
      const mobilePhone = customer.fields['Mobile Phone'];
      const phone = customer.fields.Phone;
      const name = [customer.fields['First Name'], customer.fields['Last Name']].filter(Boolean).join(' ') || 'Customer';

      if (mobilePhone) {
        const normalized = normalizePhone(mobilePhone);
        customerPhoneMap[normalized] = { id: customer.id, name, type: 'customer', displayPhone: mobilePhone };
      }
      if (phone) {
        const normalized = normalizePhone(phone);
        customerPhoneMap[normalized] = { id: customer.id, name, type: 'customer', displayPhone: phone };
      }
    }

    for (const tech of allTechs) {
      const phone = tech.fields.Phone;
      const name = [tech.fields['First Name'], tech.fields['Last Name']].filter(Boolean).join(' ') || tech.fields.Name || 'Tech';

      if (phone) {
        const normalized = normalizePhone(phone);
        techPhoneMap[normalized] = { id: tech.id, name, type: 'tech', displayPhone: phone };
      }
    }

    // Group messages by normalized phone number
    const conversations = {};

    for (const msg of messages) {
      const fields = msg.fields;

      // Skip email-type messages - they shouldn't appear in SMS conversations
      if (fields.Type === 'Email') continue;

      // Determine the contact phone (opposite of your Twilio number)
      const isOutbound = fields.Direction === 'Outbound';
      const contactPhone = isOutbound ? fields.To : fields.From;

      if (!contactPhone || contactPhone === 'Web Form') continue;

      // Normalize the phone number for consistent grouping
      const normalizedPhone = normalizePhone(contactPhone);

      if (!conversations[normalizedPhone]) {
        // Determine contact type and name using normalized phone
        let contactInfo = customerPhoneMap[normalizedPhone] || techPhoneMap[normalizedPhone];

        conversations[normalizedPhone] = {
          phone: normalizedPhone,
          displayPhone: contactInfo?.displayPhone || contactPhone,
          messages: [],
          lastMessage: null,
          contactName: contactInfo ? contactInfo.name : normalizedPhone,
          contactType: contactInfo ? contactInfo.type : 'unknown',
          leadId: fields['Related Lead'] ? fields['Related Lead'][0] : null,
        };
      }

      conversations[normalizedPhone].messages.push({
        id: msg.id,
        direction: fields.Direction,
        type: fields.Type || 'SMS',
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

    // Create "All Messages" list (combination of all)
    const allConversations = [...customersConversations, ...techsConversations, ...suppliersConversations];
    allConversations.sort(sortByLastMessage);

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
        const messageType = (lastMsg.type || 'SMS').toLowerCase();

        // Add icon based on message type
        const typeIcon = messageType === 'call' ? '📞 ' : messageType === 'email' ? '📧 ' : '';

        const preview = lastMsg.direction === 'Outbound'
          ? `You: ${typeIcon}${lastMsg.content || ''}`
          : `${typeIcon}${lastMsg.content || ''}`;
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
    const inboxStyles = `
          .inbox-wrapper {
            height: calc(100vh - 52px);
            display: flex;
            flex-direction: column;
          }
          .header {
            background: #0f1419;
            color: white;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .header h1 {
            font-size: 24px;
            font-weight: 700;
          }
          .tabs {
            display: flex;
            background: rgba(0, 212, 255, 0.1);
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
            color: rgba(255,255,255,0.6);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.3s;
          }
          .tab.active {
            background: #00d4ff;
            color: #0f1419;
            box-shadow: 0 2px 8px rgba(0, 212, 255, 0.4);
          }
          .tab:hover:not(.active) {
            background: rgba(0, 212, 255, 0.2);
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
            background: #00d4ff;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #0f1419;
            font-weight: 700;
            font-size: 20px;
            margin-right: 16px;
            flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
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
          .fab {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 60px;
            height: 60px;
            background: #00d4ff;
            border-radius: 50%;
            border: none;
            color: #0f1419;
            font-size: 28px;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(0, 212, 255, 0.5);
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .fab:hover {
            transform: scale(1.1);
            box-shadow: 0 12px 32px rgba(0, 212, 255, 0.6);
          }
          .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000;
            align-items: center;
            justify-content: center;
          }
          .modal.show {
            display: flex;
          }
          .modal-content {
            background: #1a2332;
            padding: 30px;
            border-radius: 16px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
          }
          .modal-title {
            font-size: 24px;
            font-weight: bold;
            color: white;
            margin-bottom: 24px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          .form-label {
            display: block;
            color: rgba(255, 255, 255, 0.8);
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
          }
          .form-input {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            color: white;
            font-size: 16px;
          }
          .form-input:focus {
            outline: none;
            border-color: #00d4ff;
          }
          .form-select {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            color: white;
            font-size: 16px;
          }
          .form-buttons {
            display: flex;
            gap: 12px;
            margin-top: 24px;
          }
          .btn {
            flex: 1;
            padding: 14px 24px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn-primary {
            background: #00d4ff;
            color: #0f1419;
          }
          .btn-primary:hover {
            background: #00b8d4;
          }
          .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }
          .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
          }
    `;

    const inboxBody = `
        <div class="inbox-wrapper">
        <div class="header">
          <h1>Messages</h1>
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
            <button class="tab" onclick="switchTab('all')">
              All <span class="tab-count">${allConversations.length}</span>
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
          <div class="tab-content" id="all">
            ${renderConversations(allConversations)}
          </div>
        </div>

        <!-- FAB Button -->
        <button class="fab" onclick="openAddContactModal()" title="New Message Thread">
          <span style="font-size: 28px;">+</span>
        </button>

        <!-- Add Contact Modal -->
        <div id="addContactModal" class="modal">
          <div class="modal-content">
            <h2 class="modal-title">New Message Thread</h2>
            <form id="addContactForm">
              <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" id="contactName" class="form-input" placeholder="Enter name" required>
              </div>
              <div class="form-group">
                <label class="form-label">Phone Number</label>
                <input type="tel" id="contactPhone" class="form-input" placeholder="0412 345 678" required>
              </div>
              <div class="form-group">
                <label class="form-label">Type</label>
                <select id="contactType" class="form-select" required>
                  <option value="">Select type...</option>
                  <option value="Customer">Customer</option>
                  <option value="Tech">Tech</option>
                  <option value="Supplier">Supplier</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="form-buttons">
                <button type="button" class="btn btn-secondary" onclick="closeAddContactModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Send Message</button>
              </div>
            </form>
          </div>
        </div>
        </div>
    `;

    const inboxScripts = `
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

          function openAddContactModal() {
            document.getElementById('addContactModal').classList.add('show');
          }

          function closeAddContactModal() {
            document.getElementById('addContactModal').classList.remove('show');
            document.getElementById('addContactForm').reset();
          }

          // Handle form submission
          document.getElementById('addContactForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('contactName').value;
            const phone = document.getElementById('contactPhone').value;
            const type = document.getElementById('contactType').value;

            try {
              const response = await fetch('/api/create-test-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, type })
              });

              const data = await response.json();

              if (response.ok) {
                // Redirect to the new conversation
                window.location.href = '/messages/' + encodeURIComponent(data.phone);
              } else {
                alert('Error creating message thread: ' + (data.error || 'Unknown error'));
              }
            } catch (error) {
              alert('Error creating message thread: ' + error.message);
            }
          });

          // Close modal when clicking outside
          document.getElementById('addContactModal').addEventListener('click', (e) => {
            if (e.target.id === 'addContactModal') {
              closeAddContactModal();
            }
          });
        </script>
    `;

    res.send(wrapInLayout('Messages', inboxBody, 'messages', { customStyles: inboxStyles, customScripts: inboxScripts }));
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

    // If message is longer than 1600 chars, split into chunks
    if (message.length > 1600) {
      const chunkSize = 1550; // Leave some buffer
      const chunks = [];

      for (let i = 0; i < message.length; i += chunkSize) {
        chunks.push(message.substring(i, i + chunkSize));
      }

      console.log(`📤 Splitting long message into ${chunks.length} parts`);

      // Send each chunk as separate SMS
      for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : '';
        await twilioService.sendSMS(to, prefix + chunks[i], { leadId: engagementId, type: 'manual' });

        // Small delay between messages to maintain order
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return res.status(200).json({ success: true, messagesSent: chunks.length });
    }

    // Send SMS via Twilio (this also logs to Airtable)
    await twilioService.sendSMS(to, message, { leadId: engagementId, type: 'manual' });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * Create test contact (Customer, Tech, Supplier, or Other)
 * POST /api/create-test-contact
 */
exports.createTestContact = async (req, res) => {
  try {
    const { name, phone, type } = req.body;

    if (!name || !phone || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(phone);

    // Split name into first/last
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    console.log(`Creating new message thread: ${name} (${normalizedPhone}) as ${type}`);

    // Create appropriate record based on type
    if (type === 'Customer' || type === 'Other') {
      // Create customer record
      await airtableService.createCustomer({
        firstName: firstName,
        lastName: lastName,
        email: '',
        phone: normalizedPhone,
        mobilePhone: normalizedPhone,
        notes: `Contact created via Messages interface (${type})`
      });
    } else if (type === 'Tech') {
      // Create tech record
      await airtableService.createTech({
        firstName: firstName,
        lastName: lastName,
        phone: normalizedPhone,
        email: '',
        skills: [],
        notes: 'Contact created via Messages interface'
      });
    } else if (type === 'Supplier') {
      // For suppliers, create as customer for now (can add Suppliers table later)
      await airtableService.createCustomer({
        firstName: firstName,
        lastName: lastName,
        email: '',
        phone: normalizedPhone,
        mobilePhone: normalizedPhone,
        notes: `Contact created via Messages interface (Supplier)`
      });
    }

    console.log(`✓ Message thread ready: ${name} (${normalizedPhone})`);

    res.status(200).json({
      success: true,
      phone: normalizedPhone,
      message: 'Message thread created'
    });
  } catch (error) {
    console.error('Error creating test contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
};

/**
 * API: Get messages for a conversation (for AJAX polling)
 * GET /api/messages/:phone
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const { phone } = req.params;
    const decodedPhone = decodeURIComponent(phone);
    const normalizedPhone = normalizePhone(decodedPhone);

    const allMessages = await airtableService.getAllMessages();
    const messages = allMessages.filter(msg => {
      const fields = msg.fields;
      const toNormalized = normalizePhone(fields.To);
      const fromNormalized = normalizePhone(fields.From);
      return toNormalized === normalizedPhone || fromNormalized === normalizedPhone;
    });

    messages.sort((a, b) => getTimestamp(a) - getTimestamp(b));

    const result = messages.map(msg => {
      const fields = msg.fields;
      const isOutbound = fields.Direction === 'Outbound';
      const messageType = (fields.Type || 'SMS').toLowerCase();
      const timestamp = getTimestamp(msg);

      let content = fields.Content || '';
      let hasMedia = false;
      if (content.includes('[Media]')) {
        const parts = content.split('[Media]');
        content = parts[0].trim();
        hasMedia = true;
      }

      return {
        id: msg.id,
        content,
        hasMedia,
        isOutbound,
        messageType,
        timestamp: timestamp.toISOString(),
        timeStr: timestamp.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
      };
    });

    res.json({ messages: result });
  } catch (error) {
    console.error('Error getting conversation messages:', error);
    res.status(500).json({ error: 'Failed to load messages' });
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
    const normalizedPhone = normalizePhone(decodedPhone);

    // Get all messages for this phone number (normalized matching)
    const allMessages = await airtableService.getAllMessages();
    const messages = allMessages.filter(msg => {
      const fields = msg.fields;
      const toNormalized = normalizePhone(fields.To);
      const fromNormalized = normalizePhone(fields.From);
      return toNormalized === normalizedPhone || fromNormalized === normalizedPhone;
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

    const conversationStyles = `
          .conversation-wrapper {
            height: calc(100vh - 52px);
            display: flex;
            flex-direction: column;
          }
          .header {
            background: #0f1419;
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
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
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
            white-space: pre-wrap;
            line-height: 1.4;
          }
          .message.outbound {
            background: #00d4ff;
            color: #0f1419;
            align-self: flex-end;
            margin-left: auto;
          }
          .message.inbound {
            background: #f0f4f8;
            color: #2d3748;
            align-self: flex-start;
          }
          .message.call {
            background: #ff69b4;
            color: white;
          }
          .message.email {
            background: #9333ea;
            color: white;
          }
          .message-type-label {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.8;
            margin-bottom: 4px;
          }
          .message-time {
            font-size: 11px;
            color: #999;
            margin-top: 4px;
            text-align: right;
          }
          .message.outbound .message-time {
            color: rgba(15,20,25,0.6);
          }
          .message.inbound .message-time {
            text-align: left;
            color: #a0aec0;
          }
          .message-media {
            max-width: 100%;
            max-height: 400px;
            border-radius: 12px;
            margin-top: 8px;
            display: block;
            object-fit: contain;
            cursor: pointer;
            transition: transform 0.2s;
          }
          .message-media:hover {
            transform: scale(1.02);
          }
          .message-media-placeholder {
            background: rgba(255, 255, 255, 0.1);
            border: 1px dashed rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            padding: 12px;
            margin-top: 8px;
            text-align: center;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.7);
          }
          .message-preview {
            background: rgba(255, 107, 53, 0.1);
            border: 1px solid rgba(255, 107, 53, 0.3);
            border-radius: 8px;
            padding: 15px;
            margin: 10px 20px;
            max-height: 300px;
            overflow-y: auto;
          }
          .message-preview-title {
            font-size: 12px;
            font-weight: bold;
            color: #ff6b35;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .message-preview-part {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 8px;
            font-size: 13px;
            line-height: 1.4;
            white-space: pre-wrap;
          }
          .message-preview-part:last-child {
            margin-bottom: 0;
          }
          .message-preview-label {
            font-weight: bold;
            color: #ff6b35;
            margin-bottom: 4px;
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
            border-color: #00d4ff;
          }
          .send-btn {
            background: #00d4ff;
            color: #0f1419;
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
            box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
          }
          .send-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 212, 255, 0.6);
          }
          .send-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .char-counter {
            font-size: 11px;
            color: #999;
            margin-top: 4px;
            text-align: right;
          }
          .char-counter.warning {
            color: #ff6b35;
            font-weight: bold;
          }
          .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #999;
          }
          .templates-container {
            background: rgba(0, 212, 255, 0.05);
            padding: 10px 20px;
            border-top: 1px solid rgba(0, 212, 255, 0.2);
          }
          .templates-label {
            color: rgba(255, 255, 255, 0.6);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          .template-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .template-btn {
            background: rgba(0, 212, 255, 0.15);
            color: #00d4ff;
            border: 1px solid rgba(0, 212, 255, 0.3);
            padding: 6px 12px;
            border-radius: 12px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 500;
          }
          .template-btn:hover {
            background: rgba(0, 212, 255, 0.25);
            border-color: #00d4ff;
            transform: translateY(-1px);
          }
    `;

    const conversationBody = `
        <div class="conversation-wrapper">
        <div class="header">
          <button class="back-btn" onclick="window.location.href='/messages'">&#8592;</button>
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
            const messageType = (fields.Type || 'SMS').toLowerCase();
            const timestamp = getTimestamp(msg);
            const timeStr = timestamp.toLocaleTimeString('en-AU', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });

            // Determine CSS class based on type and direction
            let messageClass = isOutbound ? 'outbound' : 'inbound';
            if (messageType === 'call') {
              messageClass += ' call';
            } else if (messageType === 'email') {
              messageClass += ' email';
            }

            // Type label for non-SMS messages
            const typeLabel = messageType !== 'sms'
              ? `<div class="message-type-label">📞 ${messageType.toUpperCase()}</div>`
              : '';

            // Adjust type label icon
            const typeIcon = messageType === 'call' ? '📞' : messageType === 'email' ? '📧' : '';
            const typeLabelFinal = messageType !== 'sms'
              ? `<div class="message-type-label">${typeIcon} ${messageType.toUpperCase()}</div>`
              : '';

            // Parse content for media URLs
            let content = fields.Content || '';
            let mediaHtml = '';

            if (content.includes('[Media]')) {
              const parts = content.split('[Media]');
              const textPart = parts[0].trim();
              const mediaPart = parts[1] || '';

              // Extract URLs from media part
              const urlRegex = /(https?:\/\/[^\s]+)/g;
              const urls = mediaPart.match(urlRegex) || [];

              // Build media HTML - images already saved to Airtable, just show placeholder
              mediaHtml = urls.map(url => {
                return '<div class="message-media-placeholder">📷 Photo attached (view in Airtable)</div>';
              }).join('');

              content = textPart;
            }

            return `
              <div class="message ${messageClass}">
                ${typeLabelFinal}
                <div class="message-content">${content}</div>
                ${mediaHtml}
                <div class="message-time">${timeStr}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div id="messagePreview" class="message-preview" style="display: none;">
          <div class="message-preview-title">Message will be sent in multiple parts:</div>
          <div id="messagePreviewContent"></div>
        </div>

        <div class="templates-container">
          <div class="templates-label">Quick Messages</div>
          <div class="template-buttons">
            <button class="template-btn" onclick="loadTemplate('photos')">Request Photos from Client</button>
            <button class="template-btn" onclick="loadTemplate('payment')">Send Payment Link to Client</button>
            <button class="template-btn" onclick="loadTemplate('paymentReceived')">Payment Received</button>
            <button class="template-btn" onclick="loadTemplate('review')">Request Review</button>
          </div>
        </div>

        <div class="input-container">
          <div style="flex: 1;">
            <textarea
              id="messageInput"
              placeholder="Type a message..."
              rows="1"
              onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }"
            ></textarea>
            <div id="charCounter" class="char-counter">0 / 1600</div>
          </div>
          <button class="send-btn" id="sendBtn" onclick="sendMessage()">&#10148;</button>
        </div>
        </div>
    `;

    const conversationScripts = `
        <script>
          const messagesContainer = document.getElementById('messagesContainer');
          const messageInput = document.getElementById('messageInput');
          const sendBtn = document.getElementById('sendBtn');

          // Template messages
          const templates = {
            photos: \`Hey ${customerName},

Ricky here from Great White Security.
Nice speaking with you!

To help us determine what's required and who to dispatch, could you please share a few photos of your system?

You can send the photos to this number.

Cheers,

Ricky\`,
            payment: \`Hi ${customerName}, thanks for sending those through.

Good news — I can have one of our technicians attend this week (or early next week).

The call-out is just $247 inc. GST, which includes travel and up to 30 minutes on site.

If more time is needed, additional labour is billed at $147 per hour inc. GST.

To secure the booking, please make payment here:
[PAYMENT_LINK]

Once payment is through, the technician will reach out to confirm a suitable time.

Thanks,
Ricky
Great White Security\`,
            paymentReceived: \`Hi ${customerName}, thanks for your payment!

The assigned technician will be in touch within the next 24 hours to schedule the booking with you.

If you have any questions in the meantime, feel free to reach out.

Thanks,
Ricky
Great White Security\`,
            review: \`Hey ${customerName}, thanks again for trusting Great White Security.

If you feel you received 5-star service, we'd really appreciate a quick Google review. It helps us get found and only takes about 20 seconds :)

Here's the link: https://g.page/r/CWLImL52RIBEEBM/review

If you need anything else, feel free to reach out anytime!

Kind regards,
Ricky (Great White Security)\`
          };

          // Scroll to bottom on load
          messagesContainer.scrollTop = messagesContainer.scrollHeight;

          // Auto-resize textarea and update character counter
          const charCounter = document.getElementById('charCounter');
          const messagePreview = document.getElementById('messagePreview');
          const messagePreviewContent = document.getElementById('messagePreviewContent');

          function updatePreview() {
            const length = messageInput.value.length;

            if (length > 1600) {
              // Show preview
              messagePreview.style.display = 'block';

              // Split message into chunks
              const chunkSize = 1550;
              const chunks = [];
              for (let i = 0; i < messageInput.value.length; i += chunkSize) {
                chunks.push(messageInput.value.substring(i, i + chunkSize));
              }

              // Generate preview HTML
              let previewHtml = '';
              chunks.forEach((chunk, index) => {
                const prefix = \`(\${index + 1}/\${chunks.length}) \`;
                previewHtml += \`
                  <div class="message-preview-part">
                    <div class="message-preview-label">Part \${index + 1} of \${chunks.length}</div>
                    \${prefix}\${chunk}
                  </div>
                \`;
              });
              messagePreviewContent.innerHTML = previewHtml;

              // Update counter
              const parts = chunks.length;
              charCounter.textContent = \`\${length} chars (will send as \${parts} messages)\`;
              charCounter.classList.add('warning');
            } else {
              // Hide preview
              messagePreview.style.display = 'none';

              // Update counter
              charCounter.textContent = \`\${length} / 1600\`;
              if (length > 1400) {
                charCounter.classList.add('warning');
              } else {
                charCounter.classList.remove('warning');
              }
            }
          }

          messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
            updatePreview();
          });

          // Load template into textarea
          function loadTemplate(templateKey) {
            const content = templates[templateKey];
            if (!content) return;

            messageInput.value = content;

            // Auto-resize
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';

            // Update preview and counter
            updatePreview();

            // Focus so user can edit
            messageInput.focus();

            // Move cursor to end
            messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
          }

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
                charCounter.textContent = '0 / 1600';
                charCounter.classList.remove('warning');
                messagePreview.style.display = 'none';
              } else {
                const errorData = await response.json();
                alert(errorData.error || 'Failed to send message. Please try again.');
              }
            } catch (error) {
              alert('Error sending message: ' + error.message);
            } finally {
              sendBtn.disabled = false;
              messageInput.disabled = false;
              messageInput.focus();
            }
          }

          // Auto-refresh messages every 30 seconds WITHOUT reloading the page
          let knownMessageIds = new Set();
          document.querySelectorAll('.message').forEach((el, i) => knownMessageIds.add(i));
          let lastMessageCount = document.querySelectorAll('.message').length;

          setInterval(async () => {
            // Don't refresh while user is typing
            if (messageInput.value.trim()) return;
            try {
              const resp = await fetch('/api/messages/${encodeURIComponent(decodedPhone)}');
              if (!resp.ok) return;
              const data = await resp.json();
              if (!data.messages || data.messages.length <= lastMessageCount) return;

              // New messages arrived — append only the new ones
              const newMessages = data.messages.slice(lastMessageCount);
              newMessages.forEach(msg => {
                let msgClass = msg.isOutbound ? 'outbound' : 'inbound';
                if (msg.messageType === 'call') msgClass += ' call';
                else if (msg.messageType === 'email') msgClass += ' email';

                const typeIcon = msg.messageType === 'call' ? '📞' : msg.messageType === 'email' ? '📧' : '';
                const typeLabel = msg.messageType !== 'sms'
                  ? \`<div class="message-type-label">\${typeIcon} \${msg.messageType.toUpperCase()}</div>\`
                  : '';
                const mediaHtml = msg.hasMedia
                  ? '<div class="message-media-placeholder">📷 Photo attached (view in Airtable)</div>'
                  : '';

                const el = document.createElement('div');
                el.className = 'message ' + msgClass;
                el.innerHTML = \`\${typeLabel}<div class="message-content">\${msg.content}</div>\${mediaHtml}<div class="message-time">\${msg.timeStr}</div>\`;
                messagesContainer.appendChild(el);
              });

              lastMessageCount = data.messages.length;
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } catch (e) {
              // Silently ignore polling errors
            }
          }, 15000);
        </script>
    `;

    res.send(wrapInLayout('Messages', conversationBody, 'messages', { customStyles: conversationStyles, customScripts: conversationScripts }));
  } catch (error) {
    console.error('Error showing conversation:', error);
    res.status(500).send('Error loading conversation');
  }
};
