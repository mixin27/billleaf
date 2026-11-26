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
  listPaymentsQuerySchema,
  paymentListSchema,
  paymentSchema,
  recordPaymentSchema,
  refundPaymentSchema,
  voidPaymentSchema,
  sendDocumentSchema,
} from "@workspace/contracts"
import type { FastifyReply } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { PaymentsService } from "./payments.service.js"

class PaymentDto extends createZodDto(paymentSchema) {}
class PaymentListDto extends createZodDto(paymentListSchema) {}
class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
class RefundPaymentDto extends createZodDto(refundPaymentSchema) {}
class VoidPaymentDto extends createZodDto(voidPaymentSchema) {}
class ListPaymentsQueryDto extends createZodDto(listPaymentsQuerySchema) {}
class SendReceiptDto extends createZodDto(sendDocumentSchema) {}

const uuid = new ParseUUIDPipe()

@ApiTags("payments")
@Controller({ version: "1" })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("payments")
  @RequirePermission("payment.read")
  @ZodResponse({ status: 200, type: PaymentListDto })
  list(@Query() query: ListPaymentsQueryDto) {
    return this.payments.list(query as never)
  }

  @Get("payments/:id")
  @RequirePermission("payment.read")
  @ZodResponse({ status: 200, type: PaymentDto })
  get(@Param("id", uuid) id: string) {
    return this.payments.get(id)
  }

  @Post("invoices/:invoiceId/payments")
  @RequirePermission("payment.record")
  @ZodResponse({ status: 201, type: PaymentDto })
  record(
    @Param("invoiceId", uuid) invoiceId: string,
    @Body() body: RecordPaymentDto
  ) {
    return this.payments.record(invoiceId, body as never)
  }

  @Post("payments/:id/refund")
  @HttpCode(200)
  @RequirePermission("payment.refund")
  @ZodResponse({ status: 200, type: PaymentDto })
  refund(@Param("id", uuid) id: string, @Body() body: RefundPaymentDto) {
    return this.payments.refund(id, body.reason)
  }

  @Post("payments/:id/void")
  @HttpCode(200)
  @RequirePermission("payment.refund")
  @ZodResponse({ status: 200, type: PaymentDto })
  void(@Param("id", uuid) id: string, @Body() body: VoidPaymentDto) {
    return this.payments.void(id, body.reason)
  }

  @Get("payments/:id/receipt/pdf")
  @RequirePermission("payment.read")
  @Header("cache-control", "private, no-store")
  async receiptPdf(@Param("id", uuid) id: string, @Res() reply: FastifyReply) {
    const { filename, content } = await this.payments.receiptPdf(id)
    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `inline; filename="${filename}"`)
      .send(content)
  }

  @Post("payments/:id/receipt/send")
  @HttpCode(200)
  @RequirePermission("payment.record")
  @ZodResponse({ status: 200, type: PaymentDto })
  sendReceipt(@Param("id", uuid) id: string, @Body() body: SendReceiptDto) {
    return this.payments.sendReceipt(id, body as never)
  }
}
