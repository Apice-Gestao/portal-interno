import { useEffect, useState } from "react";
import { PREVIEW_BLOCKED } from "../downloads";
import type { PreviewBlockedDetail } from "../downloads";
import { Modal } from "./components";

// TEMPORARY (hosted preview only): the published artifact frame blocks
// downloads and printing; say so instead of a button that seems broken.
export function PreviewBlockedNotice() {
  const [detail, setDetail] = useState<PreviewBlockedDetail>();
  useEffect(() => {
    const show = (event: Event) =>
      setDetail((event as CustomEvent<PreviewBlockedDetail>).detail);
    window.addEventListener(PREVIEW_BLOCKED, show);
    return () => window.removeEventListener(PREVIEW_BLOCKED, show);
  }, []);
  const print = detail?.action === "print";
  return (
    <Modal
      open={!!detail}
      onOpenChange={(open) => !open && setDetail(undefined)}
      title={print ? "PDF no portal instalado" : "Download no portal instalado"}
    >
      <div className="preview-blocked">
        <p>
          {print
            ? "Este link de demonstração não pode abrir a janela de impressão do navegador. No portal instalado, o botão abre o relatório pronto para salvar em PDF, com as colunas escolhidas."
            : `Este link de demonstração não pode baixar arquivos${detail?.name ? ` (${detail.name})` : ""}. No portal instalado, o arquivo é baixado na hora, com o mesmo conteúdo da tela.`}
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => setDetail(undefined)}
        >
          Entendi
        </button>
      </div>
    </Modal>
  );
}
