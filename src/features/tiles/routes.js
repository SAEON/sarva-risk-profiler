const { Router } = require("express");
const c = require("./controller");
const r = Router();

r.get("/tiles/:z/:x/:y.mvt", c.tile);
module.exports = r;