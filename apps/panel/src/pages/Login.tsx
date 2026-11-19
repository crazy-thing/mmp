import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { AuthCard, AuthError, AuthField, AuthSubmit } from '../components/AuthCard';

export default function Login() {
  const { status, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = params.get('next');
  const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (status === 'needs-setup') return <Navigate to="/setup" replace />;
  if (status === 'signed-in') return <Navigate to={target} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username, password);
      await refresh();
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard heading="Sign In Required" subheading="You must be authorized to access this application" onSubmit={submit}>
      <AuthField label="Username" value={username} onChange={setUsername} autoComplete="username" />
      <AuthField label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
      {error && <AuthError>{error}</AuthError>}
      <AuthSubmit text={busy ? 'Signing in...' : 'Sign in'} disabled={busy} />
    </AuthCard>
  );
}
