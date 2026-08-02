export type DomainResolutionCode =
  | "missing_goal"
  | "ambiguous_goal"
  | "missing_ability"
  | "ambiguous_ability"
  | "identity_conflict";

export class DomainResolutionError extends Error {
  constructor(
    public readonly code: DomainResolutionCode,
    message: string
  ) {
    super(message);
    this.name = "DomainResolutionError";
  }
}

export function isDomainResolutionError(error: unknown): error is DomainResolutionError {
  return error instanceof DomainResolutionError;
}
