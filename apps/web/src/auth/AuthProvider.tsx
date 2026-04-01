import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren
} from "react";
import { getCurrentUser, login, logout, signup } from "../lib/api";
import type { AuthUser, UserRole } from "./types";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  loginUser: (input: {
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string; user?: AuthUser }>;
  signupUser: (input: {
    email: string;
    password: string;
    fullName: string;
    role: Exclude<UserRole, "admin">;
  }) => Promise<{ ok: boolean; error?: string; user?: AuthUser }>;
  logoutUser: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function roleHomePath(role: UserRole) {
  if (role === "veteran") return "/app/veteran";
  if (role === "employer") return "/app/employer";
  return "/app/admin";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    const result = await getCurrentUser();
    if (result.ok && result.data) {
      setUser(result.data.user);
    } else {
      setUser(null);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);
      const result = await getCurrentUser();
      if (!mounted) return;
      if (result.ok && result.data) {
        setUser(result.data.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    }

    bootstrap().catch(() => {
      if (mounted) {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  async function loginUser(input: { email: string; password: string }) {
    const result = await login(input);
    if (!result.ok || !result.data) {
      return { ok: false, error: result.error ?? "Login failed." };
    }
    setUser(result.data.user);
    return { ok: true, user: result.data.user };
  }

  async function signupUser(input: {
    email: string;
    password: string;
    fullName: string;
    role: Exclude<UserRole, "admin">;
  }) {
    const result = await signup(input);
    if (!result.ok || !result.data) {
      return { ok: false, error: result.error ?? "Signup failed." };
    }
    setUser(result.data.user);
    return { ok: true, user: result.data.user };
  }

  async function logoutUser() {
    await logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginUser,
        signupUser,
        logoutUser,
        refreshSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
