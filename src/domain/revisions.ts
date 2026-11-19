import type { Project, Settings } from "../shared/schema";
import { formatRand } from "./money";

export interface RevisionState {
  used: number;
  included: number | null;
  extra: number;
  over: boolean;
  label: string;
}

/** Starter includes 1 round and Standard 2 consolidated rounds (both from settings); Custom is as quoted. */
export function revisionState(p: Pick<Project, "package" | "revisionRoundsUsed">, s: Settings): RevisionState {
  const included = p.package ? s.packages[p.package].revisionRounds : null;
  const used = p.revisionRoundsUsed;
  const extra = included != null ? Math.max(0, used - included) : 0;
  const over = extra > 0;
  let label: string;
  if (included == null) label = `${used} used (rounds as quoted)`;
  else if (over)
    label = `${used} of ${included} used: ${extra} extra. Quote at ${formatRand(s.hourlyRate)}/h before work starts.`;
  else label = `${used} of ${included} used`;
  return { used, included, extra, over, label };
}
