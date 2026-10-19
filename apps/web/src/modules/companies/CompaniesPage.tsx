import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import Papa from "papaparse";
import {
  TransferIcon,
  CompanyIcon,
  ExportFileIcon,
  EditIcon,
  AddIcon,
  SearchIcon,
  ImportFileIcon,
} from "../../shared/icons";
import {
  canExecute,
  cnpjFromBase,
  companySchema,
  companyStatusBase,
  companyStatusLabel,
  companyStatusNeedsEnd,
  companyStatusOptions,
  hasPermission,
} from "@apice/domain";
import type { Company, CreateCompany } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { downloadText } from "../../shared/downloads";
import {
  Busy,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
import { CompetencePicker } from "../../shared/ui/CompetencePicker";
import { SelectField } from "../../shared/ui/SelectField";
import { OnboardingFields } from "../templates/DepartmentFlowsPage";
import type { OnboardingDraft } from "../templates/DepartmentFlowsPage";
import "./companies.css";

type Responsibility = {
  mode: "person" | "department" | "none";
  userId?: string;
};
type Responsibilities = Record<string, Responsibility>;
const statusOf = (company: Company) =>
  company.status ?? (company.active ? "active" : "inactive");
// Badge tone follows the behaviour behind the situation (built-in or created).
const statusTone = (status: string) =>
  ({
    active: "status-done",
    closing: "status-waiting",
    suspended: "status-waiting",
    inactive: "status-todo",
  })[companyStatusBase(status)];
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
const regimes = ["Simples Nacional", "Lucro Presumido", "Lucro Real"];
const normal = (value: string) => value.toLocaleLowerCase("pt-BR");
const tagsFrom = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  ),
];
const csv = (value: unknown) =>
  `"${String(value ?? "")
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""')}"`;
function defaultResponsibilities(
  company: Company | undefined,
  departments: string[],
): Responsibilities {
  return Object.fromEntries(
    departments.map((department) => [
      department,
      company?.responsibilities?.[department] ??
        (department === "Fiscal" && company
          ? { mode: "person", userId: company.ownerId }
          : { mode: company ? "none" : "department" }),
    ]),
  );
}
function responsibilityMode(company: Company, department: string) {
  return defaultResponsibilities(company, [department])[department]!.mode;
}
function responsibilityLabel(
  company: Company,
  department: string,
  users: { userId: string; name: string }[],
) {
  const responsibility = defaultResponsibilities(company, [department])[
    department
  ]!;
  return responsibility.mode === "person"
    ? (users.find((user) => user.userId === responsibility.userId)?.name ??
        "Responsável indisponível")
    : responsibility.mode === "department"
      ? "Fila do departamento"
      : "Sem obrigações";
}

// Clicking anywhere on the row opens it; controls inside keep their own action.
const fromControl = (event: { target: EventTarget }) =>
  !!(event.target as HTMLElement).closest?.("button, a, input, label, select");
