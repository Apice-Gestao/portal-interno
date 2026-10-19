import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckIcon,
  CloseIcon,
  ChangeComparisonIcon,
  DownloadIcon,
  AuditHistoryIcon,
  TeamIcon,
} from "../../shared/icons";
import type { Company, CompanyChangeProposal, Snapshot } from "@apice/domain";
import { FilterMenu } from "../../shared/ui/FilterMenu";
import { companyStatusLabel, csvCell, hasPermission } from "@apice/domain";
import { TeamTasks } from "./TeamTasks";
import { usePortal } from "../../app/usePortal";
import {
  Busy,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
import { downloadText } from "../../shared/downloads";
import "./changes.css";
// Central do gestor: team tasks (with the task detail opening in place) and
// company change proposals. The team tab needs "tasks.team.view".
// Clicking anywhere on the row opens it; controls inside keep their own action.
const fromControl = (event: { target: EventTarget }) =>
  !!(event.target as HTMLElement).closest?.("button, a, input, label, select");
export default function ChangesPage() {
  const { actor } = usePortal();
  const [params, setParams] = useSearchParams();
  const canTeam = hasPermission(actor, "tasks.team.view");
  const canChanges = hasPermission(actor, "changes.manage");
  const view =
    canTeam && (!canChanges || params.get("aba") !== "alteracoes")
      ? "equipe"
      : "alteracoes";
  const tabs = [
    { id: "equipe", label: "Equipe", icon: TeamIcon },
    {
      id: "alteracoes",
      label: "Alterações de empresas",
      icon: ChangeComparisonIcon,
    },
  ];
  return (
    <>
      {canTeam && canChanges && (
        <div
          className="section-tabs"
          role="tablist"
          aria-label="Central do gestor"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              className={view === tab.id ? "active" : ""}
              onClick={() =>
                setParams(tab.id === "equipe" ? {} : { aba: tab.id })
              }
            >
              <tab.icon size={17} />
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {view === "equipe" ? (
        <>
          <PageHeading
            title="Central do gestor"
            description="Acompanhe as tarefas de cada pessoa e abra o detalhe sem sair daqui."
          />
          <TeamTasks />
        </>
      ) : (
        <ChangeProposals />
      )}
    </>
  );
}

function ChangeProposals() {
  const { data, client, refresh, notify } = usePortal();
  const [status, setStatus] = useState("pending"),
    [selected, setSelected] = useState<CompanyChangeProposal>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const proposals = data.changeProposals
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function decide(decision: "approve" | "reject") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await client.decideChangeProposal(selected.id, {
        expectedRevision: selected.revision,
        decision,
      });
      await refresh();
      setSelected(undefined);
      notify(
        decision === "approve"
          ? "Alteração aprovada com histórico e vigência preservados."
          : "Proposta rejeitada. Cadastro e tarefas preservados.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível decidir.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  function exportChanges() {
    downloadText(
      "alteracoes-apice.csv",
      [
        [
          "Empresa",
          "Vigência",
          "Motivo",
          "Situação",
          "Criar",
          "Preservar",
          "Revisar",
          "Transferir",
        ],
        ...proposals.map((item) => [
          data.companies.find((company) => company.id === item.companyId)?.name,
          item.effectiveCompetence,
          item.reason,
          item.status,
          item.impact.create,
          item.impact.retain,
          item.impact.review,
          item.impact.transfer,
        ]),
      ]
        .map((row) => row.map(csvCell).join(";"))
        .join("\r\n"),
    );
  }
  const company = selected
    ? data.companies.find((item) => item.id === selected.companyId)
    : undefined;
  const counts = {
    pending: data.changeProposals.filter((p) => p.status === "pending").length,
    approved: data.changeProposals.filter((p) => p.status === "approved")
      .length,
    rejected: data.changeProposals.filter((p) => p.status === "rejected")
      .length,
  };
  const history = data.audit
    .filter(
      (item) =>
        !item.taskId &&
        /atualiz|model|fluxo|configura|usuário|empresa/i.test(item.action),
    )
    .slice(0, 8);
  const stale =
    !!selected && (company?.revision ?? 1) !== selected.expectedCompanyRevision;
  return (
    <>
      <PageHeading
        title="Central do gestor"
        description="Revise o impacto das mudanças antes de aplicá-las às empresas e atividades."
      >
        <button className="button button-white" onClick={exportChanges}>
          <DownloadIcon size={16} />
          Exportar
        </button>
        <Link className="button button-primary" to="/empresas">
          Alterar uma empresa
        </Link>
      </PageHeading>
      <div className="change-summary">
        <ChangeComparisonIcon size={20} aria-hidden="true" />
        <p>
          Mudanças de regime, responsáveis ou situação viram propostas com
          vigência. Aprovar revalida o cadastro, preserva entregas e sinaliza
          tarefas para revisão.
        </p>
      </div>
      <FilterMenu
        label="Filtrar propostas por situação"
        value={status}
        options={[
          {
            value: "pending",
            label: "Aguardando decisão",
            count: counts.pending,
          },
          { value: "approved", label: "Aprovadas", count: counts.approved },
          { value: "rejected", label: "Rejeitadas", count: counts.rejected },
          { value: "all", label: "Todas", count: data.changeProposals.length },
        ]}
        onChange={setStatus}
      />
      {proposals.length > 0 && (
        <section className="surface tasks-surface change-surface">
          <div className="table-wrap">
            <table className="data-table task-table">
              <colgroup>
                <col className="task-company-column" />
                <col className="task-date-column" />
                <col className="task-situation-column" />
                <col className="task-situation-column" />
                <col className="task-owner-column" />
              </colgroup>
              <thead>
                <tr>
                  <th>Empresa / alteração</th>
                  <th>Vigência</th>
                  <th>Impacto</th>
                  <th>Situação</th>
                  <th>Proposta por</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((item) => {
                  const target = data.companies.find(
                    (entry) => entry.id === item.companyId,
                  );
                  const author = data.users.find(
                    (user) => user.userId === item.createdBy,
                  );
                  return (
                    <tr
                      key={item.id}
                      className="task-row row-clickable"
                      onClick={(event) => {
                        if (fromControl(event)) return;
                        setSelected(item);
                        setError("");
                      }}
                    >
                      <td>
                        <button
                          className="company-cell row-action"
                          onClick={() => {
                            setSelected(item);
                            setError("");
                          }}
                          aria-label={`Revisar alteração de ${target?.name ?? "empresa"}`}
                        >
                          <span
                            className={`company-monogram monogram-${Number(target?.code ?? 0) % 4}`}
                          >
                            {target?.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="company-info">
                            <strong>{target?.name ?? "Empresa"}</strong>
                            <span>
                              {changeLines(item, target, data).join(" · ")}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="date-value">
                          {formatCompetence(item.effectiveCompetence)}
                        </span>
                      </td>
                      <td>
                        <div className="task-situation">
                          {impactLines(item).map((line) => (
                            <span
                              key={line.text}
                              className={
                                line.attention ? "date-warning" : "date-hint"
                              }
                            >
                              {line.text}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="task-situation">
                          <span
                            className={`badge ${item.status === "pending" ? "status-waiting" : item.status === "approved" ? "status-done" : "status-dispensed"}`}
                          >
                            {STATUS_LABEL[item.status]}
                          </span>
                          {item.decidedAt && (
                            <span className="date-hint">
                              {formatDay(item.decidedAt)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="owner-cell">
                          <span className="avatar avatar-tiny">
                            {author?.initials ?? "—"}
                          </span>
                          {author
                            ? `${author.name.split(" ")[0]} ${author.name.split(" ").at(-1)}`
                            : "Responsável autorizado"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!proposals.length && (
        <EmptyState
          title="Nenhuma alteração nesta seleção"
          text="As propostas aparecem ao editar regime, responsáveis ou situação de uma empresa."
        />
      )}
      <section className="surface change-history">
        <div className="change-history-head">
          <AuditHistoryIcon size={18} aria-hidden="true" />
          <h2>Outras alterações do grupo</h2>
          <p>
            Usuários, modelos, fluxos e configurações têm validação e histórico
            próprios; tarefas em andamento preservam suas versões.
          </p>
        </div>
        <ol className="change-timeline">
          {history.map((item) => (
            <li key={item.id}>
              <strong>{item.action}</strong>
              <p>{item.detail}</p>
              <small>
                {item.actorName} · {formatDay(item.at)}
              </small>
            </li>
          ))}
        </ol>
        {!history.length && (
          <p className="muted-note">Nenhuma alteração registrada ainda.</p>
        )}
      </section>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(undefined);
        }}
        title="Revisão da alteração"
        description={company ? `${company.code} · ${company.name}` : undefined}
        wide
      >
        {selected && (
          <>
            <dl className="change-detail">
              <div>
                <dt>Motivo</dt>
                <dd>{selected.reason}</dd>
              </div>
              <div>
                <dt>Competência de efeito</dt>
                <dd>{selected.effectiveCompetence}</dd>
              </div>
              {selected.patch.regime && (
                <div>
                  <dt>Regime</dt>
                  <dd>
                    {company?.regime} → {selected.patch.regime}
                  </dd>
                </div>
              )}
              {selected.patch.status && (
                <div>
                  <dt>Situação proposta</dt>
                  <dd>
                    {companyStatusLabel(selected.patch.status, data.workspace)}
                  </dd>
                </div>
              )}
              {selected.patch.serviceEndCompetence && (
                <div>
                  <dt>Última competência atendida</dt>
                  <dd>{selected.patch.serviceEndCompetence}</dd>
                </div>
              )}
            </dl>
            {selected.patch.responsibilities && (
              <div className="change-responsibilities">
                {Object.entries(selected.patch.responsibilities).map(
                  ([department, value]) => (
                    <p key={department}>
                      <strong>
                        {data.workspace.departments.find(
                          (item) => item.id === department,
                        )?.name ?? department}
                        :
                      </strong>{" "}
                      {value.mode === "person"
                        ? data.users.find(
                            (user) => user.userId === value.userId,
                          )?.name
                        : value.mode === "department"
                          ? "Fila do departamento"
                          : "Sem obrigações"}
                    </p>
                  ),
                )}
              </div>
            )}
            <div className="change-counts change-counts-large">
              <span>
                <strong>{selected.impact.create}</strong>Novas tarefas
              </span>
              <span>
                <strong>{selected.impact.retain}</strong>Preservadas
              </span>
              <span>
                <strong>{selected.impact.review}</strong>Revisão necessária
              </span>
              <span>
                <strong>{selected.impact.transfer}</strong>Redistribuições
              </span>
            </div>
            <p className="muted-note">
              Aprovação usa os modelos configurados no portal. A vigência fiscal
              deve ser conferida pelo responsável. Tarefas anteriores e entregas
              concluídas não são apagadas.
            </p>
            {stale && selected.status === "pending" && (
              <FormError message="O cadastro mudou depois desta proposta. Abra a empresa e envie uma nova proposta com os dados atuais." />
            )}
            <FormError message={error} />
            <footer className="form-actions">
              <button
                className="button button-white"
                disabled={busy}
                onClick={() => setSelected(undefined)}
              >
                Fechar
              </button>
              {selected.status === "pending" && (
                <>
                  <button
                    className="button button-white"
                    disabled={busy}
                    onClick={() => void decide("reject")}
                  >
                    <CloseIcon size={16} />
                    Rejeitar
                  </button>
                  <button
                    className="button button-primary"
                    disabled={busy || stale}
                    onClick={() => void decide("approve")}
                  >
                    <CheckIcon size={16} />
                    <Busy busy={busy}>Aprovar e aplicar</Busy>
                  </button>
                </>
              )}
            </footer>
          </>
        )}
      </Modal>
    </>
  );
}

const STATUS_LABEL = {
  pending: "Aguardando decisão",
  approved: "Aprovada",
  rejected: "Rejeitada",
} as const;
function formatCompetence(value: string) {
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}
function formatDay(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}
// Short, readable list of what the proposal changes.
function changeLines(
  proposal: CompanyChangeProposal,
  company: Company | undefined,
  data: Snapshot,
) {
  const lines: string[] = [];
  const { patch } = proposal;
  if (patch.regime)
    lines.push(`Regime: ${company?.regime ?? "atual"} → ${patch.regime}`);
  for (const [department, value] of Object.entries(
    patch.responsibilities ?? {},
  )) {
    const name =
      data.workspace.departments.find((item) => item.id === department)?.name ??
      department;
    lines.push(
      `${name}: ${
        value.mode === "person"
          ? (data.users.find((user) => user.userId === value.userId)?.name ??
            "pessoa")
          : value.mode === "department"
            ? "fila do setor"
            : "sem obrigações"
      }`,
    );
  }
  if (patch.status)
    lines.push(`Situação: ${companyStatusLabel(patch.status, data.workspace)}`);
  if (patch.serviceEndCompetence)
    lines.push(`Atendida até ${formatCompetence(patch.serviceEndCompetence)}`);
  if (proposal.transferOpenTasks) lines.push("Transfere tarefas abertas");
  return lines;
}

// Only what actually happens to the tasks, one short line each.
function impactLines({ impact }: CompanyChangeProposal) {
  const lines = [
    { count: impact.create, text: `${impact.create} novas` },
    {
      count: impact.review,
      text: `${impact.review} a revisar`,
      attention: true,
    },
    { count: impact.transfer, text: `${impact.transfer} a transferir` },
    { count: impact.retain, text: `${impact.retain} preservadas` },
  ].filter((line) => line.count > 0);
  return lines.length ? lines : [{ text: "Sem impacto", attention: false }];
}
