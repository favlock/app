export type TooltipPosition = {
  left: number;
  top: number;
  placement: "above" | "below";
};

export function getProFeatureTooltipPosition({
  triggerRect,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  viewportHeight,
}: {
  triggerRect: Pick<DOMRect, "bottom" | "left" | "top" | "width">;
  tooltipWidth: number;
  tooltipHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): TooltipPosition {
  const margin = 8;
  const gap = 6;
  const width = Math.min(tooltipWidth, Math.max(0, viewportWidth - margin * 2));
  const height = Math.min(tooltipHeight, Math.max(0, viewportHeight - margin * 2));
  const halfWidth = width / 2;
  const minLeft = margin + halfWidth;
  const maxLeft = Math.max(minLeft, viewportWidth - margin - halfWidth);
  const roomAbove = triggerRect.top - margin;
  const roomBelow = viewportHeight - triggerRect.bottom - margin;
  const placement = roomAbove >= height + gap || roomAbove >= roomBelow
    ? "above"
    : "below";

  return {
    left: Math.min(
      maxLeft,
      Math.max(minLeft, triggerRect.left + triggerRect.width / 2),
    ),
    top: placement === "above"
      ? Math.min(
          Math.max(margin + height, viewportHeight - margin),
          Math.max(margin + height, triggerRect.top - gap),
        )
      : Math.min(
          Math.max(margin, viewportHeight - margin - height),
          Math.max(margin, triggerRect.bottom + gap),
        ),
    placement,
  };
}
