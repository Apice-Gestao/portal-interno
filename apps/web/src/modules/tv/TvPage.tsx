import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  KeyRound,
  Maximize,
  Monitor,
  Pencil,
  Plus,
  Power,
  Play,
  RefreshCw,
} from "lucide-react";
import {
  DomainError,
  hasPermission,
  TV_BLOCKS,
  TV_DEFAULT_BLOCKS,
} from "@apice/domain";
import type { Department, TvBlock, TvDevice } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { CompetencePicker } from "../../shared/ui/CompetencePicker";
import {
  Busy,
  CompetenceSelect,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
import { TvBoard } from "./TvBoard";
import { blockLabels } from "./tv-labels";
import { TV_SIMULATION_AVAILABLE, useTvSimulation } from "./tv-simulation";

type EditorState = {
  device?: TvDevice;
  name: string;
  departments: Department[];
  competence: string;
  showNames: boolean;
  blocks: TvBlock[];
  rotationSeconds: number;
};
export default function TvPage() {
  const { actor, client, competence, notify } = usePortal();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const simulation = TV_SIMULATION_AVAILABLE && params.get("simulacao") === "1";
  const canManage = hasPermission(actor, "tv.manage");
  const canConfigure = hasPermission(actor, "tv.configure");
  const canViewTeam = hasPermission(actor, "tv.team.view");
  const canList = canManage || canConfigure;
  const [editor, setEditor] = useState<EditorState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [pairCode, setPairCode] = useState<{
    code: string;
    expiresAt: string;
    name: string;
  }>();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const preview = useQuery({
    queryKey: [
      "tv-preview",
      actor.tenantId,
      actor.userId,
      competence,
      "consolidated",
    ],
    queryFn: () => client.previewTv(competence),
    retry: false,
    refetchInterval: 5000,
  });
  const devices = useQuery({
    queryKey: ["tv-devices", actor.tenantId, actor.userId],
    queryFn: () => client.listTvDevices(),
    enabled: canList,
    retry: false,
  });
  const feed = useTvSimulation(preview.data, simulation);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const previewUnauthorized =
    preview.error instanceof DomainError &&
    (preview.error.status === 401 || preview.error.status === 403);
  function openEditor(device?: TvDevice) {
    setError("");
    setConflict(false);
    setEditor({
      device,
      name: device?.name ?? "",
      departments: device ? [...device.departments] : [...actor.departments],
      competence: device?.competence ?? competence,
      showNames: device?.showNames ?? false,
      blocks: device
        ? [...device.blocks]
        : TV_DEFAULT_BLOCKS.filter(
            (block) => block !== "collaborators" || canViewTeam,
          ),
      rotationSeconds: device?.rotationSeconds ?? 12,
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      if (!editor.departments.length)
        throw new Error("Selecione pelo menos um departamento.");
      if (editor.device) {
        if (!editor.blocks.length)
          throw new Error("Mantenha pelo menos um bloco no painel.");
        await client.updateTvDevice(editor.device.id, {
          expectedVersion: editor.device.version,
          name: editor.name.trim(),
          departments: editor.departments,
          competence: editor.competence,
          showNames: editor.showNames,
          blocks: editor.blocks,
          rotationSeconds: editor.rotationSeconds,
        });
      } else
        await client.addTvDevice({
          name: editor.name.trim(),
          departments: editor.departments,
          competence: editor.competence,
        });
      setEditor(undefined);
      await devices.refetch();
      notify("Dispositivo salvo.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível salvar.",
      );
      setConflict(failure instanceof DomainError && failure.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function reloadEditor() {
    const result = await devices.refetch();
    const latest = result.data?.find(
      (device) => device.id === editor?.device?.id,
    );
    if (latest) openEditor(latest);
  }
  async function toggleActive(device: TvDevice) {
    setBusy(true);
    setError("");
    try {
      await client.updateTvDevice(device.id, {
        expectedVersion: device.version,
        active: !device.active,
      });
      await devices.refetch();
      notify(
        device.active
          ? "Dispositivo desativado. O acesso foi revogado."
          : "Dispositivo ativado. Gere um novo código para conectar.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível alterar o dispositivo.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generateCode(device: TvDevice) {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await client.createTvPairCode(device.id);
      setPairCode({ ...result, name: device.name });
      await devices.refetch();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível gerar o código.",
      );
    } finally {
      setBusy(false);
    }
  }
  function moveBlock(block: TvBlock, offset: number) {
    if (!editor) return;
    const blocks = [...editor.blocks];
    const index = blocks.indexOf(block);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
    setEditor({ ...editor, blocks });
  }
  const watchUrl = `${window.location.origin}${window.location.pathname}#/tv`;
  return (
    <>
      <PageHeading
        title="Painel de TV"
        description="Acompanhe a operação em uma tela dedicada."
      >
        <button
          className="button button-primary"
          disabled={!preview.data || previewUnauthorized}
          onClick={() =>
            navigate(`/painel-tv/exibir${simulation ? "?simulacao=1" : ""}`)
          }
        >
          <Maximize size={17} />
          Abrir painel
        </button>
      </PageHeading>
      <div className="tv-manager-toolbar">
        <span>
          {actor.departments.length === 3
            ? "Todos os departamentos"
            : actor.departments.join(" / ")}
          {" · Visão consolidada da equipe"}
        </span>
        <div className="tv-manager-tools">
          {TV_SIMULATION_AVAILABLE && (
            <button
              type="button"
              className="button button-secondary"
              aria-pressed={simulation}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (simulation) next.delete("simulacao");
                else next.set("simulacao", "1");
                setParams(next, { replace: true });
              }}
            >
              <Play size={16} />
              {simulation ? "Usar dados reais" : "Simular operação"}
            </button>
          )}
          <CompetenceSelect />
        </div>
      </div>
      {feed && !previewUnauthorized ? (
        <div className="tv-preview-card">
          <TvBoard
            embedded
            feed={feed}
            simulation={simulation}
            live={
              simulation ||
              (!preview.isError && now - preview.dataUpdatedAt < 15000)
            }
            updatedAt={
              simulation ? Date.parse(feed.generatedAt) : preview.dataUpdatedAt
            }
          />
          <div className="tv-preview-caption">
            <span>
              As TVs exibem os blocos e departamentos configurados em cada
              dispositivo.
            </span>
            <span>
              {simulation
                ? "Dados fictícios · movimento a cada 4 segundos"
                : "Atualização a cada 5 segundos"}
            </span>
          </div>
        </div>
      ) : preview.isError ? (
        <EmptyState
          title="Não foi possível carregar a prévia"
          text="Confira sua conexão e tente novamente."
          action={
            <button
              className="button button-secondary"
              onClick={() => void preview.refetch()}
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>
          }
        />
      ) : (
        <EmptyState
          title="Preparando a prévia"
          text="Carregando os indicadores da competência."
        />
      )}
      {canList && (
        <section className="tv-devices">
          <div className="tv-devices-heading">
            <div>
              <h2>Dispositivos</h2>
              <p className="muted">
                Cadastre a tela e conecte com um código de uso único.
              </p>
            </div>
            {canManage && (
              <button
                className="button button-white"
                onClick={() => openEditor()}
              >
                <Plus size={16} />
                Novo dispositivo
              </button>
            )}
          </div>
          {error && !editor && (
            <div className="tv-management-error">
              <FormError message={error} />
            </div>
          )}
          {devices.isError ? (
            <EmptyState
              title="Dispositivos indisponíveis"
              text="Não foi possível consultar os dispositivos autorizados."
              action={
                <button
                  className="button button-secondary"
                  onClick={() => void devices.refetch()}
                >
                  Tentar novamente
                </button>
              }
            />
          ) : devices.data?.length ? (
            <div className="tv-device-grid">
              {devices.data.map((device) => (
                <article className="tv-device-card" key={device.id}>
                  <div className="tv-device-card-head">
                    <Monitor size={24} />
                    <span
                      className={`tv-device-state ${device.active ? "active" : ""}`}
                    >
                      {device.active ? "Ativo" : "Desativado"}
                    </span>
                  </div>
                  <h3>{device.name}</h3>
                  <p>
                    {device.departments.join(" · ")}
                    <br />
                    Competência{" "}
                    {device.competence.split("-").reverse().join("/")} ·{" "}
                    {device.blocks.length} blocos
                    <br />
                    {device.showNames ? "Nomes visíveis" : "Nomes ocultos"} ·
                    Rodízio {device.rotationSeconds}s
                  </p>
                  <div className="tv-device-card-actions">
                    {canConfigure && (
                      <button
                        disabled={busy}
                        onClick={() => openEditor(device)}
                      >
                        <Pencil size={13} />
                        Configurar
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          disabled={busy || !device.active}
                          onClick={() => void generateCode(device)}
                        >
                          <KeyRound size={13} />
                          Conectar TV
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void toggleActive(device)}
                        >
                          <Power size={13} />
                          {device.active ? "Desativar" : "Ativar"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                devices.isPending
                  ? "Carregando dispositivos"
                  : "Nenhum dispositivo cadastrado"
              }
              text="A prévia está disponível. Cadastre um dispositivo para exibir o painel em uma TV."
            />
          )}
        </section>
      )}
      <Modal
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditor(undefined);
            setError("");
          }
        }}
        title={editor?.device ? "Configurar painel" : "Novo dispositivo"}
        description={
          editor?.device
            ? "Defina o que esta tela vai exibir."
            : "Cadastre uma TV para acompanhar a operação."
        }
      >
        {editor && (
          <form
            className="tv-device-form"
            onSubmit={(event) => void save(event)}
          >
            <label>
              Nome do dispositivo
              <input
                type="text"
                value={editor.name}
                onChange={(event) =>
                  setEditor({ ...editor, name: event.target.value })
                }
                minLength={2}
                maxLength={60}
                required
                disabled={busy}
                placeholder="Ex.: TV do escritório"
              />
            </label>
            <fieldset disabled={busy}>
              <legend>Departamentos</legend>
              <div className="tv-device-departments">
                {actor.departments.map((value) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={editor.departments.includes(value)}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          departments: event.target.checked
                            ? [...editor.departments, value]
                            : editor.departments.filter(
                                (item) => item !== value,
                              ),
                        })
                      }
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Competência
              <CompetencePicker
                value={editor.competence}
                onValueChange={(value) =>
                  setEditor({ ...editor, competence: value })
                }
              />
            </label>
            {editor.device && (
              <>
                <fieldset disabled={busy}>
                  <legend>Blocos do painel</legend>
                  <small>
                    Colaboradores fica à direita das listas. Exibir nomes e
                    andamento individual exige a permissão específica de equipe
                    na TV.
                  </small>
                  <div className="tv-block-editor">
                    {[
                      ...editor.blocks,
                      ...TV_BLOCKS.filter(
                        (block) => !editor.blocks.includes(block),
                      ),
                    ].map((block) => {
                      const index = editor.blocks.indexOf(block);
                      return (
                        <div className="tv-block-option" key={block}>
                          <label>
                            <input
                              type="checkbox"
                              checked={index >= 0}
                              disabled={
                                block === "collaborators" &&
                                index < 0 &&
                                !canViewTeam
                              }
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  blocks: event.target.checked
                                    ? [...editor.blocks, block]
                                    : editor.blocks.filter(
                                        (item) => item !== block,
                                      ),
                                })
                              }
                            />
                            {blockLabels[block]}
                          </label>
                          <button
                            type="button"
                            aria-label={`Mover ${blockLabels[block]} para cima`}
                            disabled={index <= 0}
                            onClick={() => moveBlock(block, -1)}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Mover ${blockLabels[block]} para baixo`}
                            disabled={
                              index < 0 || index === editor.blocks.length - 1
                            }
                            onClick={() => moveBlock(block, 1)}
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
                <label>
                  Rodízio das listas, em segundos
                  <input
                    type="number"
                    value={editor.rotationSeconds}
                    min={5}
                    max={60}
                    step={1}
                    required
                    disabled={busy}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        rotationSeconds: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <div>
                  <label className="tv-names-checkbox">
                    <input
                      type="checkbox"
                      checked={editor.showNames}
                      disabled={busy}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          showNames: event.target.checked,
                        })
                      }
                    />
                    Exibir nomes das empresas
                  </label>
                  <small>
                    Desligado por padrão. CNPJ e valores de guias não são
                    exibidos.
                  </small>
                </div>
              </>
            )}
            <FormError message={error} />
            {conflict && (
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void reloadEditor()}
              >
                Carregar versão atual e descartar esta edição
              </button>
            )}
            <div className="form-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditor(undefined);
                  setError("");
                }}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy}
              >
                <Busy busy={busy}>Salvar dispositivo</Busy>
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!pairCode}
        onOpenChange={(open) => {
          if (!open) {
            setPairCode(undefined);
            setCopied(false);
          }
        }}
        title="Conectar TV"
        description={
          pairCode ? `Código de uso único para ${pairCode.name}.` : undefined
        }
      >
        {pairCode && (
          <>
            <div className="tv-pair-instructions">
              <p>
                Na TV, abra{" "}
                <a href={watchUrl} target="_blank" rel="noreferrer">
                  {watchUrl}
                </a>{" "}
                e informe este código.
              </p>
            </div>
            <div className="tv-pair-code" aria-label="Código de vinculação">
              {pairCode.code}
            </div>
            <div className="tv-pair-instructions">
              <p>
                Válido até{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(pairCode.expiresAt))}
                . Um novo código invalida o anterior.
              </p>
              <p>
                O código concede acesso ao painel deste dispositivo. Compartilhe
                somente com quem instalará a TV.
              </p>
            </div>
            <div className="form-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(pairCode.code)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                <Copy size={15} />
                {copied ? "Copiado" : "Copiar código"}
              </button>
              <button
                className="button button-primary"
                onClick={() => setPairCode(undefined)}
              >
                Concluir
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
