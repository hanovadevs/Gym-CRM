import { Dashboard } from "@/components/dashboard";
import { readEnvironment } from "@/lib/env";
export const dynamic = "force-dynamic";
export default function Page() {
  const env = readEnvironment(process.env);
  return env.DEMO_MODE ? (
    <Dashboard />
  ) : (
    <main className="setup">
      <h1>Jym CRM</h1>
      <p>
        The dashboard preview is disabled. Live operations are not available
        yet.
      </p>
      <a href="/sign-in">Sign in to your staff account</a>
    </main>
  );
}
