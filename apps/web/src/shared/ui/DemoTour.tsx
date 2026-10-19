import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { isHostedDemo } from "../../services/portal-client";
import { TOUR_ORDER, TOUR_STEPS } from "./demo-tour-steps";
import type { TourStep } from "./demo-tour-steps";
import "./demo-tour.css";

// TEMPORARY (17/10/2026): guided tour shown only in the client demonstration
// (hosted preview). Runs again every time a module is opened; "Pular" ends it
// for that visit. Remove per docs/TUTORIAL-DEMO-TEMPORARIO.md.
function enabled() {
  if (isHostedDemo) return true;
  try {
    return (
      import.meta.env.DEV && localStorage.getItem("apice.demo-tour") === "on"
    );
  } catch {
    return false;
  }
}

// "Desativar tutorial" lasts until the page is reloaded (as requested).
let disabledUntilReload = false;

type Box = {
  top: number;
  left: number;
  width: number;
  height: number;
  /** The step this box was measured for (avoids showing a stale position). */
  step: string;
};

function findSelector(selector: string) {
  return find({ target: selector, title: "", text: "" });
}

/** CSS selector, or "css@Text" for the first match whose text contains Text. */
function query(selector: string) {
  const at = selector.lastIndexOf("@");
  if (at <= 0) return document.querySelector<HTMLElement>(selector);
  const text = selector
    .slice(at + 1)
    .trim()
    .toLocaleLowerCase("pt-BR");
  return [
    ...document.querySelectorAll<HTMLElement>(selector.slice(0, at).trim()),
  ].find((element) =>
    element.textContent?.toLocaleLowerCase("pt-BR").includes(text),
  );
}

