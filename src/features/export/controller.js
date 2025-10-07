const fs = require('fs');
const os = require('os');
const path = require('path');
const { pool } = require('../../db/pool');
const { pg } = require('../../config/env');
const safeName = require('../../utils/safeName');
const gdal = require('../../services/gdal');

function pgDsn() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { host, port, database, user, password } = pg;
  return `host=${host} port=${port} dbname=${database} user=${user}${password ? ` password=${password}` : ''}`;
}

exports.shapefile = async (req, res, next) => {
  const indicatorKey = String(req.query.indicator || '').trim();
  const period = Number(req.query.period);

  if (!indicatorKey || !Number.isFinite(period)) {
    return res.status(400).json({ ok: false, error: 'Missing ?indicator and/or ?period' });
  }

  let tmpDir;
  try {
    const ind = await pool.query(
      `SELECT id, key, COALESCE(label, key) AS label FROM catalog.indicator WHERE key = $1`,
      [indicatorKey]
    );
    if (!ind.rowCount) return res.status(404).json({ ok: false, error: 'indicator_not_found' });

    const tim = await pool.query(
      `SELECT id, period FROM dim.time WHERE period = $1`,
      [period]
    );
    if (!tim.rowCount) return res.status(404).json({ ok: false, error: 'period_not_found' });

    const indicatorId = ind.rows[0].id;
    const label = ind.rows[0].label;
    const timeId = tim.rows[0].id;

    const baseName = safeName(`${indicatorKey}_${period}`);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'));
    const shpFile = path.join(tmpDir, `${baseName}.shp`);
    const zipFile = path.join(tmpDir, `${baseName}.zip`);

    const sql = `
      SELECT
        m.geom,
        m.code::text AS mun_code,
        m.name       AS mun_name,
        v.value::numeric AS value,
        ${period}::int AS period,
        ${indicatorId}::int AS indicator_id,
        ${timeId}::int AS time_id
      FROM admin.local_municipality_2018 m
      LEFT JOIN data.indicator_value v
        ON v.spatial_id = m.id
       AND v.indicator_id = ${indicatorId}
       AND v.time_id = ${timeId}
    `;

    await gdal.ogr2ogrToShapefile({
      shpPath: shpFile,
      pgDsn: pgDsn(),
      sql,
      layerName: safeName(label).slice(0, 50) || 'layer'
    });

    const parts = [
      shpFile,
      shpFile.replace('.shp', '.shx'),
      shpFile.replace('.shp', '.dbf'),
      shpFile.replace('.shp', '.prj'),
      shpFile.replace('.shp', '.cpg'),
    ].filter(fs.existsSync);

    await gdal.zipFiles({ zipPath: zipFile, parts });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`);
    res.sendFile(zipFile, err => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      if (err) next(err);
    });
  } catch (err) {
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    next(err);
  }
};
