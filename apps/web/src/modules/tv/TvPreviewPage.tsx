import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DomainError } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { TvBoard } from "./TvBoard";
import { TV_SIMULATION_AVAILABLE, useTvSimulation } from "./tv-simulation";

export default function TvPreviewPage() {
  const { actor, client, competence } = usePortal();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const simulation = TV_SIMULATION_AVAILABLE && params.get("simulacao") === "1";
  const [now, setNow] = useState(() => Date.now());
  const query = useQuery({
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
    refetchIntervalInBackground: true,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const unauthorized =
    query.error instanceof DomainError &&
    (query.error.status === 401 || query.error.status === 403);
  const feed = useTvSimulation(query.data, simulation);
  if (!feed || unauthorized)
    return (
      <main className="tv-pair-screen">
        <section className="tv-pair-card">
          <h1>
            {query.isError ? "Prévia indisponível" : "Preparando o painel"}
          </h1>
          <p>
            {query.isError
              ? "Confira sua conexão e a permissão para visualizar o painel."
              : "Carregando os indicadores da competência…"}
          </p>
          <button onClick={() => navigate("/painel-tv")}>
            Voltar ao portal
          </button>
        </section>
      </main>
    );
  return (
    <TvBoard
      feed={feed}
      simulation={simulation}
      live={simulation || (!query.isError && now - query.dataUpdatedAt < 15000)}
      updatedAt={
        simulation ? Date.parse(feed.generatedAt) : query.dataUpdatedAt
      }
      actions={
        <button
          className="tv-control"
          onClick={() =>
            navigate(`/painel-tv${simulation ? "?simulacao=1" : ""}`)
          }
        >
          <ArrowLeft size={16} />
          Voltar
        </button>
      }
    />
  );
}
