import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { closedCompetence, DomainError } from "@apice/domain";
import type { Department } from "@apice/domain";
import { Context } from "./usePortal";
import { createClient } from "../services/portal-client";
import type { LoginSession, EmailChallenge } from "../services/portal-client";
import LoginPage, {
  PasswordChangePage,
  PasswordResetPage,
} from "../modules/auth/LoginPage";
import EmailCodePage from "../modules/auth/EmailCodePage";
import { useOrganization } from "./OrganizationContext";
import { OrganizationSelection } from "../modules/auth/OrganizationSelection";
export function PortalProvider({ children }: { children: ReactNode }) {
  const { group } = useOrganization();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [client] = useState(createClient);
  useEffect(
    () => () => {
      void client.logout().catch(() => undefined);
    },
    [client],
  );
  const [session, setSession] = useState<LoginSession | undefined>(() =>
    client.restoreSession?.(),
  );
  const [challenge, setChallenge] = useState<EmailChallenge>();
  const [department, setDepartment] = useState<Department>("Fiscal");
  // Until the person picks one, the session follows the competence that has
  // just closed in Brasília, by the server clock once the snapshot arrives.
  const [chosenCompetence, setCompetence] = useState<string>();
  const [toast, setToast] = useState("");
  const query = useQuery({
    queryKey: ["snapshot", session?.actor.tenantId, session?.actor.userId],
    queryFn: () => client.snapshot(),
    enabled: !!session && !session.mustChangePassword,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const currentDepartment = query.data?.actor.departments.includes(department)
    ? department
    : (query.data?.actor.departments[0] ?? department);
  async function login(username: string, password: string) {
    const next = await client.authenticate(username, password, group?.id);
    cache.clear();
    if ("requiresSecondFactor" in next) {
      setSession(undefined);
      setChallenge(next);
    } else {
      setDepartment(next.actor.departments[0] ?? "Fiscal");
      setChallenge(undefined);
      setSession(next);
    }
    navigate("/", { replace: true });
  }
  async function verifyCode(code: string) {
    if (!challenge) throw new Error("Entre novamente para receber um código.");
    const next = await client.verifyEmailCode(challenge.challengeId, code);
    setDepartment(next.actor.departments[0] ?? "Fiscal");
    setSession(next);
    setChallenge(undefined);
  }
  function logout() {
    void client.logout().catch(() => undefined);
    setSession(undefined);
    setChallenge(undefined);
    cache.clear();
    setToast("");
  }
  async function changePassword(current: string, next: string) {
    await client.changePassword(current, next);
    setSession(await client.getSession());
  }
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ["snapshot"] });
  }
  if (!group && location.pathname !== "/redefinir-senha")
    return <OrganizationSelection />;
  if (location.pathname === "/redefinir-senha")
    return (
      <PasswordResetPage
        token={new URLSearchParams(location.search).get("token") ?? ""}
        onSubmit={(token, password) => client.resetPassword(token, password)}
        onBack={() => {
          logout();
          navigate("/", { replace: true });
        }}
      />
    );
  if (challenge)
    return (
      <EmailCodePage
        maskedEmail={challenge.maskedEmail}
        needsEmail={challenge.needsEmail}
        onSubmit={verifyCode}
        onSetEmail={async (email) =>
          setChallenge(
            await client.setChallengeEmail(challenge.challengeId, email),
          )
        }
        onResend={async () =>
          setChallenge(await client.resendEmailCode(challenge.challengeId))
        }
        onBack={logout}
      />
    );
  if (
    !session ||
    (query.error instanceof DomainError && query.error.status === 401)
  )
    return (
      <LoginPage
        onLogin={login}
        onForgotPassword={(email) => client.forgotPassword(email)}
      />
    );
  if (session.mustChangePassword)
    return <PasswordChangePage onSubmit={changePassword} onLogout={logout} />;
  if (query.error)
    return (
      <main className="fatal">
        <span className="eyebrow">ÁPICE · PORTAL INTERNO</span>
        <h1>Não foi possível carregar sua operação.</h1>
        <p>{query.error.message}</p>
        <button onClick={() => void query.refetch()}>Tentar novamente</button>
        <button onClick={logout}>Sair</button>
      </main>
    );
  if (!query.data)
    return (
      <main className="portal-loading">
        <h2>Preparando sua operação</h2>
        <p>Carregando seus acessos…</p>
        <span className="loading-bar" />
      </main>
    );
  return (
    <Context.Provider
      value={{
        actor: query.data.actor,
        client,
        data: query.data,
        department: currentDepartment,
        setDepartment,
        competence: chosenCompetence ?? closedCompetence(query.data.now),
        setCompetence,
        logout,
        refresh,
        notify: setToast,
        updating: query.isFetching,
        localTest: session.mode === "local-test",
      }}
    >
      {children}
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
