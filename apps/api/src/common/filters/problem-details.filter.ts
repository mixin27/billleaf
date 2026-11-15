import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import { SentryExceptionCaptured } from "@sentry/nestjs"
import type { Problem } from "@workspace/contracts"
import type { FastifyReply, FastifyRequest } from "fastify"
import { ZodValidationException } from "nestjs-zod"
import type { ZodError } from "zod"

/** Renders every error as RFC 9457 `application/problem+json`. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name)

  /** Reports unexpected (non-HTTP) errors to Sentry; 4xx are not reported. */
  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const req = ctx.getRequest<FastifyRequest>()

    let problem: Problem
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError
      problem = {
        type: "about:blank",
        title: "Validation failed",
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: "validation_failed",
        errors: zodError.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const res = exception.getResponse()
      const detail =
        typeof res === "string"
          ? res
          : ((res as { message?: string | string[] }).message ?? undefined)
      problem = {
        type: "about:blank",
        title:
          HttpStatus[status]?.replaceAll("_", " ").toLowerCase() ?? "error",
        status,
        detail: Array.isArray(detail) ? detail.join("; ") : detail,
        // Machine-readable code, e.g. throw new ForbiddenException({ message, code })
        code:
          typeof res === "object" && res && "code" in res
            ? String((res as { code: unknown }).code)
            : undefined,
      }
    } else if (isBadJsonBody(exception, req)) {
      problem = {
        type: "about:blank",
        title: "bad request",
        status: HttpStatus.BAD_REQUEST,
        detail: "The request body isn't valid JSON",
        code: "invalid_json",
      }
    } else if (isClientError(exception)) {
      // Fastify's own request errors (invalid JSON, body too large, unsupported
      // content type…) are the client's fault, not a 500.
      problem = {
        type: "about:blank",
        title:
          HttpStatus[exception.statusCode]
            ?.replaceAll("_", " ")
            .toLowerCase() ?? "bad request",
        status: exception.statusCode,
        detail: exception.message,
        code: exception.code?.toLowerCase(),
      }
    } else {
      this.logger.error(exception)
      problem = {
        type: "about:blank",
        title: "internal server error",
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      }
    }

    problem.instance = req.url
    void reply
      .status(problem.status)
      .header("content-type", "application/problem+json")
      .send(problem)
  }
}

function isClientError(
  e: unknown
): e is { statusCode: number; message: string; code?: string } {
  const status = (e as { statusCode?: unknown })?.statusCode
  return typeof status === "number" && status >= 400 && status < 500
}

/** A JSON body that failed to parse (the body parser throws a SyntaxError). */
function isBadJsonBody(e: unknown, req: FastifyRequest) {
  return (
    e instanceof SyntaxError &&
    /json/i.test(String(req.headers["content-type"] ?? "")) &&
    /json/i.test(e.message)
  )
}
