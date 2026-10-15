import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { z } from "zod";

type Environment = Readonly<Record<string, string | undefined>>;
const mailAddress = z.string().trim().max(254).email();
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resetLink(
  base: string,
  token: string,
  development: boolean,
): string {
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        development &&
        url.protocol === "http:" &&
        loopbackHosts.has(url.hostname)
      )) ||
    !/^[a-zA-Z0-9_-]{43}$/.test(token)
  )
    throw new Error("Configuração inválida do endereço público do portal.");
  // A fragment is never sent to the web server or reverse-proxy access log.
  url.hash = `/redefinir-senha?token=${encodeURIComponent(token)}`;
  return url.toString();
}

export function smtpOptions(env: Environment): SMTPTransport.Options {
  const port = Number(env.SMTP_PORT ?? "587");
  const secure = env.SMTP_SECURE === "true";
  if (
    !env.SMTP_HOST ||
    !/^[a-zA-Z0-9.-]+$/.test(env.SMTP_HOST) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    ![undefined, "true", "false"].includes(env.SMTP_SECURE) ||
    !env.SMTP_USER ||
    !env.SMTP_PASSWORD ||
    !mailAddress.safeParse(env.SMTP_FROM).success
  )
    throw new Error("Configuração SMTP incompleta ou inválida.");
  return {
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    opportunisticTLS: false,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export class MailService {
  private readonly mode: "disabled" | "local" | "smtp";
  private readonly publicUrl?: string;
  private readonly transport?: Transporter;
  private readonly from?: string;
  private readonly development: boolean;
  private readonly localDirectory?: string;

  constructor(env: Environment = process.env) {
    this.development = env.NODE_ENV === "development";
    const mode = env.MAIL_DELIVERY ?? "disabled";
    if (!["disabled", "local", "smtp"].includes(mode))
      throw new Error("MAIL_DELIVERY inválido.");
    this.mode = mode as "disabled" | "local" | "smtp";
    if (this.mode === "local" && !this.development)
      throw new Error("A caixa de e-mail local exige modo de desenvolvimento.");
    if (this.mode === "local") {
      const root = fileURLToPath(new URL("../../../../", import.meta.url));
      const privateRoot = resolve(root, ".local");
      const directory = resolve(
        root,
        env.MAIL_OUTBOX_DIR ?? ".local/mail-outbox",
      );
      const within = relative(privateRoot, directory);
      if (!within || within.startsWith("..") || isAbsolute(within))
        throw new Error(
          "A captura local de e-mail deve ficar dentro de .local.",
        );
      this.localDirectory = directory;
    }
    if (this.mode !== "disabled") {
      if (!env.PORTAL_PUBLIC_URL)
        throw new Error(
          "PORTAL_PUBLIC_URL necessária para recuperação de senha.",
        );
      resetLink(env.PORTAL_PUBLIC_URL, "A".repeat(43), this.development);
      this.publicUrl = env.PORTAL_PUBLIC_URL;
    }
    if (this.mode === "smtp") {
      this.transport = nodemailer.createTransport(smtpOptions(env));
      this.from = mailAddress.parse(env.SMTP_FROM);
    }
  }

  async sendReset(email: string, token: string): Promise<void> {
    const recipient = mailAddress.parse(email);
    if (this.mode === "disabled" || !this.publicUrl)
      throw new Error("Entrega de e-mail ainda não configurada.");
    const link = resetLink(this.publicUrl, token, this.development);
    await this.send(
      recipient,
      "Redefinição de senha — Portal Ápice",
      `Recebemos uma solicitação para redefinir sua senha do Portal Ápice.\n\nAcesse o endereço abaixo para escolher uma nova senha:\n${link}\n\nO link expira em 30 minutos e pode ser usado uma única vez. Se você não solicitou a alteração, ignore esta mensagem.`,
      { link, expiresInMinutes: 30 },
    );
  }

  async sendVerification(email: string, code: string): Promise<void> {
    const recipient = mailAddress.parse(email);
    if (!/^[0-9]{6}$/.test(code))
      throw new Error("Código de verificação inválido.");
    await this.send(
      recipient,
      "Código de acesso — Portal Ápice",
      `Seu código de verificação para entrar no Portal Ápice é:\n\n${code}\n\nO código expira em 5 minutos e pode ser usado uma única vez. Não compartilhe este código. Se você não solicitou o acesso, ignore esta mensagem.`,
      { code, expiresInMinutes: 5 },
    );
  }

  private async send(
    recipient: string,
    subject: string,
    text: string,
    localData: { link?: string; code?: string; expiresInMinutes: number },
  ) {
    if (this.mode === "disabled")
      throw new Error("Entrega de e-mail ainda não configurada.");
    if (this.mode === "local") {
      const directory = this.localDirectory!;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        `${directory}/${randomUUID()}.json`,
        JSON.stringify({
          to: recipient,
          subject,
          text,
          ...localData,
          createdAt: new Date().toISOString(),
          developmentOnly: true,
        }),
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      return;
    }
    await this.transport!.sendMail({
      from: this.from!,
      to: { address: recipient, name: "" },
      envelope: { from: this.from!, to: [recipient] },
      subject,
      text,
    });
  }
}
