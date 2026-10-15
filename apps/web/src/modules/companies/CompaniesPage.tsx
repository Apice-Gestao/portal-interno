import { SelectField } from "../../shared/ui/SelectField";
import { downloadText } from "../../shared/downloads";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import Papa from "papaparse";
import {
  Search,
  Plus,
  Upload,
  Download,
  Building2,
  MapPin,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import {
  canExecute,
  companySchema,
  cnpjFromBase,
  hasPermission,
} from "@apice/domain";
import type { Company, CreateCompany } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  Busy,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
export default function CompaniesPage() {
  const { data, actor, client, refresh, notify } = usePortal();
  const [search, setSearch] = useState("");
  const [regime, setRegime] = useState("");
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Company>();
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<CreateCompany[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canManage = hasPermission(actor, "companies.manage");
  const companies = data.companies.filter(
    (c) =>
      c.name
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")) &&
      (!regime || c.regime === regime),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const result = companySchema.safeParse(Object.fromEntries(f));
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.addCompany(result.data);
      await refresh();
      setCreate(false);
      notify("Empresa cadastrada e vinculada à carteira.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cadastro indisponível.");
    } finally {
      setBusy(false);
    }
  }
  async function readImport(file?: File) {
    setError("");
    setPreview([]);
    if (!file) return;
    if (file.size > 1024 * 1024 || !file.name.toLowerCase().endsWith(".csv")) {
      setError("Selecione um CSV de até 1 MB.");
      return;
    }
    const result = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      delimiter: ";",
      skipEmptyLines: "greedy",
      transformHeader: (header) =>
        header
          .replace(/^\uFEFF/, "")
          .trim()
          .toLowerCase(),
    });
    if (result.errors.length || result.data.length > 200) {
      setError("Revise o CSV. O limite por importação é de 200 empresas.");
      return;
    }
    const parsed: CreateCompany[] = [];
    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i]!;
      const validated = companySchema.safeParse({
        name: row.nome,
        cnpj: row.cnpj,
        regime: row.regime,
        city: row.cidade,
        ownerId: row.responsavel,
      });
      if (!validated.success) {
        setError(
          `Linha ${i + 2}: ${validated.error.issues[0]?.message ?? "dados inválidos"}`,
        );
        return;
      }
      parsed.push(validated.data);
    }
    if (!parsed.length) {
      setError("O arquivo está vazio.");
      return;
    }
    setPreview(parsed);
  }
  async function confirmImport() {
    setBusy(true);
    setError("");
    try {
      const result = await client.importCompanies(preview);
      await refresh();
      setImporting(false);
      setPreview([]);
      notify(
        `${result.created} empresas importadas. ${result.existing} já cadastradas foram preservadas.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importação indisponível.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Empresas e carteira"
        description="Empresas atendidas, regimes e responsáveis por departamento."
      >
        {canManage && (
          <>
            <button
              className="button button-white"
              onClick={() => {
                setImporting(true);
                setPreview([]);
                setError("");
              }}
            >
              <Upload size={16} />
              Importar CSV
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                setCreate(true);
                setError("");
              }}
            >
              <Plus size={17} />
              Nova empresa
            </button>
          </>
        )}
      </PageHeading>
      <div className="company-summary">
        <div>
          <Building2 size={19} />
          <strong>{data.companies.length}</strong>
          <span>empresas na sua carteira</span>
        </div>
        <div>
          <span className="legend-swatch teal" />
          {
            data.companies.filter((c) => c.regime === "Simples Nacional").length
          }{" "}
          Simples Nacional
        </div>
        <div>
          <span className="legend-swatch blue" />
          {
            data.companies.filter((c) => c.regime === "Lucro Presumido").length
          }{" "}
          Lucro Presumido
        </div>
      </div>
      <section className="surface">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Buscar empresas"
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="filter-select">
            <SelectField
              value={regime}
              onValueChange={(value) => setRegime(value)}
              aria-label="Regime tributário"
            >
              <option value="">Todos os regimes</option>
              <option>Simples Nacional</option>
              <option>Lucro Presumido</option>
              <option>Lucro Real</option>
            </SelectField>
          </label>
        </div>
        {companies.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>EMPRESA</th>
                  <th>CNPJ</th>
                  <th>REGIME TRIBUTÁRIO</th>
                  <th>CARTEIRA FISCAL</th>
                  <th>SITUAÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const owner = data.users.find((u) => u.userId === c.ownerId);
                  return (
                    <tr key={c.id}>
                      <td>
                        <button
                          className="company-cell row-action"
                          onClick={() => setSelected(c)}
                        >
                          <span
                            className={`company-monogram monogram-${Number(c.code) % 4}`}
                          >
                            {c.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="company-info">
                            <strong>{c.name}</strong>
                            <span>
                              Código {c.code} · {c.city}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="mono-text">{c.cnpj}</td>
                      <td>
                        <span className="regime-label">{c.regime}</span>
                      </td>
                      <td>
                        <span className="owner-cell">
                          <span className="avatar avatar-tiny">
                            {owner?.initials}
                          </span>
                          {owner?.name}
                        </span>
                      </td>
                      <td>
                        <span className="badge status-done">
                          <Check size={12} />
                          Ativa
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
        <footer className="table-footer">
          <span>{companies.length} empresas encontradas</span>
          <span>Histórico preservado por empresa</span>
        </footer>
      </section>
      <Modal
        open={create && canManage}
        onOpenChange={(value) => {
          if (!busy) setCreate(value);
        }}
        title="Nova empresa"
        description="Use apenas dados fictícios neste ambiente."
      >
        <form className="form-grid" onSubmit={submit}>
          <label className="full">
            Razão social
            <input name="name" required minLength={3} maxLength={100} />
          </label>
          <label className="full">
            CNPJ
            <input
              name="cnpj"
              placeholder="00.000.000/0000-00"
              required
              maxLength={18}
            />
          </label>
          <label>
            Regime
            <SelectField name="regime" aria-label="Regime">
              <option>Simples Nacional</option>
              <option>Lucro Presumido</option>
              <option>Lucro Real</option>
            </SelectField>
          </label>
          <label>
            Cidade / UF
            <input
              name="city"
              placeholder="São Paulo / SP"
              required
              maxLength={80}
            />
          </label>
          <label className="full">
            Responsável pela carteira
            <SelectField name="ownerId" aria-label="Responsável pela carteira">
              {data.users
                .filter((u) => u.active !== false && canExecute(u))
                .map((u) => (
                  <option value={u.userId} key={u.userId}>
                    {u.name}
                  </option>
                ))}
            </SelectField>
          </label>
          <div className="full">
            <FormError message={error} />
          </div>
          <footer className="form-actions full">
            <button
              type="button"
              className="button button-white"
              disabled={busy}
              onClick={() => setCreate(false)}
            >
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy}>
              <Busy busy={busy}>Cadastrar empresa</Busy>
            </button>
          </footer>
        </form>
      </Modal>
      <Modal
        open={importing && canManage}
        onOpenChange={(value) => {
          if (!busy) {
            setImporting(value);
            setPreview([]);
          }
        }}
        title="Importar empresas"
        description="Confira os dados antes de adicionar empresas à carteira."
        wide
      >
        <div className="import-instructions">
          <FileSpreadsheet size={26} />
          <div>
            <strong>Planilha CSV com separador ponto e vírgula</strong>
            <p>Até 200 empresas. CNPJs existentes serão preservados.</p>
          </div>
        </div>
        <button
          className="text-button"
          onClick={() =>
            downloadText(
              "modelo-importacao-apice.csv",
              `nome;cnpj;regime;cidade;responsavel\r\nEmpresa Exemplo;${cnpjFromBase("000000990001")};Simples Nacional;São Paulo / SP;julia`,
            )
          }
        >
          <Download size={15} />
          Baixar modelo de importação
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void readImport(e.target.files?.[0])}
          aria-label="Selecionar CSV"
        />
        <button
          className="upload-zone"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={20} />
          <strong>Selecionar planilha CSV</strong>
          <span>Até 1 MB · somente dados fictícios</span>
        </button>
        <FormError message={error} />
        {preview.length > 0 && (
          <>
            <div className="section-heading">
              <h3>Prévia da importação</h3>
              <span>{preview.length} empresas</span>
            </div>
            <div className="import-preview table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>EMPRESA</th>
                    <th>CNPJ</th>
                    <th>REGIME</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((c, i) => (
                    <tr key={i}>
                      <td>{c.name}</td>
                      <td>{c.cnpj}</td>
                      <td>{c.regime}</td>
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
            onClick={() => {
              setImporting(false);
              setPreview([]);
            }}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={!preview.length || busy}
            onClick={() => void confirmImport()}
          >
            <Busy busy={busy}>Confirmar importação</Busy>
          </button>
        </footer>
      </Modal>
      <Modal
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(undefined);
        }}
        title={selected?.name ?? "Empresa"}
        description="Cadastro e responsabilidades operacionais."
      >
        {selected && (
          <>
            <div className="company-detail">
              <span className="badge status-done">Atendimento ativo</span>
              <dl>
                <dt>CNPJ</dt>
                <dd>{selected.cnpj}</dd>
                <dt>Regime tributário</dt>
                <dd>{selected.regime}</dd>
                <dt>Localização</dt>
                <dd>
                  <MapPin size={14} />
                  {selected.city}
                </dd>
                <dt>Responsável fiscal</dt>
                <dd>
                  {data.users.find((u) => u.userId === selected.ownerId)?.name}
                </dd>
                <dt>Início do atendimento</dt>
                <dd>{selected.startDate.split("-").reverse().join("/")}</dd>
              </dl>
            </div>
            {hasPermission(actor, "tasks.view") && (
              <Link
                className="button button-primary"
                to={`/tarefas?q=${encodeURIComponent(selected.name)}`}
              >
                Ver tarefas da empresa
              </Link>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
