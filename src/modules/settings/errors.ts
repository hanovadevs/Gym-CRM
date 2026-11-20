export class BusinessError extends Error {
  constructor(
    public readonly code:
      "CONFLICT" | "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
