'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSpaceDistance, computeCadenceBaseline, computeAwakeOverlapHours, realUtcOffsetMinutes, computeDistanceHealth, computeOverlapWindowUTC, isWithinOverlapWindow } = require('../index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'space-distance-test-')); }

async function main() {
  await test('realUtcOffsetMinutes: Kolkata is fixed +330 regardless of season (no DST)', () => {
    assert.strictEqual(realUtcOffsetMinutes('Asia/Kolkata', new Date('2026-07-01')), 330);
    assert.strictEqual(realUtcOffsetMinutes('Asia/Kolkata', new Date('2026-01-01')), 330);
  });

  await test('realUtcOffsetMinutes: New York genuinely shifts across DST (-240 summer, -300 winter)', () => {
    assert.strictEqual(realUtcOffsetMinutes('America/New_York', new Date('2026-07-01')), -240);
    assert.strictEqual(realUtcOffsetMinutes('America/New_York', new Date('2026-01-01')), -300);
  });

  await test('computeAwakeOverlapHours: real overlap genuinely differs by 1 hour across DST for this exact pair', () => {
    const summer = computeAwakeOverlapHours('Asia/Kolkata', 'America/New_York', new Date('2026-07-01'));
    const winter = computeAwakeOverlapHours('Asia/Kolkata', 'America/New_York', new Date('2026-01-01'));
    assert.strictEqual(summer, 5.5);
    assert.strictEqual(winter, 4.5);
  });

  await test('computeCadenceBaseline: honestly refuses to compute a baseline below the real minimum sample size', () => {
    const events = [{ timestamp: 1000 }, { timestamp: 2000 }];
    const baseline = computeCadenceBaseline(events);
    assert.strictEqual(baseline.hasBaseline, false);
    assert.strictEqual(baseline.meanGapHours, null);
  });

  await test('computeCadenceBaseline: real mean/stddev once enough real history exists', () => {
    const hour = 3600000;
    const events = [0, 24, 48, 72, 96, 120].map(h => ({ timestamp: h * hour })); // consistent 24h cadence
    const baseline = computeCadenceBaseline(events);
    assert.strictEqual(baseline.hasBaseline, true);
    assert.strictEqual(baseline.meanGapHours, 24);
    assert.strictEqual(baseline.stdDevHours, 0); // perfectly consistent -- real zero variance
  });

  await test('computeDistanceHealth: status reflects a real, computed deviation from THIS history, not a generic rule', () => {
    const hour = 3600000;
    const events = [0, 24, 48, 72, 96, 120].map(h => ({ timestamp: h * hour })); // baseline: 24h cadence
    const onBaseline = computeDistanceHealth(events, null, null, 144 * hour);
    assert.strictEqual(onBaseline.status, 'normal');

    const wayLater = computeDistanceHealth(events, null, null, 300 * hour);
    assert.strictEqual(wayLater.status, 'unusual-silence');
  });

  await test('logContact() is a real WARP Gate -- rejects an invalid contact type', async () => {
    const sd = buildSpaceDistance({ dataDir: tmpDir() });
    await assert.rejects(() => sd.logContact({ contactType: 'telepathy' }), /invalid contactType/);
    await assert.doesNotReject(() => sd.logContact({ contactType: 'call' }));
  });

  await test('setLocations() + health() uses real timezone data once set', async () => {
    const sd = buildSpaceDistance({ dataDir: tmpDir() });
    sd.setLocations({ personA: { timezone: 'America/New_York' }, personB: { timezone: 'Asia/Kolkata' } });
    const h = sd.health(new Date('2026-07-01').getTime());
    assert.strictEqual(h.overlapHours, 5.5);
  });

  await test('health() before any locations are set has honestly null overlap, not a fabricated default', async () => {
    const sd = buildSpaceDistance({ dataDir: tmpDir() });
    const h = sd.health();
    assert.strictEqual(h.overlapHours, null);
  });

  await test('survives a real process restart -- fresh instance, same dataDir, real contact history intact', async () => {
    const dir = tmpDir();
    const sd1 = buildSpaceDistance({ dataDir: dir });
    await sd1.logContact({ contactType: 'message', timestamp: 1000 });
    await sd1.logContact({ contactType: 'call', timestamp: 2000 });

    const sd2 = buildSpaceDistance({ dataDir: dir });
    const events = sd2.contactEvents();
    assert.strictEqual(events.length, 2);
  });

  await test('BUG REGRESSION: computeAwakeOverlapHours is genuinely symmetric -- argument order never changes the result', () => {
    const a = computeAwakeOverlapHours('Asia/Kolkata', 'America/New_York', new Date('2026-07-01'));
    const b = computeAwakeOverlapHours('America/New_York', 'Asia/Kolkata', new Date('2026-07-01'));
    assert.strictEqual(a, b, 'an earlier version returned 5.5 one order and 15 the other -- 15 also violated the real geometric upper bound (neither person is awake more than 15h/day)');
  });

  await test('BUG REGRESSION: a perfectly consistent (zero-variance) history still flags a real deviation, not silently "normal"', () => {
    const hour = 3600000;
    const events = [0, 24, 48, 72, 96, 120].map(h => ({ timestamp: h * hour })); // stddev genuinely 0
    const muchLater = computeDistanceHealth(events, null, null, 300 * hour); // 180h gap vs 24h mean
    assert.notStrictEqual(muchLater.status, 'normal', 'an earlier version defaulted zScore to 0 whenever stdDev was exactly 0, silently calling any deviation "normal" no matter how large');
  });

  await test('computeOverlapWindowUTC: real window duration matches computeAwakeOverlapHours exactly', () => {
    const window = computeOverlapWindowUTC('Asia/Kolkata', 'America/New_York', new Date('2026-07-01'));
    const duration = window.endUtcHour - window.startUtcHour;
    assert.strictEqual(+duration.toFixed(2), 5.5);
  });

  await test('isWithinOverlapWindow: a real timestamp in the middle of the window is correctly inside', () => {
    const window = computeOverlapWindowUTC('Asia/Kolkata', 'America/New_York', new Date('2026-07-01'));
    const midUtcHour = (window.startUtcHour + window.endUtcHour) / 2;
    const testDate = new Date('2026-07-01T00:00:00Z');
    testDate.setUTCHours(Math.floor(midUtcHour), (midUtcHour % 1) * 60);
    assert.strictEqual(isWithinOverlapWindow(testDate.getTime(), 'Asia/Kolkata', 'America/New_York'), true);
  });

  await test('isWithinOverlapWindow: a real timestamp well outside the window is correctly outside', () => {
    const window = computeOverlapWindowUTC('Asia/Kolkata', 'America/New_York', new Date('2026-07-01'));
    const testDate = new Date('2026-07-01T00:00:00Z');
    testDate.setUTCHours(Math.floor(window.startUtcHour));
    const outsideDate = new Date(testDate.getTime() - 12 * 3600000);
    assert.strictEqual(isWithinOverlapWindow(outsideDate.getTime(), 'Asia/Kolkata', 'America/New_York'), false);
  });

  await test('checkProposedTime: honestly reports unchecked when timezones are not both set', async () => {
    const sd = buildSpaceDistance({ dataDir: tmpDir() });
    const result = sd.checkProposedTime(Date.now());
    assert.strictEqual(result.checked, false);
    assert.strictEqual(result.withinOverlap, null);
  });

  await test('checkProposedTime: real check once both timezones are set', async () => {
    const sd = buildSpaceDistance({ dataDir: tmpDir() });
    sd.setLocations({ personA: { timezone: 'America/New_York' }, personB: { timezone: 'Asia/Kolkata' } });
    const window = computeOverlapWindowUTC('Asia/Kolkata', 'America/New_York', new Date());
    const midUtcHour = (window.startUtcHour + window.endUtcHour) / 2;
    const testDate = new Date();
    testDate.setUTCHours(Math.floor(midUtcHour), (midUtcHour % 1) * 60);
    const result = sd.checkProposedTime(testDate.getTime());
    assert.strictEqual(result.checked, true);
    assert.strictEqual(result.withinOverlap, true);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
