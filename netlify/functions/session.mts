import type { Config } from "@netlify/functions";
import { productionDeps } from "../lib/deps";
import { handleSession } from "../lib/handlers";

export default async (req: Request) => handleSession(req, productionDeps());

export const config: Config = { path: "/api/session", method: ["GET"] };
