import { createServer } from "./server";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const app = await createServer();

await app.listen({ port, host });
console.log(`agent-runtime listening on http://${host}:${port}`);
