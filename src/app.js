const express = require('express');
const compression = require('compression');
const cors = require('cors');
const { CORS_ORIGIN } = require('./config/env');

const catalogRoutes = require('./features/catalog/routes');

const app = express();
app.set('etag', 'strong');
app.use(express.json({ limit: '1mb' }));
app.use(compression());
app.use(cors({ origin: CORS_ORIGIN.length ? CORS_ORIGIN : '*', optionsSuccessStatus: 200 }));

app.use(catalogRoutes);

app.use(require('./middleware/error'));

module.exports = app;
