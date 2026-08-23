export type DomainResolutionCode =
  | "missing_goal"
  | "ambiguous_goal"
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

export function isRecoverableResolutionError(
  error: unknown
): error is DomainResolutionError {
  if (!(error instanceof DomainResolutionError)) {
    return false;
  }

  switch (error.code) {
    case "missing_goal":
    case "ambiguous_goal":
      return true;
    case "identity_conflict":
      return false;
  }
}
