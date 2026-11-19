import type { Config } from "@netlify/functions";
import { productionDeps } from "../lib/deps";
import { handleRecords } from "../lib/handlers";

export default async (req: Request) => handleRecords(req, productionDeps());

export const config: Config = { path: "/api/records", method: ["POST"] };
