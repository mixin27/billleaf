import { randomUUID } from "node:crypto"

import { Module } from "@nestjs/common"
import { LoggerModule as PinoLoggerModule } from "nestjs-pino"

import { ConfigModule } from "../config/config.module.js"
import { ENV, type Env } from "../config/env.js"

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req) =>
            (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
          ],
          transport:
            env.NODE_ENV === "development"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
          autoLogging: {
            ignore: (req) => req.url?.startsWith("/health") ?? false,
          },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
