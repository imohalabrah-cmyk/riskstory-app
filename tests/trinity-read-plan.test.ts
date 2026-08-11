import test from "node:test";
import assert from "node:assert/strict";
import { planTrinityReads } from "../app/lib/market/trinity-read-plan";

test("SPY normal load does not request Trinity reads", () => {
  assert.deepEqual(planTrinityReads("SPY", false), []);
});

test("Trinity demand requests SPX and QQQ while reusing the existing SPY read", () => {
  assert.deepEqual(planTrinityReads("SPY", true), [
    { symbol: "SPX", reuseSelectedRead: false },
    { symbol: "SPY", reuseSelectedRead: true },
    { symbol: "QQQ", reuseSelectedRead: false },
  ]);
});
