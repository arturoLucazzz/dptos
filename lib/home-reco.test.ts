import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecoParams } from './home-rows';

const p = (q: string) => parseRecoParams(new URLSearchParams(q));

test('parseRecoParams defaults and bounds', () => {
  assert.deepEqual(p(''), { mode: 'gain', n: 16 });
  assert.deepEqual(p('mode=yield&n=24'), { mode: 'yield', n: 24 });
  assert.deepEqual(p('mode=nope&n=abc'), { mode: 'gain', n: 16 });
  assert.deepEqual(p('orden=yield'), { mode: 'yield', n: 16 });
  assert.deepEqual(p('orden=new&mode=yield'), { mode: 'new', n: 16 });
  assert.equal(p('n=0').n, 16);
  assert.equal(p('n=999999').n, 200);
  assert.equal(p('n=20.7').n, 21);
});
