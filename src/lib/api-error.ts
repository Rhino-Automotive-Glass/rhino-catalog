export type ApiErrorPayload = {
  error?: string;
  userMessage?: string;
  debugId?: string;
  code?: string;
  details?: unknown;
  hint?: string | null;
};

export class ApiRequestError extends Error {
  debugId?: string;
  status: number;
  userMessage: string;
  payload?: ApiErrorPayload;

  constructor(message: string, options: { status: number; payload?: ApiErrorPayload }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.payload = options.payload;
    this.debugId = options.payload?.debugId;
    this.userMessage = options.payload?.userMessage ?? message;
  }
}

export async function readApiError(
  response: Response,
  fallbackMessage: string
): Promise<ApiRequestError> {
  let payload: ApiErrorPayload | undefined;

  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    payload = undefined;
  }

  const message = payload?.error ?? payload?.userMessage ?? fallbackMessage;

  return new ApiRequestError(message, {
    status: response.status,
    payload,
  });
}

export function getApiErrorDescription(error: unknown, fallback = "Please try again."): string {
  if (error instanceof ApiRequestError) {
    const parts = [error.userMessage || error.message];
    if (error.debugId) parts.push(`Debug ID: ${error.debugId}`);
    return parts.join(" ");
  }

  return error instanceof Error ? error.message : fallback;
}

export function logAdminActionError(
  action: string,
  error: unknown,
  context?: Record<string, unknown>
) {
  if (error instanceof ApiRequestError) {
    console.error(action, {
      debugId: error.debugId,
      status: error.status,
      message: error.message,
      userMessage: error.userMessage,
      payload: error.payload,
      ...context,
    });
    return;
  }

  console.error(action, {
    message: error instanceof Error ? error.message : "Unknown error",
    ...context,
  });
}
