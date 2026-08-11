import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

type Tab = "login" | "signup";

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono-data text-[11px] font-medium uppercase tracking-[0.15em] text-outline">
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded border-0 border-b border-outline-variant bg-surface-container px-3 py-2.5 font-body text-sm text-on-surface outline-none transition-colors placeholder:text-outline/60 focus:border-primary-fixed-dim focus:bg-surface-container-high focus:shadow-[0_1px_0_0_rgba(0,219,231,0.6)]"
      />
    </label>
  );
}

export default function AuthScreen() {
  const { signup, login, continueAsGuest } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = tab === "signup" ? signup(name, email, password) : login(email, password);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-obsidian px-4 py-12">
      {/* Tactical background glow -- cyan/red radial per the design system's obsidian base */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 900px 600px at 15% -10%, rgba(0,219,231,0.10), transparent 60%), radial-gradient(ellipse 900px 600px at 100% 110%, rgba(255,82,92,0.08), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #80808020 1px, transparent 1px), linear-gradient(to bottom, #80808020 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface">
            TRACK<span className="text-secondary-container">PULSE</span>
          </span>
          <span className="font-mono-data text-[11px] uppercase tracking-[0.3em] text-outline">
            AI Pit Wall Copilot
          </span>
        </div>

        <div className="glass-panel tactical-border w-full rounded-lg p-6">
          <div className="mb-5 flex gap-1 rounded border border-surface-container-high bg-surface-container-low p-1">
            {(["login", "signup"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={`flex-1 rounded py-2 font-mono-data text-xs font-semibold uppercase tracking-widest transition-colors ${
                  tab === t
                    ? "bg-primary-fixed-dim/15 text-primary-fixed-dim"
                    : "text-outline hover:text-on-surface"
                }`}
              >
                {t === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {tab === "signup" && (
              <Field label="Name" value={name} onChange={setName} placeholder="Lead Strategist" autoFocus />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@team.com"
              autoFocus={tab === "login"}
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />

            {error && (
              <p className="rounded border border-secondary-container/40 bg-secondary-container/10 px-3 py-2 text-xs text-secondary">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-1 rounded bg-primary-fixed-dim/15 border border-primary-fixed-dim py-2.5 font-headline text-sm font-bold uppercase tracking-widest text-primary-fixed-dim transition-all hover:bg-primary-fixed-dim/25"
            >
              {tab === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-outline-variant/50" />
            <span className="font-mono-data text-[10px] uppercase tracking-widest text-outline">or</span>
            <span className="h-px flex-1 bg-outline-variant/50" />
          </div>

          <button
            type="button"
            onClick={continueAsGuest}
            className="w-full rounded border border-outline-variant bg-surface-container py-2.5 font-mono-data text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:border-outline hover:text-on-surface"
          >
            Continue as guest
          </button>
        </div>

        <p className="text-center text-[11px] uppercase tracking-widest text-outline/70">
          Real vision, weather and race-history data underneath.
        </p>
      </div>
    </div>
  );
}
