module.exports = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, '_');
