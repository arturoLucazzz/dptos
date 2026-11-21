import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// The app is dark only: pale backgrounds and dark text from Tailwind's fixed palette show as white blocks.
const LIGHT = /\b(bg|border)-[a-z]+-(50|100|200|300)\b|\btext-[a-z]+-(700|800|900|950)\b|\bbg-white\b|\btext-black\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test('no fixed light colors in app or components', () => {
  const hits: string[] = [];
  for (const file of [...sourceFiles('app'), ...sourceFiles('components')]) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const m of line.matchAll(LIGHT)) hits.push(`${file}:${i + 1} ${m[0]}`);
      });
  }
  assert.deepEqual(hits, []);
});
