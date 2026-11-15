# Business modules

One folder per feature (clients, quotes, invoices, …). Follow
`docs/engineering/adding-a-module.md` or run the `new-api-module` skill.

```
modules/<feature>/
  <feature>.module.ts
  <feature>.controller.ts   HTTP + validation + @RequirePermission
  <feature>.service.ts      business rules, transactions, events, audit
  <feature>.repository.ts   Drizzle only; ALWAYS filter by ctx.workspaceId
  <feature>.dto.ts          createZodDto(...) from @workspace/contracts schemas
  <feature>.service.spec.ts
```
