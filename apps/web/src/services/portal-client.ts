import {
  applyDemoShowcase,
  createTvDeviceSchema,
  createTvFeed,
  hasPermission,
  TV_DEFAULT_BLOCKS,
  updateTvDeviceSchema,
  OPERATOR_PERMISSIONS,
  PERMISSIONS,
  createSeed,
  demoPdf,
  DEMO_NOW,
  DomainError,
  MemoryRepository,
  PortalEngine,
  validateEvidence,
  commandSchema,
  companySchema,
  templateSchema,
  updateTemplateSchema,
  generationSchema,
  taskSchema,
  importSchema,
  createDepartmentFlowSchema,
  updateDepartmentFlowSchema,
  startCompanyOnboardingSchema,
  updateCompanyOnboardingSchema,
  workspaceOf,
} from "@apice/domain";
import type { PortalState } from "@apice/domain";
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
  DepartmentFlow,
  CreateDepartmentFlow,
  UpdateDepartmentFlow,
  CompanyOnboarding,
  StartCompanyOnboarding,
  UpdateCompanyOnboarding,
  Company,
  UpdateCompany,
  ProposeCompanyChange,
  CompanyChangeProposal,
  DecideChangeProposal,
  WorkspaceSettings,
  UpdateWorkspaceSettings,
  TransferCompanies,
  AddTaskComment,
  ReportFilters,
  ReportResult,
  CompanyWorkflowInput,
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
    groupId?: "contabil" | "go" | "condominios",
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
  /** Hosted preview only: session kept in this browser across reloads. */
  restoreSession?(): LoginSession | undefined;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  listUsers(): Promise<AccountUser[]>;
  createUser(input: AccountInput): Promise<AccountUser>;
  importUsers(inputs: AccountInput[]): Promise<AccountUser[]>;
  updateUser(id: string, input: AccountUpdate): Promise<AccountUser>;
  login(userId: string): Promise<Actor>;
  snapshot(): Promise<Snapshot>;
  report(filters: ReportFilters): Promise<ReportResult>;
  command(id: string, command: TaskCommand): Promise<Task>;
  attach(
    id: string,
    revision: number,
    file: File,
    metadata?: { logicalId?: string; documentTypeId?: string },
  ): Promise<Task>;
  addTaskComment(id: string, input: AddTaskComment): Promise<Task>;
  updateCompany(id: string, input: UpdateCompany): Promise<Company>;
  setCompanyWorkflow(input: CompanyWorkflowInput): Promise<Company>;
  proposeCompanyChange(
    input: ProposeCompanyChange,
  ): Promise<CompanyChangeProposal>;
  decideChangeProposal(
    id: string,
    input: DecideChangeProposal,
  ): Promise<CompanyChangeProposal>;
  proposeCompanyChanges(
    inputs: ProposeCompanyChange[],
  ): Promise<CompanyChangeProposal[]>;
  updateWorkspaceSettings(
    input: UpdateWorkspaceSettings,
  ): Promise<WorkspaceSettings>;
  transferCompanies(
    input: TransferCompanies,
  ): Promise<{ companies: number; tasks: number }>;
  importTemplates(
    inputs: CreateTemplate[],
  ): Promise<{ created: number; existing: number }>;
  importTasks(
    inputs: CreateTask[],
  ): Promise<{ created: number; existing: number }>;
  transferTasks(input: {
    taskIds: string[];
    assigneeId: string;
    expectedRevisions: Record<string, number>;
    reason: string;
  }): Promise<{ tasks: number }>;
  addCompany(input: CreateCompany): Promise<unknown>;
  addTemplate(input: CreateTemplate): Promise<unknown>;
  updateTemplate(id: string, input: UpdateTemplate): Promise<unknown>;
  createDepartmentFlow(input: CreateDepartmentFlow): Promise<DepartmentFlow>;
  updateDepartmentFlow(
    id: string,
    input: UpdateDepartmentFlow,
  ): Promise<DepartmentFlow>;
  startCompanyOnboarding(
    input: StartCompanyOnboarding,
  ): Promise<CompanyOnboarding>;
  updateCompanyOnboarding(
    id: string,
    input: UpdateCompanyOnboarding,
  ): Promise<CompanyOnboarding>;
  generate(
    competence: string,
    department: Department,
  ): Promise<{ created: number; existing: number; blocked?: number }>;
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
// Hosted preview: same fictitious data and grants as the local test groups
// (administrator with the full catalogue, operator with own tasks), plus the
// shared demonstration showcase. Nothing leaves the browser.
// Hosted preview: what a visitor does survives a reload (data, login and the
// open screen are kept in this browser only; "Reiniciar demonstração" clears it).
const DEMO_STORE = "apice.demo.state.v1";
export const DEMO_SESSION = "apice.demo.session.v1";
export const DEMO_ROUTE = "apice.demo.route.v1";
const persistDemo = import.meta.env.VITE_DATA_MODE === "demo";
function demoStorage(key: string, value?: string | null) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the preview still works, only without memory.
  }
  return null;
}
// Attachment bytes sent in the preview live in IndexedDB (localStorage keeps
// only the records), so a reload restores the file together with its record.
const DEMO_FILES = "apice-demo-files";
function demoFiles(mode: IDBTransactionMode) {
  return new Promise<IDBObjectStore | undefined>((resolve) => {
    try {
      const request = indexedDB.open(DEMO_FILES, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () =>
        resolve(request.result.transaction("files", mode).objectStore("files"));
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}
async function keepDemoFile(id: string, file: Blob) {
  if (!persistDemo) return;
  (await demoFiles("readwrite"))?.put(file, id);
}
async function restoreDemoFile(id: string) {
  if (!persistDemo) return undefined;
  const store = await demoFiles("readonly");
  if (!store) return undefined;
  return new Promise<Blob | undefined>((resolve) => {
    const request = store.get(id);
    request.onsuccess = () =>
      resolve(request.result instanceof Blob ? request.result : undefined);
    request.onerror = () => resolve(undefined);
  });
}
class DemoRepository extends MemoryRepository {
  override replace(state: PortalState) {
    super.replace(state);
    if (persistDemo) demoStorage(DEMO_STORE, JSON.stringify(state));
  }
}
function freshDemoState(): PortalState {
  const state = (() => {
    const state = createSeed();
    for (const actor of state.users) {
      actor.active = true;
      actor.permissions =
        actor.role === "admin"
          ? [...PERMISSIONS]
          : actor.role === "operator"
            ? [...OPERATOR_PERMISSIONS]
            : actor.role === "coordinator"
              ? [
                  "overview.view",
                  "tasks.view",
                  "tasks.team.view",
                  "tasks.review",
                  "tasks.manage",
                  "tasks.download",
                  "companies.view",
                  "documents.view",
                  "reports.view",
                ]
              : ["tasks.view", "tasks.team.view", "tasks.download"];
    }
    return state;
  })();
  return state;
}
function usableDemoState(saved: string | null): PortalState | undefined {
  if (!saved) return undefined;
  try {
    const state = JSON.parse(saved) as PortalState;
    const lists = ["users", "companies", "templates", "tasks", "audit"] as const;
    if (!lists.every((key) => Array.isArray(state?.[key]))) return undefined;
    const admin = state.users.find((user) => user?.role === "admin");
    if (!admin?.userId || !admin.tenantId) return undefined;
    // Opening the snapshot exercises every collection the screens read.
    new PortalEngine(new MemoryRepository(state), () => DEMO_NOW).snapshot(
      admin,
    );
    return state;
  } catch {
    return undefined;
  }
}
const savedDemo = persistDemo ? demoStorage(DEMO_STORE) : null;
const restoredDemo = usableDemoState(savedDemo);
if (savedDemo && !restoredDemo) demoStorage(DEMO_STORE, null);
const demoRepository = new DemoRepository(restoredDemo ?? freshDemoState());
const sharedEngine = new PortalEngine(demoRepository, () => DEMO_NOW);
if (!restoredDemo) {
  const admin = demoRepository.read().users.find((u) => u.role === "admin");
  if (admin && persistDemo) {
    applyDemoShowcase(sharedEngine, admin);
    // Same automatic monthly generation the server runs.
    sharedEngine.autoGenerate(admin.tenantId);
    demoRepository.replace(demoRepository.read());
  }
}
/** Clears everything the visitor did in the hosted preview. */
export function resetDemo() {
  for (const key of [DEMO_STORE, DEMO_SESSION, DEMO_ROUTE])
    demoStorage(key, null);
  try {
    indexedDB.deleteDatabase(DEMO_FILES);
  } catch {
    // Nothing stored.
  }
}
// Fictitious account view; accounts created in the preview keep their username.
function demoAccount(user: Actor): AccountUser {
  const extra = user as Actor & { username?: string; email?: string };
  return {
    ...structuredClone(user),
    username: extra.username ?? `demo-${user.userId}`,
    permissions: [...(user.permissions ?? [])],
    active: user.active !== false,
    mustChangePassword: false,
  };
}
// Preview TV devices live only in this browser tab (no pairing without a server).
const demoTvDevices: TvDevice[] = [];
function demoTvDevice(
  actor: Actor,
  input: Partial<TvDevice> & Pick<TvDevice, "name" | "departments">,
): TvDevice {
  return {
    id: `tv-${crypto.randomUUID()}`,
    tenantId: actor.tenantId,
    competence: "2026-09",
    active: true,
    showNames: hasPermission(actor, "tv.team.view"),
    blocks: TV_DEFAULT_BLOCKS.filter(
      (block) =>
        block !== "collaborators" || hasPermission(actor, "tv.team.view"),
    ),
    rotationSeconds: 12,
    version: 1,
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
    ...input,
  };
}
export class DemoPortalClient implements PortalClient {
  private requireTv(manage = false) {
    const actor = this.user();
    if (!hasPermission(actor, manage ? "tv.manage" : "tv.view"))
      throw new DomainError("FORBIDDEN", "Acesso ao painel não liberado.", 403);
    return actor;
  }
  // Same feed the server builds, computed here from the fictitious data.
  async previewTv(competence: string, department?: Department) {
    const actor = this.requireTv();
    const departments = department ? [department] : actor.departments;
    return createTvFeed(
      demoRepository.read(),
      demoTvDevice(actor, {
        name: "Prévia do painel",
        departments,
        competence,
        showNames: false,
      }),
      DEMO_NOW,
    );
  }
  async listTvDevices(): Promise<TvDevice[]> {
    const actor = this.requireTv();
    if (!demoTvDevices.length)
      demoTvDevices.push(
        demoTvDevice(actor, {
          name: "TV da recepção",
          departments: [...actor.departments],
        }),
      );
    return structuredClone(demoTvDevices);
  }
  async addTvDevice(input: CreateTvDevice): Promise<TvDevice> {
    const actor = this.requireTv(true);
    const body = createTvDeviceSchema.parse(input);
    const device = demoTvDevice(actor, body);
    demoTvDevices.push(device);
    return structuredClone(device);
  }
  async updateTvDevice(id: string, input: UpdateTvDevice): Promise<TvDevice> {
    this.requireTv(true);
    const body = updateTvDeviceSchema.parse(input);
    const device = demoTvDevices.find((item) => item.id === id);
    if (!device)
      throw new DomainError("NOT_FOUND", "Dispositivo não encontrado.", 404);
    if (device.version !== body.expectedVersion)
      throw new DomainError(
        "CONFLICT",
        "O dispositivo mudou. Atualize a tela.",
        409,
      );
    const { expectedVersion: _version, ...changes } = body;
    void _version;
    Object.assign(device, changes, {
      version: device.version + 1,
      updatedAt: new Date().toISOString(),
    });
    return structuredClone(device);
  }
  async createTvPairCode(): Promise<{ code: string; expiresAt: string }> {
    this.requireTv(true);
    throw new DomainError(
      "UNAVAILABLE",
      "O pareamento de uma TV real só funciona no portal instalado. Use “Abrir painel” para ver a tela.",
      409,
    );
  }
  private unavailable(): never {
    throw new Error(
      "A prévia estática não possui autenticação. Use o sistema local com PostgreSQL.",
    );
  }
  // Preview only: fictitious profiles shown on the login page. Password
  // "admin" enters as the administrator; "operador" shows the operator view.
  async authenticate(
    username: string,
    password: string,
  ): Promise<LoginSession> {
    const user = username.trim().toLowerCase();
    const profile =
      password === "admin" && user === "admin"
        ? "helena"
        : password === "operador" && (user === "operador" || user === "admin")
          ? "julia"
          : undefined;
    if (!profile)
      throw new DomainError(
        "INVALID_CREDENTIALS",
        "Usuário ou senha inválidos. Na demonstração use admin/admin (administrador) ou operador/operador (operador).",
        401,
      );
    await this.login(profile);
    return this.getSession();
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
    return {
      actor: structuredClone(this.user()),
      mustChangePassword: false,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      mode: "demo",
    };
  }
  async changePassword(): Promise<void> {
    this.unavailable();
  }
  async listUsers(): Promise<AccountUser[]> {
    this.user();
    return demoRepository.read().users.map(demoAccount);
  }
  // Preview: accounts are created on the fictitious data in this browser only;
  // the password is not kept (entry stays admin/admin or operador/operador).
  async createUser(input: AccountInput): Promise<AccountUser> {
    return this.addDemoUsers([input])[0]!;
  }
  async importUsers(inputs: AccountInput[]): Promise<AccountUser[]> {
    return this.addDemoUsers(inputs);
  }
  private addDemoUsers(inputs: AccountInput[]) {
    const actor = this.user();
    if (!hasPermission(actor, "users.manage"))
      throw new DomainError("FORBIDDEN", "Acesso não permitido.", 403);
    const state = demoRepository.read();
    const departments = new Set(
      workspaceOf(state, actor.tenantId).departments.map((item) => item.id),
    );
    const taken = new Set(
      state.users.map((user) => demoAccount(user).username.toLowerCase()),
    );
    const created = inputs.map((input) => {
      const name = input.name.trim();
      const username = input.username.trim().toLowerCase();
      if (name.length < 2)
        throw new DomainError("INVALID_USER", "Informe o nome da pessoa.");
      if (!/^[a-z0-9._-]{3,60}$/.test(username))
        throw new DomainError(
          "INVALID_USER",
          "Usuário com 3 a 60 letras, números, ponto, hífen ou sublinhado.",
        );
      if (taken.has(username))
        throw new DomainError(
          "DUPLICATE_USER",
          `O usuário ${username} já existe.`,
          409,
        );
      if (
        !input.departments.length ||
        input.departments.some((item) => !departments.has(item))
      )
        throw new DomainError(
          "INVALID_USER",
          "Escolha departamentos cadastrados neste grupo.",
        );
      taken.add(username);
      const words = name.split(/\s+/);
      return {
        userId: `demo-${crypto.randomUUID().slice(0, 8)}`,
        tenantId: actor.tenantId,
        name,
        initials: `${words[0]![0] ?? ""}${words.length > 1 ? (words.at(-1)![0] ?? "") : ""}`.toUpperCase(),
        role: input.role,
        departments: [...input.departments],
        permissions: [...input.permissions],
        ...(input.managerId ? { managerId: input.managerId } : {}),
        ...(input.homeView ? { homeView: input.homeView } : {}),
        active: true,
        username,
        ...(input.email ? { email: input.email } : {}),
      };
    });
    state.users.push(...created);
    demoRepository.replace(state);
    return created.map(demoAccount);
  }
  // Preview: edits the fictitious account in this browser only (no password).
  async updateUser(id: string, input: AccountUpdate): Promise<AccountUser> {
    const actor = this.user();
    if (actor.userId !== id && !hasPermission(actor, "users.manage"))
      throw new DomainError("FORBIDDEN", "Acesso não permitido.", 403);
    const state = demoRepository.read();
    const user = state.users.find((item) => item.userId === id);
    if (!user)
      throw new DomainError("NOT_FOUND", "Usuário não encontrado.", 404);
    const { password: _password, ...changes } = input as AccountUpdate & {
      password?: string;
    };
    void _password;
    Object.assign(user, changes);
    demoRepository.replace(state);
    if (id === actor.userId) this.actor = structuredClone(user);
    return demoAccount(user);
  }
  private static readonly files = new Map<string, Blob>();
  private static storedBytes = 0;
  private static readonly seedIds = new Set(
    createSeed().tasks.flatMap((t) => t.documents.map((d) => d.id)),
  );
  private actor?: Actor;
  async login(userId: string) {
    const actor = demoRepository.read().users.find((u) => u.userId === userId);
    if (!actor)
      throw new DomainError("INVALID_SESSION", "Perfil inválido.", 401);
    this.actor = structuredClone(actor);
    if (persistDemo) demoStorage(DEMO_SESSION, actor.userId);
    return this.actor;
  }
  /** Hosted preview: the visitor stays logged in after a reload. */
  restoreSession(): LoginSession | undefined {
    if (!persistDemo) return undefined;
    const userId = demoStorage(DEMO_SESSION);
    const actor = userId
      ? demoRepository.read().users.find((u) => u.userId === userId)
      : undefined;
    if (!actor) return undefined;
    this.actor = structuredClone(actor);
    return {
      actor: structuredClone(actor),
      mustChangePassword: false,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      mode: "demo",
    };
  }
  private user() {
    if (!this.actor)
      throw new DomainError("UNAUTHENTICATED", "Selecione um perfil.", 401);
    return this.actor;
  }
  async snapshot() {
    return sharedEngine.snapshot(this.user());
  }
  async report(filters: ReportFilters) {
    return sharedEngine.report(this.user(), filters);
  }
  async command(id: string, command: TaskCommand) {
    return sharedEngine.command(this.user(), id, commandSchema.parse(command));
  }
  async attach(
    id: string,
    revision: number,
    file: File,
    metadata: { logicalId?: string; documentTypeId?: string } = {},
  ) {
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
      ...metadata,
      name: file.name,
      bytes: bytes.length,
      kind,
      hash,
    });
    const documentId = task.documents.at(-1)!.id;
    DemoPortalClient.files.set(documentId, file);
    DemoPortalClient.storedBytes += file.size;
    await keepDemoFile(documentId, file);
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
    const file =
      DemoPortalClient.files.get(documentId) ??
      (await restoreDemoFile(documentId));
    if (!file && !DemoPortalClient.seedIds.has(documentId))
      throw new DomainError(
        "MISSING_CONTENT",
        "O arquivo deste anexo não ficou guardado neste navegador. Anexe-o de novo para baixar.",
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
  async createDepartmentFlow(input: CreateDepartmentFlow) {
    return sharedEngine.createDepartmentFlow(
      this.user(),
      createDepartmentFlowSchema.parse(input),
    );
  }
  async updateDepartmentFlow(id: string, input: UpdateDepartmentFlow) {
    return sharedEngine.updateDepartmentFlow(
      this.user(),
      id,
      updateDepartmentFlowSchema.parse(input),
    );
  }
  async startCompanyOnboarding(input: StartCompanyOnboarding) {
    return sharedEngine.startCompanyOnboarding(
      this.user(),
      startCompanyOnboardingSchema.parse(input),
    );
  }
  async updateCompanyOnboarding(id: string, input: UpdateCompanyOnboarding) {
    return sharedEngine.updateCompanyOnboarding(
      this.user(),
      id,
      updateCompanyOnboardingSchema.parse(input),
    );
  }
  async setCompanyWorkflow(input: CompanyWorkflowInput) {
    return sharedEngine.setCompanyWorkflow(this.user(), input);
  }
  async updateCompany(id: string, input: UpdateCompany) {
    return sharedEngine.updateCompany(this.user(), id, input);
  }
  async proposeCompanyChange(input: ProposeCompanyChange) {
    return sharedEngine.proposeCompanyChange(this.user(), input);
  }
  async decideChangeProposal(id: string, input: DecideChangeProposal) {
    return sharedEngine.decideChangeProposal(this.user(), id, input);
  }
  async proposeCompanyChanges(inputs: ProposeCompanyChange[]) {
    return sharedEngine.proposeCompanyChanges(this.user(), inputs);
  }
  async updateWorkspaceSettings(input: UpdateWorkspaceSettings) {
    return sharedEngine.updateWorkspaceSettings(this.user(), input);
  }
  async transferCompanies(input: TransferCompanies) {
    return sharedEngine.transferCompanies(this.user(), input);
  }
  async addTaskComment(id: string, input: AddTaskComment) {
    return sharedEngine.addTaskComment(this.user(), id, input);
  }
  async importTemplates(inputs: CreateTemplate[]) {
    return sharedEngine.importTemplates(this.user(), inputs);
  }
  async importTasks(inputs: CreateTask[]) {
    return sharedEngine.importTasks(this.user(), inputs);
  }
  async transferTasks(input: {
    taskIds: string[];
    assigneeId: string;
    expectedRevisions: Record<string, number>;
    reason: string;
  }) {
    return sharedEngine.transferTasks(this.user(), input);
  }
  async logout() {
    this.actor = undefined;
    if (persistDemo) {
      demoStorage(DEMO_SESSION, null);
      demoStorage(DEMO_ROUTE, null);
    }
  }
}
export class HttpPortalClient implements PortalClient {
  importUsers(inputs: AccountInput[]) {
    return this.request<AccountUser[]>("/users/import", "POST", {
      users: inputs,
    });
  }
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
  async authenticate(
    username: string,
    password: string,
    groupId?: "contabil" | "go" | "condominios",
  ) {
    this.token = undefined;
    const result = await this.request<
      EmailChallenge | (LoginSession & { token: string })
    >("/login", "POST", {
      username,
      password,
      ...(groupId ? { groupId } : {}),
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
  report(filters: ReportFilters) {
    return this.request<ReportResult>("/reports/query", "POST", filters);
  }
  command(id: string, command: TaskCommand) {
    return this.request<Task>(
      `/tasks/${encodeURIComponent(id)}/actions`,
      "POST",
      command,
    );
  }
  attach(
    id: string,
    revision: number,
    file: File,
    metadata: { logicalId?: string; documentTypeId?: string } = {},
  ) {
    const form = new FormData();
    form.append("file", file);
    form.append("expectedRevision", String(revision));
    if (metadata.logicalId) form.append("logicalId", metadata.logicalId);
    if (metadata.documentTypeId)
      form.append("documentTypeId", metadata.documentTypeId);
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
    return this.request<{
      created: number;
      existing: number;
      blocked?: number;
    }>("/generation", "POST", { competence, department });
  }
  createDepartmentFlow(input: CreateDepartmentFlow) {
    return this.request<DepartmentFlow>("/department-flows", "POST", input);
  }
  updateDepartmentFlow(id: string, input: UpdateDepartmentFlow) {
    return this.request<DepartmentFlow>(
      `/department-flows/${encodeURIComponent(id)}`,
      "PATCH",
      input,
    );
  }
  startCompanyOnboarding(input: StartCompanyOnboarding) {
    return this.request<CompanyOnboarding>(
      "/company-onboardings",
      "POST",
      input,
    );
  }
  updateCompanyOnboarding(id: string, input: UpdateCompanyOnboarding) {
    return this.request<CompanyOnboarding>(
      `/company-onboardings/${encodeURIComponent(id)}`,
      "PATCH",
      input,
    );
  }
  setCompanyWorkflow(input: CompanyWorkflowInput) {
    return this.request<Company>(
      "/companies/workflow-overrides",
      "POST",
      input,
    );
  }
  updateCompany(id: string, input: UpdateCompany) {
    return this.request<Company>(
      `/companies/${encodeURIComponent(id)}`,
      "PATCH",
      input,
    );
  }
  proposeCompanyChange(input: ProposeCompanyChange) {
    return this.request<CompanyChangeProposal>(
      "/companies/change-proposals",
      "POST",
      input,
    );
  }
  decideChangeProposal(id: string, input: DecideChangeProposal) {
    return this.request<CompanyChangeProposal>(
      `/company-change-proposals/${encodeURIComponent(id)}/decision`,
      "POST",
      input,
    );
  }
  proposeCompanyChanges(inputs: ProposeCompanyChange[]) {
    return this.request<CompanyChangeProposal[]>(
      "/companies/change-proposals/batch",
      "POST",
      { proposals: inputs },
    );
  }
  updateWorkspaceSettings(input: UpdateWorkspaceSettings) {
    return this.request<WorkspaceSettings>(
      "/workspace-settings",
      "PATCH",
      input,
    );
  }
  transferCompanies(input: TransferCompanies) {
    return this.request<{ companies: number; tasks: number }>(
      "/companies/transfer",
      "POST",
      input,
    );
  }
  addTaskComment(id: string, input: AddTaskComment) {
    return this.request<Task>(
      `/tasks/${encodeURIComponent(id)}/comments`,
      "POST",
      input,
    );
  }
  importTemplates(inputs: CreateTemplate[]) {
    return this.request<{ created: number; existing: number }>(
      "/task-templates/import",
      "POST",
      { templates: inputs },
    );
  }
  importTasks(inputs: CreateTask[]) {
    return this.request<{ created: number; existing: number }>(
      "/tasks/import",
      "POST",
      { tasks: inputs },
    );
  }
  transferTasks(input: {
    taskIds: string[];
    assigneeId: string;
    expectedRevisions: Record<string, number>;
    reason: string;
  }) {
    return this.request<{ tasks: number }>("/tasks/transfer", "POST", input);
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
