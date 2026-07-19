const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
]);

export function isZipContentType(contentType?: string | null): boolean {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType ? ZIP_CONTENT_TYPES.has(mediaType) : false;
}

function messageFromObject(payload: Record<string, unknown>): string | null {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail;
  }
  if (Array.isArray(payload.detail)) {
    const messages = payload.detail
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const message = (item as Record<string, unknown>).msg;
        return typeof message === "string" ? message : null;
      })
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) return messages.join("; ");
  }
  return null;
}

/** Extract a backend error message even when Axios returned it as a Blob. */
export async function readDownloadErrorMessage(
  payload: unknown,
): Promise<string | null> {
  if (payload instanceof Blob) {
    try {
      return readDownloadErrorMessage(await payload.text());
    } catch {
      return null;
    }
  }
  if (payload instanceof ArrayBuffer) {
    return readDownloadErrorMessage(new TextDecoder().decode(payload));
  }
  if (payload && typeof payload === "object") {
    return messageFromObject(payload as Record<string, unknown>);
  }
  if (typeof payload !== "string") return null;

  const text = payload.trim();
  if (!text) return null;
  try {
    return (
      (await readDownloadErrorMessage(JSON.parse(text))) ||
      text
    );
  } catch {
    return text;
  }
}

export async function readFetchDownloadError(
  response: Response,
): Promise<string> {
  let message: string | null = null;
  try {
    message = await readDownloadErrorMessage(await response.text());
  } catch {
    // Fall back to status/content-type context below.
  }

  if (message) return message;
  if (!response.ok) return `HTTP ${response.status}`;

  const contentType = response.headers.get("Content-Type");
  return `Expected a ZIP response, received ${contentType || "an unknown content type"}`;
}
