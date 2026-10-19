import { useRef, useState } from "react";
import Papa from "papaparse";
import { ExportFileIcon, ImportFileIcon } from "../../shared/icons";
import type { AccountInput, AccountUser } from "@apice/domain";
import { csvCell, roleLabels } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { downloadText } from "../../shared/downloads";
import { Busy, FormError, Modal } from "../../shared/ui/components";
export function UserImport({
  accounts,
  onImported,
}: {
  accounts: AccountUser[];
  onImported: () => Promise<void>;
}) {
  const { data, client } = usePortal();
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<AccountInput[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const headers = [
    "nome",
    "usuario",
    "email",
    "modelo",
    "departamentos",
    "gestor",
  ];
  function close() {
    setOpen(false);
    setRows([]);
    setSaved(false);
    setError("");
  }
  async function read(file?: File) {
    setRows([]);
    setError("");
    setSaved(false);
    if (!file) return;
    if (file.size > 128 * 1024 || !file.name.toLowerCase().endsWith(".csv")) {
      setError("Selecione um CSV de até 128 KB.");
      return;
    }
    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) =>
        header
          .replace(/^\uFEFF/, "")
          .trim()
          .toLowerCase(),
    });
    if (
      parsed.errors.length ||
      !parsed.data.length ||
      parsed.data.length > 50
    ) {
      setError("Use o modelo e selecione entre 1 e 50 usuários.");
      return;
    }
    const result: AccountInput[] = [],
      issues: string[] = [],
      names = new Set(
        accounts.map((account) => account.username.toLowerCase()),
      );
    for (const [index, row] of parsed.data.entries()) {
      const profile = data.workspace.accessProfiles.find(
        (item) => item.id === row.modelo?.trim(),
      );
      const username = row.usuario?.trim().toLowerCase() ?? "",
        name = row.nome?.trim() ?? "",
        email = row.email?.trim().toLowerCase() ?? "";
      const departments = row.departamentos?.trim()
        ? row.departamentos.split("|").map((value) => value.trim())
        : (profile?.departments ?? []);
      if (
        !profile ||
        name.length < 2 ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        !/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(username) ||
        names.has(username) ||
        departments.some(
          (id) =>
            !data.workspace.departments.some(
              (item) => item.id === id && item.active,
            ),
        )
      ) {
        issues.push(
          `Linha ${index + 2}: confira identidade, modelo, departamentos e usuário não repetido.`,
        );
        continue;
      }
      const managerId = row.gestor?.trim() || undefined;
      if (
        managerId &&
        !accounts.some(
          (account) => account.userId === managerId && account.active,
        )
      ) {
        issues.push(`Linha ${index + 2}: gestor indisponível neste grupo.`);
        continue;
      }
      names.add(username);
      result.push({
        name,
        username,
        email,
        role: profile.role,
        departments,
        permissions: [...profile.permissions],
        homeView: profile.homeView,
        managerId,
        password: `${crypto.randomUUID().replaceAll("-", "")}Aa!`,
      });
    }
    setRows(result);
    setError(issues.join("\n"));
  }
  async function apply() {
    if (busy || error || !rows.length) return;
    setBusy(true);
    setError("");
    try {
      await client.importUsers(rows);
      setSaved(true);
      await onImported();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível confirmar o lote. Confira o cadastro antes de reenviar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button button-white" onClick={() => setOpen(true)}>
        <ImportFileIcon size={16} />
        Importar usuários
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!value && !busy) close();
        }}
        title={saved ? "Usuários criados" : "Importar usuários"}
        description={
          saved
            ? "Guarde os acessos temporários antes de fechar esta janela."
            : "Importe identidades e aplique um modelo de acesso por pessoa. O lote é validado antes de criar as contas."
        }
        wide
      >
        {saved ? (
          <>
            <p className="muted-note">
              {rows.length} contas criadas. Cada pessoa recebeu uma senha
              temporária aleatória e deverá trocá-la no primeiro acesso. As
              senhas aparecem somente neste resultado e não integram a
              exportação normal de usuários.
            </p>
            <button
              className="button button-primary"
              onClick={() =>
                downloadText(
                  "acessos-temporarios-apice.csv",
                  [
                    ["Nome", "Usuário", "Senha temporária"],
                    ...rows.map((row) => [
                      row.name,
                      row.username,
                      row.password,
                    ]),
                  ]
                    .map((row) => row.map(csvCell).join(";"))
                    .join("\r\n"),
                )
              }
            >
              <ExportFileIcon size={16} />
              Baixar acessos temporários
            </button>
          </>
        ) : (
          <>
            <div className="heading-actions">
              <button
                className="button button-white"
                onClick={() =>
                  downloadText(
                    "modelo-usuarios.csv",
                    [
                      headers,
                      [
                        "Pessoa de exemplo",
                        "pessoa.exemplo",
                        "pessoa@example.invalid",
                        data.workspace.accessProfiles[0]?.id ?? "",
                        "",
                        "",
                      ],
                    ]
                      .map((row) => row.map(csvCell).join(";"))
                      .join("\r\n"),
                  )
                }
              >
                <ExportFileIcon size={16} />
                Modelo CSV
              </button>
              <button
                className="text-button"
                onClick={() =>
                  downloadText(
                    "referencias-acessos.json",
                    JSON.stringify(
                      {
                        modelos: data.workspace.accessProfiles,
                        departamentos: data.workspace.departments,
                        gestores: accounts
                          .filter((account) => account.active)
                          .map((account) => ({
                            id: account.userId,
                            nome: account.name,
                          })),
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  )
                }
              >
                Referências de modelos e gestores
              </button>
            </div>
            <p className="muted-note">
              Preencha o ID do modelo. Departamentos podem ser separados por |
              ou ficar vazios para usar o modelo. Senhas temporárias são geradas
              individualmente ao preparar o lote.
            </p>
            <input
              ref={input}
              type="file"
              accept=".csv"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void read(event.target.files?.[0])}
            />
            <button
              className="upload-zone"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImportFileIcon size={22} />
              <strong>Selecionar CSV de usuários</strong>
              <span>Até 50 contas · 128 KB</span>
            </button>
          </>
        )}
        <FormError message={error} />
        {!!rows.length && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>NOME / USUÁRIO</th>
                  <th>E-MAIL</th>
                  <th>ACESSOS DO MODELO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.username}>
                    <td>
                      {row.name}
                      <small className="account-home-label">
                        {row.username}
                      </small>
                    </td>
                    <td>{row.email}</td>
                    <td>
                      {roleLabels[row.role]} · {row.departments.join(" / ")} ·{" "}
                      {row.permissions.length} permissões
                    </td>
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
            onClick={close}
          >
            {saved ? "Fechar e descartar senhas desta janela" : "Cancelar"}
          </button>
          {!saved && (
            <button
              className="button button-primary"
              disabled={busy || !!error || !rows.length}
              onClick={() => void apply()}
            >
              <Busy busy={busy}>Criar {rows.length} usuários</Busy>
            </button>
          )}
        </footer>
      </Modal>
    </>
  );
}
