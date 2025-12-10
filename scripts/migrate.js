/**
 * Database Migration Runner
 * Executes SQL migration files in order to set up production database
 *
 * Usage:
 *   node scripts/migrate.js              # Run all migrations
 *   node scripts/migrate.js --dry-run    # Preview without executing
 */

const fs = require('fs');
const { readFile } = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('Error: .env file not found');
  process.exit(1);
}

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

/**
 * Run a single migration file
 * @param {string} filename - Migration file name
 * @returns {Promise<void>}
 */
async function runMigration(filename) {
  const filePath = path.resolve(MIGRATIONS_DIR, filename);

  console.log(`\n▶ Running migration: ${filename}`);

  try {
    const sql = await readFile(filePath, 'utf8');

    if (isDryRun) {
      console.log(`  [DRY RUN] Would execute SQL from ${filename}`);
      console.log(`  SQL preview (first 200 chars):`);
      console.log(`  ${sql.substring(0, 200).replace(/\n/g, '\n  ')}...`);
      return;
    }

    // Execute the SQL
    await pool.query(sql);

    console.log(`✓ Migration completed: ${filename}`);
  } catch (error) {
    console.error(`✗ Migration failed: ${filename}`);
    console.error(`  Error: ${error.message}`);
    throw error;
  }
}

/**
 * Clean up existing database artifacts
 * Only drops tables and functions that our migrations will create
 */
async function cleanupDatabase() {
  console.log('\n🧹 Cleaning up existing database artifacts...');

  // List of specific tables to drop (in reverse order of dependencies)
  const tables = [
    'data.indicator_value',
    'admin.local_municipality_2018',
    'catalog.indicator',
    'dim.time',
    'dim.scenario'
  ];

  // List of functions to drop (these also drop their triggers)
  const functions = [
    'data.update_timestamp()',
    'admin.update_timestamp()',
    'catalog.update_timestamp()',
    'dim.update_timestamp()'
  ];

  // Drop tables
  for (const table of tables) {
    if (isDryRun) {
      console.log(`  [DRY RUN] Would drop table: ${table} CASCADE`);
    } else {
      try {
        await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`  ✓ Dropped table: ${table}`);
      } catch (error) {
        console.error(`  ⚠️  Failed to drop table ${table}: ${error.message}`);
      }
    }
  }

  // Drop functions (this also drops associated triggers)
  for (const func of functions) {
    if (isDryRun) {
      console.log(`  [DRY RUN] Would drop function: ${func} CASCADE`);
    } else {
      try {
        await pool.query(`DROP FUNCTION IF EXISTS ${func} CASCADE`);
        console.log(`  ✓ Dropped function: ${func}`);
      } catch (error) {
        console.error(`  ⚠️  Failed to drop function ${func}: ${error.message}`);
      }
    }
  }

  console.log('✓ Cleanup completed\n');
}

/**
 * Main migration runner
 */
async function main() {
  console.log('========================================');
  console.log('  SARVA Risk Profiler - Database Setup');
  console.log('========================================\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Test database connection
    console.log('Testing database connection...');
    const result = await pool.query('SELECT current_database(), current_user');
    console.log(`✓ Connected to database: ${result.rows[0].current_database}`);

    // Clean up existing artifacts before migrating
    await cleanupDatabase();

    const migrations = [
      '001_create_schemas_and_extensions.sql',
      '002_create_dimension_tables.sql',
      '003_create_catalog_tables.sql',
      '004_create_admin_tables.sql',
      '005_create_data_tables.sql',
    ];

    console.log(`Found ${migrations.length} migration(s) to run\n`);

    for (const migration of migrations) {
      await runMigration(migration);
    }

    if (isDryRun) {
      console.log('\n========================================');
      console.log('  🔍 Dry run completed');
      console.log('  Run without --dry-run to execute');
      console.log('========================================\n');
      return;
    }

    console.log('\n========================================');
    console.log('  ✓ All migrations completed successfully');
    console.log('========================================\n');

    // Verify schemas were created
    const schemas = await pool.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name IN ('admin', 'catalog', 'data', 'dim')
      ORDER BY schema_name
    `);

    console.log('Created schemas:');
    schemas.rows.forEach(row => {
      console.log(`  - ${row.schema_name}`);
    });

    // Verify critical tables were created
    const tables = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('admin', 'catalog', 'data', 'dim')
      AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);

    console.log(`\nCreated ${tables.rows.length} tables:`);
    let currentSchema = null;
    for (const table of tables.rows) {
      if (currentSchema !== table.table_schema) {
        currentSchema = table.table_schema;
        console.log(`\n  ${currentSchema}:`);
      }
      console.log(`    - ${table.table_name}`);
    }

    // Verify PostGIS extension
    const postgis = await pool.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'postgis'
    `);

    console.log('\nExtensions:');
    if (postgis.rows.length > 0) {
      console.log(`  - PostGIS ${postgis.rows[0].extversion}`);
    }

    console.log('\n========================================');
    console.log('  🎉 Database is ready for data loading');
    console.log('========================================\n');
    console.log('Next steps:');
    console.log('  1. Load reference data from test database:');
    console.log('     pg_dump -h test-db -U user -d risk_profiler_test \\');
    console.log('       -t dim.scenario -t dim.time -t catalog.indicator \\');
    console.log('       -t admin.local_municipality_2018 --data-only > reference_data.sql');
    console.log('');
    console.log('     psql -h prod-db -U user -d risk_profiler_prod < reference_data.sql');
    console.log('');
    console.log('  2. Load indicator values from test database:');
    console.log('     pg_dump -h test-db -U user -d risk_profiler_test \\');
    console.log('       -t data.indicator_value --data-only > indicator_data.sql');
    console.log('');
    console.log('     psql -h prod-db -U user -d risk_profiler_prod < indicator_data.sql');
    console.log('');
    console.log('  3. Or import new data via API:');
    console.log('     curl -X POST http://localhost:4001/import/crime-stats \\');
    console.log('       -F "file=@crime-data.xlsx"\n');

  } catch (error) {
    console.error('\n✗ Migration process failed');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('\n✗ Unhandled error:');
  console.error(error);
  process.exit(1);
});

// Run migrations
main();
