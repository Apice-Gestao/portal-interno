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
} from "@apice/domain";
import type {
  CreateCompany,
  CreateTask,
  CreateTemplate,
  Department,
  TaskCommand,
  UpdateTemplate,
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
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 1, fieldSize: 20 },
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
          })
          .strict(),
      ),
    )
    body: { expectedRevision: number },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.portal.attach(req.actor, id, body.expectedRevision, file);
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
}
