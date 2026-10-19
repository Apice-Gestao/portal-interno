import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  MoveDownIcon,
  MoveUpIcon,
  DownloadIcon,
  EditIcon,
  AddIcon,
  DeleteIcon,
  TeamIcon,
} from "../../shared/icons";
import type { DepartmentDefinition } from "@apice/domain";
import { hasPermission } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { Busy, FormError, Modal } from "../../shared/ui/components";
import { SelectField } from "../../shared/ui/SelectField";
import { downloadText } from "../../shared/downloads";
import "./departments.css";
function shifted<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const result = [...items],
    target = index + direction;
  if (target < 0 || target >= result.length) return result;
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}
export function DepartmentSettings() {
  const { data, actor, client, refresh, notify } = usePortal();
  const [entry, setEntry] = useState<DepartmentDefinition>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [includeSelf, setIncludeSelf] = useState(false);
  const canManage = hasPermission(actor, "users.manage");
  const query = useQuery({
    queryKey: ["account-users", actor.tenantId, actor.userId],
    queryFn: () => client.listUsers(),
    enabled: canManage,
    retry: false,
  });
  const accounts = query.data ?? data.users;
  const nameOf = (id: string) =>
    accounts.find((user) => user.userId === id)?.name ?? "Pessoa indisponível";
  async function persist(departments: DepartmentDefinition[]) {
    return client.updateWorkspaceSettings({
      expectedRevision: data.workspace.revision,
      departments,
    });
  }
  async function reorder(index: number, direction: -1 | 1) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await persist(shifted(data.workspace.departments, index, direction));
      await refresh();
      notify("Ordem dos departamentos atualizada.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível reordenar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!entry || busy) return;
    setBusy(true);
    setError("");
    try {
      const exists = data.workspace.departments.some(
        (item) => item.id === entry.id,
      );
      await persist(
        exists
          ? data.workspace.departments.map((item) =>
              item.id === entry.id ? entry : item,
            )
          : [...data.workspace.departments, entry],
      );
      if (
        includeSelf &&
        entry.active &&
        !actor.departments.includes(entry.id)
      ) {
        try {
          await client.updateUser(actor.userId, {
            departments: [...actor.departments, entry.id],
          });
        } catch {
          await refresh();
          setEntry(undefined);
          notify(
            "Departamento salvo. Ajuste seu acesso ao setor em Usuários e permissões.",
          );
          return;
        }
      }
      await refresh();
      setEntry(undefined);
      notify(
        "Departamento, cargos e equipe salvos. As permissões individuais foram preservadas.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const positions = entry?.positions ?? [],
    members = entry?.members ?? [];
  return (
    <section className="department-settings">
      <div className="surface department-intro">
        <div>
          <h2>Departamentos e equipe</h2>
          <p>
            Organize os setores, crie os cargos que precisar e defina quem
            responde a quem. A ordem é ajustável.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button button-white"
            onClick={() =>
              downloadText(
                "departamentos-apice.json",
                JSON.stringify(data.workspace.departments, null, 2),
                "application/json",
              )
            }
          >
            <DownloadIcon size={16} />
            Exportar
          </button>
          {canManage && (
            <button
              className="button button-primary"
              onClick={() => {
                setError("");
                setIncludeSelf(true);
                setEntry({
                  id: `setor-${crypto.randomUUID().slice(0, 8)}`,
                  name: "",
                  active: true,
                  positions: [],
                  members: [],
                });
              }}
            >
              <AddIcon size={16} />
              Novo departamento
            </button>
          )}
        </div>
      </div>
      <FormError message={!entry ? error : ""} />
      <div className="department-catalog-grid">
        {data.workspace.departments.map((department, index) => (
          <article className="surface department-card" key={department.id}>
            <header>
              <span className="department-order">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{department.name}</h3>
              <span
                className={`badge ${department.active ? "status-done" : "status-dispensed"}`}
              >
                {department.active ? "Ativo" : "Inativo"}
              </span>
            </header>
            <div className="department-people-summary">
              <TeamIcon size={16} />
              {department.members?.length ?? 0} pessoas ·{" "}
              {department.positions?.length ?? 0} cargos
            </div>
            <ol className="department-hierarchy">
              {(department.positions ?? []).map((position) => (
                <li key={position.id}>
                  <strong>{position.name}</strong>
                  <div>
                    {department.members
                      ?.filter((member) => member.positionId === position.id)
                      .map((member) => (
                        <span key={member.userId}>
                          {nameOf(member.userId)}
                          {member.reportsTo && (
                            <small>Responde a {nameOf(member.reportsTo)}</small>
                          )}
                        </span>
                      ))}
                    {!department.members?.some(
                      (member) => member.positionId === position.id,
                    ) && <small>Sem pessoa vinculada</small>}
                  </div>
                </li>
              ))}
            </ol>
            {!department.positions?.length && (
              <p className="muted-note">
                Configure cargos e vincule a equipe deste departamento.
              </p>
            )}
            {canManage && (
              <footer>
                <button
                  className="text-button"
                  onClick={() => {
                    setEntry(structuredClone(department));
                    setError("");
                    setIncludeSelf(false);
                  }}
                >
                  <EditIcon size={14} />
                  Organizar equipe
                </button>
                <div>
                  <button
                    className="icon-button"
                    disabled={busy || index === 0}
                    aria-label={`Subir departamento ${department.name}`}
                    onClick={() => void reorder(index, -1)}
                  >
                    <MoveUpIcon size={15} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={
                      busy || index === data.workspace.departments.length - 1
                    }
                    aria-label={`Descer departamento ${department.name}`}
                    onClick={() => void reorder(index, 1)}
                  >
                    <MoveDownIcon size={15} />
                  </button>
                </div>
              </footer>
            )}
          </article>
        ))}
      </div>
      <p className="muted-note">
        Cargos e lideranças organizam a equipe. Abas, ações e departamentos de
        acesso continuam definidos em{" "}
        <Link to="/usuarios">Usuários e permissões</Link>. Renomear preserva os
        vínculos; desativar preserva o histórico.
      </p>
      <Modal
        open={!!entry}
        onOpenChange={(value) => {
          if (!value && !busy) setEntry(undefined);
        }}
        title="Organizar departamento"
        description="Defina nomes, cargos, pessoas, lideranças e a ordem de apresentação."
        wide
      >
        {entry && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset className="department-editor" disabled={busy}>
              <div className="form-grid">
                <label className="full">
                  Nome do departamento
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={entry.name}
                    onChange={(event) =>
                      setEntry({ ...entry, name: event.target.value })
                    }
                  />
                </label>
                <label className="checkbox-field full">
                  <input
                    type="checkbox"
                    checked={entry.active}
                    onChange={(event) =>
                      setEntry({ ...entry, active: event.target.checked })
                    }
                  />
                  Departamento ativo
                </label>
              </div>
              <div className="section-heading">
                <h3>Cargos e ordem</h3>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    const additions = [
                      "Diretor",
                      "Gerente",
                      "Supervisor",
                      "Analista",
                      "Operador",
                    ]
                      .filter(
                        (name) =>
                          !positions.some(
                            (position) =>
                              position.name.toLocaleLowerCase("pt-BR") ===
                              name.toLocaleLowerCase("pt-BR"),
                          ),
                      )
                      .map((name) => ({ id: crypto.randomUUID(), name }));
                    setEntry({
                      ...entry,
                      positions: [...positions, ...additions].slice(0, 40),
                    });
                  }}
                >
                  Adicionar cargos usuais
                </button>
              </div>
              <ol className="department-position-editor">
                {positions.map((position, index) => (
                  <li key={position.id}>
                    <span>{index + 1}</span>
                    <input
                      aria-label={`Nome do cargo ${index + 1}`}
                      required
                      minLength={2}
                      maxLength={80}
                      value={position.name}
                      placeholder="Ex.: Analista sênior"
                      onChange={(event) =>
                        setEntry({
                          ...entry,
                          positions: positions.map((item) =>
                            item.id === position.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Subir cargo ${index + 1}`}
                      disabled={index === 0}
                      onClick={() =>
                        setEntry({
                          ...entry,
                          positions: shifted(positions, index, -1),
                        })
                      }
                    >
                      <MoveUpIcon size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Descer cargo ${index + 1}`}
                      disabled={index === positions.length - 1}
                      onClick={() =>
                        setEntry({
                          ...entry,
                          positions: shifted(positions, index, 1),
                        })
                      }
                    >
                      <MoveDownIcon size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remover cargo ${index + 1}`}
                      disabled={members.some(
                        (member) => member.positionId === position.id,
                      )}
                      title="Realoque as pessoas antes de remover um cargo em uso"
                      onClick={() =>
                        setEntry({
                          ...entry,
                          positions: positions.filter(
                            (item) => item.id !== position.id,
                          ),
                        })
                      }
                    >
                      <DeleteIcon size={15} />
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="button button-white"
                disabled={positions.length >= 40}
                onClick={() =>
                  setEntry({
                    ...entry,
                    positions: [
                      ...positions,
                      { id: crypto.randomUUID(), name: "" },
                    ],
                  })
                }
              >
                <AddIcon size={15} />
                Adicionar cargo
              </button>
              <div className="section-heading department-members-heading">
                <h3>Pessoas e lideranças</h3>
                <span>{members.length} vinculadas</span>
              </div>
              <SelectField
                aria-label="Vincular pessoa ao departamento"
                value=""
                disabled={
                  !positions.length ||
                  query.isPending ||
                  !!query.error ||
                  members.length >= 250
                }
                onValueChange={(userId) => {
                  if (userId)
                    setEntry({
                      ...entry,
                      members: [
                        ...members,
                        { userId, positionId: positions[0]!.id },
                      ],
                    });
                }}
              >
                <option value="">Vincular pessoa cadastrada</option>
                {accounts
                  .filter(
                    (user) =>
                      user.active !== false &&
                      !members.some((member) => member.userId === user.userId),
                  )
                  .map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.name}
                    </option>
                  ))}
              </SelectField>
              {query.error && (
                <FormError message="Não foi possível carregar as pessoas. Feche e tente novamente." />
              )}
              {!positions.length && (
                <p className="muted-note">
                  Crie um cargo para começar a vincular as pessoas.
                </p>
              )}
              <div className="department-member-editor">
                {members.map((member, index) => (
                  <article key={member.userId}>
                    <header>
                      <strong>{nameOf(member.userId)}</strong>
                      <div>
                        <button
                          type="button"
                          className="icon-button"
                          disabled={index === 0}
                          aria-label={`Subir pessoa ${index + 1}`}
                          onClick={() =>
                            setEntry({
                              ...entry,
                              members: shifted(members, index, -1),
                            })
                          }
                        >
                          <MoveUpIcon size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          disabled={index === members.length - 1}
                          aria-label={`Descer pessoa ${index + 1}`}
                          onClick={() =>
                            setEntry({
                              ...entry,
                              members: shifted(members, index, 1),
                            })
                          }
                        >
                          <MoveDownIcon size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Desvincular ${nameOf(member.userId)}`}
                          onClick={() =>
                            setEntry({
                              ...entry,
                              members: members
                                .filter((item) => item.userId !== member.userId)
                                .map((item) =>
                                  item.reportsTo === member.userId
                                    ? {
                                        userId: item.userId,
                                        positionId: item.positionId,
                                      }
                                    : item,
                                ),
                            })
                          }
                        >
                          <DeleteIcon size={14} />
                        </button>
                      </div>
                    </header>
                    <div className="form-grid">
                      <SelectField
                        label={`Cargo de ${nameOf(member.userId)}`}
                        value={member.positionId}
                        onValueChange={(positionId) =>
                          setEntry({
                            ...entry,
                            members: members.map((item) =>
                              item.userId === member.userId
                                ? { ...item, positionId }
                                : item,
                            ),
                          })
                        }
                        options={positions.map((position) => ({
                          value: position.id,
                          label: position.name || "Cargo sem nome",
                        }))}
                      />
                      <SelectField
                        label={`Liderança de ${nameOf(member.userId)}`}
                        value={member.reportsTo ?? "none"}
                        onValueChange={(leader) =>
                          setEntry({
                            ...entry,
                            members: members.map((item) =>
                              item.userId === member.userId
                                ? {
                                    ...item,
                                    reportsTo:
                                      leader === "none" ? undefined : leader,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="none">Sem vínculo de liderança</option>
                        {members
                          .filter((item) => item.userId !== member.userId)
                          .map((item) => (
                            <option key={item.userId} value={item.userId}>
                              {nameOf(item.userId)}
                            </option>
                          ))}
                      </SelectField>
                    </div>
                    {!accounts
                      .find((user) => user.userId === member.userId)
                      ?.departments.includes(entry.id) && (
                      <small className="muted-note">
                        Acesso ao setor ainda não concedido. Ajuste as
                        permissões da pessoa no cadastro de usuários.
                      </small>
                    )}
                  </article>
                ))}
              </div>
              {!actor.departments.includes(entry.id) && entry.active && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={includeSelf}
                    onChange={(event) => setIncludeSelf(event.target.checked)}
                  />
                  Incluir este departamento no meu acesso de gestão
                </label>
              )}
              <FormError message={error} />
              <footer className="form-actions">
                <button
                  type="button"
                  className="button button-white"
                  onClick={() => setEntry(undefined)}
                >
                  Cancelar
                </button>
                <button className="button button-primary">
                  <Busy busy={busy}>Salvar organização</Busy>
                </button>
              </footer>
            </fieldset>
          </form>
        )}
      </Modal>
    </section>
  );
}
