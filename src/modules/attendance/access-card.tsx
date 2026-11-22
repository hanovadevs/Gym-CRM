"use client";
import { useState } from "react";
export function AccessCardDownload({
  organizationId,
  memberId,
  memberCode,
  disabled,
}: {
  organizationId: string;
  memberId: string;
  memberCode: string;
  disabled: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <button
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const r = await fetch(`/api/members/${memberId}/access-code`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ organizationId }),
            });
            if (!r.ok) {
              const result = await r.json();
              throw Error(
                result.error?.message ?? "Could not generate access QR.",
              );
            }
            const url = URL.createObjectURL(await r.blob());
            const a = document.createElement("a");
            a.href = url;
            a.download =
              memberCode.replace(/[^A-Za-z0-9_-]/g, "_") + "-access.svg";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Access QR unavailable. Try again.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Preparing QR…" : "Download access QR"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
