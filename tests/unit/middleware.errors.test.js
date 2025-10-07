const errorHandler = require('../../src/middleware/errors');

function createRes() {
  const res = {};
  res.statusCode = 200;
  res.headers = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.jsonData = null;
  res.json = (data) => { res.jsonData = data; return res; };
  return res;
}

describe('middleware/errors', () => {
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => consoleSpy.mockRestore());

  test('formats error response with 500', () => {
    const err = new Error('boom');
    const res = createRes();
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.jsonData).toEqual({ error: 'boom' });
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('handles non-Error inputs gracefully', () => {
    const res = createRes();
    errorHandler('oops', {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.jsonData).toEqual({ error: 'Internal Server Error' });
  });
});

