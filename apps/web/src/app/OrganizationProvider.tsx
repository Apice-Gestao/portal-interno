import { useState } from "react";
import type { ReactNode } from "react";
import { ORGANIZATIONS, OrganizationContext } from "./OrganizationContext";
import type { Organization } from "./OrganizationContext";
import { isHostedDemo } from "../services/portal-client";

// Hosted preview only: the chosen group survives a reload, like the login.
const DEMO_GROUP = "apice.demo.group.v1";
function rememberedGroup(): Organization | undefined {
  if (!isHostedDemo) return undefined;
  try {
    const id = localStorage.getItem(DEMO_GROUP);
    return ORGANIZATIONS.find((item) => item.id === id);
  } catch {
    return undefined;
  }
}
function rememberGroup(id?: string) {
  if (!isHostedDemo) return;
  try {
    if (id) localStorage.setItem(DEMO_GROUP, id);
    else localStorage.removeItem(DEMO_GROUP);
  } catch {
    // Optional convenience.
  }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [group, setGroup] = useState<Organization | undefined>(rememberedGroup);
  return (
    <OrganizationContext.Provider
      value={{
        group,
        selectGroup: (id) => {
          rememberGroup(id);
          setGroup(ORGANIZATIONS.find((item) => item.id === id));
        },
        clearGroup: () => {
          rememberGroup(undefined);
          setGroup(undefined);
        },
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
