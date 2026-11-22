export class BusinessError extends Error {
  constructor(
    public readonly code:
      | "CONFLICT"
      | "VALIDATION_ERROR"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "ACCESS_DENIED",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
