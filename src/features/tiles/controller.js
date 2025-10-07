const { pool } = require("../../db/pool");

exports.tile = async (req, res) => {
  try {
    const z = Number(req.params.z),
      x = Number(req.params.x),
      y = Number(req.params.y);
    const sql = `
      WITH bounds AS (SELECT ST_TileEnvelope($1,$2,$3) AS env3857),
      m AS (
        SELECT
          code, name,
          ST_AsMVTGeom(ST_Transform(geom,3857), (SELECT env3857 FROM bounds), 4096, 64, true) AS g
        FROM admin.local_municipality_2018
        WHERE ST_Transform(geom,3857) && (SELECT env3857 FROM bounds)
      )
      SELECT ST_AsMVT(m, 'lm', 4096, 'g') AS tile FROM m;
    `;
    const { rows } = await pool.query(sql, [z, x, y]);
    const tile = rows[0]?.tile || Buffer.alloc(0);
    res.setHeader("Content-Type", "application/vnd.mapbox-vector-tile");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(tile);
  } catch (e) {
    res.status(500).send(e.message);
  }
};
