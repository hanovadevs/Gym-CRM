export class BusinessError extends Error {
  constructor(
    public readonly code:
      "CONFLICT" | "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
