// Mock child_process before requiring the module under test
jest.mock('child_process', () => {
  const execFile = jest.fn((file, args, cb) => cb(null, { stdout: '', stderr: '' }));
  return { execFile };
});

const { execFile } = require('child_process');
const gdal = require('../../src/services/gdal');

describe('services/gdal', () => {
  beforeEach(() => execFile.mockClear());

  test('ogr2ogrToShapefile calls ogr2ogr with expected args', async () => {
    await gdal.ogr2ogrToShapefile({
      shpPath: '/tmp/out.shp',
      pgDsn: 'host=localhost dbname=db user=u',
      sql: 'SELECT 1',
      layerName: 'layer_name',
    });
    expect(execFile).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFile.mock.calls[0];
    expect(cmd).toBe('ogr2ogr');
    expect(args).toEqual([
      '-f', 'ESRI Shapefile',
      '/tmp/out.shp',
      'host=localhost dbname=db user=u',
      '-sql', 'SELECT 1',
      '-nln', 'layer_name',
      '-lco', 'ENCODING=UTF-8',
    ]);
  });

  test('zipFiles uses platform-appropriate archiver', async () => {
    await gdal.zipFiles({ zipPath: '/tmp/out.zip', parts: ['/a.shp', '/a.dbf'] });
    expect(execFile).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFile.mock.calls[0];
    if (process.platform === 'win32') {
      expect(cmd.toLowerCase()).toContain('powershell');
      expect(args.join(' ')).toContain('Compress-Archive');
      expect(args.join(' ')).toContain('/tmp/out.zip');
    } else {
      expect(cmd).toBe('zip');
      expect(args).toEqual(['-j', '/tmp/out.zip', '/a.shp', '/a.dbf']);
    }
  });
});
