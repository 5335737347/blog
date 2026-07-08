import { NextResponse } from "next/server";
import type { ApiFailure, ApiSuccess } from "@/types/api";

export const API_ERROR = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof API_ERROR)[keyof typeof API_ERROR] | string;

function responseInit(statusOrInit?: number | ResponseInit): ResponseInit | undefined {
  if (statusOrInit === undefined) return undefined;
  if (typeof statusOrInit === "number") return { status: statusOrInit };
  return statusOrInit;
}

export function apiSuccess<T>(
  data: T,
  statusOrInit?: number | ResponseInit
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, responseInit(statusOrInit));
}

export function apiCreated<T>(data: T): NextResponse<ApiSuccess<T>> {
  return apiSuccess(data, 201);
}

export function apiError(
  message: string,
  status = 500,
  code: ApiErrorCode = API_ERROR.INTERNAL_ERROR
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

export function apiUnauthorized(message = "未登录") {
  return apiError(message, 401, API_ERROR.UNAUTHORIZED);
}

export function apiBadRequest(message: string) {
  return apiError(message, 400, API_ERROR.BAD_REQUEST);
}

export function apiNotFound(message = "资源不存在") {
  return apiError(message, 404, API_ERROR.NOT_FOUND);
}

export function apiConflict(message: string) {
  return apiError(message, 409, API_ERROR.CONFLICT);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
