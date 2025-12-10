# ETL Scripts

Pure Node.js ETL (Extract, Transform, Load) scripts for migrating reference data from test to production databases.

## Overview

These pure Node.js scripts export reference data from your test database and import it into production. **No PostgreSQL client tools (pg_dump/psql) required!**

Reference data includes:

- **Dimension Tables**: `dim.scenario`, `dim.time`
- **Catalog Tables**: `catalog.indicator`
- **Admin Tables**: `admin.local_municipality_2018` (with PostGIS geometries)

## Prerequisites

1. **Node.js & npm**: Already installed (you're using this project)
2. **Test Database**: Populated test database with reference data
3. **Production Database**: Migrations completed (`npm run db:migrate`)
4. **Environment Files**: `.env.test` (for export) and `.env` (for import)

## Usage

### Step 1: Export from Test Database

Run on your test environment:

```bash
npm run etl:export
```

This will:
- Connect to test database using `.env.test`
- Export 4 tables to `data-exports/` directory
- Create individual SQL files for each table

**Output:**
```
data-exports/
├── dim_scenario.sql
├── dim_time.sql
├── catalog_indicator.sql
└── admin_local_municipality_2018.sql
```

### Step 2: Transfer Export Files

Copy the `data-exports/` directory to your production server:

```bash
# Example using scp
scp -r data-exports/ user@prod-server:/path/to/app/

# Or commit to git if your data is not sensitive
git add data-exports/
git commit -m "Add exported reference data"
git push
```

### Step 3: Import to Production

Run on your production environment:

```bash
# Preview import (dry run)
npm run etl:import:dry-run

# Execute import
npm run etl:import
```

This will:
- Connect to production database using `.env`
- Check if tables already have data (skips if they do)
- Import data from SQL files in `data-exports/`
- Verify record counts after import

## Scripts

### export-reference-data-node.js

Exports reference tables from test database using pure Node.js and the `pg` library.

**Environment**: Test (uses `.env.test`)

**Command**: `npm run etl:export`

**Features**:
- Pure Node.js implementation (no pg_dump required)
- Exports 4 critical reference tables with PostGIS geometry support
- Shows file sizes and success/failure summary
- Creates `data-exports/` directory automatically
- Automatically detects primary keys for proper ordering

**Example Output**:
```
📦 EXPORTING REFERENCE DATA FROM TEST DATABASE
================================================================================
Source: risk_profiler_test@localhost:5432
Export Directory: /path/to/app/data-exports

▶ Exporting dim.scenario...
  Scenario dimension (6 records: census years, saps_actual, actual)
  ✓ Exported to dim_scenario.sql (0.8 KB)

▶ Exporting dim.time...
  Time dimension (14 records: years 1996-2024)
  ✓ Exported to dim_time.sql (1.2 KB)

▶ Exporting catalog.indicator...
  Indicator catalog (60 records: 44 crime + 16 other indicators)
  ✓ Exported to catalog_indicator.sql (15.4 KB)

▶ Exporting admin.local_municipality_2018...
  Municipality boundaries with PostGIS geometry (213 records)
  ✓ Exported to admin_local_municipality_2018.sql (2458.3 KB)

================================================================================
📊 EXPORT SUMMARY
================================================================================
✓ Successful: 4
✗ Failed: 0
```

### import-reference-data-node.js

Imports reference data to production database using pure Node.js and the `pg` library.

**Environment**: Production (uses `.env`)

**Commands**:
- `npm run etl:import` - Import data
- `npm run etl:import:dry-run` - Preview without importing

**Features**:
- Pure Node.js implementation (no psql required)
- Checks if tables exist (fails if migrations not run)
- Checks if tables already have data (skips to prevent duplicates)
- Executes SQL files directly via pg library
- Verifies record counts after import
- Dry-run mode for safety

**Example Output**:
```
📥 IMPORTING REFERENCE DATA TO PRODUCTION DATABASE
================================================================================
Target Database: risk_profiler_prod
User: risk_profiler_api

▶ Importing dim.scenario...
  Scenario dimension (census years, saps_actual, actual)
  Current records: 0
  ✓ Imported 6 records

▶ Importing dim.time...
  Time dimension (years 1996-2024)
  Current records: 0
  ✓ Imported 14 records

▶ Importing catalog.indicator...
  Indicator catalog (crime indicators + others)
  Current records: 0
  ✓ Imported 60 records

▶ Importing admin.local_municipality_2018...
  Municipality boundaries with PostGIS geometry
  Current records: 0
  ✓ Imported 213 records

================================================================================
📊 IMPORT SUMMARY
================================================================================
✓ Imported: 4
⊘ Skipped (already has data): 0
✗ Failed: 0

✓ Reference data import complete!

Next steps:
1. Verify data: node scripts/db-check.js
2. Import actual indicator values (data.indicator_value) if needed
3. Test API endpoints
```

## Data Safety Features

### Idempotency

The import script is designed to be idempotent:
- ✓ Safe to run multiple times
- ✓ Automatically skips tables that already have data
- ✓ Will not create duplicate records

### Skip Logic

If a table already has data:
```
▶ Importing dim.scenario...
  Current records: 6
  ⚠️  Table already has data - skipping import
    To force reimport, truncate table first: TRUNCATE dim.scenario CASCADE;
```

### Error Handling

- ✗ Missing export files → Shows clear error with instructions
- ✗ Table doesn't exist → Reminds you to run migrations first
- ✗ Connection issues → Shows PostgreSQL error details

## Troubleshooting

### Error: "Table does not exist"

**Cause**: Migrations haven't been run on production database

**Solution**: Run migrations first
```bash
npm run db:migrate
```

### Error: "Export file not found"

**Cause**: Haven't exported data from test database yet

**Solution**: Run export script on test environment
```bash
npm run etl:export
```

### Warning: "Table already has data"

**Cause**: Reference data already loaded (not an error)

**Solution**: If you need to reload:
1. Truncate table: `TRUNCATE dim.scenario CASCADE;`
2. Run import again: `npm run etl:import`

### Large File Size

The `admin_local_municipality_2018.sql` file contains PostGIS geometries and is ~43 MB. This is normal and expected.

## What About data.indicator_value?

The `data.indicator_value` table (actual indicator data) is **NOT** included in these ETL scripts because:

1. **Size**: Contains 85,000+ records, potentially much larger in production
2. **Volatility**: Data changes frequently via imports
3. **Import Methods**: Users import via:
   - Excel import API: `/import/crime-stats`
   - GeoJSON import API: `/import/crime-stats/spatial`
   - Direct database loads

To export/import indicator values separately, you would need to create a custom Node.js script similar to the reference data scripts, or use PostgreSQL client tools (pg_dump/psql) if installed.

## See Also

- [migrations/README.md](../../migrations/README.md) - Database migration scripts
- [PRODUCTION_DEPLOYMENT.md](../../PRODUCTION_DEPLOYMENT.md) - Full deployment guide
- [scripts/db-check.js](../db-check.js) - Database verification script
