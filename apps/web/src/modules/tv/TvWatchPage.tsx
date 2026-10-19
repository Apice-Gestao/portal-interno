import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DomainError } from "@apice/domain";
import { SignOutIcon, TvDisplayIcon } from "../../shared/icons";
import { Modal, FormError } from "../../shared/ui/components";
import { tvWatchClient } from "./tv-watch-client";
import { TvBoard } from "./TvBoard";

export default function TvWatchPage() {
  const cache = useQueryClient();
  const [paired, setPaired] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const query = useQuery({
    queryKey: ["tv-watch"],
    queryFn: async () => {
      try {
        return await tvWatchClient.watch();
      } catch (failure) {
        if (
          failure instanceof DomainError &&
          (failure.status === 401 || failure.status === 403)
        )
          setPaired(false);
        throw failure;
      }
    },
    enabled: paired,
    retry: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    gcTime: 0,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const unauthorized =
    query.error instanceof DomainError &&
    (query.error.status === 401 || query.error.status === 403);
  useEffect(() => {
    if (!paired) cache.removeQueries({ queryKey: ["tv-watch"] });
  }, [paired, cache]);
  async function pair(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await tvWatchClient.pair(code.trim().toUpperCase());
      setCode("");
      setPaired(true);
    } catch {
      setError(
        "Código inválido, expirado ou já utilizado. Solicite um novo código ao administrador.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await tvWatchClient.disconnect();
      setPaired(false);
      cache.removeQueries({ queryKey: ["tv-watch"] });
      setDisconnectOpen(false);
    } catch {
      setError("Não foi possível desconectar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  const needsPairing = !paired || unauthorized;
  if (needsPairing)
    return (
      <main className="tv-pair-screen">
        <section className="tv-pair-card">
          <TvDisplayIcon size={35} aria-hidden="true" />
          <span className="tv-wordmark">Ápice Contábil</span>
          <h1>Conectar este painel</h1>
          <p>
            Cadastre este dispositivo no portal e informe o código de vinculação
            exibido pelo administrador.
          </p>
          <form onSubmit={(event) => void pair(event)}>
            <label htmlFor="tv-pair-code">
              Código de vinculação
              <input
                id="tv-pair-code"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="characters"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                minLength={8}
                maxLength={10}
                pattern="[A-Za-z0-9]{8,10}"
                required
                placeholder="XXXXXXXXXX"
                disabled={busy}
              />
            </label>
            <FormError message={error} />
            <button type="submit" disabled={busy}>
              {busy ? "Conectando…" : "Conectar painel"}
            </button>
          </form>
          <p className="tv-pair-note">
            Este acesso é exclusivo do dispositivo, somente para consulta.
          </p>
        </section>
      </main>
    );
  if (!query.data)
    return (
      <main className="tv-pair-screen">
        <section className="tv-pair-card">
          <TvDisplayIcon size={35} />
          <h1>
            {query.isError ? "Aguardando conexão" : "Preparando o painel"}
          </h1>
          <p>
            {query.isError
              ? "Não foi possível atualizar os dados. A conexão será verificada novamente em alguns segundos."
              : "Carregando a operação deste dispositivo…"}
          </p>
          {query.isError && (
            <button onClick={() => void query.refetch()}>Tentar agora</button>
          )}
        </section>
      </main>
    );
  return (
    <>
      <TvBoard
        feed={query.data}
        live={!query.isError && now - query.dataUpdatedAt < 15000}
        updatedAt={query.dataUpdatedAt}
        actions={
          <button
            className="tv-icon-button"
            aria-label="Desconectar dispositivo"
            onClick={() => {
              setError("");
              setDisconnectOpen(true);
            }}
          >
            <SignOutIcon size={18} />
          </button>
        }
      />
      <Modal
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Desconectar dispositivo"
        description="Será necessário um novo código de vinculação para voltar a exibir o painel."
      >
        <FormError message={error} />
        <div className="form-actions">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => setDisconnectOpen(false)}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? "Desconectando…" : "Desconectar"}
          </button>
        </div>
      </Modal>
    </>
  );
}
