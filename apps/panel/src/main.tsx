import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { AuthProvider, RequireAdmin } from './auth';
import Stage from './components/Stage';
import Toasts from './components/Toast';
import './index.css';
import { PacksProvider } from './packs';
import Access from './pages/Access';
import Dashboard from './pages/Dashboard';
import Launcher from './pages/Launcher';
import Login from './pages/Login';
import PackEditor from './pages/PackEditor';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import VersionEditor from './pages/VersionEditor';
import Versions from './pages/Versions';

/** Signed-in screens share one pack list, so moving between them doesn't refetch it. */
const AdminLayout = () => (
  <RequireAdmin>
    <PacksProvider>
      <Outlet />
    </PacksProvider>
  </RequireAdmin>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Stage>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route element={<AdminLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/packs/new" element={<PackEditor isNew />} />
              <Route path="/packs/:id" element={<Dashboard />} />
              <Route path="/packs/:id/edit" element={<PackEditor />} />
              <Route path="/packs/:id/versions" element={<Versions />} />
              <Route path="/packs/:id/versions/new" element={<VersionEditor />} />
              <Route path="/packs/:id/versions/:versionId" element={<VersionEditor />} />
              <Route path="/access" element={<Access />} />
              <Route path="/access/:uuid" element={<Access />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/:id" element={<Reports />} />
              <Route path="/launcher" element={<Launcher />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toasts />
        </Stage>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
