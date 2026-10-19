import { useRef, useState } from "react";
import type { DocumentRule, Task } from "@apice/domain";
import { normalizeCnpj, validateEvidence } from "@apice/domain";
import { UploadIcon, CheckIcon, DocumentIcon } from "../../shared/icons";
import { usePortal } from "../../app/usePortal";
import { Busy, FormError } from "../../shared/ui/components";
import { SelectField } from "../../shared/ui/SelectField";
interface BatchItem {
  id: string;
  file: File;
  taskId: string;
  typeId: string;
  checked: boolean;
  status: "review" | "saved" | "error";
  detail: string;
  identification: string;
}
const normalized = (value: string) =>
  value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
function fieldText(xml: Document | undefined, field: string | undefined) {
  return field && xml
    ? (xml.getElementsByTagName(field).item(0)?.textContent?.trim() ?? "")
    : "";
}
export function DocumentBatch() {
  const { data, actor, client, refresh, notify } = usePortal();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchItem[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const openTasks = data.tasks.filter(
    (task) =>
      !["done", "dispensed", "in_review", "waiting"].includes(task.status),
  );
  async function read(files: File[]) {
    if (busy) return;
    if (
      files.length > 50 ||
      files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024
    ) {
      setError("Selecione até 50 arquivos, com no máximo 25 MB no total.");
      return;
    }
    setBusy(true);
    setError("");
    const output: BatchItem[] = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const kind = await validateEvidence(file.name, bytes);
        const text = kind === "XML" ? new TextDecoder().decode(bytes) : "";
        if (/<!DOCTYPE|<!ENTITY/i.test(text))
          throw new Error("XML com entidades externas não é aceito.");
        const xml =
          kind === "XML"
            ? new DOMParser().parseFromString(text, "application/xml")
            : undefined;
        const content = normalized(`${file.name} ${text}`);
        const rules = data.workspace.documentRules.filter(
          (rule) =>
            rule.active &&
            (!rule.keywords.length ||
              rule.keywords.some((word) => content.includes(normalized(word)))),
        );
        const cnps = [
          ...new Set(
            [
              ...(text.match(/\b[A-Z\d]{12}\d{2}\b/gi) ?? []),
              ...(text.match(
                /[A-Z\d]{2}\.?[A-Z\d]{3}\.?[A-Z\d]{3}\/?[A-Z\d]{4}-?\d{2}/gi,
              ) ?? []),
              ...rules.map((rule) => fieldText(xml, rule.cnpjField || "CNPJ")),
            ]
              .filter(Boolean)
              .map(normalizeCnpj),
          ),
        ];
        const periods = [
          ...new Set(
            [
              ...(text.match(/\b\d{4}-(?:0[1-9]|1[0-2])\b/g) ?? []),
              ...rules.map((rule) =>
                fieldText(xml, rule.competenceField || "competencia").slice(
                  0,
                  7,
                ),
              ),
            ].filter(Boolean),
          ),
        ];
        const eligible = (task: Task, rule: DocumentRule) => {
          if (
            rule.templateIds.length &&
            !rule.templateIds.includes(task.templateId)
          )
            return false;
          const company = data.companies.find(
            (entry) => entry.id === task.companyId,
          );
          return (
            (!rule.fields.includes("cnpj") ||
              (!!company && cnps.includes(normalizeCnpj(company.cnpj)))) &&
            (!rule.fields.includes("competence") ||
              periods.includes(task.competence)) &&
            (!rule.fields.includes("obligation") ||
              (fieldText(xml, rule.obligationField || "obrigacao")
                ? normalized(
                    fieldText(xml, rule.obligationField || "obrigacao"),
                  ) === normalized(task.title)
                : content.includes(normalized(task.title))))
          );
        };
        const candidates = openTasks.filter((task) =>
          rules.some((rule) => eligible(task, rule)),
        );
        const unique = candidates.length === 1 ? candidates[0] : undefined;
        const matchingTypes = [
          ...new Set(
            rules
              .filter((rule) => unique && eligible(unique, rule))
              .flatMap((rule) => rule.documentTypeIds),
          ),
        ].filter((id) =>
          data.workspace.documentTypes
            .find((type) => type.id === id)
            ?.formats.includes(kind),
        );
        output.push({
          id: crypto.randomUUID(),
          file,
          taskId: unique?.id ?? "",
          typeId: matchingTypes.length === 1 ? matchingTypes[0]! : "",
          checked: false,
          status: "review",
          detail: unique
            ? "Correspondência sugerida · confira antes de anexar"
            : candidates.length > 1
              ? "Mais de uma tarefa possível · escolha o destino"
              : "Sem correspondência única · escolha o destino",
          identification: `${cnps[0] ? `CNPJ ${cnps[0]}` : "CNPJ não identificado"} · ${periods[0] ?? "competência não identificada"}${kind === "PDF" ? " · conteúdo PDF exige conferência manual" : ""}`,
        });
      } catch (cause) {
        output.push({
          id: crypto.randomUUID(),
          file,
          taskId: "",
          typeId: "",
          checked: false,
          status: "error",
          detail: cause instanceof Error ? cause.message : "Arquivo inválido",
          identification: "Formato recusado",
        });
      }
    }
    setItems(output);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  function update(id: string, patch: Partial<BatchItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }
  async function apply() {
    if (busy) return;
    setBusy(true);
    setError("");
    let saved = 0;
    const revisions = new Map<string, Task>();
    for (const item of items.filter(
      (entry) =>
        entry.checked &&
        entry.taskId &&
        entry.typeId &&
        entry.status !== "saved",
    )) {
      try {
        let task =
          revisions.get(item.taskId) ??
          data.tasks.find((entry) => entry.id === item.taskId);
        if (!task) throw new Error("Tarefa indisponível.");
        if (["todo", "returned"].includes(task.status))
          task = await client.command(task.id, {
            type: "start",
            expectedRevision: task.revision,
          });
        const updated = await client.attach(task.id, task.revision, item.file, {
          documentTypeId: item.typeId,
        });
        revisions.set(task.id, updated);
        update(item.id, {
          status: "saved",
          checked: false,
          detail: "Documento anexado à tarefa e registrado no histórico.",
        });
        saved++;
      } catch (cause) {
        update(item.id, {
          status: "error",
          detail: cause instanceof Error ? cause.message : "Falha ao anexar.",
        });
      }
    }
    await refresh();
    setBusy(false);
    notify(
      `${saved} documentos anexados. Confira o resultado individual dos arquivos.`,
    );
  }
  function examples() {
    const targets = openTasks
      .filter(
        (task) =>
          task.assigneeId === actor.userId ||
          actor.permissions?.includes("tasks.manage"),
      )
      .slice(0, 3);
    void read(
      targets.map((task) => {
        const company = data.companies.find(
          (entry) => entry.id === task.companyId,
        )!;
        return new File(
          [
            `<?xml version="1.0" encoding="UTF-8"?><documento><CNPJ>${company.cnpj}</CNPJ><competencia>${task.competence}</competencia><obrigacao>${task.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</obrigacao><descricao>Exemplo ficticio de recibo de entrega EFD</descricao></documento>`,
          ],
          `exemplo-${company.code}-${task.competence}.xml`,
          { type: "application/xml" },
        );
      }),
    );
  }
  const selected = items.filter(
    (item) =>
      item.checked && item.taskId && item.typeId && item.status !== "saved",
  );
  return (
    <>
      <div className="document-config-intro">
        <UploadIcon size={24} />
        <p>
          Envie os arquivos, confira as sugestões e confirme os destinos. Nenhum
          vínculo é aplicado sem sua revisão. Tarefas a fazer são iniciadas ao
          confirmar, se você tiver acesso.
        </p>
      </div>
      <div className="document-batch-actions">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.xml"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void read(Array.from(event.target.files ?? []))}
        />
        <button
          className="button button-primary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <UploadIcon size={16} />
          Selecionar arquivos
        </button>
        <button
          className="button button-white"
          disabled={busy || !openTasks.length}
          onClick={examples}
        >
          Usar arquivos fictícios
        </button>
      </div>
      <FormError message={error} />
      <div className="document-batch-list">
        {items.map((item) => (
          <article
            className={`surface document-batch-item ${item.status}`}
            key={item.id}
          >
            <div className="document-batch-name">
              <DocumentIcon size={22} />
              <div>
                <strong>{item.file.name}</strong>
                <small>{item.identification}</small>
              </div>
              {item.status === "saved" && <CheckIcon size={20} />}
            </div>
            <div className="form-grid">
              <label>
                Tarefa e empresa
                <SelectField
                  disabled={busy || item.status === "saved"}
                  value={item.taskId}
                  onValueChange={(taskId) =>
                    update(item.id, { taskId, checked: false })
                  }
                  aria-label={`Destino de ${item.file.name}`}
                >
                  <option value="">Selecionar tarefa</option>
                  {openTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {
                        data.companies.find(
                          (company) => company.id === task.companyId,
                        )?.code
                      }{" "}
                      · {task.title} · {task.competence} ·{" "}
                      {
                        data.companies.find(
                          (company) => company.id === task.companyId,
                        )?.name
                      }
                    </option>
                  ))}
                </SelectField>
              </label>
              <label>
                Tipo de documento
                <SelectField
                  disabled={busy || item.status === "saved"}
                  value={item.typeId}
                  onValueChange={(typeId) =>
                    update(item.id, { typeId, checked: false })
                  }
                  aria-label={`Tipo de ${item.file.name}`}
                >
                  <option value="">Selecionar tipo</option>
                  {data.workspace.documentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </SelectField>
              </label>
            </div>
            <p
              className={item.status === "error" ? "danger-text" : "muted-note"}
            >
              {item.detail}
            </p>
            {item.status !== "saved" && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  disabled={busy || !item.taskId || !item.typeId}
                  checked={item.checked}
                  onChange={(event) =>
                    update(item.id, { checked: event.target.checked })
                  }
                />
                Conferi o conteúdo, a empresa e a competência deste arquivo
              </label>
            )}
          </article>
        ))}
      </div>
      {items.length > 0 && (
        <footer className="form-actions">
          <span className="muted-note">
            {selected.length} arquivos conferidos para anexar
          </span>
          <button
            className="button button-primary"
            disabled={busy || !selected.length}
            onClick={() => void apply()}
          >
            <Busy busy={busy}>Confirmar anexação</Busy>
          </button>
        </footer>
      )}
    </>
  );
}
