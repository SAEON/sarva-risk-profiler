/**
 * Database Schema Analyzer
 * Extracts current database structure for migration creation
 */

const fs = require('fs');
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


async function analyzeSchema() {
  console.log('========================================');
  console.log('  Database Schema Analysis');
  console.log('========================================\n');

  try {
    // Get all schemas
    console.log('📊 SCHEMAS:');
    const schemas = await pool.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    schemas.rows.forEach(row => console.log(`  - ${row.schema_name}`));

    // Get all tables
    console.log('\n📋 TABLES BY SCHEMA:');
    const tables = await pool.query(`
      SELECT
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY table_schema, table_name
    `);

    let currentSchema = null;
    for (const table of tables.rows) {
      if (currentSchema !== table.table_schema) {
        currentSchema = table.table_schema;
        console.log(`\n  ${currentSchema}:`);
      }
      console.log(`    - ${table.table_name} (${table.table_type})`);
    }

    // Get detailed table structure for each table
    console.log('\n\n📐 TABLE STRUCTURES:\n');
    for (const table of tables.rows) {
      console.log(`\n${table.table_schema}.${table.table_name}:`);

      // Get columns
      const columns = await pool.query(`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [table.table_schema, table.table_name]);

      console.log('  Columns:');
      columns.rows.forEach(col => {
        let type = col.data_type;
        if (col.character_maximum_length) {
          type += `(${col.character_maximum_length})`;
        }
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`    ${col.column_name}: ${type} ${nullable}${defaultVal}`);
      });

      // Get indexes
      const indexes = await pool.query(`
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2
      `, [table.table_schema, table.table_name]);

      if (indexes.rows.length > 0) {
        console.log('  Indexes:');
        indexes.rows.forEach(idx => {
          console.log(`    - ${idx.indexname}`);
        });
      }

      // Get foreign keys
      const fkeys = await pool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      `, [table.table_schema, table.table_name]);

      if (fkeys.rows.length > 0) {
        console.log('  Foreign Keys:');
        fkeys.rows.forEach(fk => {
          console.log(`    ${fk.column_name} → ${fk.foreign_table_schema}.${fk.foreign_table_name}(${fk.foreign_column_name})`);
        });
      }
    }

    // Get all views
    console.log('\n\n👁️  VIEWS:');
    const views = await pool.query(`
      SELECT
        table_schema,
        table_name
      FROM information_schema.views
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    if (views.rows.length > 0) {
      currentSchema = null;
      for (const view of views.rows) {
        if (currentSchema !== view.table_schema) {
          currentSchema = view.table_schema;
          console.log(`\n  ${currentSchema}:`);
        }
        console.log(`    - ${view.table_name}`);
      }
    } else {
      console.log('  (none)');
    }

    // Check for PostGIS
    console.log('\n\n🗺️  POSTGIS:');
    const postgis = await pool.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'postgis'
    `);
    if (postgis.rows.length > 0) {
      console.log(`  ✓ PostGIS ${postgis.rows[0].extversion} installed`);
    } else {
      console.log('  ✗ PostGIS not installed');
    }

    // Get sequences
    console.log('\n📊 SEQUENCES:');
    const sequences = await pool.query(`
      SELECT sequence_schema, sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY sequence_schema, sequence_name
    `);
    if (sequences.rows.length > 0) {
      sequences.rows.forEach(seq => {
        console.log(`  - ${seq.sequence_schema}.${seq.sequence_name}`);
      });
    } else {
      console.log('  (none)');
    }

    console.log('\n========================================');
    console.log('  Analysis Complete');
    console.log('========================================\n');

  } catch (error) {
    console.error('Error analyzing schema:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run analysis
analyzeSchema();
