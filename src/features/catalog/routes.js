const { Router } = require('express');
const c = require('./controller');
const r = Router();

r.get('/catalog/periods', c.periods);
r.get('/catalog/themes', c.themes);
r.get('/catalog/indicators', c.indicators);
r.get('/catalog/municipalities', c.municipalities);

module.exports = r;
