import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ForwardIcon } from "../../shared/icons";
import { Busy, FormError } from "../../shared/ui/components";
import { AuthLayout } from "./LoginPage";

interface EmailCodePageProps {
  maskedEmail: string;
  needsEmail: boolean;
  onSubmit: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onSetEmail: (email: string) => Promise<void>;
  onBack: () => void;
}

export default function EmailCodePage({
  maskedEmail,
  needsEmail,
  onSubmit,
  onResend,
  onSetEmail,
  onBack,
}: EmailCodePageProps) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(needsEmail ? 0 : 60);
  const [resendNotice, setResendNotice] = useState(false);
  const submitting = useRef(false);
  const coolingDown = cooldown > 0;

  useEffect(() => {
    if (!coolingDown) return;
    const interval = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [coolingDown]);

  function showError(cause: unknown, fallback: string) {
    setError(cause instanceof Error ? cause.message : fallback);
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
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
      await onSetEmail(email);
      setCooldown(60);
      setResendNotice(false);
    } catch (cause) {
      showError(cause, "Não foi possível vincular o e-mail. Tente novamente.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    if (!/^[0-9]{6}$/.test(code)) {
      setError("Informe o código de verificação de seis dígitos.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await onSubmit(code);
    } catch (cause) {
      showError(cause, "Não foi possível verificar o código. Tente novamente.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function resend() {
    if (submitting.current || cooldown > 0) return;
    submitting.current = true;
    setPending(true);
    setError("");
    setResendNotice(false);
    try {
      await onResend();
      setCooldown(60);
      setResendNotice(true);
    } catch (cause) {
      showError(cause, "Não foi possível reenviar o código. Tente novamente.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <span className="auth-eyebrow">VERIFICAÇÃO EM DUAS ETAPAS</span>
        <h2>{needsEmail ? "Vincule seu e-mail" : "Confirme seu acesso"}</h2>
        {needsEmail ? (
          <>
            <p className="auth-description">
              Seu cadastro precisa de um e-mail para confirmar o acesso e
              recuperar a senha. Informe seu e-mail e confirme o código recebido
              antes de continuar.
            </p>
            <form className="auth-form" onSubmit={submitEmail}>
              <fieldset disabled={pending}>
                <label htmlFor="verification-email">E-mail</label>
                <input
                  id="verification-email"
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
                    {pending ? "Solicitando..." : "Enviar código"}
                  </Busy>
                  {!pending && <ForwardIcon size={18} aria-hidden="true" />}
                </button>
              </fieldset>
            </form>
          </>
        ) : (
          <>
            <p className="auth-description">
              Informe o código recebido no seu e-mail
              {maskedEmail && <> ({maskedEmail})</>}.
            </p>
            <form className="auth-form" onSubmit={submitCode}>
              <fieldset disabled={pending}>
                <label htmlFor="verification-code">Código de verificação</label>
                <input
                  className="auth-code-input"
                  id="verification-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  autoFocus
                  aria-describedby="verification-code-help"
                />
                <span id="verification-code-help" className="auth-field-help">
                  O código tem seis dígitos e expira em cinco minutos.
                </span>
                <FormError message={error} />
                <button className="auth-submit" type="submit">
                  <Busy busy={pending}>
                    {pending ? "Verificando..." : "Verificar e continuar"}
                  </Busy>
                  {!pending && <ForwardIcon size={18} aria-hidden="true" />}
                </button>
              </fieldset>
            </form>
            {resendNotice && (
              <p className="auth-notice" role="status">
                Um novo código foi enviado para seu e-mail.
              </p>
            )}
            <div className="auth-verification-actions">
              <button
                className="auth-link"
                type="button"
                disabled={pending || coolingDown}
                aria-label="Reenviar código"
                onClick={() => void resend()}
              >
                {coolingDown
                  ? `Reenviar código (${cooldown} s)`
                  : "Reenviar código"}
              </button>
            </div>
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
