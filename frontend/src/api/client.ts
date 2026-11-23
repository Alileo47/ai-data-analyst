import type {
  AskRequest,
  AskResponse,
  UploadDatasetResponse,
} from "../types/data";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
  detail?: string | Array<{ msg?: string }>;
  message?: string;
}

function getApiUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configuredUrl) {
    throw new ApiClientError(
      "EXPO_PUBLIC_API_URL is not configured.",
      0,
      "CONFIGURATION_ERROR",
    );
  }
  return configuredUrl.replace(/\/+$/, "");
}

async function parseError(response: Response): Promise<ApiClientError> {
  let payload: ApiErrorPayload | null = null;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }

  let message =
    payload?.error?.message ??
    payload?.message ??
    (typeof payload?.detail === "string" ? payload.detail : undefined);

  if (!message && Array.isArray(payload?.detail)) {
    message = payload.detail
      .map((item) => item.msg)
      .filter((item): item is string => Boolean(item))
      .join(", ");
  }

  return new ApiClientError(
    message ?? `Request failed with status ${response.status}.`,
    response.status,
    payload?.error?.code,
  );
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await parseError(response);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiClientError(
      "The server returned an invalid JSON response.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiClientError(
      "Could not reach the API server. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }
  return readJson<T>(response);
}

export interface UploadDatasetFile {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface SearchDatasetRequest {
  session_id: string;
  query: string;
  column?: string;
}

export interface SearchDatasetResponse {
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  is_empty: boolean;
  truncated?: boolean;
}

export async function uploadDataset(
  file: UploadDatasetFile,
): Promise<UploadDatasetResponse> {
  const formData = new FormData();

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    let blob: Blob;
    try {
      const response = await fetch(file.uri);
      blob = await response.blob();
    } catch {
      throw new ApiClientError(
        "The selected file could not be read.",
        0,
        "FILE_READ_ERROR",
      );
    }

    const uploadFile =
      typeof File === "function"
        ? new File([blob], file.name, {
            type: file.mimeType ?? blob.type ?? "application/octet-stream",
          })
        : blob;
    formData.append("file", uploadFile, file.name);
  } else {
    formData.append(
      "file",
      {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? "application/octet-stream",
      } as unknown as Blob,
    );
  }

  return requestJson<UploadDatasetResponse>(`${getApiUrl()}/upload`, {
    method: "POST",
    body: formData,
  });
}

export async function askQuestion(
  request: AskRequest,
): Promise<AskResponse> {
  return requestJson<AskResponse>(`${getApiUrl()}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function searchDataset(
  request: SearchDatasetRequest,
): Promise<SearchDatasetResponse> {
  return requestJson<SearchDatasetResponse>(`${getApiUrl()}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}
