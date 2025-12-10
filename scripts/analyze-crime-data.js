#!/usr/bin/env node
/**
 * Database Analysis Script - Crime Stats Import Feature
 *
 * This script queries the database to gather all necessary information
 * for implementing the crime statistics import feature:
 *
 * 1. Crime indicators in catalog
 * 2. Available municipalities
 * 3. Available time periods
 * 4. Available scenarios
 * 5. Sample existing crime data (structure)
 * 6. Value ranges for normalization analysis
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('Error: .env file not found');
  process.exit(1);
}

const { Pool } = require('pg');

const sslEnabled = (
  String(process.env.DB_SSL || '').toLowerCase() === 'true' ||
  String(process.env.PGSSLMODE || '').toLowerCase() === 'require' ||
  String(process.env.PGSSL || '').toLowerCase() === '1'
);
const ssl = sslEnabled ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' } : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl,
  max: 10,
  idleTimeoutMillis: 30000,
});

async function analyzeDatabase() {
  console.log('='.repeat(80));
  console.log('DATABASE ANALYSIS FOR CRIME STATS IMPORT FEATURE');
  console.log('='.repeat(80));
  console.log();

  try {
    // 1. Crime Indicators
    console.log('1. CRIME INDICATORS IN CATALOG');
    console.log('-'.repeat(80));
    const crimeIndicators = await pool.query(`
      SELECT
        id,
        key,
        label,
        category,
        theme,
        measure_type,
        unit,
        polarity,
        description,
        source_name,
        sort_order
      FROM catalog.indicator
      WHERE LOWER(category) LIKE '%crime%'
         OR LOWER(theme) LIKE '%crime%'
         OR LOWER(key) LIKE '%crime%'
      ORDER BY sort_order NULLS LAST, key
    `);

    console.log(`Found ${crimeIndicators.rows.length} crime-related indicators:\n`);

    if (crimeIndicators.rows.length === 0) {
      console.log('⚠️  WARNING: No crime indicators found!');
      console.log('   Check if indicators exist with different naming conventions.\n');
    } else {
      crimeIndicators.rows.forEach((ind, idx) => {
        console.log(`${idx + 1}. Key: "${ind.key}"`);
        console.log(`   ID: ${ind.id}`);
        console.log(`   Label: ${ind.label || '(none)'}`);
        console.log(`   Category: ${ind.category || '(none)'}`);
        console.log(`   Theme: ${ind.theme || '(none)'}`);
        console.log(`   Type: ${ind.measure_type || '(none)'}`);
        console.log(`   Unit: ${ind.unit || '(none)'}`);
        console.log(`   Polarity: ${ind.polarity || '(none)'}`);
        console.log(`   Sort Order: ${ind.sort_order || 'N/A'}`);
        if (ind.description) {
          console.log(`   Description: ${ind.description.substring(0, 100)}${ind.description.length > 100 ? '...' : ''}`);
        }
        console.log();
      });

      // Save to JSON for template generation
      const outputDir = path.resolve(process.cwd(), 'tmp');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(outputDir, 'crime_indicators.json'),
        JSON.stringify(crimeIndicators.rows, null, 2)
      );
      console.log(`✓ Saved to tmp/crime_indicators.json\n`);
    }

    // 2. Check for calculated indicators (like crime_total_rate)
    console.log('2. CALCULATED INDICATORS CHECK');
    console.log('-'.repeat(80));
    const calculatedPattern = await pool.query(`
      SELECT key, label, description
      FROM catalog.indicator
      WHERE (LOWER(category) LIKE '%crime%' OR LOWER(theme) LIKE '%crime%')
        AND (LOWER(key) LIKE '%total%'
             OR LOWER(key) LIKE '%sum%'
             OR LOWER(key) LIKE '%aggregate%'
             OR LOWER(label) LIKE '%total%')
      ORDER BY key
    `);

    if (calculatedPattern.rows.length > 0) {
      console.log(`Found ${calculatedPattern.rows.length} potentially calculated indicators:`);
      calculatedPattern.rows.forEach(ind => {
        console.log(`  - ${ind.key} (${ind.label})`);
      });
      console.log('\n⚠️  These should likely be EXCLUDED from manual import.\n');
    } else {
      console.log('No obvious calculated indicators found.\n');
    }

    // 3. Municipalities
    console.log('3. AVAILABLE MUNICIPALITIES');
    console.log('-'.repeat(80));
    const municipalities = await pool.query(`
      SELECT code, name
      FROM admin.local_municipality_2018
      ORDER BY name
    `);
    console.log(`Found ${municipalities.rows.length} municipalities\n`);
    console.log('First 10:');
    municipalities.rows.slice(0, 10).forEach(m => {
      console.log(`  ${m.code} - ${m.name}`);
    });
    if (municipalities.rows.length > 10) {
      console.log(`  ... and ${municipalities.rows.length - 10} more`);
    }
    console.log();

    // Save to JSON
    fs.writeFileSync(
      path.join(process.cwd(), 'tmp', 'municipalities.json'),
      JSON.stringify(municipalities.rows, null, 2)
    );
    console.log('✓ Saved to tmp/municipalities.json\n');

    // 4. Time Periods
    console.log('4. AVAILABLE TIME PERIODS');
    console.log('-'.repeat(80));
    const timePeriods = await pool.query(`
      SELECT id, period, granularity, label
      FROM dim.time
      WHERE granularity = 'year'
      ORDER BY period DESC
    `);
    console.log(`Found ${timePeriods.rows.length} year periods:\n`);
    timePeriods.rows.forEach(t => {
      console.log(`  ${t.period} (ID: ${t.id}) ${t.label ? `- ${t.label}` : ''}`);
    });
    console.log();

    // 5. Scenarios
    console.log('5. AVAILABLE SCENARIOS');
    console.log('-'.repeat(80));
    const scenarios = await pool.query(`
      SELECT id, key, label
      FROM dim.scenario
      ORDER BY
        CASE WHEN key = 'baseline' THEN 0 ELSE 1 END,
        key
    `);
    console.log(`Found ${scenarios.rows.length} scenarios:\n`);
    scenarios.rows.forEach(s => {
      console.log(`  "${s.key}" (ID: ${s.id})`);
      if (s.label) console.log(`    Label: ${s.label}`);
      if (s.key === 'baseline') console.log(`    ← DEFAULT for crime imports`);
      console.log();
    });

    // 6. Sample Existing Crime Data
    console.log('6. SAMPLE EXISTING CRIME DATA (if any)');
    console.log('-'.repeat(80));
    if (crimeIndicators.rows.length > 0) {
      const sampleData = await pool.query(`
        SELECT
          i.key as indicator_key,
          i.label as indicator_label,
          t.period as year,
          s.key as scenario,
          v.entity_code,
          m.name as municipality_name,
          v.raw_value,
          v.value_0_100,
          CASE
            WHEN v.value_0_100 IS NOT NULL THEN 'Yes'
            ELSE 'No'
          END as is_normalized
        FROM data.indicator_value v
        JOIN catalog.indicator i ON i.id = v.indicator_id
        JOIN dim.time t ON t.id = v.time_id
        JOIN dim.scenario s ON s.id = v.scenario_id
        LEFT JOIN admin.local_municipality_2018 m ON m.code = v.entity_code
        WHERE v.indicator_id IN (${crimeIndicators.rows.map(r => r.id).join(',')})
        ORDER BY t.period DESC, v.entity_code
        LIMIT 10
      `);

      if (sampleData.rows.length > 0) {
        console.log(`Found ${sampleData.rows.length} sample records:\n`);
        sampleData.rows.forEach((row, idx) => {
          console.log(`${idx + 1}. ${row.indicator_key} | ${row.year} | ${row.entity_code} (${row.municipality_name})`);
          console.log(`   Raw Value: ${row.raw_value}`);
          console.log(`   Normalized (0-100): ${row.value_0_100 !== null ? row.value_0_100 : 'NULL'}`);
          console.log(`   Scenario: ${row.scenario}`);
          console.log();
        });
      } else {
        console.log('⚠️  No existing crime data found in database.\n');
      }
    }

    // 7. Normalization Analysis
    console.log('7. NORMALIZATION ANALYSIS');
    console.log('-'.repeat(80));
    if (crimeIndicators.rows.length > 0) {
      const normAnalysis = await pool.query(`
        SELECT
          i.key,
          i.polarity,
          COUNT(*) as total_records,
          COUNT(v.value_0_100) as normalized_count,
          COUNT(v.raw_value) as raw_count,
          ROUND((COUNT(v.value_0_100)::numeric / COUNT(*)::numeric * 100), 2) as pct_normalized,
          MIN(v.raw_value) as raw_min,
          MAX(v.raw_value) as raw_max,
          MIN(v.value_0_100) as norm_min,
          MAX(v.value_0_100) as norm_max
        FROM data.indicator_value v
        JOIN catalog.indicator i ON i.id = v.indicator_id
        WHERE v.indicator_id IN (${crimeIndicators.rows.map(r => r.id).join(',')})
        GROUP BY i.key, i.polarity
        ORDER BY i.key
      `);

      if (normAnalysis.rows.length > 0) {
        console.log('Normalization coverage per indicator:\n');
        normAnalysis.rows.forEach(row => {
          console.log(`${row.key}:`);
          console.log(`  Total Records: ${row.total_records}`);
          console.log(`  Normalized: ${row.normalized_count} (${row.pct_normalized}%)`);
          console.log(`  Raw Range: ${row.raw_min} to ${row.raw_max}`);
          if (row.norm_min !== null) {
            console.log(`  Normalized Range: ${row.norm_min} to ${row.norm_max}`);
          }
          console.log(`  Polarity: ${row.polarity || 'not set'}`);
          console.log();
        });

        // Determine normalization strategy
        const avgNormalized = normAnalysis.rows.reduce((sum, r) => sum + parseFloat(r.pct_normalized), 0) / normAnalysis.rows.length;
        console.log(`Average normalization coverage: ${avgNormalized.toFixed(2)}%\n`);

        if (avgNormalized > 90) {
          console.log('✓ RECOMMENDATION: Normalization is consistently applied.');
          console.log('  Import should calculate value_0_100 during upload.\n');
        } else if (avgNormalized > 50) {
          console.log('⚠️  RECOMMENDATION: Partial normalization detected.');
          console.log('   Consider batch normalization after import.\n');
        } else {
          console.log('⚠️  RECOMMENDATION: Most data is not normalized.');
          console.log('   Import raw_value only, normalize separately.\n');
        }
      } else {
        console.log('No data available for normalization analysis.\n');
      }
    }

    // 8. Primary Key Constraint Confirmation
    console.log('8. TABLE CONSTRAINTS');
    console.log('-'.repeat(80));
    const constraints = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'data.indicator_value'::regclass
      ORDER BY contype, conname
    `);

    console.log('Constraints on data.indicator_value:\n');
    constraints.rows.forEach(c => {
      console.log(`${c.conname}:`);
      console.log(`  ${c.definition}`);
      console.log();
    });

    console.log('='.repeat(80));
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    console.log('\nNext Steps:');
    console.log('1. Review crime_indicators.json for Excel template columns');
    console.log('2. Confirm normalization strategy with data scientist');
    console.log('3. Identify any calculated indicators to exclude from import');
    console.log('4. Proceed with import feature implementation\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error('\nFull error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run analysis
analyzeDatabase();
