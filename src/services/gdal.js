const { promisify } = require('util');
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);

async function ogr2ogrToShapefile({ shpPath, pgDsn, sql, layerName }) {
  await execFileAsync('ogr2ogr', [
    '-f', 'ESRI Shapefile',
    shpPath,
    pgDsn,
    '-sql', sql,
    '-nln', layerName,
    '-lco', 'ENCODING=UTF-8',
  ]);
}

async function zipFiles({ zipPath, parts }) {
  await execFileAsync('zip', ['-j', zipPath, ...parts]);
}

module.exports = { ogr2ogrToShapefile, zipFiles };
