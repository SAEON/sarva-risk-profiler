// Database connectivity, schema, and data verification
// Loads .env.test explicitly, then verifies:
// - DB connection works
// - PostGIS is installed
// - Required tables/schemas exist
// - Reference data is loaded (dim.*, catalog.*, admin.*)

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
} else {
  dotenv.config();
}

const { Pool } = require('pg');

function maskSecret(s, showFull) {
  if (!s) return s;
  if (showFull) return s;
  const str = String(s);
  if (str.length <= 4) return '*'.repeat(str.length);
  return str.slice(0, 2) + '*'.repeat(Math.max(3, str.length - 4)) + str.slice(-2);
}

const sslEnabled = (
  String(process.env.DB_SSL || '').toLowerCase() === 'true' ||
  String(process.env.PGSSLMODE || '').toLowerCase() === 'require' ||
  String(process.env.PGSSL || '').toLowerCase() === '1'
);
const ssl = sslEnabled ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' } : undefined;

const usingUrl = !!process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: usingUrl ? process.env.DATABASE_URL : undefined,
  host: usingUrl ? undefined : process.env.DB_HOST,
  port: usingUrl ? undefined : Number(process.env.DB_PORT || 5432),
  database: usingUrl ? undefined : process.env.DB_NAME,
  user: usingUrl ? undefined : process.env.DB_USER,
  password: usingUrl ? undefined : process.env.DB_PASSWORD,
  ssl,
  max: 1,
  idleTimeoutMillis: 5000,
});

