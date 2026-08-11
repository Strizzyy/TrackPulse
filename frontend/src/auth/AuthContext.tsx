import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface StrategistProfile {
  name: string;
  email: string;
}

interface StoredAccount extends StrategistProfile {
  password: string;
}

interface AuthState {
  user: StrategistProfile | null;
  isGuest: boolean;
  ready: boolean;
}

interface AuthContextValue extends AuthState {
  isAuthed: boolean;
  signup: (name: string, email: string, password: string) => { ok: boolean; error?: string };
  login: (email: string, password: string) => { ok: boolean; error?: string };
  continueAsGuest: () => void;
  logout: () => void;
}

const ACCOUNTS_KEY = "trackpulse.accounts";
const SESSION_KEY = "trackpulse.session"; // {email} | {guest:true} | null

const AuthContext = createContext<AuthContextValue | null>(null);

function readAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * Local-only identity, by design (see HANDOFF.md-adjacent conversation): there
 * is no backend user/database system in this project, and building one was
 * explicitly out of scope for this pass. This is a real, working signup/login
 * loop against an account list stored in this browser's localStorage -- but it
 * is NOT a secure auth system: passwords are stored in plain text client-side
 * and nothing is verified server-side. It exists so "continue as guest" vs.
 * "my account" is a genuine, persistent choice with a working history feature
 * behind it, not a login form that goes nowhere.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isGuest: false, ready: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) {
        setState({ user: null, isGuest: false, ready: true });
        return;
      }
      const session = JSON.parse(raw);
      if (session?.guest) {
        setState({ user: null, isGuest: true, ready: true });
        return;
      }
      if (session?.email) {
        const account = readAccounts().find((a) => a.email === session.email);
        if (account) {
          setState({ user: { name: account.name, email: account.email }, isGuest: false, ready: true });
          return;
        }
      }
      setState({ user: null, isGuest: false, ready: true });
    } catch {
      setState({ user: null, isGuest: false, ready: true });
    }
  }, []);

  function signup(name: string, email: string, password: string) {
    const trimmedEmail = email.trim().toLowerCase();
    if (!name.trim() || !trimmedEmail || !password) {
      return { ok: false, error: "Name, email and password are all required." };
    }
    const accounts = readAccounts();
    if (accounts.some((a) => a.email === trimmedEmail)) {
      return { ok: false, error: "An account with that email already exists -- try logging in instead." };
    }
    const account: StoredAccount = { name: name.trim(), email: trimmedEmail, password };
    writeAccounts([...accounts, account]);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: trimmedEmail }));
    setState({ user: { name: account.name, email: account.email }, isGuest: false, ready: true });
    return { ok: true };
  }

  function login(email: string, password: string) {
    const trimmedEmail = email.trim().toLowerCase();
    const account = readAccounts().find((a) => a.email === trimmedEmail);
    if (!account || account.password !== password) {
      return { ok: false, error: "No matching account on this browser. Check the details, or sign up." };
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: trimmedEmail }));
    setState({ user: { name: account.name, email: account.email }, isGuest: false, ready: true });
    return { ok: true };
  }

  function continueAsGuest() {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ guest: true }));
    setState({ user: null, isGuest: true, ready: true });
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setState({ user: null, isGuest: false, ready: true });
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        isAuthed: state.user !== null || state.isGuest,
        signup,
        login,
        continueAsGuest,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Stable per-browser-identity key for namespacing localStorage history entries. */
export function historyKeyFor(user: StrategistProfile | null): string {
  return user ? `account:${user.email}` : "guest";
}
