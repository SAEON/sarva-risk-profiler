/**
 * Import Reference Data to Production Database
 * Imports dimension and catalog data exported from test database
 *
 * Usage:
 *   node scripts/etl/import-reference-data.js              # Import all tables
 *   node scripts/etl/import-reference-data.js --dry-run    # Preview only
 *
 * Prerequisites:
 *   1. Run migrations first: npm run db:migrate
 *   2. Export data from test: node scripts/etl/export-reference-data.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load .env for production database
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('Error: .env file not found');
  process.exit(1);
}

const EXPORT_DIR = path.resolve(__dirname, '../../data-exports');
const isDryRun = process.argv.includes('--dry-run');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
});

console.log('\n📥 IMPORTING REFERENCE DATA TO PRODUCTION DATABASE');
console.log('='.repeat(80));

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No data will be imported\n');
}

/**
 * Check if table has data
 */
async function checkTableData(schema, table) {
  try {
    const result = await pool.query(`SELECT COUNT(*) as count FROM ${schema}.${table}`);
    return parseInt(result.rows[0].count);
  } catch (error) {
    return -1; // Table doesn't exist
  }
}

/**
 * Import a SQL file
 */
async function importTable(schema, table, description) {
  const filename = `${schema}_${table}.sql`;
  const filepath = path.join(EXPORT_DIR, filename);

  console.log(`\n▶ Importing ${schema}.${table}...`);
  console.log(`  ${description}`);

  // Check if export file exists
  if (!fs.existsSync(filepath)) {
    console.error(`  ✗ Export file not found: ${filename}`);
    console.error(`    Run: node scripts/etl/export-reference-data.js`);
    return false;
  }

  // Check current record count
  const currentCount = await checkTableData(schema, table);
  if (currentCount === -1) {
    console.error(`  ✗ Table ${schema}.${table} does not exist`);
    console.error(`    Run migrations first: npm run db:migrate`);
    return false;
  }

  console.log(`  Current records: ${currentCount}`);

  if (currentCount > 0) {
    console.log(`  ⚠️  Table already has data - skipping import`);
    console.log(`    To force reimport, truncate table first: TRUNCATE ${schema}.${table} CASCADE;`);
    return true; // Not an error, just skipped
  }

  if (isDryRun) {
    console.log(`  [DRY RUN] Would import from ${filename}`);
    return true;
  }

  // Build psql connection string
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 5432;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  const pgConnString = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  try {
    execSync(`psql "${pgConnString}" -f "${filepath}" -q`, { stdio: 'pipe' });

    // Verify import
    const newCount = await checkTableData(schema, table);
    console.log(`  ✓ Imported ${newCount} records`);

    return true;
  } catch (error) {
    console.error(`  ✗ Failed to import ${schema}.${table}`);
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    // Test database connection
    const result = await pool.query('SELECT current_database(), current_user');
    console.log(`Target Database: ${result.rows[0].current_database}`);
    console.log(`User: ${result.rows[0].current_user}\n`);

    // Check export directory exists
    if (!fs.existsSync(EXPORT_DIR)) {
      console.error('✗ Export directory not found:', EXPORT_DIR);
      console.error('  Run: node scripts/etl/export-reference-data.js');
      process.exit(1);
    }

    // Import reference tables in order (respecting dependencies)
    const tables = [
      {
        schema: 'dim',
        table: 'scenario',
        description: 'Scenario dimension (census years, saps_actual, actual)'
      },
      {
        schema: 'dim',
        table: 'time',
        description: 'Time dimension (years 1996-2024)'
      },
      {
        schema: 'catalog',
        table: 'indicator',
        description: 'Indicator catalog (crime indicators + others)'
      },
      {
        schema: 'admin',
        table: 'local_municipality_2018',
        description: 'Municipality boundaries with PostGIS geometry'
      }
    ];

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const { schema, table, description } of tables) {
      const success = await importTable(schema, table, description);
      if (success) {
        const count = await checkTableData(schema, table);
        if (count > 0) {
          successCount++;
        } else {
          skippedCount++;
        }
      } else {
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(80));
    console.log(`✓ Imported: ${successCount}`);
    console.log(`⊘ Skipped (already has data): ${skippedCount}`);
    console.log(`✗ Failed: ${failCount}`);

    if (successCount > 0) {
      console.log('\n✓ Reference data import complete!');
      console.log('\nNext steps:');
      console.log('1. Verify data: node scripts/db-check.js');
      console.log('2. Import actual indicator values (data.indicator_value) if needed');
      console.log('3. Test API endpoints');
    }

    console.log();
    process.exit(failCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n✗ Import failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
