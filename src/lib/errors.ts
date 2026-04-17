export class AppError extends Error {
  public readonly statusCode: number
  public readonly errors?: Array<{ field?: string; message: string }>

  constructor(
    statusCode: number,
    message: string,
    errors?: Array<{ field?: string; message: string }>
  ) {
    super(message)
    this.statusCode = statusCode
    this.errors = errors
  }
}

export class ConflictError extends AppError {
  constructor(message: string, field = 'revision') {
    super(409, message, [{ field, message: 'Expected latest revision before update' }])
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message)
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, errors?: Array<{ field?: string; message: string }>) {
    super(400, message, errors)
  }
}
