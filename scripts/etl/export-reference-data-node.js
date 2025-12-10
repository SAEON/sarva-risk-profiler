/**
 * Export Reference Data from Test Database (Pure Node.js)
 * Uses pg library to export data without requiring pg_dump
 *
 * Usage:
 *   node scripts/etl/export-reference-data-node.js
 *
 * Generates SQL files in ./data-exports/ directory
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load .env.test for source database (override any existing env vars)
const envPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
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

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
});

console.log('\n📦 EXPORTING REFERENCE DATA FROM TEST DATABASE (Node.js)');
console.log('='.repeat(80));
console.log(`Source: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
console.log(`Export Directory: ${EXPORT_DIR}\n`);

/**
 * Escape SQL string value
 */
function escapeSqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  // For strings and everything else
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Generate INSERT statements for table data
 */
async function generateInserts(schema, table, rows, columns) {
  if (rows.length === 0) {
    return `-- No data to insert for ${schema}.${table}\n`;
  }

  let sql = '';
  sql += `--\n`;
  sql += `-- Data for Name: ${table}; Type: TABLE DATA; Schema: ${schema}\n`;
  sql += `--\n\n`;

  // Special handling for PostGIS geometry columns
  const hasGeometry = columns.some(col =>
    col.data_type === 'USER-DEFINED' && (col.udt_name === 'geometry' || col.udt_name === 'geography')
  );

  for (const row of rows) {
    const columnNames = Object.keys(row);
    const values = columnNames.map(col => {
      const value = row[col];

      // Special handling for PostGIS geometry - use ST_GeomFromText
      if (hasGeometry && columns.find(c => c.column_name === col && c.udt_name === 'geometry')) {
        if (value === null) return 'NULL';
        // The value is already in WKT or EWKT format from the query
        return value;
      }

      return escapeSqlValue(value);
    });

    sql += `INSERT INTO ${schema}.${table} (${columnNames.join(', ')}) VALUES (${values.join(', ')});\n`;
  }

  sql += '\n';
  return sql;
}

/**
 * Export a table to SQL file
 */
async function exportTable(schema, table, description) {
  const filename = `${schema}_${table}.sql`;
  const filepath = path.join(EXPORT_DIR, filename);

  console.log(`\n▶ Exporting ${schema}.${table}...`);
  console.log(`  ${description}`);

  try {
    // Get column metadata
    const columnQuery = `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;
    const { rows: columns } = await pool.query(columnQuery, [schema, table]);

    // Check for geometry columns
    const geomColumn = columns.find(col => col.udt_name === 'geometry' || col.udt_name === 'geography');

    // Determine primary key column for ordering
    const pkQuery = `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      LIMIT 1
    `;
    const { rows: pkRows } = await pool.query(pkQuery, [schema, table]);
    const pkColumn = pkRows.length > 0 ? pkRows[0].column_name : null;

    let dataQuery;
    if (geomColumn) {
      // For tables with geometry, convert to EWKT format for export
      const geomColName = geomColumn.column_name;
      const otherColumns = columns.filter(c => c.column_name !== geomColName).map(c => c.column_name);
      const columnsStr = otherColumns.length > 0 ? otherColumns.join(', ') + ', ' : '';

      const orderBy = pkColumn ? `ORDER BY ${pkColumn}` : '';
      dataQuery = `
        SELECT ${columnsStr}ST_AsEWKT(${geomColName}) as ${geomColName}
        FROM ${schema}.${table}
        ${orderBy}
      `;
    } else {
      const orderBy = pkColumn ? `ORDER BY ${pkColumn}` : '';
      dataQuery = `SELECT * FROM ${schema}.${table} ${orderBy}`;
    }

    const { rows } = await pool.query(dataQuery);

    console.log(`  Found ${rows.length} rows`);

    // Generate SQL file
    let sqlContent = '';
    sqlContent += `--\n`;
    sqlContent += `-- PostgreSQL database dump\n`;
    sqlContent += `-- Exported by Node.js ETL script\n`;
    sqlContent += `--\n`;
    sqlContent += `-- Database: ${process.env.DB_NAME}\n`;
    sqlContent += `-- Table: ${schema}.${table}\n`;
    sqlContent += `--\n\n`;

    sqlContent += `SET search_path TO ${schema}, public;\n\n`;

    // Generate INSERT statements
    const inserts = await generateInserts(schema, table, rows, columns);
    sqlContent += inserts;

    // For tables with geometry, we need to use ST_GeomFromEWKT instead of direct insert
    if (geomColumn) {
      const geomColName = geomColumn.column_name;
      // Replace the geometry values with ST_GeomFromEWKT calls
      sqlContent = sqlContent.replace(
        new RegExp(`(${geomColName}\\)) VALUES \\((.+?)'(SRID=\\d+;.+?)'`, 'g'),
        `$1) VALUES ($2ST_GeomFromEWKT('$3')`
      );
    }

    // Write to file
    fs.writeFileSync(filepath, sqlContent, 'utf8');

    const stats = fs.statSync(filepath);
    console.log(`  ✓ Exported to ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);

    return true;
  } catch (error) {
    console.error(`  ✗ Failed to export ${schema}.${table}`);
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    // Test database connection
    const result = await pool.query('SELECT current_database(), current_user');
    console.log(`Connected to: ${result.rows[0].current_database} as ${result.rows[0].current_user}\n`);

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
      const success = await exportTable(schema, table, description);
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
      console.log('2. Run: npm run etl:import (on production environment)');
      console.log('3. Or manually import with psql:');
      console.log(`   psql <production-db-url> -f data-exports/dim_scenario.sql`);
    }

    console.log();
    process.exit(failCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n✗ Export failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
