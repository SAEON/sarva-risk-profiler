## Database Migrations

This directory contains numbered SQL migration files that set up the production database schema.

**Important**:
- These migrations create ONLY the tables and schemas that are actively used by the application code
- Migrations are **fully idempotent** - safe to run multiple times or on existing databases
- Uses `CREATE ... IF NOT EXISTS` - won't fail if schemas/tables already exist
- Verification checks use warnings instead of errors - migrations won't fail on existing structures

## Migration Order

Migrations must be run in numerical order:

1. **001_create_schemas_and_extensions.sql** - Creates 4 schemas (admin, catalog, data, dim) and enables PostGIS
2. **002_create_dimension_tables.sql** - Creates dim.scenario and dim.time tables
3. **003_create_catalog_tables.sql** - Creates catalog.indicator table
4. **004_create_admin_tables.sql** - Creates admin.local_municipality_2018 with PostGIS geometry
5. **005_create_data_tables.sql** - Creates data.indicator_value fact table

## Running Migrations

### On a fresh database
```bash
# Preview migrations (dry run)
npm run db:migrate:dry-run

# Execute all migrations
npm run db:migrate
```

### On an existing database (with some tables already present)
Migrations are safe to run - they will:
- ✅ Skip creating schemas/tables that already exist
- ✅ Show warnings (not errors) if structures are missing
- ✅ Create only what's needed
- ✅ Not overwrite existing data

```bash
# Safe to run even if some tables exist
npm run db:migrate
```

### Manual execution (if needed)
```bash
psql -h <host> -U <user> -d <database> -f migrations/001_create_schemas_and_extensions.sql
psql -h <host> -U <user> -d <database> -f migrations/002_create_dimension_tables.sql
# ... continue for each migration
```

## After Migrations

Once migrations are complete, load reference data from your test database:

```bash
# 1. Export reference data from test database
pg_dump -h test-db -U user -d risk_profiler_test \
  -t dim.scenario \
  -t dim.time \
  -t catalog.indicator \
  -t admin.local_municipality_2018 \
  --data-only > reference_data.sql

# 2. Import to production
psql -h prod-db -U user -d risk_profiler_prod < reference_data.sql

# 3. Export indicator values (optional - can import via API instead)
pg_dump -h test-db -U user -d risk_profiler_test \
  -t data.indicator_value \
  --data-only > indicator_data.sql

psql -h prod-db -U user -d risk_profiler_prod < indicator_data.sql
```

## Database Structure

After migrations, your database will have:

### Schemas
- **admin** - Administrative boundaries
- **catalog** - Indicator metadata
- **data** - Fact tables for indicator values
- **dim** - Dimension tables (time, scenario)

### Tables Created
- `dim.scenario` (3-5 rows) - Data scenarios (saps_actual, baseline, etc.)
- `dim.time` (29 rows) - Time periods (1996-2024)
- `catalog.indicator` (40-50 rows) - Indicator definitions
- `admin.local_municipality_2018` (234 rows) - Municipality boundaries with PostGIS geometries
- `data.indicator_value` (millions of rows) - Fact table for indicator data

### What's NOT Included

These migrations do NOT create:
- ❌ catalog.index* tables (composite indices - not used by API)
- ❌ data.index_value (calculated indices - not implemented)
- ❌ admin.entity_alias (municipality aliases - not used)
- ❌ admin.police_district (police boundaries - not used)
- ❌ admin.lm_2018_s1/s2 (simplified geometries - not used)
- ❌ staging.* tables (ETL staging - not needed for production)

If you need these tables in the future, they can be added via additional migrations.

## Production Deployment

For production deployment:

1. Set up PostgreSQL database with PostGIS extension
2. Configure environment variables in `.env.production`:
   ```
   DB_HOST=your-prod-db-host
   DB_PORT=5432
   DB_NAME=risk_profiler_prod
   DB_USER=risk_profiler_user
   DB_PASSWORD=secure-password
   ```
3. Run migrations: `npm run db:migrate`
4. Load reference data using pg_dump/psql commands above
5. Import indicator data via API or bulk load

## Rollback Strategy

These migrations do not include rollback scripts. For production:
- Take database backup before running migrations
- Test migrations on staging environment first
- Keep previous database version until new deployment is verified

## Adding New Migrations

When adding new migrations:
1. Create new file with next number: `006_description.sql`
2. Follow same format with header, verification, and comments
3. Update `scripts/migrate.js` to include new migration
4. Test on development database first
5. Ensure new migrations only create tables/schemas that are actually used by the code
