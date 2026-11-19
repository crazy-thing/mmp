import type { GroupMember } from '@mmp/schema';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, errorMessage } from '../api';
import { AddCard } from '../components/PackSidebar';
import Shell from '../components/Shell';
import { notify } from '../components/Toast';
import { CardButton, Empty, TextInput } from '../components/ui';

const VALID_NAME = /^[A-Za-z0-9_]{1,16}$/;

/** Player face from their Minecraft skin, with the first letter as a fallback. */
function Head({ member, size }: { member: { uuid: string; username: string }; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-2 border-mm-chip bg-mm-raised font-bold"
      style={{ width: size, height: size, fontSize: size / 2.4 }}
    >
      {failed ? (
        member.username.charAt(0).toUpperCase()
      ) : (
        <img
          src={`https://mc-heads.net/avatar/${member.uuid}/${size * 2}`}
          alt=""
          className="size-full [image-rendering:pixelated]"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/**
 * Manage Access: players who get Development packs and Dev Build versions.
 * Sidebar lists the players; the main panel shows the selected one.
 */
export default function Access() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listDevelopers()
      .then(setMembers)
      .catch((err) => notify(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, []);

  const selected = members.find((m) => m.uuid === uuid) ?? null;

  const add = async () => {
    const name = username.trim();
    if (!VALID_NAME.test(name)) {
      notify('That isn’t a valid Minecraft username.');
      return;
    }
    setBusy(true);
    try {
      const member = await api.addDeveloper(name);
      setMembers((prev) => [...prev.filter((m) => m.uuid !== member.uuid), member]);
      setAdding(false);
      setUsername('');
      notify(`${member.username} now has Dev access`, 'success');
      navigate(`/access/${member.uuid}`);
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: GroupMember) => {
    if (!confirm(`Remove Dev access for ${member.username}?`)) return;
    try {
      await api.removeDeveloper(member.uuid);
      setMembers((prev) => prev.filter((m) => m.uuid !== member.uuid));
      navigate('/access');
    } catch (err) {
      notify(errorMessage(err));
    }
  };

  const sidebar = (
    <>
      {members.map((member) => {
        const active = member.uuid === uuid;
        return (
          <button
            key={member.uuid}
            type="button"
            onClick={() => navigate(`/access/${member.uuid}`)}
            className={`flex h-[94px] w-[368px] shrink-0 items-center gap-[16px] rounded-[25px] px-[23px] text-left transition-colors ${
              active ? 'bg-mm-frame' : 'bg-mm-surface hover:bg-[#202027]'
            } ${adding ? 'pointer-events-none opacity-40' : ''}`}
          >
            <Head member={member} size={54} />
            <div className="min-w-0">
              <p className="truncate text-[20px] font-bold leading-[1.2]">{member.username}</p>
              <span className="mt-[6px] inline-flex h-[20px] items-center rounded-[5px] bg-mm-dev px-[10px] text-[15px] font-semibold leading-none">
                Dev Access
              </span>
            </div>
          </button>
        );
      })}

      {adding ? (
        <form
          className="relative h-[158px] w-[368px] shrink-0 rounded-[25px] bg-mm-frame"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <p className="absolute left-[23px] top-[20px] text-[20px] font-bold leading-none">Add a player</p>
          <TextInput
            autoFocus
            aria-label="Minecraft username"
            placeholder="Minecraft username"
            value={username}
            maxLength={16}
            onChange={(e) => setUsername(e.target.value)}
            className="absolute left-[20px] top-[54px] w-[327px] !bg-mm-bg"
          />
          <div className="absolute left-[20px] top-[109px] flex gap-[9px]">
            <CardButton
              tone="secondary"
              onClick={() => {
                setAdding(false);
                setUsername('');
              }}
            >
              Discard
            </CardButton>
            <CardButton tone="primary" type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Save'}
            </CardButton>
          </div>
        </form>
      ) : (
        <AddCard label="Add a player" onClick={() => setAdding(true)} />
      )}
    </>
  );

  return (
    <Shell sidebar={sidebar}>
      {selected ? (
        <div className="flex size-full flex-col items-center justify-center gap-[22px]">
          <Head member={selected} size={150} />
          <div className="text-center">
            <p className="text-[36px] font-bold leading-none">{selected.username}</p>
            <p className="mt-[12px] font-mono text-[16px] text-mm-muted">{selected.uuid}</p>
            <p className="mt-[6px] text-[16px] text-mm-muted">Added {new Date(selected.addedAt).toLocaleDateString()}</p>
          </div>
          <p className="max-w-[560px] text-center text-[18px] leading-[1.35] text-[#bbb]">
            {selected.username} sees modpacks marked Development and gets versions published as Dev Build once they sign in to the launcher with this
            Minecraft account.
          </p>
          <button
            type="button"
            onClick={() => remove(selected)}
            className="h-[40px] rounded-[10px] border border-[#7a2a2a] px-[20px] text-[18px] font-semibold text-[#ff8a8a] hover:bg-[#5a1f24] hover:text-white"
          >
            Remove Access
          </button>
        </div>
      ) : (
        <Empty>
          {!loaded ? (
            ''
          ) : members.length === 0 ? (
            <>
              Wow, such empty!
              <br />
              <span className="mt-[10px] inline-block text-[17px]">
                Use + to give a player access to Development packs and Dev Build versions.
              </span>
            </>
          ) : (
            'Select a player to manage their access.'
          )}
        </Empty>
      )}
    </Shell>
  );
}
