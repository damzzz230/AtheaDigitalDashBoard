import type { Config } from "@netlify/functions";
import { handleLogout } from "../lib/handlers";

export default async (req: Request) => handleLogout(req);

export const config: Config = { path: "/api/logout", method: ["POST"] };
