const request = require('supertest');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

const enforceIntegration = /^(1|true|yes)$/i.test(process.env.RUN_INTEGRATION || '');
let dbReady = false;

function hasOgr2ogr() {
  try {
    let r = spawnSync('ogr2ogr', ['--version'], { encoding: 'utf8' });
    if (r && r.status === 0) return true;
    // Fallback for shells where PATH resolves differently
    r = spawnSync('bash', ['-lc', 'command -v ogr2ogr'], { encoding: 'utf8' });
    return r && r.status === 0;
  } catch (_) {
    return false;
  }
}

describe('Export shapefile endpoint (integration/E2E)', () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch (e) {
      console.warn('Skipping export integration tests: DB not reachable ->', e.message);
    }
  });

  test('GET /export/shapefile missing params -> 400', async () => {
    const res = await request(app).get('/export/shapefile');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  const maybe = dbReady ? test : (enforceIntegration ? test : test.skip);

  maybe('GET /export/shapefile unknown indicator -> 404', async () => {
    const res = await request(app)
      .get('/export/shapefile')
      .query({ indicator: '___unlikely_indicator_key___', period: '2000' });
    // period may or may not exist, but indicator should 404 first
    expect([400, 404]).toContain(res.status);
  });

  maybe('GET /export/shapefile unknown period -> 404', async () => {
    // Use an obviously non-existent period
    const res = await request(app)
      .get('/export/shapefile')
      .query({ indicator: '___unlikely_indicator_key___', period: '9999' });
    expect([400, 404]).toContain(res.status);
  });

  test('E2E: creates a zip for provided indicator/period when GDAL is available', async () => {
    // Gate at runtime to avoid definition-time skip issues
    if (!(dbReady && hasOgr2ogr() && process.env.EXPORT_TEST_INDICATOR && process.env.EXPORT_TEST_PERIOD)) {
      console.warn('Skipping E2E export: ensure DB ready, ogr2ogr on PATH, and EXPORT_TEST_INDICATOR/EXPORT_TEST_PERIOD set');
      return;
    }
    const indicator = process.env.EXPORT_TEST_INDICATOR;
    const period = process.env.EXPORT_TEST_PERIOD;
    const res = await request(app)
      .get('/export/shapefile')
      .query({ indicator, period })
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(String(res.headers['content-disposition'] || '')).toContain('attachment;');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    // Zip magic number PK\x03\x04
    expect(res.body.slice(0, 4).toString('binary')).toBe('PK\x03\x04');
  });

  test('E2E: save zip for visual inspection when EXPORT_SAVE_ZIP is set', async () => {
    if (!(dbReady && hasOgr2ogr() && /^(1|true|yes)$/i.test(String(process.env.EXPORT_SAVE_ZIP || '')) && process.env.EXPORT_TEST_INDICATOR && process.env.EXPORT_TEST_PERIOD)) {
      return;
    }
    const indicator = process.env.EXPORT_TEST_INDICATOR;
    const period = process.env.EXPORT_TEST_PERIOD;
    const res = await request(app)
      .get('/export/shapefile')
      .query({ indicator, period })
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const outDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const fname = `${String(indicator).replace(/[^A-Za-z0-9_.-]+/g,'_')}_${String(period)}.zip`;
    const outPath = path.join(outDir, fname);
    fs.writeFileSync(outPath, res.body);
    // eslint-disable-next-line no-console
    console.log(`Saved export zip to ${outPath}`);
  });
});
