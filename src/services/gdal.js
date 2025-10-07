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
  if (process.platform === 'win32') {
    const ps = 'powershell.exe';
    const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const list = parts.map(quote).join(',');
    const cmd = `Compress-Archive -LiteralPath ${list} -DestinationPath ${quote(zipPath)} -Force`;
    await execFileAsync(ps, ['-NoProfile', '-Command', cmd]);
  } else {
    await execFileAsync('zip', ['-j', zipPath, ...parts]);
  }
}

module.exports = { ogr2ogrToShapefile, zipFiles };
