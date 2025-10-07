const app = require('./app');
const { PORT, HOST } = require('./config/env');

app.listen(PORT, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
