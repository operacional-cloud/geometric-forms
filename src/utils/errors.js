// Erros de domínio + middleware de erro padronizado para Express.

export class AppError extends Error {
  constructor(message, { status = 500, code = 'app_error', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', details) {
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
  constructor(message = 'Conflito', details) {
    super(message, { status: 409, code: 'conflict', details });
  }
}

// Middleware Express. Padroniza toda resposta de erro como { success:false, error:{...} }.
export function errorHandler(err, _req, res, _next) {
  // zod
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'validation_error',
        message: 'Dados inválidos',
        details: err.issues,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  console.log(JSON.stringify({
    level: 'error',
    msg: 'unhandled_error',
    error: err?.message,
    stack: err?.stack,
  }));

  return res.status(500).json({
    success: false,
    error: { code: 'internal_error', message: 'Erro interno do servidor' },
  });
}
