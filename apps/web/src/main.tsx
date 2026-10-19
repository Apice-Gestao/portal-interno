import React, { Component } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "./app/Router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import App from "./app/App";
import { OrganizationProvider } from "./app/OrganizationProvider";
import { isHostedDemo, resetDemo } from "./services/portal-client";
import "./styles.css";
import "./clean-list.css";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* Deliberately avoid logging document or session data. */
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Não foi possível abrir o portal.</h1>
        <p>Atualize a página para tentar de novo.</p>
        <button onClick={() => window.location.reload()}>
          Atualizar página
        </button>
        {/* TEMPORARY hosted preview: a broken saved state must not trap the visitor. */}
        {isHostedDemo && (
          <button
            onClick={() => {
              resetDemo();
              window.location.reload();
            }}
          >
            Recomeçar a demonstração do zero
          </button>
        )}
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <OrganizationProvider>
            <App />
          </OrganizationProvider>
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
