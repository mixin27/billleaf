import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { FilesModule } from "../files/files.module.js"
import { WorkspaceDataController } from "./workspace-data.controller.js"
import { WorkspaceDataService } from "./workspace-data.service.js"
import { WorkspaceProfileController } from "./workspace-profile.controller.js"
import { WorkspaceProfileRepository } from "./workspace-profile.repository.js"
import { WorkspaceProfileService } from "./workspace-profile.service.js"

@Module({
  imports: [IamModule, FilesModule],
  controllers: [WorkspaceProfileController, WorkspaceDataController],
  providers: [
    WorkspaceProfileRepository,
    WorkspaceProfileService,
    WorkspaceDataService,
  ],
  exports: [WorkspaceProfileService],
})
export class WorkspaceProfileModule {}
