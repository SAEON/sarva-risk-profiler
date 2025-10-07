const { pool } = require("../../db/pool");

exports.municipalities = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      res.setHeader("Cache-Control", "no-store");
      return res.json([]);
    }
    const like = `%${q}%`;
    const sql = `
      WITH envs AS (
        SELECT code, name, ST_Extent(geom) AS env
        FROM admin.local_municipality_2018
        WHERE lower(name) ILIKE lower($1) OR code::text ILIKE $1
        GROUP BY code, name
      )
      SELECT code, name,
             ST_XMin(env) AS minx, ST_YMin(env) AS miny,
             ST_XMax(env) AS maxx, ST_YMax(env) AS maxy
      FROM envs
      ORDER BY name
      LIMIT 10;
    `;
    const { rows } = await pool.query(sql, [like]);
    res.setHeader("Cache-Control", "no-store");
    res.json(
      rows.map((r) => ({
        code: String(r.code),
        name: r.name,
        bbox: [Number(r.minx), Number(r.miny), Number(r.maxx), Number(r.maxy)],
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
