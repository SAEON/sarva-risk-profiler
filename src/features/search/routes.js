const { Router } = require("express");
const c = require("./controller");
const r = Router();
r.get("/search/municipalities", c.municipalities);
module.exports = r;