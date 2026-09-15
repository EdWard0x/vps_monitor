import { FieldError } from '@/types';
import { BusinessCodeMessages } from '@/types/error';

export class AppError extends Error {
  public readonly status: number;
  public readonly code: number;
  public readonly requestId?: string;
  public readonly errors?: FieldError[];

  constructor(status: number, code: number, message: string, requestId?: string, errors?: FieldError[]) {
    super(message || BusinessCodeMessages[code] || '未知错误');
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.errors = errors;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function getErrorMessage(err: unknown): string {
  if (isAppError(err)) {
    if (err.errors && err.errors.length > 0) {
      const first = err.errors[0];
      return `${first.field}: ${first.reason}${first.limit ? ` (${first.limit})` : ''}`;
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '网络连接异常，请稍后重试';
}
