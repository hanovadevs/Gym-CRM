"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <h1>We couldn’t load this page</h1>
      <p>Please check the local server configuration and try again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
