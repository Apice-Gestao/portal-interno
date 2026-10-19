// Lives apart from engine.ts so modules the engine imports (reports, files) avoid a circular import.
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
