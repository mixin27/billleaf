import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common"
import { syncPermissions } from "@workspace/db"

import { InjectDb, type Database } from "../../core/database/database.module.js"

/** Keeps the `permissions` table in sync with the code catalog on boot. */
@Injectable()
export class PermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSyncService.name)

  constructor(@InjectDb() private readonly db: Database) {}

  async onApplicationBootstrap() {
    const { synced } = await syncPermissions(this.db)
    this.logger.log(`Permission catalog synced (${synced} keys)`)
  }
}
