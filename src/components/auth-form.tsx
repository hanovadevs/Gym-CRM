"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { SectionTitle } from "./ui/section-title";
export function AuthForm({
  mode = "sign-in",
}: {
  mode?: "sign-in" | "forgot" | "reset";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [visible, setVisible] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = setTimeout(
      () => setRetrySeconds((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [retrySeconds]);
  const title =
    mode === "sign-in"
      ? "Welcome back"
      : mode === "forgot"
        ? "Reset your password"
        : "Choose a new password";
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <a className="brand" href="/dashboard">
          <span className="brand-mark">J</span>Jym CRM
        </a>
        <h1>A better day at the gym starts here.</h1>
        <p>Members, payments and daily operations, in one calm workspace.</p>
      </aside>
      <main className="auth-main">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || retrySeconds > 0) return;
            setPending(true);
            setError("");
            setMessage("");
            const data = new FormData(event.currentTarget);
            try {
              if (mode === "sign-in") {
                const result = await authClient.signIn.email({
                  email: String(data.get("email")),
                  password: String(data.get("password")),
                  rememberMe: data.has("remember"),
                  fetchOptions: {
                    onError: ({ response }) => {
                      if (response.status === 429) {
                        const seconds =
                          Number(
                            response.headers.get("X-Retry-After") ??
                              response.headers.get("Retry-After"),
                          ) || 60;
                        setRetrySeconds(
                          Math.max(1, Math.min(300, Math.ceil(seconds))),
                        );
                      }
                    },
                  },
                });
                if (result.error)
                  setError(
                    result.error.status === 429
                      ? "Too many attempts. Please wait for the retry countdown."
                      : result.error.status === 403
                        ? "Sign-in was blocked for this app address. Contact your administrator."
                        : "Unable to sign in. Check your email and password.",
                  );
                else {
                  router.replace("/workspace");
                  router.refresh();
                }
              } else if (mode === "forgot") {
                const result = await authClient.requestPasswordReset({
                  email: String(data.get("email")),
                  redirectTo: window.location.origin + "/reset-password",
                });
                if (result.error)
                  setError(
                    "Password recovery is unavailable. Try again later.",
                  );
                else
                  setMessage(
                    "If an account exists, password reset instructions have been prepared. On this local installation, contact your administrator to retrieve them.",
                  );
              } else {
                const token = new URLSearchParams(window.location.search).get(
                  "token",
                );
                if (!token) {
                  setError(
                    "This reset link is missing or invalid. Request another link.",
                  );
                } else {
                  const result = await authClient.resetPassword({
                    newPassword: String(data.get("password")),
                    token,
                  });
                  if (result.error)
                    setError(
                      "This reset link is invalid or expired. Request another link.",
                    );
                  else setMessage("Password updated. You can now sign in.");
                }
              }
            } catch {
              setError(
                "Could not reach the server. Your inputs have been kept. Try again.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <h2 className="auth-title">{title}</h2>
          <p className="auth-subtitle">
            {mode === "sign-in"
              ? "Sign in to your gym workspace."
              : "Use the email associated with your staff account."}
          </p>
          <SectionTitle
            title="Account access"
            help="Staff accounts are created by your gym administrator. Public registration is disabled. Recovery messages are captured privately on the local server until mail delivery is configured."
          />
          {mode !== "reset" ? (
            <label className="field">
              Work email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
          ) : null}
          {mode !== "forgot" ? (
            <label className="field">
              {mode === "reset" ? "New password" : "Password"}
              <span className="password-field">
                <input
                  name="password"
                  aria-label={mode === "reset" ? "New password" : "Password"}
                  type={visible ? "text" : "password"}
                  autoComplete={
                    mode === "reset" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "reset" ? 12 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          ) : null}
          {mode === "sign-in" ? (
            <div className="auth-options">
              <label>
                <input type="checkbox" name="remember" defaultChecked />{" "}
                Remember me
              </label>
              <a href="/forgot-password">Forgot password?</a>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="form-message">
              {message}
            </p>
          ) : null}
          <button
            className="primary"
            disabled={pending || retrySeconds > 0}
            type="submit"
          >
            {pending
              ? "Please wait…"
              : retrySeconds > 0
                ? `Try again in ${retrySeconds}s`
                : mode === "sign-in"
                  ? "Sign in"
                  : mode === "forgot"
                    ? "Request reset instructions"
                    : "Update password"}
          </button>
          <p className="auth-footer">
            {mode === "sign-in" ? (
              "Need access? Contact your gym administrator."
            ) : (
              <a href="/sign-in">Back to sign in</a>
            )}
          </p>
        </form>
      </main>
    </div>
  );
}
