export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "oversize" | "upstream"
  ) {
    super(message);
  }
}

export async function boundedJson<T>(url: URL, maximumBytes: number, revalidate: number): Promise<T> {
  const controller = new AbortController();
  // Cold serverless connections to the public forecast endpoint can exceed
  // eight seconds even when the source responds successfully. Keep the guard
  // well below the hosting limit while allowing a measured cold fetch.
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate }
    });
    if (!response.ok) throw new UpstreamError(`Upstream returned ${response.status}`, "upstream");
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > maximumBytes) throw new UpstreamError("Response exceeded the size limit", "oversize");
    const text = await response.text();
    if (Buffer.byteLength(text) > maximumBytes) throw new UpstreamError("Response exceeded the size limit", "oversize");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new UpstreamError("Upstream request timed out", "timeout");
    }
    throw new UpstreamError("Upstream request failed", "upstream");
  } finally {
    clearTimeout(timer);
  }
}
