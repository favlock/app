import { Portal } from "@headlessui/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getProFeatureTooltipPosition,
  type TooltipPosition,
} from "../lib/tooltipPosition";

export default function ProFeatureTooltip({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return children;

  return <ActiveProFeatureTooltip>{children}</ActiveProFeatureTooltip>;
}

function ActiveProFeatureTooltip({ children }: { children: ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    left: 0,
    top: 0,
    placement: "above",
  });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPosition(getProFeatureTooltipPosition({
      triggerRect: trigger.getBoundingClientRect(),
      tooltipWidth: tooltipRef.current?.offsetWidth || 112,
      tooltipHeight: tooltipRef.current?.offsetHeight || 24,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, []);

  const show = () => {
    updatePosition();
    setVisible(true);
  };

  useLayoutEffect(() => {
    if (visible) updatePosition();
  }, [updatePosition, visible]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition, visible]);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-label="Annotations are available on Pro"
        aria-describedby={tooltipId}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        onFocus={show}
        onBlur={() => setVisible(false)}
        className="inline-flex cursor-help rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)] focus-visible:ring-offset-1"
      >
        {children}
      </span>
      {visible ? (
        <Portal>
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            data-placement={position.placement}
            className={`pointer-events-none fixed z-[100] -translate-x-1/2 rounded-md bg-[var(--app-ink)] px-2 py-1 text-[11px] font-semibold leading-4 text-[var(--app-card)] shadow-md ${position.placement === "above" ? "-translate-y-full" : ""}`}
            style={{ left: position.left, top: position.top }}
          >
            Available on Pro
          </span>
        </Portal>
      ) : null}
    </>
  );
}
