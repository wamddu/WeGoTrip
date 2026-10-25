export interface PollDeadlineInput {
  enabled: boolean;
  date: string;
  time: string;
}

export const MAX_POLL_DEADLINE = Date.parse("2038-01-19T03:14:07Z");
const pad = (value: number) => String(value).padStart(2, "0");

export function localDeadlineFields(value: Date) {
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export function parseLocalDeadline(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error(
      "마감 날짜와 시간을 YYYY-MM-DD, HH:mm 형식으로 입력해 주세요.",
    );
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute);
  if (
    year < 1970 ||
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hour ||
    value.getMinutes() !== minute
  )
    throw new Error("올바른 마감 날짜와 시간을 입력해 주세요.");
  if (value.getTime() > MAX_POLL_DEADLINE)
    throw new Error("마감 날짜는 2038년 1월 19일 이전으로 지정해 주세요.");
  return value.toISOString();
}

/** Use elapsed monotonic time from a server sample, independent of the device's wall clock. */
export function remainingPollMs(
  closesAt: string,
  serverNow: string,
  elapsedMs: number,
) {
  return Math.max(
    0,
    Date.parse(closesAt) - Date.parse(serverNow) - Math.max(0, elapsedMs),
  );
}

export function formatPollRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (!seconds) return "마감됐어요";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (days) return `${days}일 ${hours}시간 남음`;
  if (hours) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes ? `${minutes}분 ` : ""}${rest}초 남음`;
}
