import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
import { FarmSelectPage } from '@/pages/FarmSelectPage';
import { SupervisorHomePage } from '@/pages/SupervisorHomePage';
import { FeedingEntryPage } from '@/pages/FeedingEntryPage';
import { RecordsPage } from '@/pages/RecordsPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ReceiveFeedPage, DamageFeedPage, FeedProductFormPage } from '@/pages/InventoryFormsPage';
import { OwnerDashboardPage } from '@/pages/OwnerDashboardPage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { InviteSupervisorPage } from '@/pages/InviteSupervisorPage';
import { MorePage, AuditPage, SettingsPage, ResetPinPage } from '@/pages/MorePage';
import { NetPage } from '@/pages/NetPage';
import { SetPinPage } from '@/pages/SetPinPage';
import { UserRole } from '@/types/roles';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function ProtectedRoute({
  children,
  ownerOnly = false,
  requiresFarm = true,
}: {
  children: React.ReactNode;
  ownerOnly?: boolean;
  requiresFarm?: boolean;
}) {
  const { user, isLoading, selectedFarmId } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePin && location.pathname !== '/set-pin') {
    return <Navigate to="/set-pin" replace />;
  }
  if (ownerOnly && user.role !== UserRole.OWNER) return <Navigate to="/" replace />;
  if (requiresFarm && !selectedFarmId) return <Navigate to="/select-farm" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.mustChangePin) return <Navigate to="/set-pin" replace />;
  if (user?.role === UserRole.OWNER) return <Navigate to="/dashboard" replace />;
  return <SupervisorHomePage />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-pin" element={<ResetPinPage />} />
            <Route
              path="/set-pin"
              element={<ProtectedRoute requiresFarm={false}><SetPinPage /></ProtectedRoute>}
            />
            <Route
              path="/select-farm"
              element={<ProtectedRoute requiresFarm={false}><FarmSelectPage /></ProtectedRoute>}
            />
            <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute ownerOnly><OwnerDashboardPage /></ProtectedRoute>} />
            <Route path="/feeding" element={<ProtectedRoute><Navigate to="/feeding/entry" /></ProtectedRoute>} />
            <Route path="/feeding/entry" element={<ProtectedRoute><FeedingEntryPage /></ProtectedRoute>} />
            <Route path="/feeding/entry/:entryId" element={<ProtectedRoute><FeedingEntryPage /></ProtectedRoute>} />
            <Route path="/records" element={<ProtectedRoute><RecordsPage /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
            <Route path="/inventory/receive" element={<ProtectedRoute><ReceiveFeedPage /></ProtectedRoute>} />
            <Route path="/inventory/damage" element={<ProtectedRoute><DamageFeedPage /></ProtectedRoute>} />
            <Route path="/inventory/feeds/new" element={<ProtectedRoute ownerOnly><FeedProductFormPage /></ProtectedRoute>} />
            <Route path="/inventory/feeds/:feedProductId/edit" element={<ProtectedRoute ownerOnly><FeedProductFormPage /></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute ownerOnly><ApprovalsPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute ownerOnly><ReportsPage /></ProtectedRoute>} />
            <Route path="/net" element={<ProtectedRoute ownerOnly><NetPage /></ProtectedRoute>} />
            <Route path="/invite-supervisor" element={<ProtectedRoute ownerOnly><InviteSupervisorPage /></ProtectedRoute>} />
            <Route path="/more" element={<ProtectedRoute ownerOnly><MorePage /></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute ownerOnly><AuditPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute ownerOnly><SettingsPage /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
