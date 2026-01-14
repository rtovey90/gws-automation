# Ultra-Quick Field Setup Guide

## Start with TECHS table (easiest)

**Delete the default fields first:**
1. Click on "Notes" column header → "Delete field"
2. Delete "Assignee"
3. Delete "Status"
4. Delete "Attachments"
5. Keep "Name" (already there!)

**Now add these 8 fields by clicking the "+" button:**

| Field Name | Type | Configuration |
|------------|------|---------------|
| Phone | Phone number | Leave default |
| Email | Email | Leave default |
| Skills | Multiple select | Add options: `Bosch Alarms`, `Dahua CCTV`, `Hikvision CCTV`, `Intercoms`, `Access Control`, `AJAX Alarms`, `Paradox`, `DSC` |
| Availability Status | Single select | Add options: `Available`, `Busy`, `Unavailable` |
| Active Jobs | Link to another record | Link to: "Jobs" table (create it first if needed) |
| Completed Jobs Count | Count | This will be rollup - skip for now, add after Jobs table exists |
| Rating | Number | Precision: 1 decimal place |
| Notes | Long text | Leave default |

**Quick Steps:**
1. Click "+" at end of headers
2. Type field name
3. Select type from dropdown
4. For Single/Multiple select: click "Add option" and type each option
5. Click "Create field"

**Time: ~3 minutes for Techs table!**

---

## LEADS Table (14 fields)

**Rename "Name" → keep as is**

| # | Field Name | Type | Configuration |
|---|------------|------|---------------|
| 1 | Name | Single line text | (already there) |
| 2 | Phone | Phone number | |
| 3 | Email | Email | |
| 4 | Address/Location | Single line text | |
| 5 | Source | Single select | Options: `Call`, `Form`, `Email`, `Referral` |
| 6 | Status | Single select | Options: `New`, `Contacted`, `Quoted`, `Won`, `Lost` |
| 7 | Service Type | Single select | Options: `CCTV`, `Alarm`, `Access Control`, `Intercom`, `Complete Package`, `Other` |
| 8 | Notes | Long text | |
| 9 | Original Transcript/Form Data | Long text | |
| 10 | Created Date | Created time | |
| 11 | Business | Single select | Options: `Great White Security`, `The Alarm Guy`, `Great White Electrical` |
| 12 | Linked Jobs | Link to another record | Link to: "Jobs" |
| 13 | Previous Jobs Count | Count | Link: Linked Jobs |
| 14 | Client Notes | Long text | |

**Time: ~5 minutes**

---

## JOBS Table (25 fields - the big one!)

| # | Field Name | Type | Configuration |
|---|------------|------|---------------|
| 1 | Lead | Link to another record | Link to: "Leads" |
| 2 | Client Name | Lookup | From: Lead → Name |
| 3 | Client Phone | Lookup | From: Lead → Phone |
| 4 | Client Email | Lookup | From: Lead → Email |
| 5 | Client Address | Single line text | |
| 6 | Job Status | Single select | Options: `Draft`, `Awaiting Tech`, `Tech Assigned`, `Awaiting Payment`, `Payment Received`, `Scheduled`, `In Progress`, `Completed`, `Needs Follow-up` |
| 7 | Assigned Tech | Link to another record | Link to: "Techs" |
| 8 | Scope of Work | Long text | |
| 9 | Quoted Price | Currency | Format: Australian Dollar (AUD) |
| 10 | Payment Status | Single select | Options: `Not Sent`, `Awaiting Payment`, `Paid` |
| 11 | Stripe Payment Link | URL | |
| 12 | Stripe Payment ID | Single line text | |
| 13 | Auto-Send Pricing | Checkbox | |
| 14 | Scheduled Date | Date | Include time: No |
| 15 | Completion Date | Date | Include time: No |
| 16 | Tech Notes | Long text | |
| 17 | Photos | Attachment | |
| 18 | Activity Log | Long text | |
| 19 | Parts Used | Long text | |
| 20 | Parts Cost | Currency | Format: AUD |
| 21 | Review Requested | Checkbox | |
| 22 | Review Received | Checkbox | |
| 23 | Review Link | Single line text | |
| 24 | Created Date | Created time | |
| 25 | Last Modified | Last modified time | |

**Time: ~10 minutes**

---

## MESSAGES Table (9 fields)

| # | Field Name | Type | Configuration |
|---|------------|------|---------------|
| 1 | Related Job | Link to another record | Link to: "Jobs" |
| 2 | Related Lead | Link to another record | Link to: "Leads" |
| 3 | Direction | Single select | Options: `Outbound`, `Inbound` |
| 4 | Type | Single select | Options: `SMS`, `Email`, `Call` |
| 5 | To | Single line text | |
| 6 | From | Single line text | |
| 7 | Content | Long text | |
| 8 | Status | Single select | Options: `Sent`, `Delivered`, `Failed` |
| 9 | Timestamp | Created time | |

**Time: ~3 minutes**

---

## TEMPLATES Table (4 fields - super quick!)

| # | Field Name | Type | Configuration |
|---|------------|------|---------------|
| 1 | Name | Single line text | (rename default "Name") |
| 2 | Type | Single select | Options: `SMS to Tech`, `SMS to Client`, `Email` |
| 3 | Content | Long text | |
| 4 | Active | Checkbox | |

**Time: ~2 minutes**

---

## TOTAL TIME: ~25 minutes for all 5 tables!

## After Fields Are Set Up:

Import the sample data CSVs I created:
- `techs-sample-data.csv` - 3 sample techs

This will give you test data to work with immediately!
