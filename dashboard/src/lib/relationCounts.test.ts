import { describe, expect, it } from "vitest";
import { countRelations } from "./relationCounts";

describe("countRelations", () => {
  it("counts links by relation and ignores empty ids", () => {
    expect(
      countRelations(["first", "second", "first", null, undefined, "first"]),
    ).toEqual({ first: 3, second: 1 });
  });
});
