import type {
  Folder,
  Prompt,
  CreateFolderDTO,
  UpdateFolderDTO,
  CreatePromptDTO,
  UpdatePromptDTO,
} from "./types";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "/api";
const OWNER_TOKEN_STORAGE_KEY = "imkdir-owner-token";

let authToken: string | null =
  typeof window !== "undefined"
    ? window.localStorage.getItem(OWNER_TOKEN_STORAGE_KEY)
    : null;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (typeof window === "undefined") return;

  if (token) {
    window.localStorage.setItem(OWNER_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
  }
};

export const getStoredAuthToken = () => authToken;

export const getAuthStatus = async (): Promise<{ isOwner: boolean }> =>
  request<{ isOwner: boolean }>("/auth/me", {}, "Failed to verify auth");

const parseErrorMessage = async (
  response: Response,
  fallbackMessage: string,
): Promise<string> => {
  try {
    const body = await response.json();
    if (body?.error && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // ignore parsing errors and use fallback
  }
  return fallbackMessage;
};

const request = async <T>(
  path: string,
  options: RequestInit = {},
  fallbackErrorMessage = "Request failed",
): Promise<T> => {
  const headers = new Headers(options.headers || {});
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response, fallbackErrorMessage);
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

// --- Folders API ---

export const getFolders = async (): Promise<Folder[]> => {
  return request<Folder[]>("/folders", {}, "Failed to fetch folders");
};

export const createFolder = async (data: CreateFolderDTO): Promise<Folder> => {
  return request<Folder>(
    "/folders",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to create folder",
  );
};

export const updateFolder = async (
  id: string,
  data: UpdateFolderDTO,
): Promise<Folder> => {
  return request<Folder>(
    `/folders/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update folder",
  );
};

export const deleteFolder = async (id: string): Promise<void> => {
  await request<unknown>(
    `/folders/${id}`,
    {
      method: "DELETE",
    },
    "Failed to delete folder",
  );
};

// --- Prompts API ---

export const getPrompts = async (
  folderId?: string | null,
): Promise<Prompt[]> => {
  // If a specific folderId is provided, fetch prompts for that folder.
  // We use 'uncategorized' for prompts with a null folderId.
  const url =
    folderId !== undefined
      ? `/folders/${folderId || "uncategorized"}/prompts`
      : "/prompts";

  return request<Prompt[]>(url, {}, "Failed to fetch prompts");
};

export const createPrompt = async (data: CreatePromptDTO): Promise<Prompt> => {
  return request<Prompt>(
    "/prompts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to create prompt",
  );
};

export const updatePrompt = async (
  id: string,
  data: UpdatePromptDTO,
): Promise<Prompt> => {
  return request<Prompt>(
    `/prompts/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update prompt",
  );
};

export const deletePrompt = async (id: string): Promise<void> => {
  await request<unknown>(
    `/prompts/${id}`,
    {
      method: "DELETE",
    },
    "Failed to delete prompt",
  );
};
