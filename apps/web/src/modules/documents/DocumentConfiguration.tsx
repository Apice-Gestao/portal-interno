import { useState } from "react";
import type { DocumentRule, DocumentType } from "@apice/domain";
import { hasPermission } from "@apice/domain";
import { AddIcon, EditIcon, DocumentRuleIcon } from "../../shared/icons";
import { usePortal } from "../../app/usePortal";
import { Busy, EmptyState, FormError, Modal } from "../../shared/ui/components";
import "./documents.css";
export function DocumentConfiguration() {
  const { data, actor, client, refresh, notify } = usePortal();
  const [type, setType] = useState<DocumentType>();
  const [rule, setRule] = useState<DocumentRule>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canManage = hasPermission(actor, "documents.manage");
  async function save(types: DocumentType[], rules: DocumentRule[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await client.updateWorkspaceSettings({
        expectedRevision: data.workspace.revision,
        documentTypes: types,
        documentRules: rules,
      });
      await refresh();
      setType(undefined);
      setRule(undefined);
      notify(
        "Configuração documental salva. Tarefas existentes preservam os requisitos anteriores.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="document-config-intro">
        <DocumentRuleIcon size={24} />
        <p>
          Defina os documentos de cada obrigação e os campos usados para sugerir
          vínculos no envio em lote. Novas tarefas recebem os requisitos
          publicados; as existentes mantêm sua configuração.
        </p>
      </div>
      <FormError message={error} />
      <div className="section-heading">
        <h2>Tipos de documento</h2>
        {canManage && (
          <button
            className="button button-white"
            onClick={() => {
              setError("");
              setType({
                id: crypto.randomUUID(),
                name: "",
                formats: ["PDF", "XML"],
              });
            }}
          >
            <AddIcon size={16} />
            Novo tipo
          </button>
        )}
      </div>
      <div className="document-config-grid">
        {data.workspace.documentTypes.map((item) => (
          <article className="surface document-config-card" key={item.id}>
            <h3>{item.name}</h3>
            <p>{item.description || "Documento vinculado à atividade."}</p>
            <span className="badge status-todo">
              {item.formats.join(" / ")}
            </span>
            {canManage && (
              <button
                className="text-button"
                onClick={() => {
                  setError("");
                  setType(structuredClone(item));
                }}
              >
                <EditIcon size={14} />
                Editar tipo
              </button>
            )}
          </article>
        ))}
      </div>
      <div className="section-heading document-rules-heading">
        <h2>Regras por obrigação</h2>
        {canManage && (
          <button
            className="button button-primary"
            onClick={() => {
              setError("");
              setRule({
                id: crypto.randomUUID(),
                name: "",
                templateIds: [],
                documentTypeIds: [],
                required: true,
                keywords: [],
                fields: ["cnpj", "competence"],
                active: true,
              });
            }}
          >
            <AddIcon size={16} />
            Nova regra
          </button>
        )}
      </div>
      <div className="document-config-grid">
        {data.workspace.documentRules.map((item) => (
          <article className="surface document-config-card" key={item.id}>
            <span
              className={`badge ${item.active ? "status-done" : "status-dispensed"}`}
            >
              {item.active ? "Ativa" : "Inativa"}
            </span>
            <h3>{item.name}</h3>
            <p>
              {item.templateIds.length
                ? item.templateIds
                    .map(
                      (id) =>
                        data.templates.find((t) => t.id === id)?.title ?? id,
                    )
                    .join(" · ")
                : "Todas as obrigações"}
            </p>
            <small>
              {item.documentTypeIds
                .map(
                  (id) =>
                    data.workspace.documentTypes.find((t) => t.id === id)
                      ?.name ?? id,
                )
                .join(" · ")}{" "}
              · {item.required ? "Obrigatório" : "Complementar"}
            </small>
            <small>
              Identificação:{" "}
              {item.fields
                .map(
                  (field) =>
                    ({
                      cnpj: "CNPJ",
                      competence: "Competência",
                      obligation: "Obrigação",
                    })[field],
                )
                .join(", ") || "Revisão manual"}
            </small>
            {canManage && (
              <button
                className="text-button"
                onClick={() => {
                  setError("");
                  setRule(structuredClone(item));
                }}
              >
                <EditIcon size={14} />
                Editar regra
              </button>
            )}
          </article>
        ))}
      </div>
      {!data.workspace.documentRules.length && (
        <EmptyState
          title="Configure a primeira obrigação"
          text="Selecione os tipos documentais, os campos de leitura e se a entrega é obrigatória."
        />
      )}
      <Modal
        open={!!type}
        onOpenChange={(open) => {
          if (!busy && !open) setType(undefined);
        }}
        title="Tipo de documento"
        description="Identificação reutilizável para as obrigações."
      >
        {type && (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void save(
                [
                  ...data.workspace.documentTypes.filter(
                    (item) => item.id !== type.id,
                  ),
                  type,
                ],
                data.workspace.documentRules,
              );
            }}
          >
            <label className="full">
              Nome
              <input
                required
                minLength={2}
                maxLength={100}
                value={type.name}
                onChange={(event) =>
                  setType({ ...type, name: event.target.value })
                }
              />
            </label>
            <label className="full">
              Descrição
              <textarea
                maxLength={500}
                value={type.description ?? ""}
                onChange={(event) =>
                  setType({ ...type, description: event.target.value })
                }
              />
            </label>
            <fieldset className="document-inline-checks full">
              <legend>Formatos aceitos</legend>
              {(["PDF", "XML"] as const).map((format) => (
                <label key={format}>
                  <input
                    type="checkbox"
                    checked={type.formats.includes(format)}
                    onChange={(event) =>
                      setType({
                        ...type,
                        formats: event.target.checked
                          ? [...type.formats, format]
                          : type.formats.filter((value) => value !== format),
                      })
                    }
                  />
                  {format}
                </label>
              ))}
            </fieldset>
            <FormError message={error} />
            <footer className="form-actions full">
              <button
                type="button"
                className="button button-white"
                onClick={() => setType(undefined)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={busy || !type.formats.length}
              >
                <Busy busy={busy}>Salvar tipo</Busy>
              </button>
            </footer>
          </form>
        )}
      </Modal>
      <Modal
        open={!!rule}
        onOpenChange={(open) => {
          if (!busy && !open) setRule(undefined);
        }}
        title="Regra documental"
        description="Condições controladas de leitura e documentos esperados por obrigação."
        wide
      >
        {rule && (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void save(data.workspace.documentTypes, [
                ...data.workspace.documentRules.filter(
                  (item) => item.id !== rule.id,
                ),
                rule,
              ]);
            }}
          >
            <label className="full">
              Nome da regra
              <input
                required
                minLength={2}
                maxLength={100}
                value={rule.name}
                onChange={(event) =>
                  setRule({ ...rule, name: event.target.value })
                }
              />
            </label>
            <fieldset className="document-check-list full">
              <legend>Obrigações</legend>
              <p className="muted-note">
                Sem seleção, a regra vale para todas as obrigações do grupo.
              </p>
              {data.templates.map((template) => (
                <label key={template.id}>
                  <input
                    type="checkbox"
                    checked={rule.templateIds.includes(template.id)}
                    onChange={(event) =>
                      setRule({
                        ...rule,
                        templateIds: event.target.checked
                          ? [...rule.templateIds, template.id]
                          : rule.templateIds.filter((id) => id !== template.id),
                      })
                    }
                  />
                  {template.title} · {template.department}
                </label>
              ))}
            </fieldset>
            <fieldset className="document-check-list full">
              <legend>Documentos esperados</legend>
              {data.workspace.documentTypes.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={rule.documentTypeIds.includes(item.id)}
                    onChange={(event) =>
                      setRule({
                        ...rule,
                        documentTypeIds: event.target.checked
                          ? [...rule.documentTypeIds, item.id]
                          : rule.documentTypeIds.filter((id) => id !== item.id),
                      })
                    }
                  />
                  {item.name}
                </label>
              ))}
            </fieldset>
            <label className="full">
              Palavras que identificam o documento
              <input
                value={rule.keywords.join(", ")}
                onChange={(event) =>
                  setRule({
                    ...rule,
                    keywords: event.target.value
                      .split(",")
                      .map((word) => word.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Ex.: EFD, recibo, transmissão"
              />
              <small>
                Separadas por vírgula. Encontradas no nome ou conteúdo XML.
              </small>
            </label>
            <fieldset className="document-inline-checks full">
              <legend>O que identificar</legend>
              {(["cnpj", "competence", "obligation"] as const).map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={rule.fields.includes(field)}
                    onChange={(event) =>
                      setRule({
                        ...rule,
                        fields: event.target.checked
                          ? [...rule.fields, field]
                          : rule.fields.filter((value) => value !== field),
                      })
                    }
                  />
                  {
                    {
                      cnpj: "CNPJ",
                      competence: "Competência",
                      obligation: "Obrigação",
                    }[field]
                  }
                </label>
              ))}
            </fieldset>
            <p className="muted-note full">
              Para XML, informe o nome exato das tags. PDF permanece para
              conferência manual do conteúdo nesta versão.
            </p>
            {(["cnpjField", "competenceField", "obligationField"] as const).map(
              (field) => (
                <label key={field}>
                  {
                    {
                      cnpjField: "Tag XML do CNPJ",
                      competenceField: "Tag XML da competência",
                      obligationField: "Tag XML da obrigação",
                    }[field]
                  }
                  <input
                    maxLength={120}
                    placeholder={
                      field === "cnpjField"
                        ? "CNPJ"
                        : field === "competenceField"
                          ? "competencia"
                          : "obrigacao"
                    }
                    value={rule[field] ?? ""}
                    onChange={(event) =>
                      setRule({
                        ...rule,
                        [field]: event.target.value || undefined,
                      })
                    }
                  />
                </label>
              ),
            )}
            <label className="checkbox-field full">
              <input
                type="checkbox"
                checked={rule.required}
                onChange={(event) =>
                  setRule({ ...rule, required: event.target.checked })
                }
              />
              Exigir os documentos na conclusão da tarefa
            </label>
            <label className="checkbox-field full">
              <input
                type="checkbox"
                checked={rule.active}
                onChange={(event) =>
                  setRule({ ...rule, active: event.target.checked })
                }
              />
              Regra ativa
            </label>
            <FormError message={error} />
            <footer className="form-actions full">
              <button
                type="button"
                className="button button-white"
                disabled={busy}
                onClick={() => setRule(undefined)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={busy || !rule.documentTypeIds.length}
              >
                <Busy busy={busy}>Publicar regra</Busy>
              </button>
            </footer>
          </form>
        )}
      </Modal>
    </>
  );
}
