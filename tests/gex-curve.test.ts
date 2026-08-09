import assert from "node:assert/strict";
import test from "node:test";
import { buildGexCurvePoints, curveMeasure, curveValue } from "../app/lib/gex-curve/curve-data";
import type { ExposureStrike } from "../app/lib/market/types";

const row: ExposureStrike = {
  strike: 740,
  callOpenInterest: 120,
  putOpenInterest: 80,
  callVolume: 0,
  putVolume: 0,
  callGex: 50,
  putGex: -30,
  netGex: 20,
  callDex: 0,
  putDex: 0,
  netDex: 0,
  callVanna: 0,
  putVanna: 0,
  netVanna: 0,
  callCharm: 0,
  putCharm: 0,
  netCharm: 0,
  combined: 0,
};

test("curve values preserve current exposure semantics", () => {
  assert.equal(curveValue(row, "gex", "calls"), 50);
  assert.equal(curveValue(row, "gex", "puts"), -30);
  assert.equal(curveValue(row, "gex", "combined"), 80);
  assert.equal(curveValue(row, "netGex", "combined"), 20);
  assert.equal(curveValue(row, "openInterest", "combined"), 200);
});

test("curve points retain only actual finite strikes and sort them without creating points", () => {
  const points = buildGexCurvePoints([{ ...row, strike: 745 }, { ...row, strike: 735 }, { ...row, strike: Number.NaN }], "netGex", "combined");
  assert.deepEqual(points, [{ strike: 735, value: 20 }, { strike: 745, value: 20 }]);
});

test("curve measure makes gross and net GEX labels distinct", () => {
  assert.equal(curveMeasure("gex", "combined").label, "Gross GEX");
  assert.equal(curveMeasure("netGex", "combined").label, "Net GEX");
});
