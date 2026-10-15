import { createContext, useContext } from "react";
import type { Actor, Department, Snapshot } from "@apice/domain";
import type { PortalClient } from "../services/portal-client";
export interface PortalContextValue {
  actor: Actor;
  client: PortalClient;
  data: Snapshot;
  department: Department;
  setDepartment: (value: Department) => void;
  competence: string;
  setCompetence: (value: string) => void;
  logout: () => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  updating: boolean;
  localTest: boolean;
}
export const Context = createContext<PortalContextValue | null>(null);
export function usePortal() {
  const value = useContext(Context);
  if (!value) throw new Error("Portal context is unavailable");
  return value;
}
