import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { AuthCard, AuthError, AuthField, AuthSubmit } from '../components/AuthCard';
import { setPanelAddress } from '../components/Shell';

type Step = 'code' | 'account' | 'community' | 'done';
const STEP_NUMBER: Record<Step, number> = { code: 1, account: 2, community: 3, done: 4 };

/**
 * First run: proves the visitor runs this server (setup code from the log), creates the owner,
 * then sets the address players add in the launcher.
 */
export default function Setup() {
  const { status, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [publicUrl, setPublicUrl] = useState(() => window.location.origin);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Once the account exists the session cookie is set, but auth status only refreshes on finish,
  // so the later steps aren't cut short by the redirect below.
  if (step === 'code' || step === 'account') {
    if (status === 'signed-in') return <Navigate to="/" replace />;
    if (status === 'signed-out') return <Navigate to="/login" replace />;
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.checkSetupCode(code);
      setStep('account');
    });
  };

  const submitAccount = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('The passwords do not match');
      return;
    }
    void run(async () => {
      await api.setup({ code, communityName, username, password });
      setStep('community');
    });
  };

  const submitCommunity = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const saved = await api.updateSettings({ publicUrl: publicUrl.trim().replace(/\/+$/, '') });
      setPanelAddress(saved.publicUrl);
      setStep('done');
    });
  };

  const finish = async (to: string) => {
    await refresh();
    navigate(to, { replace: true });
  };

  const progress = `Step ${STEP_NUMBER[step]} of 4`;

  if (step === 'code') {
    return (
      <AuthCard heading="Welcome" subheading={`${progress}. Enter the setup code to prove you run this server.`} onSubmit={submitCode}>
        <AuthField label="Setup code" value={code} onChange={setCode} autoComplete="one-time-code" />
        <p className="-mt-[6px] text-[15px] leading-[1.4] text-mm-muted">
          It's printed in the server log when the server starts (for Docker:{' '}
          <code className="text-[#ccc]">docker compose logs mmp</code>) and saved as{' '}
          <code className="text-[#ccc]">setup-code.txt</code> in the data folder.
        </p>
        {error && <AuthError>{error}</AuthError>}
        <AuthSubmit text={busy ? 'Checking...' : 'Continue'} disabled={busy || !code.trim()} />
      </AuthCard>
    );
  }

  if (step === 'account') {
    return (
      <AuthCard heading="Create the owner account" subheading={`${progress}. You'll sign in to this panel with it.`} onSubmit={submitAccount}>
        <AuthField label="Community name" value={communityName} onChange={setCommunityName} />
        <AuthField label="Username" value={username} onChange={setUsername} autoComplete="username" />
        <AuthField label="Password (10+ characters)" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
        <AuthField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" />
        {error && <AuthError>{error}</AuthError>}
        <AuthSubmit text={busy ? 'Creating...' : 'Create account'} disabled={busy} />
      </AuthCard>
    );
  }

  if (step === 'community') {
    return (
      <AuthCard heading="Your server address" subheading={`${progress}. You can change this later in Settings.`} onSubmit={submitCommunity}>
        <div className="flex flex-col gap-[8px]">
          <AuthField label="Public URL" value={publicUrl} onChange={setPublicUrl} autoComplete="url" />
          <p className="text-[15px] leading-[1.4] text-mm-muted">
            The address players add in the launcher. Use your domain, e.g. https://packs.example.com
          </p>
        </div>
        {error && <AuthError>{error}</AuthError>}
        <AuthSubmit text={busy ? 'Saving...' : 'Continue'} disabled={busy || !publicUrl.trim()} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      heading="You're all set"
      subheading={`${progress}. Upload a modpack, then share your join page with players.`}
      onSubmit={(e) => {
        e.preventDefault();
        void finish('/packs/new');
      }}
    >
      <p className="text-[17px] leading-[1.45] text-[#ccc]">
        Export your pack from CurseForge or Modrinth (a Modrinth <code>.mrpack</code> needs no API key) and upload it as
        the first version. The <span className="font-semibold text-white">Launcher</span> page has the link to share.
      </p>
      <AuthSubmit text="Upload your first modpack" />
      <button type="button" onClick={() => void finish('/')} className="text-[18px] text-mm-muted hover:text-white">
        Go to the dashboard
      </button>
    </AuthCard>
  );
}
