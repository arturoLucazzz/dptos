import assert from 'node:assert/strict';
import test from 'node:test';
import { MAP_LOCALE } from './map-locale';

test('the map controls speak Spanish', () => {
  assert.equal(MAP_LOCALE['Map.Title'], 'Mapa');
  assert.equal(MAP_LOCALE['NavigationControl.ZoomIn'], 'Acercar');
  assert.equal(MAP_LOCALE['NavigationControl.ZoomOut'], 'Alejar');
  assert.equal(MAP_LOCALE['NavigationControl.ResetBearing'], 'Restablecer el norte');
  assert.equal(MAP_LOCALE['AttributionControl.ToggleAttribution'], 'Mostrar u ocultar los créditos');
});
