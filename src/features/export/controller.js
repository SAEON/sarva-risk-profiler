const fs = require("fs");
const os = require("os");
const path = require("path");
const { pool } = require("../../db/pool");
const { pg } = require("../../config/env");
const safeName = require("../../utils/safeName");
const gdal = require("../../services/gdal");

function buildPgDsn() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { host, port, database, user, password } = pg;
  return `PG:host=${host} port=${port} dbname=${database} user=${user}${
    password ? ` password=${password}` : ""
  }`;
}

exports.shapefile = async (req, res, next) => {
  const indicatorKey = String(req.query.indicator || "").trim();
  const period = req.query.period ? Number(req.query.period) : null;
  const scenarioKey = req.query.scenario ? String(req.query.scenario) : null;

  if (!indicatorKey || !Number.isFinite(period)) {
    return res
      .status(400)
      .json({ error: "indicator and numeric period are required" });
  }

  let tmpDir;
  try {
    // Resolve ids
    const ind = await pool.query(
      `SELECT id, key, COALESCE(label,key) AS label FROM catalog.indicator WHERE key=$1 LIMIT 1`,
      [indicatorKey]
    );
    if (!ind.rowCount)
      return res.status(404).json({ error: "Unknown indicator key" });

    const tim = await pool.query(
      `SELECT id FROM dim.time WHERE period=$1 AND granularity='year' LIMIT 1`,
      [period]
    );
    if (!tim.rowCount)
      return res.status(404).json({ error: "Unknown/unsupported period" });

    let scenarioId = null;
    if (scenarioKey) {
      const sc = await pool.query(
        `SELECT id FROM dim.scenario WHERE key=$1 LIMIT 1`,
        [scenarioKey]
      );
      if (!sc.rowCount)
        return res.status(404).json({ error: "Unknown scenario key" });
      scenarioId = sc.rows[0].id;
    } else {
      const sc = await pool.query(
        `SELECT id FROM dim.scenario WHERE key='baseline' LIMIT 1`
      );
      scenarioId = sc.rows[0]?.id ?? null;
    }

    const indicatorId = ind.rows[0].id;
    const timeId = tim.rows[0].id;

    // Temp files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shp-"));
    const base = safeName(
      `${indicatorKey}_${period}${scenarioKey ? "_" + scenarioKey : ""}`
    );
    const shpPath = path.join(tmpDir, `${base}.shp`);
    const zipPath = path.join(tmpDir, `${base}.zip`);

    // SQL identical to the original (entity_code join; raw_value & value_0_100; simplify+transform)
    const sql = `
      SELECT
        a.code::text AS lm_code,
        a.name       AS lm_name,
        iv.raw_value,
        iv.value_0_100,
        ${period}::int AS year,
        ST_Transform(
          ST_SimplifyPreserveTopology(a.geom, 0.0002),
          4326
        ) AS geom
      FROM admin.local_municipality_2018 a
      JOIN data.indicator_value iv
        ON iv.entity_code = a.code
      WHERE iv.indicator_id = ${indicatorId}
        AND iv.time_id      = ${timeId}
        ${scenarioId ? `AND iv.scenario_id = ${scenarioId}` : ""}
    `;

    // Run ogr2ogr and zip
    await gdal.ogr2ogrToShapefile({
      shpPath,
      pgDsn: buildPgDsn(),
      sql,
      layerName: base,
    });
    const parts = [".shp", ".shx", ".dbf", ".prj", ".cpg"]
      .map((ext) => shpPath.replace(".shp", ext))
      .filter(fs.existsSync);
    if (!parts.length)
      return res.status(500).json({ error: "No shapefile parts were created" });
    await gdal.zipFiles({ zipPath, parts });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.zip"`);
    res.sendFile(zipPath, (err) => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
      if (err) next(err);
    });
  } catch (err) {
    try {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    next(err);
  }
};
