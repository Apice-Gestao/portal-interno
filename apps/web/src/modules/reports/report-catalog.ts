import {
  AnalyticsIcon,
  AuditHistoryIcon,
  CalendarIcon,
  CancelledIcon,
  ChangeReviewIcon,
  CompanyIcon,
  DeadlineWarningIcon,
  DepartmentFlowIcon,
  DispensedIcon,
  DocumentIcon,
  DocumentRuleIcon,
  DocumentVaultIcon,
  EmptyTrayIcon,
  MatrixIcon,
  NotificationIcon,
  OfficeSettingsIcon,
  OverdueIcon,
  ProcessIcon,
  ReconciliationIcon,
  ReturnedIcon,
  ReviewIcon,
  TaskChecklistIcon,
  TeamIcon,
  TodayIcon,
  TransferIcon,
  UserAccessIcon,
  WaitingIcon,
  AccessLockIcon,
  AddIcon,
  StorageIcon,
} from "../../shared/icons";
import type { ReportCategory, ReportDateBasis, ReportId } from "@apice/domain";

export const categoryLabels: Record<ReportCategory, string> = {
  essential: "Principais",
  tasks: "Tarefas e prazos",
  companies: "Empresas e carteiras",
  processes: "Processos e implantações",
  documents: "Documentos e comunicação",
  management: "Gestão e histórico",
  access: "Acessos e estrutura",
};

export const dateBasisLabels: Record<ReportDateBasis, string> = {
  competence: "Competência",
  internalDue: "Meta interna",
  legalDue: "Prazo legal",
  completedAt: "Data de conclusão",
  startedAt: "Data de início",
  recordedAt: "Data de registro",
};

export const reportIcons: Record<ReportId, typeof AnalyticsIcon> = {
  reconciliation: ReconciliationIcon,
  deliveries: AnalyticsIcon,
  pending: TaskChecklistIcon,
  matrix: MatrixIcon,
  productivity: TeamIcon,
  changes: AuditHistoryIcon,
  deadlines: CalendarIcon,
  overdue: OverdueIcon,
  "internal-late": DeadlineWarningIcon,
  review: ReviewIcon,
  waiting: WaitingIcon,
  returned: ReturnedIcon,
  "department-queue": TodayIcon,
  "dispense-requests": DispensedIcon,
  cancelled: CancelledIcon,
  companies: CompanyIcon,
  "new-companies": AddIcon,
  "company-status": StorageIcon,
  portfolios: TransferIcon,
  regimes: DocumentRuleIcon,
  "companies-without-tasks": EmptyTrayIcon,
  processes: ProcessIcon,
  "process-stages": DepartmentFlowIcon,
  "recurring-blocks": AccessLockIcon,
  documents: DocumentVaultIcon,
  "missing-documents": DocumentIcon,
  comments: NotificationIcon,
  "company-changes": ChangeReviewIcon,
  activity: OfficeSettingsIcon,
  "user-access": UserAccessIcon,
  "department-structure": DepartmentFlowIcon,
};

export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
