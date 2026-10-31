import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/common/LandingPage";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import EmailVerification from "./pages/auth/EmailVerification";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ProtectedRoute from "./components/ProtectRoute";

import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import HospitalVerification from "./pages/admin/HospitalVerification";
import CommunityVerification from "./pages/admin/CommunityVerification";
import UserManagement from "./pages/admin/UserManagement";
import BloodRequestMonitor from "./pages/admin/BloodRequestMonitor";
import ReportsAnalytics from "./pages/admin/ReportsAnalytics";
import AuditLogs from "./pages/admin/AuditLogs";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminProfile from "./pages/admin/AdminProfile";

import VerificationDocuments from "./pages/auth/VerificationDocuments";
import PendingVerification from "./pages/auth/PendingVerification";

import HospitalRoute from "./components/HospitalRoute";
import HospitalLayout from "./pages/hospital/HospitalLayout";
import HospitalDashboard from "./pages/hospital/Dashboard";
import HospitalRequests from "./pages/hospital/HospitalRequests.jsx";
import CreateBloodRequest from "./pages/hospital/CreateBloodRequest.jsx";
import RequestDetails from "./pages/hospital/RequestDetails";
import DonorMatches from "./pages/hospital/DonorMatches";
import RequestTracking from "./pages/hospital/RequestTracking";
import HospitalProfile from "./pages/hospital/HospitalProfile";
import HospitalSettings from "./pages/hospital/HospitalSettings";
import DonationHistory from "./pages/hospital/DonationHistory";

import DonorRoute from "./components/DonorRoute";
import DonorLayout from "./pages/donor/DonorLayout";
import DonorDashboard from "./pages/donor/Dashboard";
import DonorRequests from "./pages/donor/Requests";
import DonorRequestDetail from "./pages/donor/RequestDetails";
import DonorHistory from "./pages/donor/History";
import DonorCommunity from "./pages/donor/Community";
import DonorAvailability from "./pages/donor/Availability";
import DonorProfile from "./pages/donor/Profile";

import CommunitySelection from "./pages/donor/CommunitySelection";
import CommunityAdminRoute from "./components/CommunityAdminRoute";
import CommunityAdminLayout from "./pages/community/CommunityAdminLayout";
import CommunityAdminDashboard from "./pages/community/CommunityAdminDashboard";
import CommunityApplications from "./pages/community/CommunityApplications";
import CommunityMembers from "./pages/community/CommunityMembers";
import CommunityProfile from "./pages/community/CommunityProfile";
import { CommunityBloodCoordination, CommunityAnnouncements, CommunityDonationCamps, CommunityActivityHistory } from "./pages/community/CommunityAdminPages";

