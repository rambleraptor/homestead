/**
 * Injection seam for a short-lived system token: for server code that must
 * write somewhere its caller can't, after deciding itself that the write is
 * allowed (a household message lands in the recipient's inbox, which only they
 * and superusers may write).
 *
 * The server mints it — the same leased admin token a cron firing gets — and
 * core can't reach the db (the dependency direction is server → core), so the
 * server hands down an issuer at boot, like `setHouseholdDirectory`.
 */

export interface SystemToken {
  token: string;
  /** Release it once the work is done. */
  revoke: () => void;
}

export type SystemTokenIssuer = () => SystemToken;

let current: SystemTokenIssuer | null = null;

/** Install the server's issuer. `null` leaves no way to elevate. */
export function setSystemTokenIssuer(issuer: SystemTokenIssuer | null): void {
  current = issuer;
}

/** Run `work` with a system token, revoking it after. Throws when none can be issued. */
export async function withSystemToken<T>(work: (token: string) => Promise<T>): Promise<T> {
  if (!current) throw new Error('no system token issuer is installed');
  const issued = current();
  try {
    return await work(issued.token);
  } finally {
    issued.revoke();
  }
}
