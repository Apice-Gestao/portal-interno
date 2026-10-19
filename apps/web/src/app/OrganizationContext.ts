import { createContext, useContext } from "react";
export const ORGANIZATIONS = [
  {
    id: "contabil",
    name: "Ápice Contábil",
    subtitle: "Operação e gestão contábil",
    shortName: "Contábil",
    logo: {
      src: `${import.meta.env.BASE_URL}branding/apice-contabil.webp`,
      width: 1024,
      height: 419,
    },
  },
  {
    id: "go",
    name: "Ápice Go",
    subtitle: "Operação do grupo Ápice Go",
    shortName: "Go",
    logo: {
      src: `${import.meta.env.BASE_URL}branding/apice-go.png`,
      width: 1276,
      height: 419,
    },
  },
  {
    id: "condominios",
    name: "Ápice Condomínios",
    subtitle: "Operação e gestão de condomínios",
    shortName: "Condomínios",
    logo: {
      src: `${import.meta.env.BASE_URL}branding/apice-condominios.png`,
      width: 1024,
      height: 419,
    },
  },
] as const;
export type OrganizationId = (typeof ORGANIZATIONS)[number]["id"];
export type Organization = (typeof ORGANIZATIONS)[number];
export const OrganizationContext = createContext<{
  group?: Organization;
  selectGroup: (id: OrganizationId) => void;
  clearGroup: () => void;
} | null>(null);
export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("Ambiente do portal indisponível.");
  return context;
}
