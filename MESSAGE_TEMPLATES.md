# Message Templates for Airtable

Add these to your **Templates** table in Airtable:

---

## Template 1: Request Photos
**Name:** Request Photos from Client
**Type:** SMS to Client
**Active:** TRUE

**Content:**
```
Hi {{CLIENT_NAME}}, Ricky here from Great White Security.
Thanks for reaching out!

To help us determine what's required and who to dispatch, could you please send a clear photo of the alarm keypad showing the fault message to this number?

Cheers, Ricky
```

---

## Template 2: Service Call Pricing ($247)
**Name:** Service Call - $247 Standard
**Type:** SMS to Client
**Active:** TRUE

**Content:**
```
Hi {{CLIENT_NAME}}, thank you for sending these over!

Good news! I can have one of our technicians out this week to troubleshoot your alarm system.

The call-out is just $247 inc. GST, covering the first hour on-site. We'll also have tech support on standby if needed to keep things running smoothly.
If any parts, additional time, or upgrades are required, the technician will let me know first so I can go through the options with you directly.

To lock it in, please make payment here: {{STRIPE_LINK}}

Once payment's through, I'll have the technician reach out to schedule the visit.

Alternatively, if you're thinking about replacing your current system with a more reliable, modern system that includes smartphone app arm/disarm and monitoring, we have packages starting at $97/month for 24 months (interest-free).

https://www.greatwhitesecurity.com/alarm-packages/

Thanks!
Ricky
```

---

## Template 3: Custom Quote (Multiple Options)
**Name:** Custom Quote - Multiple Options
**Type:** SMS to Client
**Active:** TRUE

**Content:**
```
Hi {{CLIENT_NAME}},

Thanks for sending these over!

Good news! Your system is around {{SYSTEM_AGE}} years old but you've got a few good options here.

{{OPTION_1}}

{{OPTION_2}}

{{OPTION_3}}

{{PRICING_BREAKDOWN}}

All options assume existing equipment and cabling are in good working order and cameras are accessible via step ladder.

Let me know which way you're leaning toward, and I'll send through the booking link or any additional details you need.

Thanks,
Ricky
```

*Note: This template needs manual editing for each job - use as starting point*

---

## Template 4: Payment Received - Tech Will Call
**Name:** Payment Received Confirmation
**Type:** SMS to Client
**Active:** TRUE

**Content:**
```
Hi {{CLIENT_NAME}},

Thanks for your payment!

{{TECH_NAME}} will be reaching out within the next 24 hours to confirm a time that works for you.

Thanks,
Ricky
```

---

## Template 5: Review Request
**Name:** Review Request After Completion
**Type:** SMS to Client
**Active:** TRUE

**Content:**
```
Hey {{CLIENT_NAME}}, thanks again for trusting Great White Security.

If you feel you received 5-star service, we'd really appreciate a quick Google review. It helps us get found and only takes about 20 seconds :)

Here's the link: https://g.page/r/CWLImL52RIBEEBM/review

If you'd be interested in looking at potentially having {{SUGGESTED_SERVICE}} installed, or need anything else, feel free to reach out anytime!

Thanks,
Ricky
```

---

## Template 6: Job Offer to Tech
**Name:** Job Offer to Tech
**Type:** SMS to Tech
**Active:** TRUE

**Content:**
```
Hey {{TECH_NAME}}, Ricky here.

I have a job if you're interested:

Client: {{CLIENT_NAME}}
Location: {{CLIENT_ADDRESS}}
Issue: {{JOB_SCOPE}}

Payment: ${{TECH_PAYMENT}} for first hour, paid same day.

Accept here: {{ACCEPT_LINK}}

First to accept gets it!
```

---

## Template 7: Job Details to Tech (After Payment)
**Name:** Job Details After Payment
**Type:** SMS to Tech
**Active:** TRUE

**Content:**
```
Hey {{TECH_NAME}},

Payment received for the {{CLIENT_ADDRESS}} job!

Client: {{CLIENT_NAME}}
Phone: {{CLIENT_PHONE}}
Address: {{CLIENT_ADDRESS}}

Job Details:
{{JOB_SCOPE}}

Please call the client within 24 hours to schedule.

Use this link to update job status: {{UPDATE_LINK}}

Thanks!
```

---

## Template 8: Checking Availability
**Name:** Checking Availability Message
**Type:** SMS to Client
**Active:** TRUE

**Content:**
```
Hi {{CLIENT_NAME}},

Thanks for the photos!

We're looking at availability now and will get back to you shortly with options.

Thanks,
Ricky
```

---

## Variables Available:
- `{{CLIENT_NAME}}` - Client name from Lead
- `{{CLIENT_PHONE}}` - Client phone
- `{{CLIENT_ADDRESS}}` - Client address
- `{{TECH_NAME}}` - Assigned tech name
- `{{TECH_PHONE}}` - Tech phone
- `{{STRIPE_LINK}}` - Stripe payment link
- `{{ACCEPT_LINK}}` - Tech acceptance link
- `{{UPDATE_LINK}}` - Tech update form link
- `{{JOB_SCOPE}}` - Scope of work
- `{{TECH_PAYMENT}}` - Tech payment amount
- `{{SYSTEM_AGE}}` - Age of client's system
- `{{SUGGESTED_SERVICE}}` - Suggested upsell service
- `{{PRICE}}` - Custom price amount
- `{{OPTION_1}}, {{OPTION_2}}, {{OPTION_3}}` - Custom options
- `{{PRICING_BREAKDOWN}}` - Custom pricing details

---

## Next Steps:
1. Add these templates to Airtable Templates table
2. Set up button automations that use these templates
3. Build preview system so you can see/edit before sending
