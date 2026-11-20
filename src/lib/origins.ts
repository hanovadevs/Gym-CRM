/** Explicit same-port loopback aliases are only enabled for local development. */
export function trustedOrigins(baseURL: string, allowLocalAliases = false) {
  const base = new URL(baseURL);
  const origins = [base.origin];
  if (allowLocalAliases && ["localhost", "127.0.0.1"].includes(base.hostname)) {
    base.hostname = base.hostname === "localhost" ? "127.0.0.1" : "localhost";
    origins.push(base.origin);
  }
  return origins;
}
