const { pool } = require("../../db/pool");

exports.indicator = async (req, res) => {
  try {
    const { indicatorKey } = req.params;
    const { period, bbox } = req.query;
    const scenario = req.query.scenario ? String(req.query.scenario) : null;
    const extent = (req.query.extent || "").toLowerCase(); // '', 'all_periods'

    if (!period) return res.status(400).json({ error: "period required" });
    if (!bbox) return res.status(400).json({ error: "bbox required" });

    const [minx, miny, maxx, maxy] = String(bbox).split(",").map(Number);
    if ([minx, miny, maxx, maxy].some(Number.isNaN)) {
      return res.status(400).json({ error: "invalid bbox" });
    }

    const sql = `
      WITH
      t AS (SELECT id AS time_id FROM dim.time WHERE period=$1),
      ind AS (
        SELECT id AS indicator_id, label, unit, polarity, description, source_name, source_url
        FROM catalog.indicator WHERE key=$2
      ),
      s AS (
        SELECT id AS scenario_id
        FROM dim.scenario
        WHERE $7::text IS NOT NULL AND key=$7
      ),
      inview AS (
        SELECT code
        FROM admin.local_municipality_2018
        WHERE geom && ST_MakeEnvelope($3,$4,$5,$6,4326)
      ),
      vals AS (
        SELECT v.entity_code AS code, COALESCE(v.value_0_100, v.raw_value) AS value
        FROM data.indicator_value v
        WHERE v.time_id = (SELECT time_id FROM t)
          AND v.indicator_id = (SELECT indicator_id FROM ind)
          AND ( $7::text IS NULL OR v.scenario_id = (SELECT scenario_id FROM s) )
      ),
      vals_inview AS (
        SELECT code, value FROM vals WHERE code IN (SELECT code FROM inview)
      ),
      stats_view AS (
        SELECT MIN(value) AS vmin, MAX(value) AS vmax
        FROM vals_inview WHERE value IS NOT NULL
      ),
      vals_global AS (
        SELECT COALESCE(v.value_0_100, v.raw_value) AS value
        FROM data.indicator_value v
        WHERE v.indicator_id = (SELECT indicator_id FROM ind)
          AND ( $7::text IS NULL OR v.scenario_id = (SELECT scenario_id FROM s) )
          AND ( $8::text = 'all_periods' OR v.time_id = (SELECT time_id FROM t) )
      ),
      stats_global AS (
        SELECT MIN(value) AS gvmin, MAX(value) AS gvmax,
               MIN(NULLIF(value,0)) FILTER (WHERE value > 0) AS gposmin
        FROM vals_global WHERE value IS NOT NULL
      )
      SELECT
        (SELECT jsonb_agg(jsonb_build_object('code',code,'value',value) ORDER BY code) FROM vals_inview) AS items,
        (SELECT vmin  FROM stats_view)   AS vmin,
        (SELECT vmax  FROM stats_view)   AS vmax,
        (SELECT gvmin FROM stats_global) AS gvmin,
        (SELECT gvmax FROM stats_global) AS gvmax,
        (SELECT gposmin FROM stats_global) AS gposmin,
        (SELECT label FROM ind) AS label,
        (SELECT unit FROM ind) AS unit,
        (SELECT polarity FROM ind) AS polarity,
        (SELECT description FROM ind) AS description,
        (SELECT source_name FROM ind) AS source_name,
        (SELECT source_url FROM ind) AS source_url
    `;
    const { rows } = await pool.query(sql, [
      period,
      indicatorKey,
      minx,
      miny,
      maxx,
      maxy,
      scenario,
      extent,
    ]);
    const row = rows[0] || {};
    res.setHeader("Cache-Control", "no-store");
    res.json({
      indicator: indicatorKey,
      period,
      scenario: scenario || null,
      label: row.label || indicatorKey,
      unit: row.unit || null,
      polarity: row.polarity || "neutral",
      description: row.description || "",
      source_name: row.source_name || "",
      source_url: row.source_url || "",
      vmin: row.vmin,
      vmax: row.vmax,
      gvmin: row.gvmin,
      gvmax: row.gvmax,
      gposmin: row.gposmin,
      items: Array.isArray(row.items) ? row.items : [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
