export type LifeOsApiError = { error: string; issues?: { path: string; message: string }[] };
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error ?? "Life OS API error"), { status: response.status, body });
  return body as T;
}
export const lifeOsApi = {
  tasks: () => requestJson<{ items: unknown[]; nextCursor: string | null }>("/api/tasks"),
  reminders: () => requestJson<{ items: unknown[]; nextCursor: string | null }>("/api/reminders"),
  record: (command: unknown) => requestJson("/api/life-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) })
};
