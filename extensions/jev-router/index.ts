import {
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { registerRouter } from "./extension.ts";
import { pick } from "./picker.ts";

export default function jevRouter(pi: ExtensionAPI) {
  registerRouter(pi, {
    configPath: join(getAgentDir(), "jev-router.json"),
    pick,
  });
}
