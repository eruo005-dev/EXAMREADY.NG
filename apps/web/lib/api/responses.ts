import type { ApiErrorCode } from '@examready/shared';
import { NextResponse } from 'next/server';


export const ok = <T>(data: T, init?: ResponseInit): Response =>
  NextResponse.json({ ok: true, data }, init);

export const err = (
  code: ApiErrorCode,
  message: string,
  status: number,
  extras?: { details?: unknown; retryAfterSeconds?: number; nextAvailableAt?: string },
): Response => {
  const body = {
    ok: false,
    error: {
      code,
      message,
      ...(extras?.details !== undefined ? { details: extras.details } : {}),
      ...(extras?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: extras.retryAfterSeconds }
        : {}),
      ...(extras?.nextAvailableAt !== undefined ? { nextAvailableAt: extras.nextAvailableAt } : {}),
    },
  };
  const headers: HeadersInit = {};
  if (extras?.retryAfterSeconds !== undefined) {
    headers['Retry-After'] = String(extras.retryAfterSeconds);
  }
  return NextResponse.json(body, { status, headers });
};
