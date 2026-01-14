# Airtable Preview System - Fields to Add

## Add These Fields to LEADS Table

### Section 1: Request Photos

**Field 1: Preview: Request Photos** (Formula field)
```
"Hi " & Name & ", Ricky here from Great White Security.\nThanks for reaching out!\n\nTo help us determine what's required and who to dispatch, could you please send a clear photo of the alarm keypad showing the fault message to this number?\n\nCheers, Ricky"
```

**Field 2: Edit: Request Photos** (Long text field)
- Leave empty unless you want to customize
- Instructions: "Edit this message if needed, otherwise leave blank to use preview"

**Field 3: Sent: Request Photos** (Checkbox)
- Checked when message is sent

**Field 4: Button Field**
- Name: "📸 Send: Request Photos"
- Triggers: Automation → Webhook to send SMS

---

### Section 2: Checking Availability

**Field 1: Preview: Checking Availability** (Formula field)
```
"Hi " & Name & ",\n\nThanks for the photos!\n\nWe're looking at availability now and will get back to you shortly with options.\n\nThanks,\nRicky"
```

**Field 2: Edit: Checking Availability** (Long text field)

**Field 3: Sent: Checking Availability** (Checkbox)

**Field 4: Button Field**
- Name: "⏰ Send: Checking Availability"

---

### Section 3: Pricing Message

**Field 1: Pricing Type** (Single select)
Options:
- Service Call - $247
- Custom Quote
- Install Quote
- Parts Required

**Field 2: Custom Price** (Currency field)
- For custom pricing amounts

**Field 3: Stripe Link** (URL field)
- Paste the Stripe payment link here

**Field 4: Preview: Pricing Message** (Formula field)
```
IF(
  {Pricing Type} = "Service Call - $247",
  "Hi " & Name & ", thank you for sending these over!\n\nGood news! I can have one of our technicians out this week to troubleshoot your alarm system.\n\nThe call-out is just $247 inc. GST, covering the first hour on-site. We'll also have tech support on standby if needed to keep things running smoothly.\nIf any parts, additional time, or upgrades are required, the technician will let me know first so I can go through the options with you directly.\n\nTo lock it in, please make payment here: " & {Stripe Link} & "\n\nOnce payment's through, I'll have the technician reach out to schedule the visit.\n\nAlternatively, if you're thinking about replacing your current system with a more reliable, modern system that includes smartphone app arm/disarm and monitoring, we have packages starting at $97/month for 24 months (interest-free).\n\nhttps://www.greatwhitesecurity.com/alarm-packages/\n\nThanks!\nRicky",

  {Pricing Type} = "Custom Quote",
  "Hi " & Name & ",\n\nThanks for sending these over!\n\n[EDIT THIS MESSAGE WITH YOUR CUSTOM QUOTE OPTIONS]\n\nLet me know which way you're leaning toward, and I'll send through the booking link or any additional details you need.\n\nThanks,\nRicky",

  "Please select a Pricing Type"
)
```

**Field 5: Edit: Pricing Message** (Long text field)
- For custom quotes, edit the preview here

**Field 6: Sent: Pricing** (Checkbox)

**Field 7: Button Field**
- Name: "💰 Send Pricing to Client"

---

## Visual Layout in Airtable

Organize these fields in sections:

**📸 Stage 1: Request Photos**
- Preview: Request Photos
- Edit: Request Photos
- Sent: Request Photos
- [Button: Send Request Photos]

**⏰ Stage 2: Check Availability**
- Preview: Checking Availability
- Edit: Checking Availability
- Sent: Checking Availability
- [Button: Send Checking Availability]

**💰 Stage 3: Send Pricing**
- Pricing Type (dropdown)
- Custom Price
- Stripe Link
- Preview: Pricing Message
- Edit: Pricing Message
- Sent: Pricing
- [Button: Send Pricing]

---

## How the Preview System Works

1. **You open a Lead**
2. **Preview fields auto-populate** with client name
3. **You review the preview**
4. **Option A:** Message looks good → Click button to send
5. **Option B:** Need to customize → Edit the "Edit" field, then click button
6. **Button sends:**
   - If "Edit" field has text → send that
   - If "Edit" field is empty → send "Preview" text
7. **Checkbox marks it as sent**

---

## Next Steps

1. Add these fields to Leads table in Airtable
2. Test the preview formulas populate correctly
3. I'll build the button automations
4. I'll update middleware to handle editable messages

**Let me know when you've added the fields and I'll set up the button automations!**
