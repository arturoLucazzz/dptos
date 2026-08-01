import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { weekKey } from "./dates";

describe("weekKey", () => {
  it("buckets mid-week days into the Monday of that week", () => {
    // 2026-07-22 is a Wednesday; the Monday is 2026-07-20.
    assert.equal(weekKey(new Date("2026-07-22T15:00:00Z")), "2026-07-20");
  });

  it("keeps a Monday on itself", () => {
    assert.equal(weekKey(new Date("2026-07-20T08:00:00Z")), "2026-07-20");
  });

  it("puts Sunday with the week that started the day before", () => {
    // 2026-07-26 is Sunday; Monday of that week is 2026-07-20.
    assert.equal(weekKey(new Date("2026-07-26T12:00:00Z")), "2026-07-20");
  });
});
