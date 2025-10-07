const { pool } = require('../../db/pool');

exports.periods = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT period::text AS period, COALESCE(label, period::text) AS label
      FROM dim.time
      WHERE granularity='year'
      ORDER BY period DESC;
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// GET /catalog/themes?kind=indicator|sub_index|index&period=YYYY
exports.themes = async (req, res) => {
  try {
    const kind   = (req.query.kind || '').toLowerCase();
    const period = req.query.period ? Number(req.query.period) : null;

    const params = [];
    const where  = ["NULLIF(btrim(i.theme),'') IS NOT NULL"];

    if (kind) {
      params.push(kind);
      where.push(`i.measure_type = $${params.length}`);
    }
    if (Number.isFinite(period)) {
      params.push(period);
      // only include themes that have values for this period
      where.push(`
        EXISTS (
          SELECT 1
          FROM data.indicator_value v
          JOIN dim.time t ON t.id = v.time_id
          WHERE v.indicator_id = i.id
            AND t.period = $${params.length}
        )
      `);
    }

    const sql = `
      SELECT DISTINCT NULLIF(btrim(i.theme),'') AS theme
      FROM catalog.indicator i
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY 1;
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows.map(r => r.theme));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// GET /catalog/indicators?kind=&theme=&period=
exports.indicators = async (req, res) => {
  try {
    const kind   = (req.query.kind || '').toLowerCase();
    const theme  = (req.query.theme || '').trim() || null;
    const period = req.query.period ? Number(req.query.period) : null;

    const params = [];
    const where  = [];

    if (kind) {
      params.push(kind);
      where.push(`i.measure_type = $${params.length}`);
    }
    if (theme) {
      params.push(theme);
      where.push(`i.theme = $${params.length}`);
    }
    if (Number.isFinite(period)) {
      params.push(period);
      // only include items that have values for this period
      where.push(`
        EXISTS (
          SELECT 1
          FROM data.indicator_value v
          JOIN dim.time t ON t.id = v.time_id
          WHERE v.indicator_id = i.id
            AND t.period = $${params.length}
        )
      `);
    }

    const sql = `
      SELECT i.key, i.label, i.category, i.unit, i.polarity, i.description, i.theme, i.measure_type
      FROM catalog.indicator i
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY COALESCE(i.sort_order, 9999), i.label, i.key;
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// GET /catalog/municipalities
exports.municipalities = async (_req, res) => {
  try {
    const sql = `
      SELECT
        code::text AS code,
        name,
        ST_XMin(geom) AS minx,
        ST_YMin(geom) AS miny,
        ST_XMax(geom) AS maxx,
        ST_YMax(geom) AS maxy
      FROM admin.local_municipality_2018
      ORDER BY name;
    `;
    const { rows } = await pool.query(sql);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(rows.map(r => ({
      code: r.code,
      name: r.name,
      bbox: [Number(r.minx), Number(r.miny), Number(r.maxx), Number(r.maxy)]
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
