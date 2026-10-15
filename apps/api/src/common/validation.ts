import { BadRequestException, Injectable } from "@nestjs/common";
import type { PipeTransform } from "@nestjs/common";
import type { ApiBodyOptions } from "@nestjs/swagger";
import { z } from "zod";
import type { ZodType } from "zod";
export function swaggerSchema(
  schema: ZodType,
): Extract<ApiBodyOptions, { schema: unknown }>["schema"] {
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
    unrepresentable: "any",
  }) as unknown as Extract<ApiBodyOptions, { schema: unknown }>["schema"];
}
@Injectable()
export class SchemaPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        code: "INVALID_INPUT",
        message: result.error.issues.map((i) => i.message).join(" "),
      });
    return result.data;
  }
}
