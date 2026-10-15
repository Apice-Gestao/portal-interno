import { createApplication } from "./bootstrap.js";
import { PortalService } from "./portal/portal.service.js";
const app = await createApplication();
app.enableShutdownHooks();
const port = Number(process.env.PORTAL_API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORTAL_API_PORT inválida.");
await app.listen(port, "127.0.0.1");
console.info(
  `Ápice API local: http://127.0.0.1:${port}/api/v1 · Swagger: /api/docs · persistência: ${app.get(PortalService).storageMode}`,
);
