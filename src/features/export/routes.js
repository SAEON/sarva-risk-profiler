const { Router } = require('express');
const c = require('./controller');

const r = Router();
r.get('/export/shapefile', c.shapefile);
module.exports = r;
