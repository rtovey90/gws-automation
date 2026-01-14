# Airtable CSV Import Instructions

This is the **FASTEST** way to set up all your fields!

## How to Import (5 minutes total)

### Step 1: Techs Table
1. Open **Techs** table in Airtable
2. Click the dropdown next to "Grid view"
3. Select **"Import data"** → **"CSV file"**
4. Upload: `1-techs-structure.csv`
5. Map the columns (should auto-map)
6. Click **"Import"**
7. ✅ Done! All fields created automatically

### Step 2: Leads Table
1. Switch to **Leads** table
2. Click **"Import data"** → **"CSV file"**
3. Upload: `2-leads-structure.csv`
4. Import

### Step 3: Jobs Table
1. Switch to **Jobs** table
2. Click **"Import data"** → **"CSV file"**
3. Upload: `3-jobs-structure.csv`
4. Import

### Step 4: Messages Table
1. Switch to **Messages** table
2. Click **"Import data"** → **"CSV file"**
3. Upload: `4-messages-structure.csv`
4. Import

### Step 5: Templates Table
1. Switch to **Templates** table
2. Click **"Import data"** → **"CSV file"**
3. Upload: `5-templates-structure.csv`
4. Import

## After Import

1. **Delete the sample records** (they all say "Sample" or "Delete me")
2. **Fix field types** if needed:
   - Airtable might import everything as "Single line text"
   - Click column header → "Customize field type" → Change to correct type:
     - Phone → Phone number
     - Email → Email
     - Skills → Multiple select (add options)
     - Status fields → Single select (add options)
     - Quoted Price → Currency (AUD)
     - Dates → Date
     - Checkboxes → Checkbox

3. **Add link relationships**:
   - Leads → Linked Jobs: Link to Jobs table
   - Jobs → Lead: Link to Leads table
   - Jobs → Assigned Tech: Link to Techs table
   - Messages → Related Job: Link to Jobs table
   - Messages → Related Lead: Link to Leads table

## Total Time: ~10 minutes!

Much faster than manual field creation!
