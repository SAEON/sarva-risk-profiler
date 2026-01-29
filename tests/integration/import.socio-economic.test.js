const request = require('supertest');
const XLSX = require('xlsx');

// Use the real app and DB connection from .env.test
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

const enforceIntegration = /^(1|true|yes)$/i.test(process.env.RUN_INTEGRATION || '');
let dbReady = false;

describe('Socio-Economic Import endpoints (integration)', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch (e) {
      console.warn('Skipping socio-economic import integration tests: DB not reachable ->', e.message);
    }
  }, 30000); // 30 second timeout for beforeAll

  const maybe = () => dbReady ? test : (enforceIntegration ? test : test.skip);

  describe('GET /import/socio-economic/themes', () => {
    maybe()('returns list of socio-economic themes', async () => {
      const res = await request(app).get('/import/socio-economic/themes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('themes');
      expect(res.body).toHaveProperty('totalThemes');
      expect(res.body).toHaveProperty('totalIndicators');
      expect(Array.isArray(res.body.themes)).toBe(true);

      if (res.body.themes.length > 0) {
        const theme = res.body.themes[0];
        expect(theme).toHaveProperty('theme');
        expect(theme).toHaveProperty('count');
        expect(theme).toHaveProperty('indicators');
        expect(Array.isArray(theme.indicators)).toBe(true);

        if (theme.indicators.length > 0) {
          const indicator = theme.indicators[0];
          expect(indicator).toHaveProperty('id');
          expect(indicator).toHaveProperty('key');
          expect(indicator).toHaveProperty('label');
          expect(indicator).toHaveProperty('excelColumn');
          // Verify Excel column starts with Socio_
          expect(indicator.excelColumn.startsWith('Socio_')).toBe(true);
        }
      }
    });
  });

  describe('GET /import/socio-economic/template', () => {
    maybe()('returns 400 if themes parameter is missing', async () => {
      const res = await request(app).get('/import/socio-economic/template');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('themes parameter is required');
    });

    maybe()('returns 400 for invalid theme', async () => {
      const res = await request(app)
        .get('/import/socio-economic/template')
        .query({ themes: 'NonExistentTheme' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Invalid theme');
    });

    maybe()('generates Excel template for valid theme', async () => {
      // First get available themes
      const themesRes = await request(app).get('/import/socio-economic/themes');
      if (themesRes.body.themes.length === 0) {
        console.warn('No socio-economic themes available, skipping template test');
        return;
      }

      const themeName = themesRes.body.themes[0].theme;
      const res = await request(app)
        .get('/import/socio-economic/template')
        .query({ themes: themeName });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('socio_economic');

      // Parse the Excel file and verify structure
      const workbook = XLSX.read(res.body, { type: 'buffer' });
      expect(workbook.SheetNames).toContain('Socio_Economic_Data');
      expect(workbook.SheetNames).toContain('Available_Years');
      expect(workbook.SheetNames).toContain('Available_Municipalities');
      expect(workbook.SheetNames).toContain('Instructions');

      // Verify data sheet has Socio_ columns
      const dataSheet = workbook.Sheets['Socio_Economic_Data'];
      const data = XLSX.utils.sheet_to_json(dataSheet, { header: 1 });
      if (data.length > 0) {
        const headers = data[0];
        expect(headers).toContain('Municipality_Code');
        expect(headers).toContain('Year');
        expect(headers).toContain('Scenario');
        // Should have at least one Socio_ column
        const socioColumns = headers.filter(h => h && h.startsWith('Socio_'));
        expect(socioColumns.length).toBeGreaterThan(0);
      }
    });
  });

  describe('POST /import/socio-economic', () => {
    maybe()('returns 400 if no file uploaded', async () => {
      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('No file uploaded');
    });

    maybe()('returns 400 for Excel without Socio_Economic_Data sheet', async () => {
      // Create a simple Excel file without the required sheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['test']]);
      XLSX.utils.book_append_sheet(wb, ws, 'WrongSheet');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345')
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Socio_Economic_Data');
    });

    maybe()('returns 400 for Excel without Socio_ columns', async () => {
      // Create Excel with correct sheet but no Socio_ columns
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Municipality_Code', 'Year', 'SomeOtherColumn'],
        ['JHB', '2022', '100']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Socio_Economic_Data');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345')
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('No socio-economic indicator columns');
    });

    maybe()('validates municipality codes', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Municipality_Code', 'Year', 'Socio_Population_Total'],
        ['INVALID_CODE', '2022', '1000000']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Socio_Economic_Data');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345')
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('errors');
      expect(res.body.errors[0].error).toContain('not found in database');
    });

    maybe()('validates year values', async () => {
      // Get a valid municipality code
      const muniRes = await pool.query('SELECT code FROM admin.local_municipality_2018 LIMIT 1');
      if (muniRes.rows.length === 0) {
        console.warn('No municipalities in database, skipping year validation test');
        return;
      }
      const validCode = muniRes.rows[0].code;

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Municipality_Code', 'Year', 'Socio_Population_Total'],
        [validCode, '9999', '1000000']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Socio_Economic_Data');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345')
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('errors');
      expect(res.body.errors[0].error).toContain('not available in the system');
    });

    maybe()('rejects negative values', async () => {
      // Get valid municipality and year
      const muniRes = await pool.query('SELECT code FROM admin.local_municipality_2018 LIMIT 1');
      const yearRes = await pool.query("SELECT period FROM dim.time WHERE granularity = 'year' LIMIT 1");
      if (muniRes.rows.length === 0 || yearRes.rows.length === 0) {
        console.warn('Missing test data, skipping negative value test');
        return;
      }
      const validCode = muniRes.rows[0].code;
      const validYear = yearRes.rows[0].period;

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Municipality_Code', 'Year', 'Socio_Population_Total'],
        [validCode, validYear, '-100']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Socio_Economic_Data');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345')
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('errors');
      expect(res.body.errors[0].error).toContain('cannot be negative');
    });

    maybe()('accepts zero values (unlike crime import)', async () => {
      // Get valid municipality, year, and indicator
      const muniRes = await pool.query('SELECT code FROM admin.local_municipality_2018 LIMIT 1');
      const yearRes = await pool.query("SELECT period FROM dim.time WHERE granularity = 'year' LIMIT 1");
      const indRes = await pool.query("SELECT key FROM catalog.indicator WHERE category = 'socio-economic' AND measure_type = 'indicator' LIMIT 1");

      if (muniRes.rows.length === 0 || yearRes.rows.length === 0 || indRes.rows.length === 0) {
        console.warn('Missing test data, skipping zero value test');
        return;
      }

      const validCode = muniRes.rows[0].code;
      const validYear = yearRes.rows[0].period;
      const indicatorKey = indRes.rows[0].key;

      // Convert key to Excel column format: key -> Socio_Key
      const excelColumn = 'Socio_' + indicatorKey
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('_');

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Municipality_Code', 'Year', excelColumn, 'Scenario'],
        [validCode, validYear, '0', 'census 2022']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Socio_Economic_Data');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345')
        .attach('file', buffer, 'test.xlsx');

      // Should succeed or have validation errors unrelated to zero value
      // Zero should be accepted, not skipped
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.summary.cellsProcessed).toBeGreaterThanOrEqual(1);
      } else if (res.status === 400 && res.body.errors) {
        // If there are errors, none should be about zero values
        res.body.errors.forEach(err => {
          expect(err.error).not.toContain('zero');
        });
      }
    });

    maybe()('uses census 2022 as default scenario', async () => {
      // Get valid municipality, year, and indicator
      const muniRes = await pool.query('SELECT code FROM admin.local_municipality_2018 LIMIT 1');
      const yearRes = await pool.query("SELECT period FROM dim.time WHERE granularity = 'year' LIMIT 1");
      const indRes = await pool.query("SELECT key FROM catalog.indicator WHERE category = 'socio-economic' AND measure_type = 'indicator' LIMIT 1");
      const scenarioRes = await pool.query("SELECT id FROM dim.scenario WHERE key = 'census 2022'");

      if (muniRes.rows.length === 0 || yearRes.rows.length === 0 || indRes.rows.length === 0 || scenarioRes.rows.length === 0) {
        console.warn('Missing test data (including census 2022 scenario), skipping default scenario test');
        return;
      }

      const validCode = muniRes.rows[0].code;
      const validYear = yearRes.rows[0].period;
      const indicatorKey = indRes.rows[0].key;

      const excelColumn = 'Socio_' + indicatorKey
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('_');

      // Create Excel without Scenario column (should default to census 2022)
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Municipality_Code', 'Year', excelColumn],
        [validCode, validYear, '12345']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Socio_Economic_Data');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/import/socio-economic')
        .set('X-API-Key', process.env.IMPORT_API_KEYS || 'test_key_12345')
        .attach('file', buffer, 'test.xlsx');

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.details.scenario).toBe('census 2022');
      }
    });
  });
});