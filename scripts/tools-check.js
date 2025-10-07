// Checks presence of external tools required for E2E export and geospatial ops.
// - GDAL: ogr2ogr
// - Zip capability: 'zip' on POSIX, or PowerShell Compress-Archive on Windows

const { spawnSync } = require('child_process');

function checkCmd(cmd, args = ['--version']) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.error) return { ok: false, error: r.error.message };
    if (r.status !== 0) return { ok: false, error: r.stderr || `exit ${r.status}` };
    return { ok: true, stdout: r.stdout.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function main() {
  let ok = true;
  console.log('Tools check: starting');

  // Check GDAL ogr2ogr
  const gdal = checkCmd('ogr2ogr', ['--version']);
  if (gdal.ok) {
    console.log(' - ogr2ogr: OK ->', gdal.stdout.split('\n')[0]);
  } else {
    ok = false;
    console.error(' - ogr2ogr: MISSING ->', gdal.error);
  }

  // Check zip capability
  if (process.platform === 'win32') {
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Command Compress-Archive | Out-Null; if($?) { Write-Output ok } else { exit 1 }'], { encoding: 'utf8' });
    if (ps.status === 0 && (ps.stdout || '').toLowerCase().includes('ok')) {
      console.log(' - Compress-Archive: OK (PowerShell)');
    } else {
      ok = false;
      console.error(' - Compress-Archive: MISSING -> ensure PowerShell 5+ is available');
    }
  } else {
    const zip = checkCmd('zip', ['-v']);
    if (zip.ok) {
      console.log(' - zip: OK');
    } else {
      ok = false;
      console.error(' - zip: MISSING ->', zip.error);
    }
  }

  if (!ok) {
    console.error('\nTools check: FAILED');
    console.error('Install guidance:');
    if (process.platform === 'win32') {
      console.error(' - GDAL (ogr2ogr): install via OSGeo4W (https://trac.osgeo.org/osgeo4w/) or Chocolatey: choco install gdal');
      console.error(' - Zip: PowerShell Compress-Archive is built-in on Windows 10+; ensure PowerShell is available.');
    } else if (process.platform === 'darwin') {
      console.error(' - GDAL: brew install gdal');
      console.error(' - Zip: usually preinstalled; otherwise brew install zip');
    } else {
      console.error(' - GDAL: apt-get install gdal-bin (Debian/Ubuntu) or yum install gdal (RHEL/CentOS)');
      console.error(' - Zip: apt-get install zip or yum install zip');
    }
    process.exit(1);
  } else {
    console.log('\nTools check: SUCCESS');
  }
}

main();

