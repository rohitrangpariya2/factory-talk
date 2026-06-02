import fs from 'fs';
import path from 'path';

describe('road match API route source', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

  test('registers GET and POST road-match endpoints with request validation and cache', () => {
    expect(indexSource).toContain("app.get('/road-match', roadMatchHandler)");
    expect(indexSource).toContain("app.post('/road-match', roadMatchHandler)");
    expect(indexSource).toContain('readRoadMatchRequestPoints(req)');
    expect(indexSource).toContain('if (result.coordinates.length < 2)');
    expect(indexSource).toContain('roadMatchCache.get(key)');
    expect(indexSource).toContain('buildOsrmMatchUrl(prepared)');
    expect(indexSource).toContain('parseOsrmMatchResponse');
  });
});
