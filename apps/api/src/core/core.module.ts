import { Module } from "@nestjs/common"
import { EventEmitterModule } from "@nestjs/event-emitter"

import { RedisModule } from "./cache/redis.module.js"
import { ConfigModule } from "./config/config.module.js"
import { DatabaseModule } from "./database/database.module.js"
import { LoggerModule } from "./logger/logger.module.js"
import { QueueModule } from "./queue/queue.module.js"
import { StorageModule } from "./storage/storage.module.js"
import { RequestContextModule } from "../common/context/request-context.module.js"

/** Infrastructure shared by the HTTP app and the worker. */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    StorageModule,
    RequestContextModule,
    EventEmitterModule.forRoot(),
  ],
})
export class CoreModule {}