/** Only modules in this visitor's menu count (an operator sees fewer). */
function reachable(to: string) {
  const path = to.split("?")[0];
  return [
    ...document.querySelectorAll<HTMLAnchorElement>("aside.sidebar nav a"),
  ].some((link) => link.getAttribute("href")?.replace(/^#/, "") === path);
}

function find(step: TourStep) {
  if (!step.target) return undefined;
  for (const selector of step.target.split(",")) {
    const element = query(selector.trim());
    const rect = element?.getBoundingClientRect();
    // Skip hidden or off-canvas targets (e.g. the closed menu on a phone).
    if (
      element &&
      rect &&
      rect.width > 0 &&
      rect.right > 0 &&
      rect.left < window.innerWidth
    )
      return element;
  }
  return undefined;
}

export function DemoTour() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tab = params.get("aba");
  const key = tab ? `${location.pathname}?${tab}` : location.pathname;
  // The tour belongs to the route it was started on; changing module drops it.
  const [tour, setTour] = useState<{
    key: string;
    steps: TourStep[];
    index: number;
  }>();
  const [box, setBox] = useState<Box>();
  const balloon = useRef<HTMLDivElement>(null);
  const [off, setOff] = useState(disabledUntilReload);
  const on = enabled() && !off;

  // A new module (or tab) starts its own tour once the page has rendered.
  useEffect(() => {
    if (!on || !TOUR_STEPS[key]) return;
    const timer = window.setTimeout(() => {
      const order = TOUR_ORDER.findIndex((item) => item.key === key);
      const current = TOUR_ORDER[order]?.label ?? "este módulo";
      const upcoming = TOUR_ORDER.slice(order + 1).find((item) =>
        reachable(item.to),
      )?.label;
      setTour({
        key,
        index: 0,
        // Steps after a "click" (e.g. inside the task detail) are checked later.
        steps: [
          ...TOUR_STEPS[key]!.filter(
            (step) => !step.target || step.afterClick || find(step),
          ),
          // Before turning the page, invite the visitor to try the module.
          {
            title: "Experimente à vontade",
            text: upcoming
              ? `Agora é a sua vez: explore ${current} livremente, clique, abra e teste o que quiser. Quando terminar, siga para ${upcoming} pelo botão abaixo ou pelo menu.`
              : `Agora é a sua vez: explore ${current} livremente. Você pode rever qualquer módulo pelo menu; o tutorial aparece de novo ao abrir cada um.`,
            final: true,
          },
        ],
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [key, on]);

  const steps = tour?.key === key ? tour.steps : [];
  const index = tour?.key === key ? tour.index : 0;
  const setIndex = (value: number) =>
    setTour((current) => current && { ...current, index: value });
  const step = steps[index];
  const stepId = step ? `${key}#${index}` : "";
  const measure = useCallback(() => {
    // A step without a target is a centered explanation.
    if (step && !step.target)
      return setBox({ top: 0, left: 0, width: 0, height: 0, step: stepId });
    const element = step && find(step);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setBox({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      step: stepId,
    });
  }, [step, stepId]);

  // Moves on when a step's part is not on screen (kept in a ref for timers).
  const skip = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!step) return;
    // A step may first click something (open a task, close it again).
    // "a && b" clicks in sequence (e.g. close one window, then open another).
    for (const selector of step.click?.split("&&") ?? [])
      findSelector(selector.trim())?.click();
    const show = window.setTimeout(
      () => {
        const element = find(step);
        if (step.target && !element) return skip.current();
        // Instant scroll, so the balloon is placed against the final position.
        element?.scrollIntoView({ block: "center", behavior: "auto" });
        window.setTimeout(measure, 80);
      },
      step.click ? 650 : 0,
    );
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(show);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    if (step) balloon.current?.focus();
  }, [step, box]);

  // Real balloon height, so it is always placed fully inside the screen.
  const [height, setHeight] = useState(220);
  useEffect(() => {
    const element = balloon.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [step, box]);

  const close = () => setTour(undefined);
  // After the last step of a module, the tour opens the next module.
  const order = TOUR_ORDER.findIndex((item) => item.key === key);
  const following =
    order >= 0
      ? TOUR_ORDER.slice(order + 1).find((item) => reachable(item.to))
      : undefined;
  const finish = () => {
    close();
    if (following) navigate(following.to);
  };
  const next = () =>
    index + 1 < steps.length ? setIndex(index + 1) : finish();
  useEffect(() => {
    skip.current = next;
  });
  const back = () => setIndex(Math.max(0, index - 1));

  if (!on || !step || !box || box.step !== stepId) return null;
  const centered = !step.target;

  // Always centered on the screen horizontally and always fully visible:
  // below the target if it fits, above if it fits, otherwise docked at the
  // bottom center (tall targets such as the menu on a phone).
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(380, viewportWidth - 32);
  const left = (viewportWidth - width) / 2;
  const gap = 14;
  // Decide with a safe height; "above" and "docked" are pinned by their
  // bottom edge, so a stale measurement can never push them off screen.
  const needed = Math.max(height, 240);
  const fitsBelow = box.top + box.height + gap + needed + 16 <= viewportHeight;
  const fitsAbove = box.top - gap - needed - 16 >= 0;
  const placement = fitsBelow ? "below" : fitsAbove ? "above" : "docked";
  const position =
    placement === "below"
      ? { top: box.top + box.height + gap }
      : placement === "above"
        ? { bottom: viewportHeight - box.top + gap }
        : { bottom: 16 };
  const arrowLeft = box.left + box.width / 2 - left;
  const showArrow =
    placement !== "docked" && arrowLeft >= 18 && arrowLeft <= width - 18;
  const below = placement === "below";

  return createPortal(
    <div className="demo-tour" onClick={(event) => event.stopPropagation()}>
      {centered && <div className="demo-tour-dim" aria-hidden="true" />}
      <div
        key={`spot-${index}`}
        hidden={centered}
        className="demo-tour-spot"
        style={{
          top: box.top - 6,
          left: box.left - 6,
          width: box.width + 12,
          height: box.height + 12,
        }}
        aria-hidden="true"
      />
      <div
        ref={balloon}
        className={`demo-tour-balloon ${centered ? "is-centered" : below ? "is-below" : "is-above"}`}
        style={
          centered
            ? { width: Math.min(420, window.innerWidth - 32) }
            : { left, width, ...position }
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-tour-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          if (event.key === "ArrowRight") next();
          if (event.key === "ArrowLeft") back();
        }}
      >
        <span
          hidden={centered || !showArrow}
          className="demo-tour-arrow"
          style={{ left: arrowLeft }}
          aria-hidden="true"
        />
        <p className="demo-tour-count">
          Tutorial · {index + 1} de {steps.length}
        </p>
        <h2 id="demo-tour-title">{step.title}</h2>
        <p>{step.text}</p>
        {step.final ? (
          <footer className="demo-tour-final">
            <button type="button" className="demo-tour-back" onClick={close}>
              Explorar este módulo
            </button>
            <button type="button" className="demo-tour-next" onClick={finish}>
              {following ? `Ir para ${following.label}` : "Concluir tutorial"}
            </button>
          </footer>
        ) : (
          <footer>
            <span className="demo-tour-links">
              <button type="button" className="demo-tour-skip" onClick={close}>
                Pular tutorial
              </button>
              <button
                type="button"
                className="demo-tour-skip"
                onClick={() => {
                  disabledUntilReload = true;
                  setOff(true);
                }}
              >
                Desativar tutorial
              </button>
            </span>
            <span>
              {index > 0 && (
                <button type="button" className="demo-tour-back" onClick={back}>
                  Voltar
                </button>
              )}
              <button type="button" className="demo-tour-next" onClick={next}>
                Próximo
              </button>
            </span>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
