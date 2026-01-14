# Airtable Setup Guide - Quick Reference

## Table 1: Leads

**Fields to add (in order):**
1. Name - Single line text
2. Phone - Phone number
3. Email - Email
4. Address/Location - Single line text
5. Source - Single select (options: Call, Form, Email, Referral)
6. Status - Single select (options: New, Contacted, Quoted, Won, Lost)
7. Service Type - Single select (options: CCTV, Alarm, Access Control, Intercom, Complete Package, Other)
8. Notes - Long text
9. Original Transcript/Form Data - Long text
10. Created Date - Created time
11. Business - Single select (options: Great White Security, The Alarm Guy, Great White Electrical)
12. Linked Jobs - Link to another record → Select "Jobs" table
13. Previous Jobs Count - Count (rollup from Linked Jobs)
14. Client Notes - Long text

---

## Table 2: Jobs

**Fields to add (in order):**
1. Lead - Link to another record → Select "Leads" table
2. Client Name - Lookup (from Lead → Name)
3. Client Phone - Lookup (from Lead → Phone)
4. Client Email - Lookup (from Lead → Email)
5. Client Address - Single line text
6. Job Status - Single select (options: Draft, Awaiting Tech, Tech Assigned, Awaiting Payment, Payment Received, Scheduled, In Progress, Completed, Needs Follow-up)
7. Assigned Tech - Link to another record → Select "Techs" table
8. Scope of Work - Long text
9. Quoted Price - Currency (AUD)
10. Payment Status - Single select (options: Not Sent, Awaiting Payment, Paid)
11. Stripe Payment Link - URL
12. Stripe Payment ID - Single line text
13. Auto-Send Pricing - Checkbox
14. Scheduled Date - Date
15. Completion Date - Date
16. Tech Notes - Long text
17. Photos - Attachment
18. Activity Log - Long text
19. Parts Used - Long text
20. Parts Cost - Currency (AUD)
21. Review Requested - Checkbox
22. Review Received - Checkbox
23. Review Link - Single line text
24. Created Date - Created time
25. Last Modified - Last modified time

---

## Table 3: Techs

**Fields to add (in order):**
1. Name - Single line text
2. Phone - Phone number
3. Email - Email
4. Skills - Multiple select (options: Bosch Alarms, Dahua CCTV, Hikvision CCTV, Intercoms, Access Control, AJAX Alarms, Paradox, DSC, Others)
5. Availability Status - Single select (options: Available, Busy, Unavailable)
6. Active Jobs - Link to another record → Select "Jobs" table
7. Completed Jobs Count - Count (rollup from Active Jobs where Status = Completed)
8. Rating - Number (0-5)
9. Notes - Long text

---

## Table 4: Messages

**Fields to add (in order):**
1. Related Job - Link to another record → Select "Jobs" table
2. Related Lead - Link to another record → Select "Leads" table
3. Direction - Single select (options: Outbound, Inbound)
4. Type - Single select (options: SMS, Email, Call)
5. To - Single line text
6. From - Single line text
7. Content - Long text
8. Status - Single select (options: Sent, Delivered, Failed)
9. Timestamp - Created time

---

## Table 5: Templates

**Fields to add (in order):**
1. Name - Single line text
2. Type - Single select (options: SMS to Tech, SMS to Client, Email)
3. Content - Long text
4. Active - Checkbox

---

## Quick Tips:

**Adding a field:**
1. Click the **"+"** at the end of the column headers
2. Choose field type
3. Name it exactly as shown above (case-sensitive!)
4. Configure options if needed

**For Single Select fields:**
- After creating, click the dropdown → "Customize field type"
- Add all options listed

**For Link fields:**
- Choose "Link to another record"
- Select or create the table to link to

**For Lookup/Rollup fields:**
- Choose the linked record field first
- Then select what to lookup/rollup

---

## Verification Checklist:

- [ ] Leads table: 14 fields
- [ ] Jobs table: 25 fields
- [ ] Techs table: 9 fields
- [ ] Messages table: 9 fields
- [ ] Templates table: 4 fields
- [ ] All field names match exactly (including capitals, spaces, dashes)
- [ ] All link relationships are correct
- [ ] All single select options are added

---

## Next: Add Sample Data

**Add yourself as a tech:**
1. Go to Techs table
2. Add new record:
   - Name: [Your name or test tech]
   - Phone: +61400000000
   - Email: test@example.com
   - Skills: Select a few
   - Availability Status: Available

**Create a test template:**
1. Go to Templates table
2. Add new record:
   - Name: Job Offer
   - Type: SMS to Tech
   - Content: "Hey {{TECH_NAME}}, job available: {{SCOPE}}"
   - Active: Check the box

This validates your setup is working!
