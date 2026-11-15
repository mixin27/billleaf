import "reflect-metadata"

import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import type { Database } from "@workspace/db"
import { user } from "@workspace/db"
import { eq } from "drizzle-orm"

import { createApp } from "../../src/bootstrap.js"
import { DB } from "../../src/core/database/database.module.js"

type Json = Record<string, unknown> | unknown[] | undefined

export interface TestApp {
  app: NestFastifyApplication
  db: Database
  close: () => Promise<void>
}

export async function startApp(): Promise<TestApp> {
  const { app } = await createApp()
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return { app, db: app.get<Database>(DB), close: () => app.close() }
}

const unique = () => Math.random().toString(36).slice(2, 8)

/** An HTTP client that keeps Better Auth's session cookie, like a browser. */
export class Client {
  private cookies = new Map<string, string>()
  workspaceId?: string

  constructor(private readonly t: TestApp) {}

  async request(
    method: string,
    url: string,
    body?: Json,
    headers: Record<string, string> = {}
  ) {
    const res = await this.t.app.inject({
      method: method as "GET",
      url,
      headers: {
        origin: "http://localhost:3000",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookies.size
          ? {
              cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
            }
          : {}),
        ...(this.workspaceId ? { "x-workspace-id": this.workspaceId } : {}),
        ...headers,
      },
      payload: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = res.headers["set-cookie"]
    for (const c of (Array.isArray(setCookie)
      ? setCookie
      : setCookie
        ? [setCookie]
        : []) as string[]) {
      const [pair] = c.split(";")
      const [k, ...v] = pair!.split("=")
      this.cookies.set(k!.trim(), v.join("="))
    }
    let json: any = undefined
    try {
      json = res.body ? JSON.parse(res.body) : undefined
    } catch {
      json = res.body
    }
    return { status: res.statusCode, body: json }
  }

  /** Headers this client would send (for raw `inject` calls). */
  headers(): Record<string, string> {
    return {
      origin: "http://localhost:3000",
      ...(this.cookies.size
        ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
        : {}),
      ...(this.workspaceId ? { "x-workspace-id": this.workspaceId } : {}),
    }
  }

  get = (url: string) => this.request("GET", url)
  post = (url: string, body: Json = {}) => this.request("POST", url, body)
  patch = (url: string, body: Json) => this.request("PATCH", url, body)
  put = (url: string, body: Json) => this.request("PUT", url, body)
  del = (url: string) => this.request("DELETE", url)

  /** Sign up, mark the email verified (no inbox in tests), sign in. */
  async signUp(name = "Test User") {
    const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${unique()}@example.test`
    const password = "integration-password-123"
    const up = await this.post("/api/auth/sign-up/email", {
      name,
      email,
      password,
    })
    if (up.status !== 200)
      throw new Error(`sign-up failed: ${JSON.stringify(up.body)}`)
    await this.t.db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, email))
    const signIn = await this.post("/api/auth/sign-in/email", {
      email,
      password,
    })
    if (signIn.status !== 200)
      throw new Error(`sign-in failed: ${JSON.stringify(signIn.body)}`)
    return { email }
  }

  async createWorkspace(name = "Studio") {
    const res = await this.post("/api/auth/organization/create", {
      name,
      slug: `${name.toLowerCase()}-${unique()}`,
    })
    if (res.status !== 200)
      throw new Error(`create workspace failed: ${JSON.stringify(res.body)}`)
    this.workspaceId = res.body.id
    return res.body as { id: string; slug: string }
  }
}
