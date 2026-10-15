/** Never show raw HTML, SQL details or parser exceptions in the interface. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function readApiResponse<T>(response: Response): Promise<T> {
  const fallback =
    response.status === 503
      ? "服务暂时繁忙，请稍后重试。"
      : response.ok
        ? "服务器返回了无效响应，请稍后重试。"
        : `请求失败（HTTP ${response.status}），请稍后重试。`;
  let body: string;
  try {
    body = await response.text();
  } catch {
    throw new ApiError(fallback, response.status);
  }
  if (!body.trim())
    throw new ApiError(
      response.ok ? "服务器返回了空响应，请稍后重试。" : fallback,
      response.status,
    );
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new ApiError(fallback, response.status);
  }
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : fallback;
    throw new ApiError(message, response.status);
  }
  return data as T;
}
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("无法连接服务，请检查服务是否已启动。输入仍保留。", 0);
  }
  return readApiResponse<T>(response);
}

export function requestToken() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
