/**
 * Export Reference Data from Test Database
 * Exports dimension and catalog data needed for production
 *
 * Usage:
 *   node scripts/etl/export-reference-data.js
 *
 * Generates SQL files in ./data-exports/ directory
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env.test for source database
const envPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('Error: .env.test file not found');
  process.exit(1);
}

const EXPORT_DIR = path.resolve(__dirname, '../../data-exports');

// Create export directory if it doesn't exist
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  console.log(`✓ Created directory: ${EXPORT_DIR}`);
}

// Build pg_dump connection string
const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 5432;
const database = process.env.DB_NAME;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;

const pgConnString = `postgresql://${user}:${password}@${host}:${port}/${database}`;

console.log('\n📦 EXPORTING REFERENCE DATA FROM TEST DATABASE');
console.log('='.repeat(80));
console.log(`Source: ${database}@${host}:${port}`);
console.log(`Export Directory: ${EXPORT_DIR}\n`);

/**
 * Export a table to SQL file using pg_dump
 */
function exportTable(schema, table, description) {
  const filename = `${schema}_${table}.sql`;
  const filepath = path.join(EXPORT_DIR, filename);

  console.log(`\n▶ Exporting ${schema}.${table}...`);
  console.log(`  ${description}`);

  try {
    const cmd = `pg_dump "${pgConnString}" \
      --no-owner \
      --no-privileges \
      --data-only \
      --table=${schema}.${table} \
      --file="${filepath}"`;

    execSync(cmd, { stdio: 'pipe' });

    const stats = fs.statSync(filepath);
    console.log(`  ✓ Exported to ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);

    return true;
  } catch (error) {
    console.error(`  ✗ Failed to export ${schema}.${table}`);
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

// Export reference tables
const tables = [
  {
    schema: 'dim',
    table: 'scenario',
    description: 'Scenario dimension (6 records: census years, saps_actual, actual)'
  },
  {
    schema: 'dim',
    table: 'time',
    description: 'Time dimension (14 records: years 1996-2024)'
  },
  {
    schema: 'catalog',
    table: 'indicator',
    description: 'Indicator catalog (60 records: 44 crime + 16 other indicators)'
  },
  {
    schema: 'admin',
    table: 'local_municipality_2018',
    description: 'Municipality boundaries with PostGIS geometry (213 records)'
  }
];

let successCount = 0;
let failCount = 0;

for (const { schema, table, description } of tables) {
  const success = exportTable(schema, table, description);
  if (success) {
    successCount++;
  } else {
    failCount++;
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 EXPORT SUMMARY');
console.log('='.repeat(80));
console.log(`✓ Successful: ${successCount}`);
console.log(`✗ Failed: ${failCount}`);

if (successCount > 0) {
  console.log('\n📁 Exported files in:', EXPORT_DIR);
  console.log('\nNext steps:');
  console.log('1. Review exported SQL files');
  console.log('2. Run: node scripts/etl/import-reference-data.js (on production environment)');
  console.log('3. Or manually import with psql:');
  console.log(`   psql <production-db-url> -f data-exports/dim_scenario.sql`);
}

console.log();
