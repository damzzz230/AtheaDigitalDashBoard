import type { Config, Context } from "@netlify/functions";
import { productionDeps } from "../lib/deps";
import { handleLogin } from "../lib/handlers";

export default async (req: Request, context: Context) => handleLogin(req, productionDeps(), context.ip ?? "unknown");

export const config: Config = { path: "/api/login", method: ["POST"] };
