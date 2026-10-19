import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { z } from "zod";
import {
  commandSchema,
  companySchema,
  generationSchema,
  importSchema,
  MAX_FILE_BYTES,
  taskSchema,
  templateSchema,
  updateTemplateSchema,
  createDepartmentFlowSchema,
  updateDepartmentFlowSchema,
  startCompanyOnboardingSchema,
  updateCompanyOnboardingSchema,
  updateCompanySchema,
  proposeCompanyChangeSchema,
  decideChangeProposalSchema,
  updateWorkspaceSettingsSchema,
  transferCompaniesSchema,
  taskCommentSchema,
  reportFiltersSchema,
  companyWorkflowSchema,
} from "@apice/domain";
import type {
  CreateCompany,
  CreateTask,
  CreateTemplate,
  Department,
  TaskCommand,
  UpdateTemplate,
  CreateDepartmentFlow,
  UpdateDepartmentFlow,
  StartCompanyOnboarding,
  UpdateCompanyOnboarding,
  UpdateCompany,
  ProposeCompanyChange,
  DecideChangeProposal,
  UpdateWorkspaceSettings,
  TransferCompanies,
  AddTaskComment,
  ReportFilters,
  CompanyWorkflowInput,
} from "@apice/domain";
import type { AuthRequest } from "../security/auth.guard.js";
import { SchemaPipe, swaggerSchema } from "../common/validation.js";
import { PortalService } from "./portal.service.js";
import { RequirePermission } from "../common/permission.guard.js";
@ApiTags("Operação")
@ApiBearerAuth()
@Controller("api/v1")
export class PortalController {
  constructor(@Inject(PortalService) private readonly portal: PortalService) {}
  @Get("snapshot")
  @ApiOperation({
    summary: "Estado operacional filtrado pelo escopo da sessão",
  })
  snapshot(@Req() req: AuthRequest) {
    return this.portal.snapshot(req.actor);
  }
  @Post("reports/query")
  @RequirePermission("reports.view")
  @ApiBody({ schema: swaggerSchema(reportFiltersSchema) })
  @ApiOperation({
    summary: "Consultar relatório com filtros e escopo revalidados no servidor",
  })
  report(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(reportFiltersSchema)) body: ReportFilters,
  ) {
    return this.portal.report(req.actor, body);
  }
  @Post("tasks/:id/actions")
  @RequirePermission("tasks.view")
  @ApiBody({ schema: swaggerSchema(commandSchema) })
  @ApiOperation({ summary: "Executar comando com revisão obrigatória" })
  command(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(new SchemaPipe(commandSchema)) body: TaskCommand,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.command(actor, id, body),
    );
  }
  @Post("tasks")
  @RequirePermission("tasks.create")
  @ApiBody({ schema: swaggerSchema(taskSchema) })
  addTask(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(taskSchema)) body: CreateTask,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.addTask(actor, body),
    );
  }
  @Get("tasks/:id/documents/:documentId/download")
  @RequirePermission("tasks.download")
  async download(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
  ) {
    const result = await this.portal.download(req.actor, id, documentId, {
      ip: req.ip,
      device: String(req.headers["user-agent"] ?? "").slice(0, 200),
    });
    return new StreamableFile(result.bytes, {
      type: result.doc.kind === "PDF" ? "application/pdf" : "application/xml",
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.doc.name)}`,
    });
  }
  @Post("tasks/:id/evidence")
  @RequirePermission("tasks.attach")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "expectedRevision"],
      additionalProperties: false,
      properties: {
        file: { type: "string", format: "binary" },
        expectedRevision: { type: "string", pattern: "^[1-9][0-9]*$" },
        logicalId: { type: "string", maxLength: 80 },
        documentTypeId: { type: "string", maxLength: 80 },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 3, fieldSize: 80 },
    }),
  )
  attach(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(
      new SchemaPipe(
        z
          .object({
            expectedRevision: z
              .string()
              .regex(/^[1-9]\d{0,8}$/)
              .transform(Number),
            logicalId: z
              .string()
              .min(1)
              .max(80)
              .regex(/^[A-Za-z0-9_-]+$/)
              .optional(),
            documentTypeId: z
              .string()
              .min(1)
              .max(80)
              .regex(/^[A-Za-z0-9_-]+$/)
              .optional(),
          })
          .strict(),
      ),
    )
    body: {
      expectedRevision: number;
      logicalId?: string;
      documentTypeId?: string;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.portal.attach(req.actor, id, body.expectedRevision, file, {
      logicalId: body.logicalId,
      documentTypeId: body.documentTypeId,
    });
  }
  @Post("companies")
  @RequirePermission("companies.manage")
  @ApiBody({ schema: swaggerSchema(companySchema) })
  addCompany(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(companySchema)) body: CreateCompany,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.addCompany(actor, body),
    );
  }
  @Post("companies/import")
  @RequirePermission("companies.manage")
  @ApiBody({ schema: swaggerSchema(importSchema) })
  import(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(importSchema)) body: { companies: CreateCompany[] },
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.importCompanies(actor, body.companies),
    );
  }
  @Post("task-templates")
  @RequirePermission("templates.manage")
  @ApiBody({ schema: swaggerSchema(templateSchema) })
  addTemplate(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(templateSchema)) body: CreateTemplate,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.addTemplate(actor, body),
    );
  }
  @Post("task-templates/import")
  @RequirePermission("templates.manage")
  importTemplates(
    @Req() req: AuthRequest,
    @Body(
      new SchemaPipe(
        z
          .object({ templates: z.array(templateSchema).min(1).max(200) })
          .strict(),
      ),
    )
    body: { templates: CreateTemplate[] },
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.importTemplates(actor, body.templates),
    );
  }
  @Post("tasks/import")
  @RequirePermission("tasks.create")
  importTasks(
    @Req() req: AuthRequest,
    @Body(
      new SchemaPipe(
        z.object({ tasks: z.array(taskSchema).min(1).max(200) }).strict(),
      ),
    )
    body: { tasks: CreateTask[] },
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.importTasks(actor, body.tasks),
    );
  }
  @Post("tasks/transfer")
  @RequirePermission("tasks.assign")
  transferTasks(
    @Req() req: AuthRequest,
    @Body(
      new SchemaPipe(
        z
          .object({
            taskIds: z.array(z.string().min(1).max(80)).min(1).max(200),
            assigneeId: z.string().min(1).max(80),
            expectedRevisions: z.record(
              z.string().min(1).max(80),
              z.number().int().positive(),
            ),
            reason: z.string().trim().min(8).max(500),
          })
          .strict(),
      ),
    )
    body: {
      taskIds: string[];
      assigneeId: string;
      expectedRevisions: Record<string, number>;
      reason: string;
    },
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.transferTasks(actor, body),
    );
  }
  @Patch("task-templates/:id")
  @RequirePermission("templates.manage")
  @ApiBody({ schema: swaggerSchema(updateTemplateSchema) })
  @ApiOperation({ summary: "Editar modelo e fluxo com versão obrigatória" })
  updateTemplate(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(new SchemaPipe(updateTemplateSchema)) body: UpdateTemplate,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.updateTemplate(actor, id, body),
    );
  }
  @Post("department-flows")
  @ApiBody({ schema: swaggerSchema(createDepartmentFlowSchema) })
  @ApiOperation({
    summary: "Criar fluxo ordenado de implantação entre departamentos",
  })
  createDepartmentFlow(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(createDepartmentFlowSchema))
    body: CreateDepartmentFlow,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.createDepartmentFlow(actor, body),
    );
  }
  @Patch("department-flows/:id")
  @ApiBody({ schema: swaggerSchema(updateDepartmentFlowSchema) })
  @ApiOperation({
    summary: "Versionar fluxo sem alterar implantações iniciadas",
  })
  updateDepartmentFlow(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(new SchemaPipe(updateDepartmentFlowSchema))
    body: UpdateDepartmentFlow,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.updateDepartmentFlow(actor, id, body),
    );
  }
  @Post("company-onboardings")
  @ApiBody({ schema: swaggerSchema(startCompanyOnboardingSchema) })
  @ApiOperation({
    summary:
      "Iniciar implantação e escolher se rotinas aguardam ou rodam em paralelo",
  })
  startCompanyOnboarding(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(startCompanyOnboardingSchema))
    body: StartCompanyOnboarding,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.startCompanyOnboarding(actor, body),
    );
  }
  @Patch("company-onboardings/:id")
  @ApiBody({ schema: swaggerSchema(updateCompanyOnboardingSchema) })
  @ApiOperation({
    summary: "Remanejar responsáveis de etapas futuras da implantação",
  })
  updateCompanyOnboarding(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(new SchemaPipe(updateCompanyOnboardingSchema))
    body: UpdateCompanyOnboarding,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.updateCompanyOnboarding(actor, id, body),
    );
  }
  @Post("generation")
  @RequirePermission("templates.manage")
  @ApiBody({ schema: swaggerSchema(generationSchema) })
  generate(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(generationSchema))
    body: { competence: string; department: Department },
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.generate(actor, body.competence, body.department),
    );
  }
  @Patch("workspace-settings")
  @ApiBody({ schema: swaggerSchema(updateWorkspaceSettingsSchema) })
  updateWorkspace(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(updateWorkspaceSettingsSchema))
    body: UpdateWorkspaceSettings,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.updateWorkspaceSettings(actor, body),
    );
  }
  @Post("companies/workflow-overrides")
  @RequirePermission("templates.manage")
  @ApiBody({ schema: swaggerSchema(companyWorkflowSchema) })
  @ApiOperation({
    summary:
      "Personalizar, manter ou remover as etapas de um modelo para uma empresa",
  })
  setCompanyWorkflow(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(companyWorkflowSchema)) body: CompanyWorkflowInput,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.setCompanyWorkflow(actor, body),
    );
  }
  @Patch("companies/:id")
  @RequirePermission("companies.manage")
  updateCompany(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(new SchemaPipe(updateCompanySchema)) body: UpdateCompany,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.updateCompany(actor, id, body),
    );
  }
  @Post("companies/change-proposals")
  @RequirePermission("companies.manage")
  proposeChange(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(proposeCompanyChangeSchema))
    body: ProposeCompanyChange,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.proposeCompanyChange(actor, body),
    );
  }
  @Post("companies/change-proposals/batch")
  @RequirePermission("companies.manage")
  proposeChanges(
    @Req() req: AuthRequest,
    @Body(
      new SchemaPipe(
        z
          .object({
            proposals: z.array(proposeCompanyChangeSchema).min(1).max(200),
          })
          .strict(),
      ),
    )
    body: { proposals: ProposeCompanyChange[] },
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.proposeCompanyChanges(actor, body.proposals),
    );
  }
  @Post("company-change-proposals/:id/decision")
  @RequirePermission("changes.manage")
  decideChange(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(new SchemaPipe(decideChangeProposalSchema))
    body: DecideChangeProposal,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.decideChangeProposal(actor, id, body),
    );
  }
  @Post("companies/transfer")
  @RequirePermission("companies.manage")
  transfer(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(transferCompaniesSchema)) body: TransferCompanies,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.transferCompanies(actor, body),
    );
  }
  @Post("tasks/:id/comments")
  @RequirePermission("tasks.comment")
  comment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body(new SchemaPipe(taskCommentSchema)) body: AddTaskComment,
  ) {
    return this.portal.execute(req.actor, (engine, actor) =>
      engine.addTaskComment(actor, id, body),
    );
  }
}
