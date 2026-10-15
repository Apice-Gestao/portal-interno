import { SelectField } from "../../shared/ui/SelectField";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  FileText,
  Download,
  FolderOpen,
  ShieldCheck,
  History,
  ExternalLink,
} from "lucide-react";
import { competenceLabel, dateLabel, hasPermission } from "@apice/domain";
import type { DocumentVersion, Task } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  CompetenceSelect,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
export default function DocumentsPage() {
  const { data, actor, department, competence, client, notify } = usePortal();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<Task>();
  const [error, setError] = useState("");
  const tasks = data.tasks.filter(
    (t) => t.department === department && t.competence === competence,
  );
  const all = tasks.flatMap((task) => {
    const document = task.documents.at(-1);
    return document ? [{ task, document }] : [];
  });
  const documents = all.filter(
    ({ task, document }) =>
      (!kind || document.kind === kind) &&
      `${document.name} ${data.companies.find((c) => c.id === task.companyId)?.name} ${task.title}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  async function download(task: Task, doc: DocumentVersion) {
    setError("");
    try {
      const blob = await client.downloadDocument(task.id, doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify("Download preparado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download indisponível.");
    }
  }
  return (
    <>
      <PageHeading
        title="Documentos"
        description="Evidências vinculadas a empresas, tarefas e competências."
      >
        <CompetenceSelect />
      </PageHeading>
      <div className="document-summary">
        <span className="summary-icon">
          <FolderOpen size={23} />
        </span>
        <div>
          <strong>{all.length} evidências disponíveis</strong>
          <p>
            {tasks.reduce((n, t) => n + t.documents.length, 0)} versões
            preservadas · {department}
          </p>
        </div>
        <span className="badge status-todo">
          <ShieldCheck size={14} />
          Visibilidade interna
        </span>
      </div>
      <FormError message={error} />
      <section className="surface">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Buscar arquivo ou empresa..."
              aria-label="Buscar documentos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="filter-select">
            <SelectField
              value={kind}
              onValueChange={(value) => setKind(value)}
              aria-label="Tipo de documento"
            >
              <option value="">Todos os tipos</option>
              <option value="PDF">PDF</option>
              <option value="XML">XML</option>
            </SelectField>
          </label>
        </div>
        {documents.length ? (
          <div className="table-wrap">
            <table className="data-table document-table">
              <thead>
                <tr>
                  <th>ARQUIVO</th>
                  <th>EMPRESA</th>
                  <th>COMPETÊNCIA</th>
                  <th>VERSÃO</th>
                  <th>VERIFICAÇÃO</th>
                  <th>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(({ task, document }) => (
                  <tr key={document.id}>
                    <td>
                      <button
                        className="document-file row-action"
                        onClick={() => setSelected(task)}
                      >
                        <span className="file-icon">
                          <FileText size={20} />
                        </span>
                        <span>
                          <strong>{document.name}</strong>
                          <small>
                            {task.title} · {(document.bytes / 1024).toFixed(0)}{" "}
                            KB
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {
                        data.companies.find((c) => c.id === task.companyId)
                          ?.name
                      }
                    </td>
                    <td>{competenceLabel(task.competence)}</td>
                    <td>
                      <span className="version-label">v{document.version}</span>
                    </td>
                    <td>
                      <span className="badge status-done">
                        Formato verificado
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Ver versões de ${document.name}`}
                          onClick={() => setSelected(task)}
                        >
                          <History size={17} />
                        </button>
                        {hasPermission(actor, "tasks.download") && (
                          <button
                            className="icon-button"
                            aria-label={`Baixar ${document.name}`}
                            onClick={() => void download(task, document)}
                          >
                            <Download size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhum documento nesta seleção"
            text="As evidências anexadas às tarefas aparecerão aqui."
          />
        )}
        <footer className="table-footer">
          <span>{documents.length} documentos encontrados</span>
          <span>Última versão de cada evidência</span>
        </footer>
      </section>
      <div className="page-footnote">
        <ShieldCheck size={14} />
        <span>
          Os documentos deste ambiente são fictícios e não têm validade fiscal.
        </span>
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(undefined);
        }}
        title="Histórico do documento"
        description={
          selected
            ? `${selected.title} · ${data.companies.find((c) => c.id === selected.companyId)?.name}`
            : undefined
        }
      >
        {selected && (
          <>
            <div className="document-versions-list">
              {[...selected.documents].reverse().map((doc) => (
                <div className="document-version" key={doc.id}>
                  <span className="file-icon">
                    <FileText size={21} />
                  </span>
                  <div>
                    <strong>{doc.name}</strong>
                    <p>
                      v{doc.version} · {dateLabel(doc.createdAt)} ·{" "}
                      {(doc.bytes / 1024).toFixed(0)} KB
                    </p>
                    <span className="badge status-done">
                      Formato verificado
                    </span>
                  </div>
                  {hasPermission(actor, "tasks.download") && (
                    <button
                      className="icon-button"
                      aria-label={`Baixar versão ${doc.version}`}
                      onClick={() => void download(selected, doc)}
                    >
                      <Download size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="muted-note">
              A validação fiscal avançada não é executada neste ambiente.
            </p>
            {hasPermission(actor, "tasks.view") && (
              <footer className="form-actions">
                <Link
                  to={`/tarefas?task=${selected.id}`}
                  className="button button-primary"
                >
                  <ExternalLink size={15} />
                  Abrir tarefa vinculada
                </Link>
              </footer>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
