import type { EffectiveAgenda } from "./route";

export function participationLabel(agenda: EffectiveAgenda): string {
  const joined = agenda.startTime !== agenda.originalStartTime;
  const left = agenda.endTime !== agenda.originalEndTime;
  return [joined && "중간 합류", left && "중간 이탈"]
    .filter(Boolean)
    .join(" · ");
}
