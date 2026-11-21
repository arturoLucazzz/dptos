import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRunDate, runModeLabel, runStatusLabel } from './run-labels';

test('run statuses read in Spanish', () => {
  assert.equal(runStatusLabel('RUNNING'), 'En curso');
  assert.equal(runStatusLabel('SUCCESS'), 'Completa');
  assert.equal(runStatusLabel('PARTIAL'), 'Parcial');
  assert.equal(runStatusLabel('FAILED'), 'Falló');
});

test('run modes read in Spanish', () => {
  assert.equal(runModeLabel('TARGET_DAILY'), 'Diaria');
  assert.equal(runModeLabel('FULL_WEEKLY'), 'Semanal');
  assert.equal(runModeLabel('MANUAL'), 'Manual');
  assert.equal(runModeLabel('PROBE'), 'Prueba');
});

test('an unknown status or mode is shown as it comes', () => {
  assert.equal(runStatusLabel('OTHER'), 'OTHER');
  assert.equal(runModeLabel('OTHER'), 'OTHER');
});

test('run dates are written in Lima time, whatever the process time zone', () => {
  assert.match(formatRunDate('2026-11-20T03:30:00.000Z'), /19\/11\/2026/);
  assert.match(formatRunDate('2026-11-20T03:30:00.000Z'), /22:30/);
});
