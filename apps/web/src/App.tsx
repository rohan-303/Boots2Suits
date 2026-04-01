import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { AppShell } from "./components/AppShell";
import { EmployerProfileGate } from "./components/EmployerProfileGate";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { EmployerDashboardPage } from "./pages/EmployerDashboardPage";
import { EmployerJobDetailPage } from "./pages/EmployerJobDetailPage";
import { EmployerJobMatchesPage } from "./pages/EmployerJobMatchesPage";
import { EmployerJobPersonaPage } from "./pages/EmployerJobPersonaPage";
import { EmployerJobsPage } from "./pages/EmployerJobsPage";
import { EmployerOnboardingPage } from "./pages/EmployerOnboardingPage";
import { EmployerProfilePage } from "./pages/EmployerProfilePage";
import { LoginPage } from "./pages/LoginPage";
import { RoleRedirectPage } from "./pages/RoleRedirectPage";
import { SignupPage } from "./pages/SignupPage";
import { VeteranDashboardPage } from "./pages/VeteranDashboardPage";
import { VeteranOnboardingPage } from "./pages/VeteranOnboardingPage";
import { VeteranApplicationsPage } from "./pages/VeteranApplicationsPage";
import { VeteranRecommendedJobsPage } from "./pages/VeteranRecommendedJobsPage";
import { VeteranProfilePage } from "./pages/VeteranProfilePage";
import { VeteranPersonaPage } from "./pages/VeteranPersonaPage";
import { VeteranProfileGate } from "./components/VeteranProfileGate";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<RoleRedirectPage />} />
            <Route path="/app" element={<RoleRedirectPage />} />
            <Route element={<ProtectedRoute roles={["veteran", "admin"]} />}>
              <Route element={<VeteranProfileGate />}>
                <Route path="/app/veteran/onboarding" element={<VeteranOnboardingPage />} />
                <Route path="/app/veteran" element={<VeteranDashboardPage />} />
                <Route path="/app/veteran/profile" element={<VeteranProfilePage />} />
                <Route path="/app/veteran/persona" element={<VeteranPersonaPage />} />
                <Route path="/app/veteran/recommendations" element={<VeteranRecommendedJobsPage />} />
                <Route path="/app/veteran/applications" element={<VeteranApplicationsPage />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute roles={["employer", "admin"]} />}>
              <Route element={<EmployerProfileGate />}>
                <Route path="/app/employer/onboarding" element={<EmployerOnboardingPage />} />
                <Route path="/app/employer" element={<EmployerDashboardPage />} />
                <Route path="/app/employer/profile" element={<EmployerProfilePage />} />
                <Route path="/app/employer/jobs" element={<EmployerJobsPage />} />
                <Route path="/app/employer/jobs/:jobId" element={<EmployerJobDetailPage />} />
                <Route path="/app/employer/jobs/:jobId/matches" element={<EmployerJobMatchesPage />} />
                <Route
                  path="/app/employer/jobs/:jobId/persona"
                  element={<EmployerJobPersonaPage />}
                />
              </Route>
            </Route>
            <Route element={<ProtectedRoute roles={["admin"]} />}>
              <Route path="/app/admin" element={<AdminDashboardPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
