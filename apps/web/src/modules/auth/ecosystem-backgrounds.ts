// TEMPORARY: options for the user to choose the group selection background.
// Remove the picker once a tone is chosen and becomes the fixed default.

export type BackgroundTone = "dark" | "mid" | "light";
export interface EcosystemBackground {
  id: string;
  name: string;
  value: string;
  tone: BackgroundTone;
}

const solid = (id: string, name: string, hex: string): EcosystemBackground => {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return {
    id,
    name,
    value: hex,
    tone: luminance < 0.18 ? "dark" : luminance < 0.55 ? "mid" : "light",
  };
};
const gradient = (
  id: string,
  name: string,
  from: string,
  to: string,
  tone: BackgroundTone,
): EcosystemBackground => ({
  id,
  name,
  value: `linear-gradient(160deg, ${from}, ${to})`,
  tone,
});

export const DEFAULT_BACKGROUND = "apice-blue";
export const DEFAULT_CARD = "default";

export const BACKGROUND_GROUPS: {
  label: string;
  items: EcosystemBackground[];
}[] = [
  {
    label: "Paleta Ápice",
    items: [
      solid("apice-blue", "Azul Ápice", "#16AFC4"),
      solid("apice-mid", "Azul intermediário", "#1297A6"),
      solid("apice-teal", "Azul-petróleo", "#0E7F87"),
      solid("apice-deep", "Petróleo profundo", "#115962"),
      solid("apice-slate", "Grafite azulado", "#153D4A"),
      solid("apice-ink", "Grafite", "#15202B"),
      solid("apice-water", "Água clara", "#D0EFF3"),
      solid("apice-mist", "Névoa", "#F2F5F6"),
    ],
  },
  {
    label: "Azuis",
    items: [
      solid("navy", "Azul-marinho", "#0B1F3A"),
      solid("deep-blue", "Azul profundo", "#1E3A5F"),
      solid("royal", "Azul royal", "#2563EB"),
      solid("indigo", "Índigo", "#3730A3"),
      solid("sky", "Azul-céu", "#7DD3FC"),
      solid("ice", "Azul-gelo", "#E0F2FE"),
    ],
  },
  {
    label: "Verdes",
    items: [
      solid("forest", "Verde-floresta", "#14532D"),
      solid("emerald", "Esmeralda", "#059669"),
      solid("aqua", "Verde-água", "#2DD4BF"),
      solid("sage", "Sálvia", "#A7C4B5"),
      solid("mint", "Menta", "#D1FAE5"),
    ],
  },
  {
    label: "Neutros",
    items: [
      solid("black", "Preto", "#0A0A0A"),
      solid("charcoal", "Carvão", "#1F2937"),
      solid("slate", "Ardósia", "#475569"),
      solid("gray", "Cinza médio", "#9CA3AF"),
      solid("light-gray", "Cinza-claro", "#E5E7EB"),
      solid("white", "Branco", "#FFFFFF"),
    ],
  },
  {
    label: "Quentes",
    items: [
      solid("wine", "Vinho", "#7F1D1D"),
      solid("terracotta", "Terracota", "#C2410C"),
      solid("amber", "Âmbar", "#F59E0B"),
      solid("peach", "Pêssego", "#FBCFB4"),
      solid("sand", "Areia", "#F5E6CC"),
    ],
  },
  {
    label: "Roxos",
    items: [
      solid("plum", "Ameixa", "#4C1D95"),
      solid("violet", "Violeta", "#7C3AED"),
      solid("lavender", "Lavanda", "#DDD6FE"),
    ],
  },
  {
    label: "Gradientes",
    items: [
      gradient("g-apice", "Ápice", "#16AFC4", "#0E7F87", "mid"),
      gradient("g-ocean", "Oceano", "#0E7F87", "#15202B", "dark"),
      gradient("g-night", "Noite", "#15202B", "#0B1F3A", "dark"),
      gradient("g-aurora", "Aurora", "#16AFC4", "#7C3AED", "mid"),
      gradient("g-lagoon", "Lagoa", "#2DD4BF", "#16AFC4", "mid"),
      gradient("g-dawn", "Amanhecer", "#F2F5F6", "#D0EFF3", "light"),
      gradient("g-pearl", "Pérola", "#FFFFFF", "#E0F2FE", "light"),
    ],
  },
];

export const BACKGROUNDS = BACKGROUND_GROUPS.flatMap((group) => group.items);
