export { AccessError } from "@/domain/policy";

export class AppError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Sessão expirada. Entre novamente.") {
    super(message, 401);
  }
}

/** Código do PostgreSQL para violação de unicidade. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = (err as { cause?: unknown })?.cause ?? err;
  const code = (e as { code?: string })?.code;
  if (code !== "23505") return false;
  if (!constraint) return true;
  const c = (e as { constraint_name?: string; constraint?: string });
  return (c.constraint_name ?? c.constraint ?? "").includes(constraint);
}
