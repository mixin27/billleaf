import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { FilesModule } from "../files/files.module.js"
import { WorkspaceProfileController } from "./workspace-profile.controller.js"
import { WorkspaceProfileRepository } from "./workspace-profile.repository.js"
import { WorkspaceProfileService } from "./workspace-profile.service.js"

@Module({
  imports: [IamModule, FilesModule],
  controllers: [WorkspaceProfileController],
  providers: [WorkspaceProfileRepository, WorkspaceProfileService],
  exports: [WorkspaceProfileService],
})
export class WorkspaceProfileModule {}
