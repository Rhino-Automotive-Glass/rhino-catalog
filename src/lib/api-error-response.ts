import { NextResponse } from "next/server";

type ApiFailureOptions = {
  context: string;
  error: unknown;
  status?: number;
  userMessage: string;
  log?: Record<string, unknown>;
  code?: string;
  details?: unknown;
  hint?: string | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown error";
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function getErrorDetails(error: unknown): unknown {
  if (typeof error === "object" && error && "details" in error) {
    return (error as { details: unknown }).details;
  }
  return undefined;
}

function getErrorHint(error: unknown): string | null | undefined {
  if (typeof error === "object" && error && "hint" in error) {
    const hint = (error as { hint: unknown }).hint;
    return typeof hint === "string" || hint === null ? hint : undefined;
  }
  return undefined;
}

export function createApiDebugId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function apiFailure({
  context,
  error,
  status = 500,
  userMessage,
  log,
  code,
  details,
  hint,
}: ApiFailureOptions) {
  const debugId = createApiDebugId(context.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
  const errorMessage = getErrorMessage(error);
  const errorCode = code ?? getErrorCode(error);
  const errorDetails = details ?? getErrorDetails(error);
  const errorHint = hint ?? getErrorHint(error);

  console.error(context, {
    debugId,
    status,
    code: errorCode,
    details: errorDetails,
    hint: errorHint,
    message: errorMessage,
    ...log,
  });

  return NextResponse.json(
    {
      error: errorMessage,
      userMessage,
      debugId,
      code: errorCode,
      details: errorDetails,
      hint: errorHint,
    },
    { status }
  );
}
