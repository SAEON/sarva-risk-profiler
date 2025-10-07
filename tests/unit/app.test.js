const request = require('supertest');

describe('app (CORS and 404)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // restore env and module cache
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('allows configured origin via CORS', async () => {
    process.env.CORS_ORIGIN = 'http://allowed.test';
    jest.resetModules();
    const app = require('../../src/app');
    const res = await request(app)
      .get('/__not_found__')
      .set('Origin', 'http://allowed.test');
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'not_found' });
  });

  test('wildcard CORS when no allowlist', async () => {
    process.env.CORS_ORIGIN = '';
    jest.resetModules();
    const app = require('../../src/app');
    const res = await request(app)
      .get('/__not_found__')
      .set('Origin', 'http://random.test');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.status).toBe(404);
  });
});