(async () => {
  try {
    const showMode = String(process.env.DB_CHECK_SHOW_PASSWORD || '').toLowerCase();
    const showPwFull = showMode === 'true' || showMode === 'full';
    const showPwMasked = showMode === 'masked';
    let info;
    if (usingUrl) {
      info = { using: 'DATABASE_URL', ssl: sslEnabled };
      try {
        const u = new URL(process.env.DATABASE_URL);
        info.url = {
          protocol: u.protocol,
          host: u.hostname,
          port: u.port,
          database: u.pathname ? u.pathname.slice(1) : undefined,
          user: u.username,
        };
        if (showPwFull) {
          info.url.password = decodeURIComponent(u.password || '');
        } else if (showPwMasked) {
          info.url.password = maskSecret(decodeURIComponent(u.password || ''), false);
        }
      } catch (_) {
        info.url = { raw: '[unparsed]', password: '[unavailable]' };
      }
    } else {
      info = {
        using: 'individual env vars',
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        ssl: sslEnabled,
      };
      if (showPwFull) {
        info.password = process.env.DB_PASSWORD;
      } else if (showPwMasked) {
        info.password = maskSecret(process.env.DB_PASSWORD, false);
      }
    }
    console.log('DB check: attempting to connect', info);

    await pool.query('SELECT 1');
    console.log('DB check: connectivity OK');

    // Check PostGIS
    let postgisOk = false;
    try {
      const { rows } = await pool.query("SELECT extname FROM pg_extension WHERE extname = 'postgis'");
      postgisOk = rows.length > 0;
    } catch (_) {}
    if (!postgisOk) {
      throw new Error('PostGIS extension not found. Install with: CREATE EXTENSION postgis;');
    }
    console.log('DB check: PostGIS installed');

    // Required tables for catalog/search/tiles/choropleth/export
    const required = [
      'dim.time',
      'catalog.indicator',
      'admin.local_municipality_2018',
      'data.indicator_value',
    ];
    const missing = [];
    for (const qname of required) {
      const { rows } = await pool.query('SELECT to_regclass($1) AS reg', [qname]);
      if (!rows[0] || rows[0].reg === null) missing.push(qname);
    }
    if (missing.length) {
      throw new Error('Missing required tables: ' + missing.join(', '));
    }
    console.log('DB check: required tables exist');

    // Check reference data exists
    console.log('DB check: verifying reference data...');

    const dataChecks = [
      {
        table: 'dim.scenario',
        minRows: 1,
        description: 'scenarios (e.g., baseline, saps_actual)',
        sampleQuery: 'SELECT key FROM dim.scenario ORDER BY id LIMIT 3'
      },
      {
        table: 'dim.time',
        minRows: 1,
        description: 'time periods',
        sampleQuery: 'SELECT period FROM dim.time ORDER BY period DESC LIMIT 3'
      },
      {
        table: 'catalog.indicator',
        minRows: 1,
        description: 'indicators',
        sampleQuery: 'SELECT key FROM catalog.indicator LIMIT 3'
      },
      {
        table: 'admin.local_municipality_2018',
        minRows: 1,
        description: 'municipalities',
        sampleQuery: 'SELECT code, name FROM admin.local_municipality_2018 LIMIT 3'
      }
    ];

    const dataWarnings = [];
    for (const check of dataChecks) {
      const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${check.table}`);
      const count = parseInt(rows[0].count);

      if (count < check.minRows) {
        dataWarnings.push(`${check.table}: ${count} rows (expected at least ${check.minRows} ${check.description})`);
      } else {
        console.log(`DB check: ${check.table} has ${count} ${check.description}`);

        // Show sample data
        const sample = await pool.query(check.sampleQuery);
        if (sample.rows.length > 0) {
          const keys = Object.keys(sample.rows[0]);
          sample.rows.forEach(row => {
            const values = keys.map(k => row[k]).join(', ');
            console.log(`  - ${values}`);
          });
        }
      }
    }

    if (dataWarnings.length > 0) {
      console.warn('\nDB check: ⚠️  WARNING - Missing reference data:');
      dataWarnings.forEach(w => console.warn(`  - ${w}`));
      console.warn('\nReference data is required for the application to function.');
      console.warn('Run: npm run etl:import');
      console.warn('');
    }

    // Additional data integrity checks
    console.log('\nDB check: verifying data integrity...');

    // Check indicator_value data exists
    const ivCount = await pool.query('SELECT COUNT(*) as count FROM data.indicator_value');
    const indicatorValueCount = parseInt(ivCount.rows[0].count);
    if (indicatorValueCount === 0) {
      console.warn('⚠️  WARNING: data.indicator_value is EMPTY - no indicator data loaded');
      console.warn('   The application will not show any data in maps or charts.');
      console.warn('   Load data via: POST /import/crime-stats API endpoint');
    } else {
      console.log(`DB check: data.indicator_value has ${indicatorValueCount} records ✓`);
    }

    // Check for sub_index indicators (critical for theme dropdown)
    const subIndexCheck = await pool.query(`
      SELECT measure_type, COUNT(*) as count
      FROM catalog.indicator
      WHERE measure_type = 'sub_index'
      GROUP BY measure_type
    `);
    const subIndexCount = subIndexCheck.rows.length > 0 ? parseInt(subIndexCheck.rows[0].count) : 0;
    if (subIndexCount === 0) {
      console.warn('⚠️  WARNING: No sub_index indicators found in catalog');
    } else {
      console.log(`DB check: catalog has ${subIndexCount} sub_index indicators ✓`);

      // Check which themes exist for sub_index
      const subIndexThemes = await pool.query(`
        SELECT DISTINCT theme
        FROM catalog.indicator
        WHERE measure_type = 'sub_index'
          AND theme IS NOT NULL
        ORDER BY theme
      `);
      if (subIndexThemes.rows.length > 0) {
        console.log(`  Themes: ${subIndexThemes.rows.map(r => r.theme).join(', ')}`);
      }
    }

    // Check for period 2024 (commonly used in frontend)
    const period2024 = await pool.query(`
      SELECT id, period, label
      FROM dim.time
      WHERE period = 2024 AND granularity = 'year'
    `);
    if (period2024.rows.length === 0) {
      console.warn('⚠️  WARNING: Period 2024 not found in dim.time');
      console.warn('   Frontend may fail when selecting 2024');
    } else {
      console.log(`DB check: period 2024 exists (id=${period2024.rows[0].id}) ✓`);
    }

    // CRITICAL: Verify themes endpoint query (sub_index + period=2024)
    if (indicatorValueCount > 0 && subIndexCount > 0 && period2024.rows.length > 0) {
      const themesQuery = await pool.query(`
        SELECT DISTINCT i.theme
        FROM catalog.indicator i
        INNER JOIN data.indicator_value iv ON i.id = iv.indicator_id
        INNER JOIN dim.time t ON iv.time_id = t.id
        WHERE i.measure_type = 'sub_index'
          AND t.period = 2024
          AND NULLIF(btrim(i.theme),'') IS NOT NULL
        ORDER BY i.theme
      `);

      if (themesQuery.rows.length === 0) {
        console.warn('⚠️  WARNING: Themes endpoint will return EMPTY for sub_index + period=2024');
        console.warn('   No sub_index indicators have data for period 2024');
        console.warn('   Frontend theme dropdown will be disabled');
      } else {
        console.log(`DB check: themes endpoint query returns ${themesQuery.rows.length} theme(s) ✓`);
        console.log(`  Themes for sub_index + 2024: ${themesQuery.rows.map(r => r.theme).join(', ')}`);

        // Count indicators per theme
        const themeDetail = await pool.query(`
          SELECT i.theme, COUNT(DISTINCT i.id) as indicator_count, COUNT(*) as value_count
          FROM catalog.indicator i
          INNER JOIN data.indicator_value iv ON i.id = iv.indicator_id
          INNER JOIN dim.time t ON iv.time_id = t.id
          WHERE i.measure_type = 'sub_index'
            AND t.period = 2024
            AND NULLIF(btrim(i.theme),'') IS NOT NULL
          GROUP BY i.theme
          ORDER BY i.theme
        `);
        themeDetail.rows.forEach(row => {
          console.log(`    - "${row.theme}": ${row.indicator_count} indicators, ${row.value_count} values`);
        });
      }
    }

    // Check for common data issues
    const issues = [];

    // Check for NULL themes in indicators
    const nullThemes = await pool.query(`
      SELECT COUNT(*) as count
      FROM catalog.indicator
      WHERE theme IS NULL OR btrim(theme) = ''
    `);
    const nullThemeCount = parseInt(nullThemes.rows[0].count);
    if (nullThemeCount > 0) {
      issues.push(`${nullThemeCount} indicators have NULL or empty theme`);
    }

    // Check for indicators with no data
    const indicatorsNoData = await pool.query(`
      SELECT COUNT(*) as count
      FROM catalog.indicator i
      WHERE NOT EXISTS (
        SELECT 1 FROM data.indicator_value iv WHERE iv.indicator_id = i.id
      )
    `);
    const noDataCount = parseInt(indicatorsNoData.rows[0].count);
    if (noDataCount > 0) {
      issues.push(`${noDataCount} indicators have NO data in indicator_value table`);
    }

    if (issues.length > 0) {
      console.log('\nDB check: potential issues detected:');
      issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    }

    console.log('\n' + '='.repeat(60));
    console.log('DB check: ✓ SUCCESS - Database is operational');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (err) {
    console.error('DB check: FAILED ->', err.message);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch {}
  }
})();
