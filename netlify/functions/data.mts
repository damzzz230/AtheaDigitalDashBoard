import type { Config } from "@netlify/functions";
import { productionDeps } from "../lib/deps";
import { handleData } from "../lib/handlers";

export default async (req: Request) => handleData(req, productionDeps());

export const config: Config = { path: "/api/data", method: ["GET"] };
