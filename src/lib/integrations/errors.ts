/** Normalised integration failure. `permanent` = do not retry (bad request, revoked auth). */
export class IntegrationError extends Error {
  constructor(public provider: string, message: string, public permanent = false, public retryAfterSec?: number) {
    super(`${provider}: ${message}`);
    this.name = "IntegrationError";
  }
}
