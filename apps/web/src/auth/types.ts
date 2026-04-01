export type UserRole = "veteran" | "employer" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
};

