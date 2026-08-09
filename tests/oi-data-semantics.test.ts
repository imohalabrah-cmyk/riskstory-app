import assert from "node:assert/strict";
import test from "node:test";
import { buildGexCurvePoints, curveValue } from "../app/lib/gex-curve/curve-data";
import { addReportedValues, combineReportedValues, reportedNonNegative } from "../app/lib/market/reported-values";
import type { ExposureStrike } from "../app/lib/market/types";

const row: ExposureStrike = {
  strike: 740,
  callOpenInterest: null,
  putOpenInterest: 12,
  callVolume: null,
  putVolume: 0,
  callGex: 42,
  putGex: -18,
  netGex: 24,
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

test("reported OI and volume preserve a true zero while missing values remain null", () => {
  assert.equal(reportedNonNegative(0), 0);
  assert.equal(reportedNonNegative(Number.NaN), null);
  assert.equal(reportedNonNegative(Number.POSITIVE_INFINITY), null);
});

test("combined reported values require both sides and never turn missing into zero", () => {
  assert.equal(combineReportedValues(0, 12), 12);
  assert.equal(combineReportedValues(null, 12), null);
  assert.equal(combineReportedValues(0, null), null);
  assert.equal(combineReportedValues(null, null), null);
  assert.equal(addReportedValues(0, 5), 5);
  assert.equal(addReportedValues(5, null), null);
});

test("GEX transforms remain available while missing OI is not manufactured", () => {
  assert.equal(curveValue(row, "openInterest", "calls"), null);
  assert.equal(curveValue(row, "openInterest", "combined"), null);
  assert.deepEqual(buildGexCurvePoints([row], "openInterest", "combined"), []);
  assert.deepEqual(buildGexCurvePoints([row], "netGex", "combined"), [{ strike: 740, value: 24 }]);
});
