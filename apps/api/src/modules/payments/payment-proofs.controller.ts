import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  confirmPaymentProofSchema,
  listPaymentProofsQuerySchema,
  paymentProofListSchema,
  paymentProofSchema,
  rejectPaymentProofSchema,
} from "@workspace/contracts"
import type { FastifyReply } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { PaymentProofsService } from "./payment-proofs.service.js"

class PaymentProofDto extends createZodDto(paymentProofSchema) {}
class PaymentProofListDto extends createZodDto(paymentProofListSchema) {}
class ListPaymentProofsQueryDto extends createZodDto(
  listPaymentProofsQuerySchema
) {}
class ConfirmPaymentProofDto extends createZodDto(confirmPaymentProofSchema) {}
class RejectPaymentProofDto extends createZodDto(rejectPaymentProofSchema) {}

const uuid = new ParseUUIDPipe()

/** Review clients' "I've paid" submissions from the client portal. */
@ApiTags("payments")
@Controller({ path: "payment-proofs", version: "1" })
export class PaymentProofsController {
  constructor(private readonly proofs: PaymentProofsService) {}

  @Get()
  @RequirePermission("payment.read")
  @ZodResponse({ status: 200, type: PaymentProofListDto })
  list(@Query() q: ListPaymentProofsQueryDto) {
    return this.proofs.list(q as never)
  }

  @Get(":id")
  @RequirePermission("payment.read")
  @ZodResponse({ status: 200, type: PaymentProofDto })
  get(@Param("id", uuid) id: string) {
    return this.proofs.get(id)
  }

  /** The uploaded screenshot. */
  @Get(":id/file")
  @RequirePermission("payment.read")
  @Header("cache-control", "private, max-age=300")
  async file(@Param("id", uuid) id: string, @Res() reply: FastifyReply) {
    const { file, body } = await this.proofs.file(id)
    void reply
      .header("content-type", file.contentType)
      .header(
        "content-disposition",
        `inline; filename="${file.filename.replace(/"/g, "")}"`
      )
      .header("x-content-type-options", "nosniff")
      .send(body)
  }

  /** Record the payment and receipt from this proof. */
  @Post(":id/confirm")
  @HttpCode(200)
  @RequirePermission("payment.record")
  @ZodResponse({ status: 200, type: PaymentProofDto })
  confirm(@Param("id", uuid) id: string, @Body() body: ConfirmPaymentProofDto) {
    return this.proofs.confirm(id, body as never)
  }

  @Post(":id/reject")
  @HttpCode(200)
  @RequirePermission("payment.record")
  @ZodResponse({ status: 200, type: PaymentProofDto })
  reject(@Param("id", uuid) id: string, @Body() body: RejectPaymentProofDto) {
    return this.proofs.reject(id, body.reason)
  }
}
