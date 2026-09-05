import { describe, expect, it } from "vitest";
import { getProFeatureTooltipPosition } from "../lib/tooltipPosition";

describe("ProFeatureTooltip positioning", () => {
  it("opens below a trigger near the top and stays inside the left edge", () => {
    expect(getProFeatureTooltipPosition({
      triggerRect: { left: 4, top: 4, bottom: 36, width: 32 },
      tooltipWidth: 104,
      tooltipHeight: 24,
      viewportWidth: 320,
      viewportHeight: 240,
    })).toEqual({ left: 60, top: 42, placement: "below" });
  });

  it("opens above a trigger near the bottom and stays inside the right edge", () => {
    expect(getProFeatureTooltipPosition({
      triggerRect: { left: 294, top: 200, bottom: 232, width: 32 },
      tooltipWidth: 104,
      tooltipHeight: 24,
      viewportWidth: 320,
      viewportHeight: 240,
    })).toEqual({ left: 260, top: 194, placement: "above" });
  });
});
