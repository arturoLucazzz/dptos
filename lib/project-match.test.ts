import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sameProject, type ProjectSide } from './project-match';

const base: ProjectSide = {
  districtSlug: 'lince',
  nameNorm: 'prolongacion iquitos',
  addressNorm: null,
  latitude: -12.0867,
  longitude: -77.0345,
};

describe('sameProject', () => {
  it('same name links', () => {
    assert.equal(sameProject(base, { ...base, latitude: null, longitude: null }), true);
  });

  it('same numbered address links', () => {
    const a = { ...base, nameNorm: null, addressNorm: 'jiron iquitos 1234' };
    const b = { ...base, nameNorm: 'otro nombre', addressNorm: 'jiron iquitos 1234' };
    assert.equal(sameProject(a, b), true);
  });

  it('same address without a number does not link', () => {
    const a = { ...base, nameNorm: null, addressNorm: 'jiron iquitos', latitude: null, longitude: null };
    const b = { ...base, nameNorm: 'x', addressNorm: 'jiron iquitos', latitude: null, longitude: null };
    assert.equal(sameProject(a, b), false);
  });

  it('close and similar name links', () => {
    const a = { ...base, nameNorm: 'prolongacion iquitos' };
    const b = { ...base, nameNorm: 'iquitos plaza', latitude: -12.08675 };
    assert.equal(sameProject(a, b), true);
  });

  it('close but different name stays apart', () => {
    const b = { ...base, nameNorm: 'los pinos', latitude: -12.08675 };
    assert.equal(sameProject(base, b), false);
  });

  it('far with similar name stays apart', () => {
    const b = { ...base, nameNorm: 'iquitos plaza', latitude: -12.0967 };
    assert.equal(sameProject(base, b), false);
  });

  it('other district stays apart', () => {
    assert.equal(sameProject(base, { ...base, districtSlug: 'jesus-maria' }), false);
  });
});
