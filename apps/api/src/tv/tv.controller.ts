import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  createTvDeviceSchema,
  departmentSchema,
  pairTvSchema,
  updateTvDeviceSchema,
} from "@apice/domain";
import type { CreateTvDevice, Department, UpdateTvDevice } from "@apice/domain";
import { SchemaPipe, swaggerSchema } from "../common/validation.js";
import { RequirePermission } from "../common/permission.guard.js";
import { Public } from "../security/auth.guard.js";
import type { AuthRequest } from "../security/auth.guard.js";
import { TVService } from "./tv.service.js";
import { TvPairGuard } from "./tv-pair.guard.js";

const previewSchema = z
  .object({
    competence: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
    department: departmentSchema.optional(),
  })
  .strict();
const COOKIE = "portal_tv";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/v1/tv",
};

// Only this specific cookie is accepted, without depending on a global parser.
// Reject duplicates and invalid syntax rather than guessing an identity.
export function readTvCookie(request: Pick<Request, "headers">) {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return "";
  const token = values[0]!.slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

@ApiTags("Painel de TV")
@Controller("api/v1")
export class TVController {
  constructor(@Inject(TVService) private readonly tv: TVService) {}

  @Get("tv-devices")
  @ApiBearerAuth()
  @RequirePermission("tv.view")
  list(@Req() request: AuthRequest) {
    return this.tv.list(request.actor);
  }

  @Post("tv-devices")
  @ApiBearerAuth()
  @RequirePermission("tv.manage")
  @ApiBody({ schema: swaggerSchema(createTvDeviceSchema) })
  create(
    @Req() request: AuthRequest,
    @Body(new SchemaPipe(createTvDeviceSchema)) body: CreateTvDevice,
  ) {
    return this.tv.create(request.actor, body);
  }

  @Patch("tv-devices/:id")
  @ApiBearerAuth()
  @RequirePermission("tv.view")
  @ApiBody({ schema: swaggerSchema(updateTvDeviceSchema) })
  update(
    @Req() request: AuthRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new SchemaPipe(updateTvDeviceSchema)) body: UpdateTvDevice,
  ) {
    // Mixed edits are authorized again in the service according to fields.
    return this.tv.update(request.actor, id, body);
  }

  @Post("tv-devices/:id/pair-code")
  @ApiBearerAuth()
  @RequirePermission("tv.manage")
  code(
    @Req() request: AuthRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.tv.pairCode(request.actor, id);
  }

  @Get("tv/preview")
  @ApiBearerAuth()
  @RequirePermission("tv.view")
  preview(
    @Req() request: AuthRequest,
    @Query(new SchemaPipe(previewSchema))
    query: { competence: string; department?: Department },
  ) {
    return this.tv.preview(request.actor, query.competence, query.department);
  }

  @Public()
  @Post("tv/pair")
  @UseGuards(TvPairGuard)
  @ApiOperation({ summary: "Parear TV com código temporário de uso único" })
  @ApiBody({ schema: swaggerSchema(pairTvSchema) })
  async pair(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new SchemaPipe(pairTvSchema)) body: { code: string },
  ) {
    void request;
    const result = await this.tv.pair(body.code);
    response.cookie(COOKIE, result.token, {
      ...COOKIE_OPTIONS,
      expires: result.expiresAt,
    });
    return { paired: true };
  }

  @Public()
  @Get("tv/watch")
  @ApiOperation({
    summary: "Consultar somente os dados sanitizados da TV pareada",
  })
  watch(@Req() request: Request) {
    return this.tv.watch(readTvCookie(request));
  }

  @Public()
  @Post("tv/disconnect")
  async disconnect(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.tv.disconnect(readTvCookie(request));
    response.clearCookie(COOKIE, COOKIE_OPTIONS);
    return { disconnected: true };
  }
}
