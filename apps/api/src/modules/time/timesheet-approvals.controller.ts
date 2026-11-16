import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  listTimesheetApprovalsQuerySchema,
  rejectTimesheetSchema,
  reviewTimesheetSchema,
  timesheetApprovalListSchema,
  timesheetApprovalSchema,
  timesheetWeekSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import {
  RequirePermission,
  RequireWorkspace,
} from "../../common/decorators/require-permission.decorator.js"
import { TimesheetApprovalsService } from "./timesheet-approvals.service.js"

class ListQueryDto extends createZodDto(listTimesheetApprovalsQuerySchema) {}
class ApprovalListDto extends createZodDto(timesheetApprovalListSchema) {}
class ApprovalDto extends createZodDto(timesheetApprovalSchema) {}
class WeekDto extends createZodDto(timesheetWeekSchema) {}
class ReviewDto extends createZodDto(reviewTimesheetSchema) {}
class RejectDto extends createZodDto(rejectTimesheetSchema) {}

@ApiTags("time")
@Controller({ path: "timesheet-approvals", version: "1" })
export class TimesheetApprovalsController {
  constructor(private readonly approvals: TimesheetApprovalsService) {}

  /** Approvers see every member's weeks; others see their own. */
  @Get()
  @RequireWorkspace()
  @ZodResponse({ status: 200, type: ApprovalListDto })
  list(@Query() q: ListQueryDto) {
    return this.approvals.list(q)
  }

  @Post("submit")
  @RequireWorkspace()
  @ZodResponse({ status: 201, type: ApprovalDto })
  submit(@Body() body: WeekDto) {
    return this.approvals.submit(body.week)
  }

  @Post("withdraw")
  @HttpCode(204)
  @RequireWorkspace()
  async withdraw(@Body() body: WeekDto) {
    await this.approvals.withdraw(body.week)
  }

  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermission("time.approve")
  @ZodResponse({ status: 200, type: ApprovalDto })
  approve(@Param("id", ParseUUIDPipe) id: string, @Body() body: ReviewDto) {
    return this.approvals.approve(id, body.note)
  }

  /** Send back a submitted week, or reopen an approved one. */
  @Post(":id/reject")
  @HttpCode(200)
  @RequirePermission("time.approve")
  @ZodResponse({ status: 200, type: ApprovalDto })
  reject(@Param("id", ParseUUIDPipe) id: string, @Body() body: RejectDto) {
    return this.approvals.reject(id, body.note)
  }
}
