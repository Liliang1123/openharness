import { pathToFileURL } from "node:url";
import { main } from "./productionEntrypoint";

export { main } from "./productionEntrypoint";

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
