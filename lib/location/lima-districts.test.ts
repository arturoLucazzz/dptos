import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMA_PROVINCE_DISTRICTS, isLimaDistrict } from './lima-districts';
import { LIMA_DISTRICT_SLUGS } from '../../scraper/src/config/districts';

test('Lima has 43 districts, includes every scraped slug, excludes callao', () => {
  assert.equal(LIMA_PROVINCE_DISTRICTS.length, 43);
  assert.equal(new Set(LIMA_PROVINCE_DISTRICTS.map((d) => d.slug)).size, 43);
  for (const slug of LIMA_DISTRICT_SLUGS) assert.ok(isLimaDistrict(slug), slug);
  assert.ok(isLimaDistrict('lima'));
  assert.equal(isLimaDistrict('callao'), false);
  assert.equal(isLimaDistrict('bellavista'), false);
});
