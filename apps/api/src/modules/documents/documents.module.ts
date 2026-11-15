import { Module } from "@nestjs/common"

import { DocumentNumberingService } from "./document-numbering.service.js"

/** Shared building blocks for issued documents (quotes, invoices, receipts). */
@Module({
  providers: [DocumentNumberingService],
  exports: [DocumentNumberingService],
})
export class DocumentsModule {}
