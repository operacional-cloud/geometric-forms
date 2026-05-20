// Erros de domínio padronizados pras route handlers.

export class AppError extends Error {
  status: number;
  code: string;
  details?: any;
  constructor(message: string, opts: { status?: number; code?: string; details?: any } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = opts.status ?? 500;
    this.code = opts.code ?? 'app_error';
    this.details = opts.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', details?: any) {
    super(message, { status: 400, code: 'validation_error', details });
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(message, { status: 404, code: 'not_found' });
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') {
    super(message, { status: 401, code: 'unauthorized' });
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, { status: 403, code: 'forbidden' });
  }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflito', details?: any) {
    super(message, { status: 409, code: 'conflict', details });
  }
}

/**
 * Wrapper pra route handlers — converte erros em Response JSON padronizado.
 * Uso:
 *   export const POST = withErrorHandler(async (req) => { ... });
 */
export function withErrorHandler(handler: (req: Request, ctx?: any) => Promise<Response>) {
  return async (req: Request, ctx?: any): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return Response.json({
          success: false,
          error: { code: 'validation_error', message: 'Dados inválidos', details: err.issues },
        }, { status: 400 });
      }
      if (err instanceof AppError) {
        return Response.json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          },
        }, { status: err.status });
      }
      console.error('[unhandled]', err);
      return Response.json({
        success: false,
        error: { code: 'internal_error', message: 'Erro interno do servidor' },
      }, { status: 500 });
    }
  };
}
