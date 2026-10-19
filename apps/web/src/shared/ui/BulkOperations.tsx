import { useRef, useState } from "react";
import type { CreateTask, CreateTemplate } from "@apice/domain";
import {
  canExecute,
  businessDate,
  csvCell,
  hasPermission,
  taskSchema,
  templateSchema,
} from "@apice/domain";
import Papa from "papaparse";
import { ImportFileIcon, ExportFileIcon, TransferIcon } from "../icons";
import { usePortal } from "../../app/usePortal";
import { downloadText } from "../downloads";
import { Busy, FormError, Modal } from "./components";
import { SelectField } from "./SelectField";
export function BulkImport({ kind }: { kind: "tasks" | "templates" }) {
  const { data, department, actor, client, refresh, notify } = usePortal();
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<(CreateTask | CreateTemplate)[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const taskHeaders = [
    "titulo",
    "descricao",
    "empresa",
    "departamento",
    "meta",
    "prazo_legal",
    "responsavel",
    "conferencia",
  ];
  const modelHeaders = [
    "titulo",
    "descricao",
    "departamento",
    "regime",
    "dia_meta",
    "dia_legal",
    "conferencia",
    "documento",
    "etapas_json",
  ];
  const headers = kind === "tasks" ? taskHeaders : modelHeaders;
  const company = data.companies[0];
  const operator = data.users.find(
    (user) => user.departments.includes(department) && canExecute(user),
  );
  const now = businessDate(data.now);
  const example =
    kind === "tasks"
      ? [
          "Atividade de exemplo",
          "Atividade fictícia importada",
          company?.code ?? "",
          department,
          now,
          now,
          operator?.userId ?? actor.userId,
          "false",
        ]
      : [
          "Rotina de exemplo",
          "Modelo fictício importado",
          department,
          "Todos",
          "10",
          "20",
          "false",
          "Relatório de conferência",
          JSON.stringify([
            { id: "verify", title: "Conferir documentos" },
            { id: "deliver", title: "Registrar entrega" },
          ]),
        ];
  async function parse(text: string) {
    setError("");
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim().toLowerCase(),
    });
    if (
      result.errors.length ||
      result.data.length > 200 ||
      !result.data.length
    ) {
      setError(
        "Arquivo inválido. Use o modelo e importe entre 1 e 200 linhas.",
      );
      setRows([]);
      return;
    }
    const valid: (CreateTask | CreateTemplate)[] = [];
    const issues: string[] = [];
    for (const [index, row] of result.data.entries()) {
      try {
        const review = ["true", "sim", "1"].includes(
          row.conferencia?.toLowerCase() ?? "",
        );
        if (kind === "tasks") {
          const found = data.companies.find((company) =>
            [company.id, company.code, company.cnpj].includes(
              row.empresa ?? "",
            ),
          );
          const parsed = taskSchema.parse({
            title: row.titulo,
            description: row.descricao,
            companyId: found?.id ?? row.empresa,
            department: row.departamento,
            internalDue: row.meta,
            legalDue: row.prazo_legal,
            assigneeId: row.responsavel,
            requiresReview: review,
          });
          if (
            !found ||
            !actor.departments.includes(parsed.department) ||
            !data.users.some(
              (user) =>
                user.userId === parsed.assigneeId &&
                user.active !== false &&
                user.departments.includes(parsed.department) &&
                canExecute(user),
            )
          )
            throw new Error(
              "Empresa, departamento ou responsável indisponível.",
            );
          valid.push(parsed);
        } else {
          valid.push(
            templateSchema.parse({
              title: row.titulo,
              description: row.descricao,
              department: row.departamento,
              regime: row.regime,
              internalDay: Number(row.dia_meta),
              legalDay: Number(row.dia_legal),
              requiresReview: review,
              requiredDocument: row.documento,
              ...(row.etapas_json
                ? { workflowSteps: JSON.parse(row.etapas_json) as unknown }
                : {}),
            }),
          );
        }
      } catch (cause) {
        issues.push(
          `Linha ${index + 2}: ${cause instanceof Error ? cause.message.slice(0, 180) : "dados inválidos"}`,
        );
      }
    }
    setRows(valid);
    if (issues.length) setError(issues.join("\n"));
  }
  async function apply() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result =
        kind === "tasks"
          ? await client.importTasks(rows as CreateTask[])
          : await client.importTemplates(rows as CreateTemplate[]);
      await refresh();
      notify(
        `${result.created} registros importados; ${result.existing} existentes preservados.`,
      );
      setOpen(false);
      setRows([]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Importação indisponível.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button button-white"
        onClick={() => {
          setRows([]);
          setError("");
          setOpen(true);
        }}
      >
        <ImportFileIcon size={16} />
        Importar
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title={
          kind === "tasks"
            ? "Importar atividades"
            : "Importar modelos de tarefa"
        }
        description="Revise os registros antes de aplicar. O lote é validado e salvo em conjunto."
        wide
      >
        <div className="heading-actions">
          <button
            className="button button-white"
            onClick={() =>
              downloadText(
                `modelo-${kind}.csv`,
                [headers, example]
                  .map((row) => row.map(csvCell).join(";"))
                  .join("\r\n"),
              )
            }
          >
            <ExportFileIcon size={16} />
            Baixar modelo
          </button>
          <button
            className="text-button"
            onClick={() =>
              void parse(
                [headers, example]
                  .map((row) => row.map(csvCell).join(";"))
                  .join("\r\n"),
              )
            }
          >
            Usar exemplo fictício
          </button>
        </div>
        <p className="muted-note">
          Até 200 linhas e 256 KB. Informe o código ou ID da empresa e os IDs
          dos responsáveis. Cadastros equivalentes são preservados.
        </p>
        <button
          className="text-button"
          onClick={() =>
            downloadText(
              "referencias-importacao.json",
              JSON.stringify(
                {
                  empresas: data.companies.map((company) => ({
                    id: company.id,
                    codigo: company.code,
                    nome: company.name,
                  })),
                  usuarios: data.users.map((user) => ({
                    id: user.userId,
                    nome: user.name,
                    departamentos: user.departments,
                  })),
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          Baixar referências de empresas e responsáveis
        </button>
        <input
          ref={ref}
          type="file"
          accept=".csv"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && file.size <= 256 * 1024) void file.text().then(parse);
            else setError("O CSV deve ter até 256 KB.");
            event.target.value = "";
          }}
        />
        <button
          className="upload-zone"
          disabled={busy}
          onClick={() => ref.current?.click()}
        >
          <ImportFileIcon size={22} />
          <strong>Selecionar CSV</strong>
        </button>
        <FormError message={error} />
        {rows.length > 0 && (
          <div className="table-wrap import-preview">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TÍTULO</th>
                  <th>DEPARTAMENTO</th>
                  <th>CONFERÊNCIA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.title}</td>
                    <td>{row.department}</td>
                    <td>{row.requiresReview ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="form-actions">
          <button
            className="button button-white"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={busy || !rows.length || !!error}
            onClick={() => void apply()}
          >
            <Busy busy={busy}>Importar {rows.length} registros</Busy>
          </button>
        </footer>
      </Modal>
    </>
  );
}
export function BulkTaskTransfer() {
  const { data, actor, client, refresh, notify } = usePortal();
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [userId, setUserId] = useState(""),
    [search, setSearch] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tasks = data.tasks.filter(
    (task) =>
      !["done", "dispensed"].includes(task.status) &&
      `${task.title} ${data.companies.find((company) => company.id === task.companyId)?.name ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const chosen = data.tasks.filter((task) => selected.includes(task.id));
  const eligible = data.users.filter(
    (user) =>
      user.active !== false &&
      canExecute(user) &&
      hasPermission(user, "tasks.view") &&
      chosen.every((task) => user.departments.includes(task.department)),
  );
  async function apply() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.transferTasks({
        taskIds: selected,
        assigneeId: userId,
        expectedRevisions: Object.fromEntries(
          chosen.map((task) => [task.id, task.revision]),
        ),
        reason,
      });
      await refresh();
      setOpen(false);
      setSelected([]);
      notify(
        `${result.tasks} atividades abertas transferidas. Autoria anterior preservada.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível transferir.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button button-white"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        <TransferIcon size={16} />
        Transferir atividades
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title="Transferir atividades em lote"
        description="Selecione as atividades abertas e confira o novo responsável."
        wide
      >
        <label className="form-label">
          Buscar atividades
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Empresa ou atividade"
          />
        </label>
        <div className="table-wrap import-preview">
          <table className="data-table">
            <thead>
              <tr>
                <th />
                <th>ATIVIDADE / EMPRESA</th>
                <th>RESPONSÁVEL ATUAL</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <input
                      aria-label={`Transferir ${task.title} ${task.id}`}
                      type="checkbox"
                      checked={selected.includes(task.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, task.id]
                            : selected.filter((id) => id !== task.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    {task.title}
                    <small className="company-subtext">
                      {
                        data.companies.find(
                          (company) => company.id === task.companyId,
                        )?.name
                      }{" "}
                      · {task.department}
                    </small>
                  </td>
                  <td>
                    {data.users.find((user) => user.userId === task.assigneeId)
                      ?.name ?? "Fila do setor"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void apply();
          }}
        >
          <label className="full">
            Novo responsável
            <SelectField required value={userId} onValueChange={setUserId}>
              <option value="">Selecione</option>
              {eligible.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.name}
                </option>
              ))}
            </SelectField>
          </label>
          <label className="full">
            Justificativa
            <textarea
              required
              minLength={8}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
          </label>
          <p className="muted-note full">
            {selected.length} selecionadas. O destinatário deve ter execução em
            todos os setores envolvidos. Entregas concluídas não aparecem nesta
            operação. Seu acesso: {actor.departments.join(", ")}.
          </p>
          <FormError message={error} />
          <footer className="form-actions full">
            <button
              type="button"
              className="button button-white"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              className="button button-primary"
              disabled={
                busy ||
                !selected.length ||
                !eligible.some((user) => user.userId === userId)
              }
            >
              <Busy busy={busy}>Confirmar transferência</Busy>
            </button>
          </footer>
        </form>
      </Modal>
    </>
  );
}
