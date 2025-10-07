const { Router } = require("express");
const c = require("./controller");
const r = Router();
r.get("/choropleth/indicator/:indicatorKey", c.indicator);
module.exports = r;
