/** Shared driver configuration for runtime and reviewed migration commands. */
export function databaseConnection(url, caBase64) {
  const parsed = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
    parsed.hostname,
  );
  if (local) return { connectionString: url };
  // pg connection-string SSL parameters replace explicit TLS options. Normalize
  // them so a copied sslmode=require cannot discard the trusted CA or verifier.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    parsed.searchParams.delete(key);
  let ca;
  if (caBase64) {
    ca = Buffer.from(caBase64, "base64").toString("utf8");
    if (!ca.includes("-----BEGIN CERTIFICATE-----"))
      throw Error("Invalid database CA configuration");
  }
  return {
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}
