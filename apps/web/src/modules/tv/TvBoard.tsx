import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ConnectionWarningIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  ExpandIcon,
  CollapseIcon,
  LiveBroadcastIcon,
  OfflineIcon,
} from "../../shared/icons";
import type { TvBlock, TvFeed } from "@apice/domain";
import "./tv.css";

function competenceLabel(value: string) {
  const [year = 1970, month = 1] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
function dateLabel(value: string) {
  const day = value.slice(0, 10).split("-");
  return `${day[2]}/${day[1]}`;
}
function timeLabel(value: string | number) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
function usePage<T>(
  items: T[],
  rows: number,
  seconds: number,
  kind: "tasks" | "collaborators" | "obligations",
) {
  const listRef = useRef<HTMLDivElement>(null);
  const [fittingRows, setFittingRows] = useState(rows);
  const [page, setPage] = useState(0);
  const visibleRows = Math.max(1, Math.min(rows, fittingRows));
  const count = Math.max(1, Math.ceil(items.length / visibleRows));
  const current = page % count;
  useEffect(() => {
    const list = listRef.current;
    if (!list || !items.length) return;
    const measure = () => {
      const row = list.firstElementChild;
      if (!(row instanceof HTMLElement)) return;
      const style = getComputedStyle(row);
      const size = (selector: string) =>
        row.querySelector(selector)?.getBoundingClientRect().height ?? 0;
      const gap = Number.parseFloat(style.rowGap) || 0;
      const padding =
        (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0) +
        1;
      const content =
        kind === "tasks"
          ? Math.max(size(".tv-row-main"), size(".tv-row-date"))
          : kind === "collaborators"
            ? size(".tv-person-heading") +
              size(".tv-person-progress") +
              5 +
              2 * gap
            : size(".tv-obligation > div:first-child") + 5 + gap;
      const minimum = Math.max(
        content + padding,
        kind === "collaborators" ? 70 : 48,
      );
      setFittingRows(
        Math.max(1, Math.min(rows, Math.floor(list.clientHeight / minimum))),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const part of list.querySelectorAll(
      ".tv-row-main, .tv-row-date, .tv-person-heading, .tv-person-progress",
    ))
      observer.observe(part);
    return () => observer.disconnect();
  }, [rows, items.length, kind]);
  useEffect(() => {
    if (count <= 1) return;
    const timer = window.setInterval(
      () => setPage((value) => (value + 1) % count),
      seconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [count, seconds]);
  return {
    listRef,
    items: items.slice(current * visibleRows, (current + 1) * visibleRows),
    current,
    count,
  };
}
function PageDots({ current, count }: { current: number; count: number }) {
  if (count < 2) return null;
  return (
    <span className="tv-pages" aria-label={`Página ${current + 1} de ${count}`}>
      {Array.from({ length: Math.min(count, 8) }, (_, index) => (
        <i key={index} className={index === current % 8 ? "active" : ""} />
      ))}
      <span>
        {current + 1} / {count}
      </span>
    </span>
  );
}
function Panel({
  title,
  count,
  children,
  className = "",
  pages,
}: {
  title: string;
  count: number | string;
  children: ReactNode;
  className?: string;
  pages?: ReactNode;
}) {
  return (
    <section className={`tv-panel ${className}`}>
      <div className="tv-panel-heading">
        <h2>{title}</h2>
        <span className="tv-count">{count}</span>
        {pages}
      </div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="tv-empty">
      <CheckIcon size={24} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
function Upcoming({ feed, rows }: { feed: TvFeed; rows: number }) {
  const { listRef, ...page } = usePage(
    feed.upcoming,
    rows,
    feed.device.rotationSeconds,
    "tasks",
  );
  const total = feed.total - feed.progress.closed;
  const labels = {
    legal: "Prazo vencido",
    internal: "Meta vencida",
    today: "Vence hoje",
    "on-time": "No prazo",
  };
  return (
    <Panel
      title={
        feed.device.blocks.includes("collaborators")
          ? "Tarefas por colaborador"
          : "Tarefas pendentes"
      }
      count={
        feed.upcoming.length < total
          ? `${feed.upcoming.length} de ${total}`
          : total
      }
      className="tv-upcoming"
      pages={<PageDots {...page} />}
    >
      <div className="tv-list" ref={listRef}>
        {page.items.map((item, index) => (
          <div
            className={`tv-task-row tv-urgency-${item.urgency}`}
            key={`${item.obligation}-${item.companyLabel}-${index}`}
          >
            <div className="tv-row-main">
              <strong>{item.responsibleLabel}</strong>
              <span>
                <b>{item.obligation}</b> <i>·</i> {item.companyLabel} <i>·</i>{" "}
                {item.department}
              </span>
            </div>
            <div className="tv-row-date">
              <strong>{dateLabel(item.legalDue)}</strong>
              <span>{labels[item.urgency]}</span>
            </div>
          </div>
        ))}
        {!page.items.length && (
          <Empty>Nenhuma tarefa pendente nesta competência.</Empty>
        )}
      </div>
    </Panel>
  );
}
function Deliveries({ feed, rows }: { feed: TvFeed; rows: number }) {
  const { listRef, ...page } = usePage(
    feed.deliveries,
    rows,
    feed.device.rotationSeconds,
    "tasks",
  );
  return (
    <Panel
      title="Últimas entregas"
      count={feed.deliveries.length}
      className="tv-deliveries"
      pages={<PageDots {...page} />}
    >
      <div className="tv-list" ref={listRef}>
        {page.items.map((item, index) => (
          <div
            className="tv-task-row tv-delivery-row"
            key={`${item.obligation}-${item.companyLabel}-${index}`}
          >
            <div className="tv-row-main">
              <strong>{item.responsibleLabel}</strong>
              <span>
                <b>{item.obligation}</b> <i>·</i> {item.companyLabel} <i>·</i>{" "}
                {item.department}
              </span>
            </div>
            <div className="tv-row-date">
              <strong>{timeLabel(item.completedAt)}</strong>
              <span>
                {dateLabel(item.completedAt)} <i>·</i> Concluída
              </span>
            </div>
          </div>
        ))}
        {!page.items.length && (
          <Empty>As entregas concluídas aparecerão aqui.</Empty>
        )}
      </div>
    </Panel>
  );
}
function Collaborators({ feed, rows }: { feed: TvFeed; rows: number }) {
  const { listRef, ...page } = usePage(
    feed.collaborators,
    rows,
    feed.device.rotationSeconds,
    "collaborators",
  );
  return (
    <Panel
      title="Colaboradores"
      count={feed.collaborators.length}
      className="tv-collaborators"
      pages={<PageDots {...page} />}
    >
      <div className="tv-team-legend">
        <span>Equipe e andamento</span>
        <span>Pendentes</span>
      </div>
      <div className="tv-team-list" ref={listRef}>
        {page.items.map((item, index) => (
          <div className="tv-person" key={`${item.name}-${index}`}>
            <div className="tv-person-heading">
              <span className="tv-avatar" aria-hidden="true">
                {item.initials}
              </span>
              <div className="tv-person-name">
                <strong>{item.name}</strong>
                <span>{item.departments.join(" / ")}</span>
              </div>
              <strong className="tv-person-pending">{item.pending}</strong>
            </div>
            <div className="tv-person-progress">
              <span>
                {item.closed} de {item.total} encerradas
              </span>
              <strong>{item.percent}%</strong>
            </div>
            <div
              className="tv-bar"
              role="progressbar"
              aria-label={`Tarefas encerradas de ${item.name}`}
              aria-valuenow={item.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${item.percent}%` }} />
            </div>
          </div>
        ))}
        {!page.items.length && (
          <Empty>Nenhum colaborador ativo neste escopo.</Empty>
        )}
      </div>
    </Panel>
  );
}
function Obligations({ feed, rows }: { feed: TvFeed; rows: number }) {
  const { listRef, ...page } = usePage(
    feed.obligations,
    rows,
    feed.device.rotationSeconds,
    "obligations",
  );
  return (
    <Panel
      title="Entregas por obrigação"
      count={feed.obligations.length}
      className="tv-obligations"
      pages={<PageDots {...page} />}
    >
      <div className="tv-obligation-list" ref={listRef}>
        {page.items.map((item) => (
          <div className="tv-obligation" key={item.title}>
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.completed} <small>/ {item.total}</small>
              </span>
            </div>
            <div
              className="tv-bar"
              role="progressbar"
              aria-label={item.title}
              aria-valuenow={item.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${item.percent}%` }} />
            </div>
          </div>
        ))}
        {!page.items.length && (
          <Empty>Nenhuma obrigação gerada nesta competência.</Empty>
        )}
      </div>
    </Panel>
  );
}
function Progress({ feed }: { feed: TvFeed }) {
  return (
    <section className="tv-progress" aria-label="Progresso da competência">
      <div className="tv-progress-caption">
        <strong>{feed.total} tarefas</strong>
        <span>
          {feed.companies} empresas <i>·</i>{" "}
          {feed.device.departments.length === 3
            ? "Todos os departamentos"
            : feed.device.departments.join(" / ")}
        </span>
      </div>
      <div className="tv-progress-end">
        <span>
          {feed.progress.closed} de {feed.total} encerradas
        </span>
        <div
          className="tv-bar"
          role="progressbar"
          aria-label="Progresso da competência"
          aria-valuenow={feed.progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${feed.progress.percent}%` }} />
        </div>
        <strong>{feed.progress.percent}%</strong>
      </div>
    </section>
  );
}
function Deadlines({ feed }: { feed: TvFeed }) {
  const metrics = [
    {
      label: "No prazo",
      value: feed.deadlines.onTime,
      style: "neutral",
      icon: ClockIcon,
    },
    {
      label: "Vencem hoje",
      value: feed.deadlines.dueToday,
      style: "today",
      icon: CalendarIcon,
    },
    {
      label: "Meta vencida",
      value: feed.deadlines.internalLate,
      style: "warning",
      icon: ConnectionWarningIcon,
    },
    {
      label: "Prazo vencido",
      value: feed.deadlines.legalLate,
      style: "danger",
      icon: ConnectionWarningIcon,
    },
    {
      label: "Encerradas",
      value: feed.deadlines.done,
      style: "success",
      icon: CheckIcon,
    },
  ];
  return (
    <section className="tv-deadlines" aria-label="Situação dos prazos">
      {metrics.map((item) => (
        <div key={item.label} className={`tv-stat tv-stat-${item.style}`}>
          <span className="tv-stat-label">
            {item.label}
            <item.icon size={19} aria-hidden="true" />
          </span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  );
}

function blockPositions(blocks: TvBlock[]) {
  const positions: {
    block: TvBlock;
    row: number;
    column: string | number;
    span: number;
  }[] = [];
  const tracks: string[] = [];
  const isIndicator = (block: TvBlock) =>
    block === "progress" || block === "deadlines";
  let cursor = 0;
  while (cursor < blocks.length) {
    const block = blocks[cursor]!;
    const row = tracks.length + 1;
    if (isIndicator(block)) {
      positions.push({ block, row, column: "1 / -1", span: 1 });
      tracks.push("auto");
      cursor++;
      continue;
    }
    let end = cursor + 1;
    while (end < blocks.length && !isIndicator(blocks[end]!)) end++;
    const group = blocks.slice(cursor, end);
    const team = group.includes("collaborators");
    const lists = group.filter((item) => item !== "collaborators");
    const rows = Math.max(lists.length, 1);
    for (const [index, item] of lists.entries())
      positions.push({
        block: item,
        row: row + index,
        column: team ? 1 : "1 / -1",
        span: 1,
      });
    if (team)
      positions.push({
        block: "collaborators",
        row,
        column: lists.length ? 2 : "1 / -1",
        span: rows,
      });
    tracks.push(...Array.from({ length: rows }, () => "minmax(0, 1fr)"));
    cursor = end;
  }
  return { positions, tracks };
}
export function TvBoard({
  feed,
  live,
  updatedAt,
  actions,
  embedded = false,
  simulation = false,
}: {
  feed: TvFeed;
  live: boolean;
  updatedAt: number;
  actions?: ReactNode;
  embedded?: boolean;
  simulation?: boolean;
}) {
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [fullscreenError, setFullscreenError] = useState("");
  const [compact, setCompact] = useState(
    window.matchMedia("(max-height: 800px)").matches,
  );
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    const media = window.matchMedia("(max-height: 800px)");
    const onSize = () => setCompact(media.matches);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    document.addEventListener("fullscreenchange", onFullscreen);
    media.addEventListener("change", onSize);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      media.removeEventListener("change", onSize);
      window.clearInterval(timer);
    };
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenError("");
    } catch {
      setFullscreenError("Use a opção de tela cheia do navegador.");
    }
  }
  const layout = blockPositions(feed.device.blocks);
  const compactRows = compact || embedded;
  const listCount = feed.device.blocks.filter(
    (block) => !["progress", "deadlines", "collaborators"].includes(block),
  ).length;
  const rows =
    listCount > 2
      ? compactRows
        ? 2
        : 3
      : listCount > 1
        ? compactRows
          ? 3
          : 5
        : compactRows
          ? 6
          : 9;
  const BoardContainer = embedded ? "section" : "main";
  return (
    <BoardContainer
      className={`tv-board ${compactRows ? "tv-compact" : ""}`}
      data-immersive={!embedded}
      data-simulation={simulation}
      aria-label={embedded ? "Prévia do painel de TV" : undefined}
    >
      <header className="tv-header">
        <div className="tv-identity">
          <span className="tv-wordmark">Ápice Contábil</span>
          <div>
            <h1>Painel da equipe</h1>
            <p>{competenceLabel(feed.device.competence)}</p>
          </div>
        </div>
        <div className="tv-header-end">
          <span className={`tv-connection ${live ? "is-live" : "is-stale"}`}>
            {live ? <LiveBroadcastIcon size={14} /> : <OfflineIcon size={14} />}
            {simulation ? "SIMULAÇÃO" : live ? "AO VIVO" : "DESATUALIZADO"}
          </span>
          <time className="tv-clock">{timeLabel(clock)}</time>
          <button
            className="tv-icon-button"
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <CollapseIcon size={19} /> : <ExpandIcon size={19} />}
          </button>
          {actions}
        </div>
      </header>
      {fullscreenError && (
        <p role="status" className="tv-fullscreen-help">
          {fullscreenError}
        </p>
      )}
      <div
        className="tv-content-grid"
        style={{
          gridTemplateRows: layout.tracks.join(" "),
        }}
      >
        {layout.positions.map(({ block, row, column, span }) => (
          <div
            key={block}
            className={`tv-block-cell tv-block-${block}`}
            style={{ gridColumn: column, gridRow: `${row} / span ${span}` }}
          >
            {block === "progress" ? (
              <Progress feed={feed} />
            ) : block === "deadlines" ? (
              <Deadlines feed={feed} />
            ) : block === "collaborators" ? (
              <Collaborators feed={feed} rows={compactRows ? 5 : 8} />
            ) : block === "upcoming" ? (
              <Upcoming feed={feed} rows={rows} />
            ) : block === "deliveries" ? (
              <Deliveries feed={feed} rows={rows} />
            ) : (
              <Obligations feed={feed} rows={rows} />
            )}
          </div>
        ))}
      </div>
      <footer className="tv-footer">
        <span>
          {feed.device.name} <i>·</i>{" "}
          {feed.device.departments.length === 3
            ? "Todos os departamentos"
            : feed.device.departments.join(" / ")}
        </span>
        <span>
          {simulation
            ? "Dados fictícios · movimento a cada 4s"
            : live
              ? "Atualização automática"
              : "Exibindo a última atualização recebida"}
          <i />
          {updatedAt ? timeLabel(feed.generatedAt) : "Aguardando atualização"}
        </span>
      </footer>
    </BoardContainer>
  );
}
