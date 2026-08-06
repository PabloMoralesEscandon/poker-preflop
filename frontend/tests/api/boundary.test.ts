import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest's root is `frontend/`.
const SRC = join(process.cwd(), 'src');
const API_DIR = join(SRC, 'api');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const outsideApi = sourceFiles(SRC).filter((file) => !file.startsWith(API_DIR));

/**
 * The hard constraint from FE-02: no component, page, or hook may know whether
 * it is talking to the mock or the real server. This is cheap to violate by
 * accident and expensive to discover at integration, so it is a test.
 */
describe('api boundary', () => {
  it('has files to check', () => {
    expect(outsideApi.length).toBeGreaterThan(0);
  });

  it('keeps fixture imports inside src/api', () => {
    const offenders = outsideApi.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('@fixtures') || source.includes('docs/examples');
    });
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });

  it('keeps the concrete client implementations inside src/api', () => {
    const offenders = outsideApi.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /from\s+['"][^'"]*api\/(mock|live)['"]/.test(source);
    });
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });
});
