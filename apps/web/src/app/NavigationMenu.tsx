import { useState } from "react";
import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { DragHandleIcon } from "../shared/icons";
interface Item {
  path: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}
export function NavigationMenu({
  items,
  preferenceKey,
  compact,
  onNavigate,
}: {
  items: Item[];
  preferenceKey: string;
  compact: boolean;
  onNavigate: () => void;
}) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(preferenceKey) ?? "[]",
      );
      return Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (entry): entry is string => typeof entry === "string",
              ),
            ),
          ]
        : [];
    } catch {
      return [];
    }
  });
  const [dragged, setDragged] = useState<string>(),
    [target, setTarget] = useState<string>(),
    [announcement, setAnnouncement] = useState("");
  const sorted = [...items].sort((a, b) => {
    const ai = order.indexOf(a.path),
      bi = order.indexOf(b.path);
    return (
      (ai < 0 ? order.length + items.indexOf(a) : ai) -
      (bi < 0 ? order.length + items.indexOf(b) : bi)
    );
  });
  function move(source: string, destination: string) {
    if (source === destination) return;
    const paths = sorted.map((item) => item.path),
      from = paths.indexOf(source),
      to = paths.indexOf(destination);
    if (from < 0 || to < 0) return;
    paths.splice(from, 1);
    paths.splice(to, 0, source);
    const next = [...paths, ...order.filter((path) => !paths.includes(path))];
    setOrder(next);
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* The menu still works when browser preferences are unavailable. */
    }
    setAnnouncement(
      `${items.find((item) => item.path === source)?.label} movido para a posição ${to + 1} de ${paths.length}.`,
    );
  }
  return (
    <>
      <nav
        aria-label="Navegação principal"
        className={`reorderable-navigation ${dragged ? "navigation-dragging" : ""}`}
      >
        {sorted.map((item, index) => (
          <div
            key={item.path}
            className={`nav-row ${target === item.path && dragged !== item.path ? "nav-drop-target" : ""} ${dragged === item.path ? "nav-drag-source" : ""}`}
            draggable
            onDragStart={(event) => {
              setDragged(item.path);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-apice-menu", item.path);
            }}
            onDragOver={(event) => {
              if (dragged) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setTarget(item.path);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (
                dragged &&
                event.dataTransfer.getData("application/x-apice-menu") ===
                  dragged
              )
                move(dragged, item.path);
              setDragged(undefined);
              setTarget(undefined);
            }}
            onDragEnd={() => {
              setDragged(undefined);
              setTarget(undefined);
            }}
          >
            <NavLink
              to={item.path}
              draggable={false}
              onClick={onNavigate}
              title={compact ? item.label : undefined}
              aria-label={item.label}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={19} />
              <span className="nav-item-label">{item.label}</span>
            </NavLink>
            <button
              type="button"
              className="nav-drag-handle"
              aria-label={`Reordenar ${item.label}`}
              aria-describedby="menu-order-help"
              title="Arraste para reordenar · Alt + ↑ ou ↓ pelo teclado"
              onKeyDown={(event) => {
                if (
                  event.altKey &&
                  ["ArrowUp", "ArrowDown"].includes(event.key)
                ) {
                  event.preventDefault();
                  const destination =
                    sorted[index + (event.key === "ArrowUp" ? -1 : 1)];
                  if (destination) move(item.path, destination.path);
                }
              }}
            >
              <DragHandleIcon size={13} />
            </button>
          </div>
        ))}
      </nav>
      <span id="menu-order-help" className="sr-only">
        Arraste para ajustar a ordem. Pelo teclado, use Alt e as setas para cima
        ou para baixo. A preferência é salva para este usuário neste navegador.
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
