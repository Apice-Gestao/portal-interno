import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BackIcon, ForwardIcon, SignOutIcon } from "../../shared/icons";
import { Busy, FormError } from "../../shared/ui/components";
import "./auth.css";
import { ORGANIZATIONS, useOrganization } from "../../app/OrganizationContext";
import { isHostedDemo, resetDemo } from "../../services/portal-client";

export function AuthLayout({ children }: { children: ReactNode }) {
  const { group, clearGroup } = useOrganization();
  const brand = group ?? ORGANIZATIONS[0];
  return (
    <main className="auth-page">
      <aside className="auth-introduction" aria-label="Portal interno Ápice">
        <div className={`auth-logo auth-logo-${brand.id}`}>
          <img
            src={brand.logo.src}
            alt={brand.name}
            width={brand.logo.width}
            height={brand.logo.height}
            fetchPriority="high"
          />
        </div>
        <div className="auth-introduction-copy">
          <span className="auth-eyebrow">
            {group?.name ?? "PORTAL INTERNO"}
          </span>
          <h1>Acesse o seu ambiente de trabalho.</h1>
          <p>
            As abas e ações disponíveis seguem as permissões do seu usuário.
          </p>
        </div>
        <span className="auth-restricted">
          Acesso restrito a usuários autorizados.
        </span>
      </aside>
      <section className="auth-content">
        <button
          type="button"
          className="auth-change-group"
          onClick={clearGroup}
        >
          <BackIcon size={16} /> Escolher outro grupo
        </button>
        {children}
      </section>
    </main>
  );
}

