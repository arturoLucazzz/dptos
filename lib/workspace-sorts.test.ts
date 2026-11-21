import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PANEL } from './assumption-defaults';
import { DEFAULT_FILTERS } from './investments/filters';
import { filtersToQuery, WORKSPACE_SORTS } from './workspace-sorts';

describe('WORKSPACE_SORTS', () => {
  it('lists the nine sorts with their labels and orders', () => {
    assert.deepEqual(
      WORKSPACE_SORTS.map((s) => [s.id, s.label, s.order]),
      [
        ['monthlyGain', 'Ganancia mensual', 'desc'],
        ['grossYield', 'Rentabilidad bruta', 'desc'],
        ['cashReturn', 'Rinde sobre efectivo', 'desc'],
        ['descuento', 'Bajo precio de mercado', 'desc'],
        ['pricePerM2', 'Precio por m²', 'asc'],
        ['pricePen', 'Precio', 'asc'],
        ['entryCost', 'Efectivo día 1', 'asc'],
        ['location', 'Ubicación', 'desc'],
        ['newest', 'Más nuevos', 'asc'],
      ]
    );
  });
});

describe('filtersToQuery', () => {
  it('maps default filters to a query', () => {
    const q = filtersToQuery(DEFAULT_FILTERS, DEFAULT_PANEL, 2, 24);
    assert.equal(q.sort, 'monthlyGain');
    assert.equal(q.order, 'desc');
    assert.equal(q.page, 2);
    assert.equal(q.pageSize, 24);
    assert.equal(q.area, null);
    assert.equal(q.panel, DEFAULT_PANEL);
  });
});
