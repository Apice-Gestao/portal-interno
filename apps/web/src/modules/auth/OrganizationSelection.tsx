import { useState } from "react";
import type { CSSProperties } from "react";
import { ForwardIcon, SecurityIcon } from "../../shared/icons";
import { ORGANIZATIONS, useOrganization } from "../../app/OrganizationContext";
import { EcosystemBackgroundPicker } from "./EcosystemBackgroundPicker";
import {
  BACKGROUNDS,
  DEFAULT_BACKGROUND,
  DEFAULT_CARD,
} from "./ecosystem-backgrounds";
import "./auth.css";

const BACKGROUND_KEY = "apice.ecosystem.background";
const CARDS_KEY = "apice.ecosystem.cards";
function stored(key: string, fallback: string) {
  try {
    const id = localStorage.getItem(key);
    return BACKGROUNDS.some((item) => item.id === id) ? id! : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, id: string) {
  try {
    localStorage.setItem(key, id);
  } catch {
    // Private mode or blocked storage: the choice simply lasts this visit.
  }
}

export function OrganizationSelection() {
  const { selectGroup } = useOrganization();
  const [backgroundId, setBackgroundId] = useState(() =>
    stored(BACKGROUND_KEY, DEFAULT_BACKGROUND),
  );
  const [cardsId, setCardsId] = useState(() => stored(CARDS_KEY, DEFAULT_CARD));
  const background =
    BACKGROUNDS.find((item) => item.id === backgroundId) ?? BACKGROUNDS[0]!;
  const cards = BACKGROUNDS.find((item) => item.id === cardsId);
  const changeBackground = (id: string) => {
    setBackgroundId(id);
    remember(BACKGROUND_KEY, id);
  };
  const changeCards = (id: string) => {
    setCardsId(id);
    remember(CARDS_KEY, id);
  };
  return (
    <main
      className="ecosystem-page"
      data-tone={background.tone}
      data-card-tone={cards?.tone}
      style={
        {
          "--ecosystem-bg": background.value,
          ...(cards && { "--ecosystem-card-bg": cards.value }),
        } as CSSProperties
      }
    >
      <div className="ecosystem-backdrop" aria-hidden="true" />
      <div className="ecosystem-heading">
        <span className="ecosystem-badge">
          Grupo <strong>Ápice</strong>
        </span>
        <h1>Seu ambiente de trabalho.</h1>
      </div>
      <div className="ecosystem-groups">
        {ORGANIZATIONS.map((item, index) => {
          return (
            <button
              type="button"
              className="ecosystem-card"
              key={item.id}
              style={{ "--order": index } as CSSProperties}
              onClick={() => selectGroup(item.id)}
            >
              <span className={`ecosystem-logo ecosystem-logo-${item.id}`}>
                <img
                  src={item.logo.src}
                  alt=""
                  width={item.logo.width}
                  height={item.logo.height}
                />
              </span>
              {/* The logo already shows the name; the heading keeps it for screen readers. */}
              <h2 className="sr-only">{item.name}</h2>
              <span className="ecosystem-cta">
                Acessar ambiente <ForwardIcon size={17} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="ecosystem-note">
        <SecurityIcon size={16} />
        Acesso individual, conforme as permissões de cada grupo.
      </p>
      <p className="ecosystem-disclaimer">
        Todos os textos são meramente ilustrativos.
      </p>
      <EcosystemBackgroundPicker
        background={background.id}
        cards={cards?.id ?? DEFAULT_CARD}
        onBackgroundChange={changeBackground}
        onCardsChange={changeCards}
      />
    </main>
  );
}