export default function LoginPage({
  onLogin,
  onForgotPassword,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!username || !password) {
      setError("Informe seu usuário e senha.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await onLogin(username, password);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email) {
      setError("Informe seu e-mail.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await onForgotPassword(email);
      setRecoveryRequested(true);
    } catch {
      setError("Não foi possível solicitar a recuperação. Tente novamente.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  function backToLogin() {
    setRecovering(false);
    setRecoveryRequested(false);
    setError("");
  }

  if (recovering) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <span className="auth-eyebrow">RECUPERAR ACESSO</span>
          <h2>Esqueci minha senha</h2>
          {recoveryRequested ? (
            <p className="auth-notice" role="status">
              Se o e-mail estiver cadastrado, você receberá as instruções.
            </p>
          ) : (
            <>
              <p className="auth-description">
                Informe o e-mail vinculado ao seu cadastro para receber as
                instruções de recuperação.
              </p>
              <form className="auth-form" onSubmit={requestRecovery}>
                <fieldset disabled={pending}>
                  <label htmlFor="recovery-email">E-mail</label>
                  <input
                    id="recovery-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={254}
                    autoFocus
                  />
                  <FormError message={error} />
                  <button className="auth-submit" type="submit">
                    <Busy busy={pending}>
                      {pending ? "Solicitando..." : "Enviar instruções"}
                    </Busy>
                    {!pending && <ForwardIcon size={18} aria-hidden="true" />}
                  </button>
                </fieldset>
              </form>
            </>
          )}
          <button
            className="auth-link"
            type="button"
            disabled={pending}
            onClick={backToLogin}
          >
            Voltar para entrar
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <span className="auth-eyebrow">BEM-VINDO AO PORTAL</span>
        <h2>Entrar</h2>
        <p className="auth-description">
          Informe seu usuário e senha para continuar.
        </p>
        {isHostedDemo && (
          <p className="auth-demo-note">
            Demonstração com dados fictícios. Administrador: usuário{" "}
            <strong>admin</strong>, senha <strong>admin</strong>. Visão do
            operador: usuário <strong>operador</strong>, senha{" "}
            <strong>operador</strong>. As alterações ficam só neste navegador.{" "}
            <button
              type="button"
              className="auth-link auth-demo-reset"
              onClick={() => {
                resetDemo();
                window.location.reload();
              }}
            >
              Recomeçar a demonstração do zero
            </button>
          </p>
        )}
        <form className="auth-form" onSubmit={submit}>
          <fieldset disabled={pending}>
            <label htmlFor="login-username">Usuário</label>
            <input
              id="login-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={60}
              autoFocus
            />
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
            <FormError message={error} />
            <button className="auth-submit" type="submit">
              <Busy busy={pending}>{pending ? "Entrando..." : "Entrar"}</Busy>
              {!pending && <ForwardIcon size={18} aria-hidden="true" />}
            </button>
          </fieldset>
        </form>
        {!isHostedDemo && (
          <button
            className="auth-link"
            type="button"
            disabled={pending}
            onClick={() => {
              setRecovering(true);
              setError("");
            }}
          >
            Esqueci minha senha
          </button>
        )}
        <p className="auth-help">
          Para obter acesso, fale com o administrador do sistema.
        </p>
      </div>
    </AuthLayout>
  );
}

export function PasswordResetPage({
  token,
  onSubmit,
  onBack,
}: {
  token: string;
  onSubmit: (token: string, newPassword: string) => Promise<void>;
  onBack: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError("A nova senha deve ter entre 12 e 128 caracteres.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("As novas senhas não coincidem.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await onSubmit(token, newPassword);
      setCompleted(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível redefinir a senha. Tente novamente.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <span className="auth-eyebrow">RECUPERAR ACESSO</span>
        <h2>Redefinir senha</h2>
        {completed ? (
          <p className="auth-notice" role="status">
            Senha redefinida. Entre com sua nova senha.
          </p>
        ) : (
          <>
            <p className="auth-description">
              Defina uma senha pessoal de 12 a 128 caracteres.
            </p>
            <form className="auth-form" onSubmit={submit}>
              <fieldset disabled={pending}>
                <label htmlFor="reset-password-new">Nova senha</label>
                <input
                  id="reset-password-new"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoFocus
                  aria-describedby="reset-password-help"
                />
                <span id="reset-password-help" className="auth-field-help">
                  Use uma senha pessoal que você não utilize em outros serviços.
                </span>
                <label htmlFor="reset-password-confirm">
                  Confirme a nova senha
                </label>
                <input
                  id="reset-password-confirm"
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
                <FormError message={error} />
                <button className="auth-submit" type="submit">
                  <Busy busy={pending}>
                    {pending ? "Salvando..." : "Salvar nova senha"}
                  </Busy>
                  {!pending && <ForwardIcon size={18} aria-hidden="true" />}
                </button>
              </fieldset>
            </form>
          </>
        )}
        <button
          className="auth-link"
          type="button"
          disabled={pending}
          onClick={onBack}
        >
          Voltar para entrar
        </button>
      </div>
    </AuthLayout>
  );
}

export function PasswordChangePage({
  onSubmit,
  onLogout,
}: {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError("A nova senha deve ter entre 12 e 128 caracteres.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("As novas senhas não coincidem.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Escolha uma senha diferente da senha atual.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await onSubmit(currentPassword, newPassword);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar a senha. Tente novamente.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <span className="auth-eyebrow">PRIMEIRO ACESSO</span>
        <h2>Defina sua senha</h2>
        <p className="auth-description">
          Antes de continuar, substitua sua senha temporária por uma senha
          pessoal de 12 a 128 caracteres.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <fieldset disabled={pending}>
            <label htmlFor="password-current">Senha atual</label>
            <input
              id="password-current"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              autoFocus
            />
            <label htmlFor="password-new">Nova senha</label>
            <input
              id="password-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              aria-describedby="password-length"
            />
            <span id="password-length" className="auth-field-help">
              Use uma senha pessoal que você não utilize em outros serviços.
            </span>
            <label htmlFor="password-confirm">Confirme a nova senha</label>
            <input
              id="password-confirm"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <FormError message={error} />
            <button className="auth-submit" type="submit">
              <Busy busy={pending}>
                {pending ? "Salvando..." : "Salvar nova senha"}
              </Busy>
              {!pending && <ForwardIcon size={18} aria-hidden="true" />}
            </button>
          </fieldset>
        </form>
        <button
          className="auth-logout"
          type="button"
          disabled={pending}
          onClick={onLogout}
        >
          <SignOutIcon size={16} aria-hidden="true" />
          Sair
        </button>
      </div>
    </AuthLayout>
  );
}
