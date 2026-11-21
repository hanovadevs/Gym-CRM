"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <h1>We couldn’t load this page</h1>
      <p>Please try again. If this continues, contact your workspace administrator.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