import AccessDenied from "./pages/common/AccessDenied";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* =====================================================
            PUBLIC PAGES
        ===================================================== */}

        <Route
          path="/"
          element={<LandingPage />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        <Route
          path="/verify-email"
          element={<EmailVerification />}
        />

        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />

        {/* =====================================================
            VERIFICATION PAGES

            These are shared by Hospital, Community and Donor
            verification flows.

            Donor-specific onboarding restrictions are handled
            by DonorRoute on the donor onboarding routes.
        ===================================================== */}

        <Route
          path="/verification/documents"
          element={
            <ProtectedRoute>
              <VerificationDocuments />
            </ProtectedRoute>
          }
        />

        <Route
          path="/verification/pending"
          element={
            <ProtectedRoute>
              <PendingVerification />
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            DONOR ONBOARDING

            Donor flow:
              Register
                ↓
              Community Selection
                ↓
              Documents
                ↓
              Community Review
                ↓
              Dashboard

            IMPORTANT:
            Community selection remains outside DonorRoute
            because newly registered donors are pending.
        ===================================================== */}

        <Route
          path="/donor/onboarding/community"
          element={
            <ProtectedRoute>
              <CommunitySelection />
            </ProtectedRoute>
          }
        />

        <Route
          path="/donor/onboarding/review"
          element={
            <DonorRoute requireOnboarding>
              <PendingVerification />
            </DonorRoute>
          }
        />

        {/* =====================================================
            SUPER ADMIN WORKSPACE
        ===================================================== */}

        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="super_admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={<AdminDashboard />}
          />

          <Route
            path="hospitals"
            element={<HospitalVerification />}
          />

          <Route
            path="communities"
            element={<CommunityVerification />}
          />

          <Route
            path="users"
            element={<UserManagement />}
          />

          <Route
            path="blood-requests"
            element={<BloodRequestMonitor />}
          />

          <Route
            path="reports"
            element={<ReportsAnalytics />}
          />

          <Route
            path="audit-logs"
            element={<AuditLogs />}
          />

          <Route
            path="settings"
            element={<AdminSettings />}
          />

          <Route
            path="profile"
            element={<AdminProfile />}
          />
        </Route>

        {/* =====================================================
            HOSPITAL WORKSPACE
        ===================================================== */}

        <Route
          element={
            <HospitalRoute>
              <HospitalLayout />
            </HospitalRoute>
          }
        >
          <Route path="/hospital" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={<HospitalDashboard />}
          />

          <Route
            path="/requests"
            element={<HospitalRequests />}
          />

          <Route
            path="/requests/create"
            element={<CreateBloodRequest />}
          />

          <Route
            path="/requests/:requestId"
            element={<RequestDetails />}
          />

          <Route
            path="/requests/:requestId/matches"
            element={<DonorMatches />}
          />

          <Route
            path="/requests/:requestId/tracking"
            element={<RequestTracking />}
          />

          <Route
            path="/profile"
            element={<HospitalProfile />}
          />

          <Route
            path="/donation-history"
            element={<DonationHistory />}
          />

          <Route
            path="/settings"
            element={<HospitalSettings />}
          />
        </Route>

        {/* COMMUNITY ADMIN WORKSPACE */}
        <Route
          element={
            <CommunityAdminRoute>
              <CommunityAdminLayout />
            </CommunityAdminRoute>
          }
        >
          <Route path="/community" element={<CommunityAdminDashboard />} />
          <Route path="/community/dashboard" element={<CommunityAdminDashboard />} />
          <Route path="/community/applications" element={<CommunityApplications />} />
          <Route path="/community/members" element={<CommunityMembers />} />
          <Route path="/community/profile" element={<CommunityProfile />} />
          <Route path="/community/blood-coordination" element={<CommunityBloodCoordination />} />
          <Route path="/community/announcements" element={<CommunityAnnouncements />} />
          <Route path="/community/donation-camps" element={<CommunityDonationCamps />} />
          <Route path="/community/activity-history" element={<CommunityActivityHistory />} />
          <Route path="/community/community-activity-history" element={<CommunityActivityHistory />} />
        </Route>

        {/* =====================================================
            DONOR WORKSPACE

            Only active donors can enter this workspace.
        ===================================================== */}

        <Route
          element={
            <DonorRoute>
              <DonorLayout />
            </DonorRoute>
          }
        >
          <Route path="/donor" element={<Navigate to="/donor/dashboard" replace />} />
          <Route
            path="/donor/dashboard"
            element={<DonorDashboard />}
          />

          <Route
            path="/donor/requests"
            element={<DonorRequests />}
          />

          <Route
            path="/donor/requests/:requestId"
            element={<DonorRequestDetail />}
          />

          <Route
            path="/donor/history"
            element={<DonorHistory />}
          />

          <Route
            path="/donor/community"
            element={<DonorCommunity />}
          />

          <Route
            path="/donor/availability"
            element={<DonorAvailability />}
          />

          <Route
            path="/donor/profile"
            element={<DonorProfile />}
          />
        </Route>

        <Route
          path="/access-denied"
          element={<AccessDenied />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
