import assert from "node:assert/strict";
import test from "node:test";
import { clearedLinkedSelection, resolveLinkedStrike, selectionMatchesSymbol } from "../app/lib/intelligence/selection-linking";

test("GEX and OI selections preserve symbol, strike, and expiration for linked workspaces", () => {
  const selection = { symbol: "SPY", strike: 744, expiration: "2026-08-21" };
  assert.equal(selectionMatchesSymbol(selection, "SPY"), true);
  assert.equal(resolveLinkedStrike(selection, { symbol: "SPY", strikes: [740, 744, 745], expiration: "2026-08-21" }), 744);
});

test("wrong symbols and expiration-specific mismatches do not link a strike", () => {
  const selection = { symbol: "SPY", strike: 744, expiration: "2026-08-21" };
  assert.equal(resolveLinkedStrike(selection, { symbol: "QQQ", strikes: [744] }), null);
  assert.equal(resolveLinkedStrike(selection, { symbol: "SPY", strikes: [744], expiration: "2026-08-22" }), null);
});

test("missing strikes never create a linked row and clear selection resets the contract", () => {
  const selection = { symbol: "SPY", strike: 744, expiration: null };
  assert.equal(resolveLinkedStrike(selection, { symbol: "SPY", strikes: [740, 745] }), null);
  assert.deepEqual(clearedLinkedSelection(), { symbol: "SPY", strike: null, expiration: null });
});