export default function CompaniesPage() {
  const { data, actor } = usePortal();
  const [search, setSearch] = useState("");
  const [regime, setRegime] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [obligation, setObligation] = useState("");
  const [managingStatuses, setManagingStatuses] = useState(false);
  const [editor, setEditor] = useState<{ company?: Company }>();
  const [selected, setSelected] = useState<Company>();
  const [importing, setImporting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const departments = data.workspace.departments.map(
    (department) => department.id,
  );
  const departmentLabel = (id: string) =>
    data.workspace.departments.find((department) => department.id === id)
      ?.name ?? id;
  const canManage = hasPermission(actor, "companies.manage");
  const companies = data.companies.filter(
    (company) =>
      normal(
        `${company.name} ${company.code} ${company.cnpj} ${company.city} ${(company.tags ?? []).join(" ")}`,
      ).includes(normal(search)) &&
      (!regime || company.regime === regime) &&
      (!status || statusOf(company) === status) &&
      (!tag || company.tags?.includes(tag)) &&
      (!obligation ||
        data.tasks.some(
          (task) => task.companyId === company.id && task.title === obligation,
        )) &&
      (!owner ||
        Object.values(defaultResponsibilities(company, departments)).some(
          (responsibility) =>
            responsibility.mode === "person" && responsibility.userId === owner,
        )),
  );
  const allTags = [
    ...new Set(data.companies.flatMap((company) => company.tags ?? [])),
  ];
  const obligations = [...new Set(data.tasks.map((task) => task.title))].sort(
    (left, right) => left.localeCompare(right, "pt-BR"),
  );
  const statusOptions = companyStatusOptions(data.workspace).filter(
    (option) =>
      ["active", "suspended", "inactive"].includes(option.id) ||
      data.companies.some((company) => statusOf(company) === option.id),
  );
  function exportCompanies() {
    const headers = [
      "codigo",
      "nome",
      "cnpj",
      "regime",
      "cidade",
      "situacao",
      "encerramento_competencia",
      "agrupadores",
      "responsavel",
      ...departments.map((department) => `setor:${department}`),
    ];
    const rows = companies.map((company) => [
      company.code,
      company.name,
      company.cnpj,
      company.regime,
      company.city,
      companyStatusLabel(statusOf(company), data.workspace),
      company.serviceEndCompetence ?? "",
      (company.tags ?? []).join(","),
      company.ownerId,
      ...departments.map((department) => {
        const responsibility = defaultResponsibilities(company, departments)[
          department
        ]!;
        return responsibility.mode === "person"
          ? responsibility.userId
          : responsibility.mode;
      }),
    ]);
    downloadText(
      "carteira-apice.csv",
      [headers, ...rows].map((row) => row.map(csv).join(";")).join("\r\n"),
    );
  }
  return (
    <>
      <PageHeading
        title="Empresas e carteira"
        description="Cadastro integrado e responsabilidades de todos os setores."
      >
        <button className="button button-white" onClick={exportCompanies}>
          <ExportFileIcon size={16} />
          Exportar
        </button>
        {canManage && (
          <>
            <button
              className="button button-white"
              onClick={() => setImporting(true)}
            >
              <ImportFileIcon size={16} />
              Importar
            </button>
            <button
              className="button button-primary"
              onClick={() => setEditor({})}
            >
              <AddIcon size={17} />
              Nova empresa
            </button>
          </>
        )}
      </PageHeading>
      <div className="company-summary">
        <div className="company-summary-total">
          <CompanyIcon size={19} />
          <strong>{data.companies.length}</strong>
          <span>empresas na carteira</span>
        </div>
        {statusOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className="company-summary-status"
            aria-pressed={status === option.id}
            onClick={() => setStatus(status === option.id ? "" : option.id)}
          >
            <strong>
              {
                data.companies.filter(
                  (company) => statusOf(company) === option.id,
                ).length
              }
            </strong>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      {canManage && (
        <p className="company-status-manage">
          <button
            type="button"
            className="text-button"
            onClick={() => setManagingStatuses(true)}
          >
            Gerenciar situações
          </button>
        </p>
      )}
      <section className="surface">
        <div className="table-toolbar company-filters">
          <label className="search-field">
            <SearchIcon size={17} />
            <input
              aria-label="Buscar empresas"
              placeholder="Nome, código, CNPJ ou agrupador..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <SelectField
            aria-label="Filtrar regime"
            value={regime}
            onValueChange={setRegime}
          >
            <option value="">Todos os regimes</option>
            {regimes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField
            aria-label="Carteira por colaborador"
            value={owner}
            onValueChange={setOwner}
          >
            <option value="">Todos os responsáveis</option>
            {data.users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            aria-label="Agrupador de clientes"
            value={tag}
            onValueChange={setTag}
          >
            <option value="">Todos os agrupadores</option>
            {allTags.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField
            aria-label="Filtrar por obrigação"
            value={obligation}
            onValueChange={setObligation}
          >
            <option value="">Todas as obrigações</option>
            {obligations.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
        </div>
        {canManage && checked.length === 0 && (
          <p className="company-selection-hint">
            <TransferIcon size={14} aria-hidden="true" />
            Marque empresas na lista para transferir responsabilidades e tarefas
            em lote.
          </p>
        )}
        {canManage && checked.length > 0 && (
          <div className="company-selection">
            <strong>{checked.length} selecionadas</strong>
            <button
              className="button button-white"
              onClick={() => setTransferring(true)}
            >
              <TransferIcon size={15} />
              Transferir responsabilidade
            </button>
            <button className="text-button" onClick={() => setChecked([])}>
              Limpar seleção
            </button>
          </div>
        )}
        {companies.length ? (
          <div className="table-wrap">
            <table className="data-table company-table">
              <thead>
                <tr>
                  {canManage && (
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Selecionar empresas visíveis"
                        checked={companies.every((company) =>
                          checked.includes(company.id),
                        )}
                        onChange={(event) =>
                          setChecked(
                            event.target.checked
                              ? [
                                  ...new Set([
                                    ...checked,
                                    ...companies.map((company) => company.id),
                                  ]),
                                ]
                              : checked.filter(
                                  (id) =>
                                    !companies.some(
                                      (company) => company.id === id,
                                    ),
                                ),
                          )
                        }
                      />
                    </th>
                  )}
                  <th>EMPRESA</th>
                  <th>REGIME</th>
                  <th>RESPONSÁVEIS POR SETOR</th>
                  <th>SITUAÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    className="row-clickable"
                    onClick={(event) => {
                      if (!fromControl(event)) setSelected(company);
                    }}
                  >
                    {canManage && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${company.name}`}
                          checked={checked.includes(company.id)}
                          onChange={(event) =>
                            setChecked(
                              event.target.checked
                                ? [...checked, company.id]
                                : checked.filter((id) => id !== company.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td>
                      <button
                        className="company-cell row-action"
                        onClick={() => setSelected(company)}
                      >
                        <span className="company-monogram">
                          {company.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="company-info">
                          <strong>{company.name}</strong>
                          <span>
                            Código {company.code} · {company.cnpj}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td>
                      {company.regime}
                      <div className="company-tags">
                        {(company.tags ?? []).map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {/* Only the departments that serve the company; the others stay in its detail. */}
                      <div className="company-owners">
                        {departments
                          .filter(
                            (department) =>
                              responsibilityMode(company, department) !==
                              "none",
                          )
                          .map((department) => (
                            <span
                              key={department}
                              className={`company-owner-tag ${responsibilityMode(company, department) === "department" ? "is-queue" : ""}`}
                            >
                              <strong>{departmentLabel(department)}</strong>
                              {responsibilityLabel(
                                company,
                                department,
                                data.users,
                              )}
                            </span>
                          ))}
                        {departments.every(
                          (department) =>
                            responsibilityMode(company, department) === "none",
                        ) && (
                          <small className="company-owner-none">
                            Nenhum setor com obrigação
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${statusTone(statusOf(company))}`}
                      >
                        {companyStatusLabel(statusOf(company), data.workspace)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
        <footer className="table-footer">
          <span>{companies.length} empresas encontradas</span>
          <span>Cadastros e histórico por grupo</span>
        </footer>
      </section>
      {editor && (
        <CompanyEditor
          company={editor.company}
          onClose={() => setEditor(undefined)}
        />
      )}
      {importing && <CompanyImport onClose={() => setImporting(false)} />}
      {transferring && (
        <BulkTransfer
          companyIds={checked}
          onClose={() => setTransferring(false)}
        />
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        title={selected?.name ?? "Empresa"}
        description="Cadastro, carteira e processos da empresa."
        wide
      >
        {selected && (
          <>
            <dl className="company-detail-grid">
              <div>
                <dt>Código</dt>
                <dd>{selected.code}</dd>
              </div>
              <div>
                <dt>CNPJ</dt>
                <dd>{selected.cnpj}</dd>
              </div>
              <div>
                <dt>Regime</dt>
                <dd>{selected.regime}</dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd>
                  {companyStatusLabel(statusOf(selected), data.workspace)}
                </dd>
              </div>
              <div>
                <dt>Cidade / UF</dt>
                <dd>{selected.city}</dd>
              </div>
              <div>
                <dt>Início</dt>
                <dd>{selected.startDate.split("-").reverse().join("/")}</dd>
              </div>
            </dl>
            <h3>Responsabilidades</h3>
            <div className="company-responsibility-summary">
              {departments.map((department) => (
                <p
                  key={department}
                  className={
                    responsibilityMode(selected, department) === "none"
                      ? "is-empty"
                      : ""
                  }
                >
                  <strong>{departmentLabel(department)}</strong>
                  <span>
                    {responsibilityLabel(selected, department, data.users)}
                  </span>
                </p>
              ))}
            </div>
            {data.changeProposals.some(
              (proposal) =>
                proposal.companyId === selected.id &&
                proposal.status === "pending",
            ) && (
              <p className="muted-note">
                Há alterações aguardando revisão na Central do gestor.
              </p>
            )}
            <footer className="form-actions">
              {canManage && (
                <button
                  className="button button-white"
                  onClick={() => {
                    setEditor({ company: selected });
                    setSelected(undefined);
                  }}
                >
                  <EditIcon size={15} />
                  Editar cadastro
                </button>
              )}
              {hasPermission(actor, "processes.view") && (
                <Link
                  className="button button-white"
                  to={`/processos?empresa=${encodeURIComponent(selected.id)}`}
                >
                  Fluxos e processos
                </Link>
              )}
              {hasPermission(actor, "tasks.view") && (
                <Link
                  className="button button-primary"
                  to={`/tarefas?q=${encodeURIComponent(selected.name)}`}
                >
                  Ver tarefas
                </Link>
              )}
            </footer>
          </>
        )}
      </Modal>
      {managingStatuses && (
        <StatusManager onClose={() => setManagingStatuses(false)} />
      )}
      <p className="muted-note company-bottom-note">
        Mudanças de regime, situação e responsáveis têm competência de vigência
        e passam pela revisão do gestor.
      </p>
    </>
  );
}

// Situations created by the group: a name plus the behaviour behind it.
function StatusManager({ onClose }: { onClose: () => void }) {
  const { data, client, refresh, notify } = usePortal();
  const [items, setItems] = useState(data.workspace.companyStatuses ?? []);
  const [label, setLabel] = useState("");
  const [base, setBase] = useState("suspended");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const behaviour: Record<string, string> = {
    active: "Gera tarefas, como Ativa",
    suspended: "Pausa as tarefas, como Suspensa",
    inactive: "Encerra o atendimento, como Inativa",
  };
  function add() {
    const name = label.trim();
    const id = `${base}:${slug(name)}`;
    if (name.length < 2 || slug(name).length < 2)
      return setError("Informe um nome com pelo menos 2 letras.");
    if (
      items.some((item) => item.id === id) ||
      companyStatusOptions().some(
        (option) => option.label.toLowerCase() === name.toLowerCase(),
      )
    )
      return setError("Já existe uma situação com esse nome.");
    setItems([...items, { id, label: name }]);
    setLabel("");
    setError("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await client.updateWorkspaceSettings({
        expectedRevision: data.workspace.revision,
        companyStatuses: items,
      });
      await refresh();
      notify("Situações das empresas atualizadas.");
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Situações das empresas"
      description="Ativa, Suspensa e Inativa são fixas. Crie outras escolhendo como cada uma afeta as tarefas."
    >
      <ul className="status-manager-list">
        {companyStatusOptions()
          .filter((option) => option.id !== "closing")
          .map((option) => (
            <li key={option.id}>
              <strong>{option.label}</strong>
              <span>Padrão do portal</span>
            </li>
          ))}
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong>
            <span>{behaviour[companyStatusBase(item.id)]}</span>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setItems(items.filter((entry) => entry.id !== item.id))
              }
              disabled={busy}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
      <div className="status-manager-add">
        <label>
          Nova situação
          <input
            value={label}
            maxLength={40}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ex.: Aguardando documentos"
          />
        </label>
        <label>
          Efeito nas tarefas
          <SelectField
            value={base}
            onValueChange={setBase}
            aria-label="Efeito nas tarefas"
          >
            {Object.entries(behaviour).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </SelectField>
        </label>
        <button
          type="button"
          className="button button-white"
          onClick={add}
          disabled={busy}
        >
          <AddIcon size={15} aria-hidden="true" />
          Adicionar
        </button>
      </div>
      <FormError message={error} />
      <footer className="form-actions">
        <button
          type="button"
          className="button button-white"
          onClick={onClose}
          disabled={busy}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => void save()}
          disabled={busy}
        >
          <Busy busy={busy}>Salvar situações</Busy>
        </button>
      </footer>
    </Modal>
  );
}

function CompanyEditor({
  company,
  onClose,
}: {
  company?: Company;
  onClose: () => void;
}) {
  const { data, actor, competence, client, refresh, notify } = usePortal();
  const departments = data.workspace.departments
    .filter((department) => department.active)
    .map((department) => department.id);
  const [name, setName] = useState(company?.name ?? ""),
    [code, setCode] = useState(company?.code ?? ""),
    [cnpj, setCnpj] = useState(company?.cnpj ?? ""),
    [city, setCity] = useState(company?.city ?? "");
  const [regime, setRegime] = useState(company?.regime ?? "Simples Nacional");
  const [status, setStatus] = useState<string>(
    company ? statusOf(company) : "active",
  );
  const [endCompetence, setEndCompetence] = useState(
    company?.serviceEndCompetence ?? competence,
  );
  const [tags, setTags] = useState((company?.tags ?? []).join(", "));
  const initialResponsibilities = defaultResponsibilities(company, departments);
  const [responsibilities, setResponsibilities] = useState<Responsibilities>(
    initialResponsibilities,
  );
  const [effectiveCompetence, setEffectiveCompetence] = useState(competence),
    [reason, setReason] = useState(""),
    [transferOpenTasks, setTransferOpenTasks] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingDraft>({
    flowId: "",
    competence,
    blockRecurring: true,
    assignments: {},
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  // Shortcut: create a department without leaving the company form (17/10/2026).
  const [newDepartment, setNewDepartment] = useState<string>();
  const canCreateDepartment = hasPermission(actor, "users.manage");
  async function createDepartment() {
    const name = newDepartment?.trim() ?? "";
    if (name.length < 2) return setError("Informe o nome do departamento.");
    if (
      data.workspace.departments.some(
        (item) =>
          item.name.toLocaleLowerCase("pt-BR") ===
          name.toLocaleLowerCase("pt-BR"),
      )
    )
      return setError("Já existe um departamento com esse nome.");
    setBusy(true);
    setError("");
    try {
      const id = `setor-${crypto.randomUUID().slice(0, 8)}`;
      await client.updateWorkspaceSettings({
        expectedRevision: data.workspace.revision,
        departments: [
          ...data.workspace.departments,
          { id, name, active: true, positions: [], members: [] },
        ],
      });
      try {
        await client.updateUser(actor.userId, {
          departments: [...actor.departments, id],
        });
      } catch {
        // The department exists; access can be adjusted in Usuários e permissões.
      }
      setResponsibilities((current) => ({
        ...current,
        [id]: { mode: "department" },
      }));
      setNewDepartment(undefined);
      await refresh();
      notify(`Departamento ${name} criado e marcado nesta empresa.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar o departamento.",
      );
    } finally {
      setBusy(false);
    }
  }
  const operationalChange =
    !!company &&
    (regime !== company.regime ||
      status !== statusOf(company) ||
      JSON.stringify(responsibilities) !==
        JSON.stringify(initialResponsibilities) ||
      (companyStatusNeedsEnd(status) &&
        endCompetence !== company.serviceEndCompetence));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (operationalChange && reason.trim().length < 8)
        throw new Error(
          "Informe o motivo da alteração com pelo menos 8 caracteres.",
        );
      const ownerId =
        Object.values(responsibilities).find(
          (responsibility) => responsibility.mode === "person",
        )?.userId ??
        company?.ownerId ??
        actor.userId;
      if (company) {
        let revision = company.revision ?? 1;
        if (
          name !== company.name ||
          code !== company.code ||
          city !== company.city ||
          tags !== (company.tags ?? []).join(", ")
        ) {
          const saved = await client.updateCompany(company.id, {
            expectedRevision: revision,
            name,
            code,
            city,
            tags: tagsFrom(tags),
          });
          revision = saved.revision ?? revision + 1;
        }
        if (operationalChange)
          await client.proposeCompanyChange({
            companyId: company.id,
            expectedRevision: revision,
            effectiveCompetence,
            reason,
            transferOpenTasks,
            patch: {
              regime,
              responsibilities,
              status,
              ...(companyStatusNeedsEnd(status)
                ? { serviceEndCompetence: endCompetence }
                : {}),
            },
          });
      } else {
        const flow = data.departmentFlows.find(
          (item) => item.id === onboarding.flowId,
        );
        const parsed = companySchema.safeParse({
          name,
          code,
          cnpj,
          city,
          regime,
          ownerId,
          responsibilities,
          status,
          tags: tagsFrom(tags),
          ...(companyStatusNeedsEnd(status)
            ? { serviceEndCompetence: endCompetence }
            : {}),
          ...(onboarding.flowId
            ? {
                onboarding: {
                  ...onboarding,
                  expectedFlowVersion: flow?.version,
                },
              }
            : {}),
        });
        if (!parsed.success)
          throw new Error(
            parsed.error.issues[0]?.message ?? "Revise o cadastro.",
          );
        await client.addCompany(parsed.data);
      }
      await refresh();
      notify(
        operationalChange
          ? "Cadastro salvo. Revise o impacto na Central do gestor."
          : company
            ? "Cadastro atualizado."
            : "Empresa cadastrada com as responsabilidades de cada setor.",
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o cadastro.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={company ? "Editar empresa" : "Nova empresa"}
      description="Configure todos os setores em um único cadastro."
      wide
    >
      <form onSubmit={submit}>
        <fieldset className="form-grid company-editor-fieldset" disabled={busy}>
          <label>
            Código da empresa
            <input
              required
              minLength={1}
              maxLength={30}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Ex.: 00125"
            />
          </label>
          <label>
            Razão social
            <input
              required
              minLength={3}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            CNPJ
            <input
              required
              maxLength={18}
              value={cnpj}
              readOnly={!!company}
              onChange={(event) => setCnpj(event.target.value)}
            />
          </label>
          <label>
            Cidade / UF
            <input
              required
              minLength={2}
              maxLength={80}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>
          <label>
            Regime tributário
            <SelectField
              value={regime}
              onValueChange={setRegime}
              aria-label="Regime tributário da empresa"
            >
              {regimes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </SelectField>
          </label>
          <label>
            Situação do atendimento
            <SelectField
              value={status}
              onValueChange={setStatus}
              aria-label="Situação do atendimento"
            >
              {companyStatusOptions(data.workspace).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            {companyStatusBase(status) === "suspended" && (
              <small>
                Suspensa: novas tarefas recorrentes param a partir da vigência;
                o cadastro e o histórico continuam.
              </small>
            )}
          </label>
          {companyStatusNeedsEnd(status) && (
            <label className="full">
              Última competência do atendimento
              <CompetencePicker
                value={endCompetence}
                onValueChange={setEndCompetence}
              />
              <small>
                O histórico permanece disponível. Confira pendências e
                atividades finais.
              </small>
            </label>
          )}
          <label className="full">
            Agrupadores
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              maxLength={500}
              placeholder="Ex.: Comércio, Grupo Norte (separados por vírgula)"
            />
          </label>
          <section className="full company-sector-editor">
            <h3>Departamentos e responsáveis</h3>
            <p className="muted-note">
              Marque os setores que têm obrigação com esta empresa e escolha o
              responsável de cada um (ou deixe na fila do setor).
            </p>
            <div className="company-sector-table" role="table">
              <div className="company-sector-head" role="row">
                <span role="columnheader">Departamento</span>
                <span role="columnheader">Tem obrigação</span>
                <span role="columnheader">Responsável</span>
              </div>
              {departments.map((department) => {
                const current = responsibilities[department];
                const name =
                  data.workspace.departments.find(
                    (item) => item.id === department,
                  )?.name ?? department;
                const obliged = !!current && current.mode !== "none";
                return (
                  <div
                    className={`company-sector-line ${obliged ? "" : "is-off"}`}
                    role="row"
                    key={department}
                  >
                    <strong role="cell">{name}</strong>
                    <label className="company-sector-toggle" role="cell">
                      <input
                        type="checkbox"
                        checked={obliged}
                        onChange={(event) =>
                          setResponsibilities({
                            ...responsibilities,
                            [department]: event.target.checked
                              ? { mode: "department" }
                              : { mode: "none" },
                          })
                        }
                        aria-label={`${name} tem obrigações com esta empresa`}
                      />
                      {obliged ? "Sim" : "Não"}
                    </label>
                    <div role="cell">
                      {obliged ? (
                        <SelectField
                          aria-label={`Responsável ${name}`}
                          value={
                            current.mode === "person"
                              ? (current.userId ?? "")
                              : "__queue"
                          }
                          onValueChange={(value) =>
                            setResponsibilities({
                              ...responsibilities,
                              [department]:
                                value === "__queue"
                                  ? { mode: "department" }
                                  : { mode: "person", userId: value },
                            })
                          }
                        >
                          <option value="__queue">Fila do setor</option>
                          {data.users
                            .filter(
                              (user) =>
                                user.active !== false &&
                                user.departments.includes(department) &&
                                canExecute(user),
                            )
                            .map((user) => (
                              <option key={user.userId} value={user.userId}>
                                {user.name}
                              </option>
                            ))}
                        </SelectField>
                      ) : (
                        <span className="company-sector-none">
                          Sem obrigações neste setor
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {canCreateDepartment &&
              (newDepartment === undefined ? (
                <button
                  type="button"
                  className="text-button company-new-department"
                  onClick={() => setNewDepartment("")}
                >
                  <AddIcon size={14} aria-hidden="true" />
                  Novo departamento
                </button>
              ) : (
                <div className="company-new-department-form">
                  <label>
                    Nome do novo departamento
                    <input
                      autoFocus
                      value={newDepartment}
                      maxLength={80}
                      onChange={(event) => setNewDepartment(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createDepartment();
                        }
                      }}
                      placeholder="Ex.: Societário"
                    />
                  </label>
                  <button
                    type="button"
                    className="button button-white"
                    onClick={() => setNewDepartment(undefined)}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void createDepartment()}
                    disabled={busy}
                  >
                    <Busy busy={busy}>Criar departamento</Busy>
                  </button>
                </div>
              ))}
          </section>
          {!company && (
            <OnboardingFields
              value={onboarding}
              onChange={setOnboarding}
              optional
              disabled={busy}
            />
          )}
          {operationalChange && (
            <section className="full company-impact-note">
              <h3>Revisão do impacto operacional</h3>
              <p>
                A alteração será enviada à Central do gestor. Competências
                anteriores e entregas concluídas são preservadas.
              </p>
              <label>
                Vigência a partir da competência
                <CompetencePicker
                  value={effectiveCompetence}
                  onValueChange={setEffectiveCompetence}
                />
              </label>
              <label>
                Motivo
                <textarea
                  required
                  minLength={8}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={transferOpenTasks}
                  onChange={(event) =>
                    setTransferOpenTasks(event.target.checked)
                  }
                />
                Transferir também tarefas abertas a partir da vigência
              </label>
            </section>
          )}
          <div className="full">
            <FormError message={error} />
          </div>
          <footer className="form-actions full">
            <button
              type="button"
              className="button button-white"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy}>
              <Busy busy={busy}>
                {operationalChange
                  ? "Salvar e enviar para revisão"
                  : company
                    ? "Salvar cadastro"
                    : "Cadastrar empresa"}
              </Busy>
            </button>
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}

function BulkTransfer({
  companyIds,
  onClose,
}: {
  companyIds: string[];
  onClose: () => void;
}) {
  const { data, actor, competence, client, refresh, notify } = usePortal();
  const [department, setDepartment] = useState(
      actor.departments[0] ?? "Fiscal",
    ),
    [userId, setUserId] = useState(""),
    [effectiveCompetence, setEffectiveCompetence] = useState(competence),
    [reason, setReason] = useState("");
  const [transferOpenTasks, setTransferOpenTasks] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const companies = data.companies.filter((company) =>
    companyIds.includes(company.id),
  );
  const affected = data.tasks.filter(
    (task) =>
      companyIds.includes(task.companyId) &&
      task.department === department &&
      !["done", "dispensed"].includes(task.status) &&
      task.competence >= effectiveCompetence,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await client.proposeCompanyChanges(
        companies.map((company) => ({
          companyId: company.id,
          expectedRevision: company.revision ?? 1,
          effectiveCompetence,
          reason,
          transferOpenTasks,
          patch: {
            responsibilities: {
              [department]: { mode: "person" as const, userId },
            },
          },
        })),
      );
      await refresh();
      notify(
        `${saved.length} propostas criadas. Confirme os impactos na Central do gestor.`,
      );
      onClose();
    } catch (cause) {
      await refresh();
      setError(
        cause instanceof Error
          ? cause.message
          : "Nenhuma proposta foi criada. Revise o lote e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Transferir carteira em lote"
      description="Confira as empresas e o alcance antes de enviar as propostas para aprovação."
      wide
    >
      <form className="form-grid" onSubmit={submit}>
        <label>
          Departamento
          <SelectField
            value={department}
            onValueChange={setDepartment}
            aria-label="Departamento da transferência"
          >
            {actor.departments.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
        </label>
        <label>
          Novo responsável
          <SelectField
            required
            value={userId}
            onValueChange={setUserId}
            aria-label="Novo responsável pela carteira"
          >
            <option value="">Selecione</option>
            {data.users
              .filter(
                (user) =>
                  user.active !== false &&
                  user.departments.includes(department) &&
                  canExecute(user),
              )
              .map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.name}
                </option>
              ))}
          </SelectField>
        </label>
        <label className="full">
          Competência de vigência
          <CompetencePicker
            value={effectiveCompetence}
            onValueChange={setEffectiveCompetence}
          />
        </label>
        <label className="checkbox-field full">
          <input
            type="checkbox"
            checked={transferOpenTasks}
            onChange={(event) => setTransferOpenTasks(event.target.checked)}
          />
          Transferir também as atividades em aberto
        </label>
        <label className="full">
          Motivo
          <textarea
            required
            minLength={8}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
          />
        </label>
        <div className="full company-impact-note">
          <strong>
            {companies.length} empresas ·{" "}
            {transferOpenTasks ? affected.length : 0} tarefas abertas na prévia
          </strong>
          {companies.map((company) => (
            <p key={company.id}>
              {company.code} · {company.name}
              <br />
              <small>
                {responsibilityLabel(company, department, data.users)} →{" "}
                {data.users.find((user) => user.userId === userId)?.name ??
                  "Selecione o destino"}
              </small>
            </p>
          ))}
          <small>
            Entregas concluídas mantêm a autoria e os documentos. A aprovação
            revalida os dados.
          </small>
        </div>
        <div className="full">
          <FormError message={error} />
        </div>
        <footer className="form-actions full">
          <button
            type="button"
            className="button button-white"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="button button-primary" disabled={busy || !userId}>
            <Busy busy={busy}>Enviar propostas para revisão</Busy>
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function CompanyImport({ onClose }: { onClose: () => void }) {
  const { actor, data, client, refresh, notify } = usePortal();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CreateCompany[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const departments = data.workspace.departments
    .filter((department) => department.active)
    .map((department) => department.id);
  const headers = [
    "codigo",
    "nome",
    "cnpj",
    "regime",
    "cidade",
    "situacao",
    "encerramento_competencia",
    "agrupadores",
    "responsavel",
    ...departments.map((department) => `setor:${department}`),
  ];
  const example = [
    "00999",
    "Empresa Exemplo",
    cnpjFromBase("000000990001"),
    "Simples Nacional",
    "São Paulo / SP",
    "active",
    "",
    "Exemplos,Comércio",
    actor.userId,
    ...departments.map(() => "department"),
  ];
  async function parse(text: string) {
    setErrors([]);
    setPreview([]);
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: ";",
      skipEmptyLines: "greedy",
      transformHeader: (header) =>
        header
          .replace(/^\uFEFF/, "")
          .trim()
          .toLocaleLowerCase("pt-BR"),
    });
    if (
      result.errors.length ||
      !result.data.length ||
      result.data.length > 200
    ) {
      setErrors([
        "Revise o CSV: deve conter entre 1 e 200 empresas, com separador ponto e vírgula.",
      ]);
      return;
    }
    const validated: CreateCompany[] = [],
      issues: string[] = [],
      codes = new Set<string>(),
      cnpjs = new Set<string>();
    result.data.forEach((row, index) => {
      const responsibilities: Responsibilities = {};
      departments.forEach((department) => {
        const value =
          row[`setor:${department.toLocaleLowerCase("pt-BR")}`]?.trim();
        responsibilities[department] =
          !value || value === "none"
            ? { mode: "none" }
            : value === "department"
              ? { mode: "department" }
              : { mode: "person", userId: value };
      });
      const input = companySchema.safeParse({
        code: row.codigo,
        name: row.nome,
        cnpj: row.cnpj,
        regime: row.regime,
        city: row.cidade,
        ownerId: row.responsavel || actor.userId,
        status: row.situacao || "active",
        ...(row.encerramento_competencia
          ? { serviceEndCompetence: row.encerramento_competencia }
          : {}),
        tags: tagsFrom(row.agrupadores ?? ""),
        responsibilities,
      });
      if (!input.success) {
        issues.push(
          `Linha ${index + 2}: ${input.error.issues[0]?.message ?? "dados inválidos"}`,
        );
        return;
      }
      if (codes.has(row.codigo ?? "") || cnpjs.has(input.data.cnpj))
        issues.push(
          `Linha ${index + 2}: código ou CNPJ repetido dentro do arquivo.`,
        );
      codes.add(row.codigo ?? "");
      cnpjs.add(input.data.cnpj);
      for (const [department, responsibility] of Object.entries(
        responsibilities,
      ))
        if (
          responsibility.mode === "person" &&
          !data.users.some(
            (user) =>
              user.userId === responsibility.userId &&
              user.active !== false &&
              user.departments.includes(department) &&
              canExecute(user),
          )
        )
          issues.push(
            `Linha ${index + 2}: responsável inválido para ${department}. Use o ID de uma pessoa ativa do setor.`,
          );
      validated.push(input.data);
    });
    setErrors(issues);
    setPreview(validated);
  }
  async function read(file?: File) {
    if (!file) return;
    if (file.size > 256 * 1024 || !file.name.toLowerCase().endsWith(".csv")) {
      setErrors(["Selecione um arquivo CSV de até 256 KB."]);
      return;
    }
    await parse(await file.text());
  }
  async function confirm() {
    setBusy(true);
    setErrors([]);
    try {
      const result = await client.importCompanies(preview);
      await refresh();
      notify(
        `${result.created} empresas importadas. ${result.existing} já existentes foram preservadas.`,
      );
      onClose();
    } catch (cause) {
      setErrors([
        cause instanceof Error ? cause.message : "Não foi possível importar.",
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Importação completa de empresas"
      description="Todos os responsáveis, agrupadores e parâmetros em uma planilha. Cadastros existentes são preservados."
      wide
    >
      <p className="muted-note">
        Colunas de setor: informe o ID do colaborador, “department” para fila ou
        “none” para sem obrigações. Setor vazio significa sem obrigações. A
        importação adiciona cadastros, preservando os existentes.
      </p>
      <div className="company-import-actions">
        <button
          className="button button-white"
          onClick={() =>
            downloadText(
              "modelo-carteira-completa.csv",
              [headers, example]
                .map((row) => row.map(csv).join(";"))
                .join("\r\n"),
            )
          }
        >
          <ExportFileIcon size={15} />
          Baixar modelo completo
        </button>
        <button
          className="text-button"
          onClick={() =>
            void parse(
              [headers, example]
                .map((row) => row.map(csv).join(";"))
                .join("\r\n"),
            )
          }
        >
          Usar exemplo fictício
        </button>
        <button
          className="text-button"
          onClick={() =>
            downloadText(
              "responsaveis-setores.csv",
              [
                "id;nome;departamentos",
                ...data.users.map((user) =>
                  [user.userId, user.name, user.departments.join(",")]
                    .map(csv)
                    .join(";"),
                ),
              ].join("\r\n"),
            )
          }
        >
          Lista de responsáveis
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void read(event.target.files?.[0])}
      />
      <button
        className="upload-zone"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <ImportFileIcon size={22} />
        <strong>Selecionar CSV</strong>
        <span>Até 200 empresas · 256 KB</span>
      </button>
      {errors.length > 0 && (
        <div role="alert" className="form-error">
          {errors.slice(0, 20).map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
          {errors.length > 20 && <p>E mais {errors.length - 20} erros.</p>}
        </div>
      )}
      {preview.length > 0 && (
        <>
          <div className="section-heading">
            <h3>Prévia</h3>
            <span>{preview.length} empresas válidas</span>
          </div>
          <div className="table-wrap import-preview">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CÓDIGO / EMPRESA</th>
                  <th>REGIME</th>
                  <th>SETORES</th>
                  <th>TRATAMENTO</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((company, index) => (
                  <tr key={index}>
                    <td>
                      {company.code} · {company.name}
                      <small className="company-subtext">{company.cnpj}</small>
                    </td>
                    <td>{company.regime}</td>
                    <td>
                      {Object.entries(company.responsibilities ?? {}).map(
                        ([department, responsibility]) => (
                          <small className="company-subtext" key={department}>
                            {department}:{" "}
                            {responsibility.mode === "person"
                              ? data.users.find(
                                  (user) =>
                                    user.userId === responsibility.userId,
                                )?.name
                              : responsibility.mode === "department"
                                ? "Fila"
                                : "Sem obrigações"}
                          </small>
                        ),
                      )}
                    </td>
                    <td>
                      {data.companies.some(
                        (existing) => existing.cnpj === company.cnpj,
                      )
                        ? "Existente · preservar"
                        : "Novo cadastro"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <footer className="form-actions">
        <button
          className="button button-white"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          className="button button-primary"
          disabled={!preview.length || !!errors.length || busy}
          onClick={() => void confirm()}
        >
          <Busy busy={busy}>Confirmar importação</Busy>
        </button>
      </footer>
    </Modal>
  );
}
