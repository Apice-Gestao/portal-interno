import { useEffect } from "react";
import type { ReactNode } from "react";
import { HashRouter, MemoryRouter, useLocation } from "react-router-dom";
import { DEMO_ROUTE, isHostedDemo } from "../services/portal-client";

// Hosted preview: routes live in memory (the artifact viewer reloads on hash
// URLs with query strings) and the open screen is remembered in this browser.
function savedRoute() {
  try {
    return localStorage.getItem(DEMO_ROUTE) ?? "/";
  } catch {
    return "/";
  }
}
function RememberRoute() {
  const location = useLocation();
  useEffect(() => {
    try {
      localStorage.setItem(DEMO_ROUTE, location.pathname + location.search);
    } catch {
      // Optional convenience.
    }
  }, [location]);
  return null;
}
export function Router({ children }: { children: ReactNode }) {
  return isHostedDemo ? (
    <MemoryRouter initialEntries={[savedRoute()]}>
      <RememberRoute />
      {children}
    </MemoryRouter>
  ) : (
    <HashRouter>{children}</HashRouter>
  );
}
