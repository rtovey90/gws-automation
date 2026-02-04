/**
 * Estimator API Controller
 * Ports the Netlify serverless functions (ai-pricing, parse-invoice) to Express.
 * Also provides save/load quote endpoints for Airtable integration.
 */
const airtableService = require('../services/airtable.service');

// POST /api/estimator/ai-pricing
exports.aiPricing = async (req, res) => {
  try {
    const { userMessage, projectName, clientName, options, conversationHistory } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Server not configured: missing ANTHROPIC_API_KEY.' });
    }

    if (!userMessage || !options) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Build the options summary for the AI
    const optionsSummary = options.map(opt => {
      const itemsList = opt.items.map(item =>
        `  - ${item.description} (${item.section}): ${item.quantity} x $${item.unitPrice}`
      ).join('\n');

      return `
**${opt.name}** (ID: ${opt.tabId})
- Cost (Ex GST): $${opt.costExGST.toFixed(2)}
- Current Price (Inc GST): $${opt.currentPriceIncGST.toFixed(2)}
- Current Profit (Ex GST): $${opt.currentProfitExGST.toFixed(2)}
- Current Markup: ${opt.currentMarkup.toFixed(1)}%
- Current Margin: ${opt.currentMargin.toFixed(1)}%
- Payment Term: ${opt.paymentTerm} months
- Current Monthly: $${opt.currentMonthly.toFixed(2)}/mo
Items:
${itemsList}`;
    }).join('\n\n');

    // Build conversation messages
    const messages = [];

    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    const isFollowUp = conversationHistory && conversationHistory.length > 0;

    if (isFollowUp) {
      messages.push({
        role: 'user',
        content: `${userMessage}

Current options data for reference:
${optionsSummary}

If you're adjusting recommendations based on my feedback, respond with the same JSON structure. If you're just discussing strategy, you can respond conversationally without JSON.`
      });
    } else {
      messages.push({
        role: 'user',
        content: `Project: ${projectName}
Client: ${clientName}

My Pricing Options:
${optionsSummary}

Context from me:
${userMessage}

Give me a strategic pricing breakdown for ALL ${options.length} options. This is for ME to understand the strategy, not client-facing.

Format your response EXACTLY like this:

## MY ANCHORING STRATEGY:

**Option X: [ROLE] - [Option Name]**
- Purpose: [Why this option exists in the structure]
- Price: $X,XXX (up/down from current $X,XXX)
- Psychology: [What the client thinks when they see this]
- Margin: XX%

[Repeat for ALL options]

## THE MAGIC GAPS:
- [Option] to [Option]: $XXX jump ($XX/month) - [why this gap matters]
[List the key gaps that drive decision-making]

## YOUR PROFIT BY OPTION:
1. [Option Name]: $X,XXX profit
2. [Option Name]: $X,XXX profit ← TARGET (if applicable)
[etc]

[One sentence summary of the strategy]

Then end with this JSON (no markdown code blocks):
{
  "recommendations": [
    {
      "tabId": "tab-1",
      "name": "Option Name",
      "role": "ANCHOR/TARGET/DECOY/BUDGET",
      "costExGST": 1000.00,
      "suggestedPriceIncGST": 1500.00,
      "paymentTerm": 24,
      "reasoning": "Brief strategic reason"
    }
  ],
  "textMessageSummary": "A ready-to-send text message for the client. IMPORTANT FORMATTING: Put each option on its OWN LINE with a blank line between each. Use \\n\\n for spacing between options. Format like:\\n\\nHi [Name]! Here are your options:\\n\\n1) OPTION NAME - $X,XXX or $XX/month [emoji]\\nBrief description\\n\\n2) OPTION NAME - $X,XXX or $XX/month [emoji] POPULAR CHOICE!\\nBrief description\\n\\n[etc]\\n\\nClosing line. Present highest to lowest price. Make TARGET feel like incredible value."
}`
      });
    }

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You are a pricing strategist who specializes in Alex Hormozi-style value-based pricing and price anchoring. You help trades businesses (security, electrical, AV) price their quotes to maximize both close rates AND profit.

HORMOZI PRICING PRINCIPLES YOU APPLY:
1. **Anchor High First** - Always present the premium option first to set the reference point. Everything else feels cheaper by comparison.

2. **The Decoy Effect** - Structure pricing so one option is obviously the "smart choice." The premium anchors high, the budget option feels like you're missing out, and the middle option feels like the sweet spot.

3. **Price to Value, Not Cost** - Don't just mark up costs. Price based on the VALUE and OUTCOME the client gets. A $2,000 intercom upgrade that solves 10 years of problems is worth more than the parts cost.

4. **Make the Math Easy** - Use round numbers. $2,995 not $2,847. Monthly payments should be clean: $125/mo not $118.62/mo.

5. **Create No-Brainer Gaps** - The jump from basic to mid-tier should feel like "for just $X more, I get so much more value." Make upgrading feel stupid NOT to do.

6. **Strategic Profit Distribution** - It's OK to have lower margins on the anchor (premium) option. The goal is to make the TARGET option (where you want them to land) feel irresistible while still being very profitable for you.

WHEN GIVING RECOMMENDATIONS:
- Be conversational and explain your strategy like a coach
- Tell them exactly which option you're steering toward and why
- Explain the psychology of why each price works
- Show them the profit they'll make
- Be direct about the anchoring tactics you're using

You're not just calculating markup - you're engineering a pricing structure that makes the client feel smart choosing the option that's also great for the business.

When including JSON, output it raw without markdown code blocks.`,
        messages: messages
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.error?.message || 'API request failed' });
    }

    const data = await response.json();
    let responseText = data.content[0].text.trim();

    // Try to find JSON in the response
    let explanation = '';
    let recommendations = null;
    let textMessageSummary = '';

    const jsonMatch = responseText.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);

    if (jsonMatch) {
      const jsonStartIndex = responseText.indexOf(jsonMatch[0]);
      explanation = responseText.substring(0, jsonStartIndex).trim();

      let jsonText = jsonMatch[0];
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsed = JSON.parse(jsonText);
        recommendations = parsed.recommendations || [];
        textMessageSummary = parsed.textMessageSummary || '';
      } catch (e) {
        explanation = responseText;
      }
    } else {
      explanation = responseText;
    }

    res.json({ explanation, recommendations, textMessageSummary });
  } catch (error) {
    console.error('AI Pricing Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/estimator/parse-invoice
exports.parseInvoice = async (req, res) => {
  try {
    const { pdfBase64 } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Server not configured: missing ANTHROPIC_API_KEY.' });
    }

    if (!pdfBase64) {
      return res.status(400).json({ error: 'Missing pdfBase64' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: `Parse this supplier invoice/quotation and extract ALL line items. Return ONLY a JSON object with this exact structure (no markdown, no explanation):

{
  "supplier": "Company Name",
  "items": [
    {
      "code": "PRODUCT-CODE",
      "description": "Product description",
      "quantity": 1.5,
      "unitPriceExGST": 100.00
    }
  ]
}

Important rules:
- Extract the supplier/company name
- Include ALL line items from the invoice
- Use the unit price EXCLUDING GST (Ex GST price)
- If only Inc GST price is shown, divide by 1.1 to get Ex GST
- Quantity should be a number (convert "4.00" to 4)
- Include product codes if available
- Keep descriptions concise but complete
- Return ONLY the JSON, nothing else`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.error?.message || 'API request failed' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Parse Invoice Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/estimator/engagements — list engagements for the picker
exports.listEngagements = async (req, res) => {
  try {
    const engagements = await airtableService.getAllEngagements();

    const list = engagements.map(eng => {
      const f = eng.fields;
      // Build display name from customer name + system type
      const firstName = (f['First Name (from Customer)'] || [])[0] || '';
      const lastName = (f['Last Name (from Customer)'] || [])[0] || '';
      const customerName = [firstName, lastName].filter(Boolean).join(' ');
      const systemType = Array.isArray(f['System Type']) ? f['System Type'].join(', ') : (f['System Type'] || '');
      const name = customerName
        ? (systemType ? `${customerName} — ${systemType}` : customerName)
        : `Engagement ${eng.id.slice(-4)}`;

      return {
        id: eng.id,
        name,
        status: f.Status || '',
      };
    });

    res.json(list);
  } catch (error) {
    console.error('List Engagements Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/estimator/save-quote — save quote JSON to an engagement
exports.saveQuote = async (req, res) => {
  try {
    const { engagementId, quoteData } = req.body;

    if (!engagementId || !quoteData) {
      return res.status(400).json({ error: 'Missing engagementId or quoteData' });
    }

    // Calculate summary numbers from the quote data
    const GST_RATE = 0.10;
    let totalCost = 0;
    let partsCost = 0;
    let labourCost = 0;
    let cableCost = 0;
    let miscCost = 0;
    let totalPriceIncGST = 0;

    // Use the active tab (or first tab) for the summary numbers
    const tabId = quoteData.activeTabId || Object.keys(quoteData.tabs || {})[0];
    const tab = quoteData.tabs && quoteData.tabs[tabId];

    if (tab) {
      const labourMarkup = parseFloat(tab.labourMarkup) || 0;
      const materialsMarkup = parseFloat(tab.materialsMarkup) || 0;

      ['parts', 'labour', 'cable', 'misc'].forEach(section => {
        const items = (tab.items && tab.items[section]) || [];
        const markup = section === 'labour' ? labourMarkup : materialsMarkup;

        items.forEach(item => {
          const qty = parseFloat(item.quantity) || 0;
          const unitPrice = parseFloat(item.unitPrice) || 0;
          const cost = qty * unitPrice;
          const priceExGST = cost * (1 + markup / 100);
          const priceIncGST = priceExGST * (1 + GST_RATE);

          totalCost += cost;
          totalPriceIncGST += priceIncGST;

          if (section === 'parts') partsCost += cost;
          if (section === 'labour') labourCost += cost;
          if (section === 'cable') cableCost += cost;
          if (section === 'misc') miscCost += cost;
        });
      });
    }

    const totalPriceExGST = totalPriceIncGST / (1 + GST_RATE);
    const profit = totalPriceExGST - totalCost;

    // Save to Airtable
    // Note: 'Quote Data' long text field must be added to Engagements table in Airtable.
    // 'Quote Amount' and 'Total Cost' already exist. Other cost fields are optional.
    const updates = {
      'Quote Data': JSON.stringify(quoteData),
      'Quote Amount': Math.round(totalPriceIncGST * 100) / 100,
      'Total Cost': Math.round(totalCost * 100) / 100,
    };

    await airtableService.updateEngagement(engagementId, updates);

    res.json({
      success: true,
      summary: {
        quoteAmount: updates['Quote Amount'],
        partsCost: updates['Parts Cost'],
        laborCost: updates['Labor Cost'],
        otherCosts: updates['Other Costs'],
        totalCost: updates['Total Cost'],
        profit: Math.round(profit * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Save Quote Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/estimator/load-quote/:engagementId — load quote JSON from an engagement
exports.loadQuote = async (req, res) => {
  try {
    const { engagementId } = req.params;

    if (!engagementId) {
      return res.status(400).json({ error: 'Missing engagementId' });
    }

    const engagement = await airtableService.getEngagement(engagementId);
    const quoteDataStr = engagement.fields['Quote Data'];

    if (!quoteDataStr) {
      return res.status(404).json({ error: 'No quote data found for this engagement' });
    }

    const quoteData = JSON.parse(quoteDataStr);
    res.json(quoteData);
  } catch (error) {
    console.error('Load Quote Error:', error);
    res.status(500).json({ error: error.message });
  }
};
