import { forwardRef } from "react";
import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react/lib";

/** A single SVG, inherited color, and a consistent optical weight across the portal. */
export function createPortalIcon(Source: Icon, weight: IconWeight = "duotone") {
  const PortalIcon = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 20, className, ...props }, ref) => (
      <Source
        ref={ref}
        size={size}
        weight={weight}
        aria-hidden={
          props["aria-label"] || props["aria-labelledby"] || props.alt
            ? undefined
            : true
        }
        focusable="false"
        {...props}
        className={`apice-icon ${className ?? ""}`.trim()}
      />
    ),
  );
  PortalIcon.displayName = `Portal${Source.displayName ?? "Icon"}`;
  return PortalIcon;
}
