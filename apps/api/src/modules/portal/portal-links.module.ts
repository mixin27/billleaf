import { Module } from "@nestjs/common"

import { PortalLinksService } from "./portal-links.service.js"

/** Kept separate from PortalModule so document modules can use it without a cycle. */
@Module({ providers: [PortalLinksService], exports: [PortalLinksService] })
export class PortalLinksModule {}
