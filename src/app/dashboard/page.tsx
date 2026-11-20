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
        The dashboard preview is disabled. Staff authentication and live
        operations are not available yet.
      </p>
    </main>
  );
}
