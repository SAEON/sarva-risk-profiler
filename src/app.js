const express = require('express');
const compression = require('compression');
const cors = require('cors');
const { CORS_ORIGIN } = require('./config/env');

const catalogRoutes = require('./features/catalog/routes');
const catalogExport = require('./features/export/routes');
const errorHandler = require('./middleware/errors');

const app = express();

app.set('etag', 'strong');
app.use(express.json({ limit: '1mb' }));
app.use(compression());

const allowlist = (Array.isArray(CORS_ORIGIN) ? CORS_ORIGIN
  : String(CORS_ORIGIN || '*').split(','))
  .map(s => s.trim()).filter(Boolean);

const corsOrigin = allowlist.includes('*') || allowlist.length === 0
  ? '*'
  : allowlist;

app.use(cors({
  origin: corsOrigin,
  optionsSuccessStatus: 200,
}));

app.use(catalogRoutes);
app.use(catalogExport);
app.use(require("./features/tiles/routes"));
app.use(require("./features/choropleth/routes"));
app.use(require("./features/search/routes"));

app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
app.use(errorHandler);

module.exports = app;
