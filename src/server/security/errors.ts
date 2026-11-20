export type AccessCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR";
export class AccessError extends Error {
  constructor(public readonly code: AccessCode) {
    super(
      {
        UNAUTHENTICATED: "Please sign in to continue.",
        FORBIDDEN:
          "Your account does not have access to this workspace or action.",
        NOT_FOUND: "Workspace or branch not found.",
        VALIDATION_ERROR: "Choose a valid workspace and branch.",
      }[code],
    );
    this.name = "AccessError";
  }
}
