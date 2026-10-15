import {
  createSeed,
  demoPdf,
  DEMO_NOW,
  DomainError,
  MemoryRepository,
  PortalEngine,
  validateEvidence,
  users,
  commandSchema,
  companySchema,
  templateSchema,
  updateTemplateSchema,
  generationSchema,
  taskSchema,
  importSchema,
} from "@apice/domain";
import type {
  Actor,
  CreateCompany,
  CreateTask,
  CreateTemplate,
  UpdateTemplate,
  Department,
  Snapshot,
  Task,
  TaskCommand,
  AccountUser,
  AccountInput,
  AccountUpdate,
  TvDevice,
  TvFeed,
  CreateTvDevice,
  UpdateTvDevice,
} from "@apice/domain";
export interface LoginSession {
  actor: Actor;
  mustChangePassword: boolean;
  expiresAt: number;
  mode?: "password" | "demo" | "local-test";
}
export interface EmailChallenge {
  requiresSecondFactor: true;
  challengeId: string;
  maskedEmail: string;
  needsEmail: boolean;
  expiresAt: number;
}
export interface PortalClient {
  authenticate(
    username: string,
    password: string,
  ): Promise<EmailChallenge | LoginSession>;
  verifyEmailCode(challengeId: string, code: string): Promise<LoginSession>;
  setChallengeEmail(
    challengeId: string,
    email: string,
  ): Promise<EmailChallenge>;
  resendEmailCode(challengeId: string): Promise<EmailChallenge>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  getSession(): Promise<LoginSession>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  listUsers(): Promise<AccountUser[]>;
  createUser(input: AccountInput): Promise<AccountUser>;
  updateUser(id: string, input: AccountUpdate): Promise<AccountUser>;
  login(userId: string): Promise<Actor>;
  snapshot(): Promise<Snapshot>;
  command(id: string, command: TaskCommand): Promise<Task>;
  attach(id: string, revision: number, file: File): Promise<Task>;
  addCompany(input: CreateCompany): Promise<unknown>;
  addTemplate(input: CreateTemplate): Promise<unknown>;
  updateTemplate(id: string, input: UpdateTemplate): Promise<unknown>;
  generate(
    competence: string,
    department: Department,
  ): Promise<{ created: number; existing: number }>;
  logout(): Promise<void>;
  addTask(input: CreateTask): Promise<Task>;
  importCompanies(
    inputs: CreateCompany[],
  ): Promise<{ created: number; existing: number }>;
  downloadDocument(taskId: string, documentId: string): Promise<Blob>;
  previewTv(competence: string, department?: Department): Promise<TvFeed>;
  listTvDevices(): Promise<TvDevice[]>;
  addTvDevice(input: CreateTvDevice): Promise<TvDevice>;
  updateTvDevice(id: string, input: UpdateTvDevice): Promise<TvDevice>;
  createTvPairCode(id: string): Promise<{ code: string; expiresAt: string }>;
}
const sharedEngine = new PortalEngine(
  new MemoryRepository(createSeed()),
  () => DEMO_NOW,
);
export class DemoPortalClient implements PortalClient {
  async previewTv(): Promise<TvFeed> {
    return this.unavailable();
  }
  async listTvDevices(): Promise<TvDevice[]> {
    return this.unavailable();
  }
  async addTvDevice(): Promise<TvDevice> {
    return this.unavailable();
  }
  async updateTvDevice(): Promise<TvDevice> {
    return this.unavailable();
  }
  async createTvPairCode(): Promise<{ code: string; expiresAt: string }> {
    return this.unavailable();
  }
  private unavailable(): never {
    throw new Error(
      "A prévia estática não possui autenticação. Use o sistema local com PostgreSQL.",
    );
  }
  async authenticate(): Promise<EmailChallenge> {
    return this.unavailable();
  }
  async verifyEmailCode(): Promise<LoginSession> {
    return this.unavailable();
  }
  async setChallengeEmail(): Promise<EmailChallenge> {
    return this.unavailable();
  }
  async resendEmailCode(): Promise<EmailChallenge> {
    return this.unavailable();
  }
  async forgotPassword(): Promise<void> {
    this.unavailable();
  }
  async resetPassword(): Promise<void> {
    this.unavailable();
  }
  async getSession(): Promise<LoginSession> {
    return this.unavailable();
  }
  async changePassword(): Promise<void> {
    this.unavailable();
  }
  async listUsers(): Promise<AccountUser[]> {
    return this.unavailable();
  }
  async createUser(): Promise<AccountUser> {
    return this.unavailable();
  }
  async updateUser(): Promise<AccountUser> {
    return this.unavailable();
  }
  private static readonly files = new Map<string, Blob>();
  private static storedBytes = 0;
  private static readonly seedIds = new Set(
    createSeed().tasks.flatMap((t) => t.documents.map((d) => d.id)),
  );
  private actor?: Actor;
  async login(userId: string) {
    const actor = users.find((u) => u.userId === userId);
    if (!actor)
      throw new DomainError("INVALID_SESSION", "Perfil inválido.", 401);
    this.actor = structuredClone(actor);
    return this.actor;
  }
  private user() {
    if (!this.actor)
      throw new DomainError("UNAUTHENTICATED", "Selecione um perfil.", 401);
    return this.actor;
  }
  async snapshot() {
    return sharedEngine.snapshot(this.user());
  }
  async command(id: string, command: TaskCommand) {
    return sharedEngine.command(this.user(), id, commandSchema.parse(command));
  }
  async attach(id: string, revision: number, file: File) {
    if (DemoPortalClient.storedBytes + file.size > 32 * 1024 * 1024)
      throw new DomainError("STORAGE_LIMIT", "Limite da sessão atingido.", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = await validateEvidence(file.name, bytes);
    const hashBytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes),
    );
    const hash = [...hashBytes]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (DemoPortalClient.storedBytes + file.size > 32 * 1024 * 1024)
      throw new DomainError("STORAGE_LIMIT", "Limite da prévia atingido.", 413);
    const task = sharedEngine.attach(this.user(), id, revision, {
      name: file.name,
      bytes: bytes.length,
      kind,
      hash,
    });
    DemoPortalClient.files.set(task.documents.at(-1)!.id, file);
    DemoPortalClient.storedBytes += file.size;
    return task;
  }
  async addTask(input: CreateTask) {
    return sharedEngine.addTask(this.user(), taskSchema.parse(input));
  }
  async importCompanies(inputs: CreateCompany[]) {
    const parsed = importSchema.parse({ companies: inputs });
    return sharedEngine.importCompanies(this.user(), parsed.companies);
  }
  async downloadDocument(taskId: string, documentId: string) {
    const task = sharedEngine
      .snapshot(this.user())
      .tasks.find((t) => t.id === taskId);
    if (!task?.documents.some((d) => d.id === documentId))
      throw new DomainError("NOT_FOUND", "Documento indisponível.", 404);
    const file = DemoPortalClient.files.get(documentId);
    if (!file && !DemoPortalClient.seedIds.has(documentId))
      throw new DomainError(
        "MISSING_CONTENT",
        "Conteúdo do documento indisponível.",
        503,
      );
    sharedEngine.logSecurity(
      this.user(),
      "Documento baixado",
      task.documents.find((d) => d.id === documentId)!.name,
      { taskId },
    );
    return (
      file ??
      new Blob([demoPdf() as Uint8Array<ArrayBuffer>], {
        type: "application/pdf",
      })
    );
  }
  async addCompany(input: CreateCompany) {
    return sharedEngine.addCompany(this.user(), companySchema.parse(input));
  }
  async addTemplate(input: CreateTemplate) {
    return sharedEngine.addTemplate(this.user(), templateSchema.parse(input));
  }
  async updateTemplate(id: string, input: UpdateTemplate) {
    return sharedEngine.updateTemplate(
      this.user(),
      id,
      updateTemplateSchema.parse(input),
    );
  }
  async generate(competence: string, department: Department) {
    generationSchema.parse({ competence, department });
    return sharedEngine.generate(this.user(), competence, department);
  }
  async logout() {
    this.actor = undefined;
  }
}
export class HttpPortalClient implements PortalClient {
  private token?: string;
  private readonly base = import.meta.env.VITE_API_BASE ?? "/api/v1";
  previewTv(competence: string, department?: Department) {
    const query = new URLSearchParams({ competence });
    if (department) query.set("department", department);
    return this.request<TvFeed>(`/tv/preview?${query}`);
  }
  listTvDevices() {
    return this.request<TvDevice[]>("/tv-devices");
  }
  addTvDevice(input: CreateTvDevice) {
    return this.request<TvDevice>("/tv-devices", "POST", input);
  }
  updateTvDevice(id: string, input: UpdateTvDevice) {
    return this.request<TvDevice>(
      `/tv-devices/${encodeURIComponent(id)}`,
      "PATCH",
      input,
    );
  }
  createTvPairCode(id: string) {
    return this.request<{ code: string; expiresAt: string }>(
      `/tv-devices/${encodeURIComponent(id)}/pair-code`,
      "POST",
    );
  }
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const multipart = body instanceof FormData;
      const response = await fetch(`${this.base}${path}`, {
        method,
        credentials: "omit",
        signal: controller.signal,
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(!multipart && body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          body === undefined
            ? undefined
            : multipart
              ? body
              : JSON.stringify(body),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const detail = data as { message?: string; code?: string };
        throw new DomainError(
          detail.code ?? "API_ERROR",
          detail.message ?? "Não foi possível concluir a operação.",
          response.status,
        );
      }
      return data as T;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new Error(
        "Não foi possível conectar ao servidor. Tente novamente.",
        { cause: error },
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }
  async login(userId: string) {
    const result = await this.request<{ token: string; actor: Actor }>(
      "/demo-session",
      "POST",
      { userId },
    );
    this.token = result.token;
    return result.actor;
  }
  async authenticate(username: string, password: string) {
    this.token = undefined;
    const result = await this.request<
      EmailChallenge | (LoginSession & { token: string })
    >("/login", "POST", {
      username,
      password,
    });
    if ("token" in result) this.token = result.token;
    return result;
  }
  async verifyEmailCode(challengeId: string, code: string) {
    const session = await this.request<LoginSession & { token: string }>(
      "/login/verify",
      "POST",
      { challengeId, code },
    );
    this.token = session.token;
    return session;
  }
  setChallengeEmail(challengeId: string, email: string) {
    return this.request<EmailChallenge>("/login/email", "POST", {
      challengeId,
      email,
    });
  }
  resendEmailCode(challengeId: string) {
    return this.request<EmailChallenge>("/login/resend", "POST", {
      challengeId,
    });
  }
  async forgotPassword(email: string) {
    await this.request("/password/forgot", "POST", { email });
  }
  async resetPassword(token: string, newPassword: string) {
    await this.request("/password/reset", "POST", { token, newPassword });
  }
  getSession() {
    return this.request<LoginSession>("/session");
  }
  async changePassword(currentPassword: string, newPassword: string) {
    await this.request("/password", "POST", { currentPassword, newPassword });
  }
  listUsers() {
    return this.request<AccountUser[]>("/users");
  }
  createUser(input: AccountInput) {
    return this.request<AccountUser>("/users", "POST", input);
  }
  updateUser(id: string, input: AccountUpdate) {
    return this.request<AccountUser>(
      `/users/${encodeURIComponent(id)}`,
      "PATCH",
      input,
    );
  }
  snapshot() {
    return this.request<Snapshot>("/snapshot");
  }
  command(id: string, command: TaskCommand) {
    return this.request<Task>(
      `/tasks/${encodeURIComponent(id)}/actions`,
      "POST",
      command,
    );
  }
  attach(id: string, revision: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("expectedRevision", String(revision));
    return this.request<Task>(
      `/tasks/${encodeURIComponent(id)}/evidence`,
      "POST",
      form,
    );
  }
  addCompany(input: CreateCompany) {
    return this.request("/companies", "POST", input);
  }
  addTemplate(input: CreateTemplate) {
    return this.request("/task-templates", "POST", input);
  }
  updateTemplate(id: string, input: UpdateTemplate) {
    return this.request(
      `/task-templates/${encodeURIComponent(id)}`,
      "PATCH",
      input,
    );
  }
  generate(competence: string, department: Department) {
    return this.request<{ created: number; existing: number }>(
      "/generation",
      "POST",
      { competence, department },
    );
  }
  async logout() {
    const previous = this.token;
    try {
      await this.request("/session", "DELETE");
    } finally {
      if (this.token === previous) this.token = undefined;
    }
  }
  addTask(input: CreateTask) {
    return this.request<Task>("/tasks", "POST", input);
  }
  importCompanies(inputs: CreateCompany[]) {
    return this.request<{ created: number; existing: number }>(
      "/companies/import",
      "POST",
      { companies: inputs },
    );
  }
  async downloadDocument(taskId: string, documentId: string) {
    const result = await fetch(
      `${this.base}/tasks/${encodeURIComponent(taskId)}/documents/${encodeURIComponent(documentId)}/download`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        credentials: "omit",
      },
    );
    if (!result.ok) throw new Error("Documento indisponível neste escopo.");
    return result.blob();
  }
}
export const isHostedDemo = import.meta.env.VITE_DATA_MODE === "demo";
export function createClient(): PortalClient {
  return isHostedDemo ? new DemoPortalClient() : new HttpPortalClient();
}
