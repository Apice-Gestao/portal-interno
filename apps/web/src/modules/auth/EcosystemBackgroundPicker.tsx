import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { BackgroundPaletteIcon, CheckIcon } from "../../shared/icons";
import {
  BACKGROUND_GROUPS,
  DEFAULT_BACKGROUND,
  DEFAULT_CARD,
} from "./ecosystem-backgrounds";

type Target = "background" | "cards";

// TEMPORARY: lets the user try page and card tones before one becomes the default.
export function EcosystemBackgroundPicker({
  background,
  cards,
  onBackgroundChange,
  onCardsChange,
}: {
  background: string;
  cards: string;
  onBackgroundChange: (id: string) => void;
  onCardsChange: (id: string) => void;
}) {
  const [target, setTarget] = useState<Target>("background");
  const value = target === "background" ? background : cards;
  const change = target === "background" ? onBackgroundChange : onCardsChange;
  return (
    <Popover.Root>
      <Popover.Trigger
        className="ecosystem-palette-trigger"
        aria-label="Escolher cores da tela"
        title="Escolher cores da tela"
      >
        <BackgroundPaletteIcon size={20} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="ecosystem-palette"
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
        >
          <div
            className="ecosystem-palette-tabs"
            role="tablist"
            aria-label="O que colorir"
          >
            {(
              [
                ["background", "Fundo"],
                ["cards", "Cartões"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={target === id}
                onClick={() => setTarget(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ecosystem-palette-heading">
            <strong>
              {target === "background" ? "Cor de fundo" : "Cor dos cartões"}
            </strong>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                change(
                  target === "background" ? DEFAULT_BACKGROUND : DEFAULT_CARD,
                )
              }
            >
              {target === "background"
                ? "Restaurar azul Ápice"
                : "Restaurar tom água"}
            </button>
          </div>
          <p className="ecosystem-palette-hint">
            {target === "cards"
              ? "As logos não mudam. A escolha fica salva só neste navegador."
              : "Teste à vontade: a escolha fica salva só neste navegador."}
          </p>
          {target === "cards" && (
            <section className="ecosystem-palette-group">
              <span>Padrão</span>
              <div role="radiogroup" aria-label="Padrão">
                <button
                  type="button"
                  role="radio"
                  aria-checked={value === DEFAULT_CARD}
                  aria-label="Tom água (padrão)"
                  title="Tom água (padrão)"
                  className="ecosystem-swatch"
                  data-tone="light"
                  style={{
                    background:
                      "linear-gradient(170deg, color-mix(in srgb, #16afc4 12%, white), color-mix(in srgb, #16afc4 26%, white))",
                  }}
                  onClick={() => change(DEFAULT_CARD)}
                >
                  {value === DEFAULT_CARD && <CheckIcon size={14} />}
                </button>
              </div>
            </section>
          )}
          {BACKGROUND_GROUPS.map((group) => (
            <section key={group.label} className="ecosystem-palette-group">
              <span>{group.label}</span>
              <div role="radiogroup" aria-label={group.label}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={item.id === value}
                    aria-label={item.name}
                    title={item.name}
                    className="ecosystem-swatch"
                    data-tone={item.tone}
                    style={{ background: item.value }}
                    onClick={() => change(item.id)}
                  >
                    {item.id === value && <CheckIcon size={14} />}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
