import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { apiFetch } from "@/lib/api";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [{ title: "User administration — HTS" }],
  }),
  component: AdminUsers,
});

type AdminUser = {
  id: number;
  uid: string;
  candidateNumber: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  position: string;
  company: string;
  location: string;
  createdAt: string;
  validityDays: number;
  expiresAt: string | null;
  daysRemaining: number | null;
  enabled: boolean;
  status: "active" | "expired" | "disabled";
  enrollmentCount: number;
};

type UserDraft = { validityDays: string; enabled: boolean };

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<number, UserDraft>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadUsers = () => {
    setLoading(true);
    void apiFetch("/api/admin/users/")
      .then(async (response) => (await response.json()) as AdminUser[])
      .then((nextUsers) => {
        setUsers(nextUsers);
        setDrafts(
          Object.fromEntries(
            nextUsers.map((user) => [
              user.id,
              { validityDays: String(user.validityDays), enabled: user.enabled },
            ]),
          ),
        );
      })
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load users.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => loadUsers(), []);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.email, user.candidateNumber, user.company].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [search, users]);

  const updateDraft = (user: AdminUser, next: Partial<UserDraft>) => {
    setDrafts((current) => {
      const currentDraft = current[user.id] ?? {
        validityDays: String(user.validityDays),
        enabled: user.enabled,
      };
      return {
        ...current,
        [user.id]: {
          validityDays: next.validityDays ?? currentDraft.validityDays,
          enabled: next.enabled ?? currentDraft.enabled,
        },
      };
    });
  };

  const saveUser = async (user: AdminUser) => {
    const draft = drafts[user.id];
    if (!draft) return;
    const validityDays = Number(draft.validityDays);
    if (!Number.isInteger(validityDays) || validityDays < 0 || validityDays > 3650) {
      setError("Validity must be a whole number from 0 to 3650 days.");
      return;
    }

    setSavingId(user.id);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch(`/api/admin/users/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ validityDays, enabled: draft.enabled }),
      });
      const updated = (await response.json()) as AdminUser;
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDrafts((current) => ({
        ...current,
        [updated.id]: { validityDays: String(updated.validityDays), enabled: updated.enabled },
      }));
      setNotice(`${updated.name || updated.email || "User"} updated.`);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update user.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading && users.length === 0) {
    return (
      <LoadingScreen label="Loading users" detail="Fetching account administration records…" />
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-5">
      <div className="mb-5 border-b border-ink/15 pb-5">
        <div className="rule-label">Administrator</div>
        <h1 className="mt-2 text-4xl font-black leading-none tracking-tight">User accounts.</h1>
        <p className="mt-2 max-w-2xl text-sm text-fog">
          Enable or disable access and reset the number of days remaining from today.
        </p>
      </div>

      {error && (
        <div className="mb-3 border-2 border-clay bg-paper p-3 text-sm text-clay">{error}</div>
      )}
      {notice && (
        <div className="mb-3 border-2 border-moss bg-paper p-3 text-sm text-moss">{notice}</div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-fog">
          {visibleUsers.length} of {users.length} users
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, candidate number…"
          className="w-full border-2 border-ink bg-paper px-3 py-2 text-sm outline-none placeholder:text-fog/70 focus:border-clay sm:w-80"
        />
      </div>

      <div className="overflow-x-auto border-2 border-ink bg-paper">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-b-2 border-ink bg-sand font-mono text-[10px] uppercase tracking-wider text-fog">
            <tr>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Details</th>
              <th className="px-3 py-3">Created / courses</th>
              <th className="px-3 py-3">Validity</th>
              <th className="px-3 py-3">Access</th>
              <th className="px-3 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => {
              const draft = drafts[user.id] ?? {
                validityDays: String(user.validityDays),
                enabled: user.enabled,
              };
              return (
                <tr key={user.id} className="border-b border-ink/10 align-top last:border-0">
                  <td className="px-3 py-4">
                    <div className="font-bold">{user.name || "Unnamed learner"}</div>
                    <div className="mt-1 font-mono text-[10px] text-fog">
                      {user.candidateNumber || user.uid}
                    </div>
                    <div className="mt-1 text-xs text-fog">{user.email || "No email"}</div>
                  </td>
                  <td className="px-3 py-4 text-xs text-fog">
                    <div>{user.phone || "Phone not provided"}</div>
                    <div className="mt-1">
                      {[user.position, user.company, user.location].filter(Boolean).join(" · ") ||
                        "Profile details not provided"}
                    </div>
                  </td>
                  <td className="px-3 py-4 font-mono text-[10px] text-fog">
                    <div>{formatDate(user.createdAt)}</div>
                    <div className="mt-1">
                      {user.enrollmentCount} course{user.enrollmentCount === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="3650"
                        value={draft.validityDays}
                        onChange={(event) =>
                          updateDraft(user, { validityDays: event.target.value })
                        }
                        className="w-20 border border-ink/30 bg-paper px-2 py-1 font-mono text-xs"
                        aria-label={`Validity days for ${user.name || user.email}`}
                      />
                      <span className="font-mono text-[10px] text-fog">days</span>
                    </div>
                    <div className="mt-2 text-xs">Until {formatDate(user.expiresAt)}</div>
                    <div
                      className={`mt-1 font-mono text-[10px] uppercase ${user.status === "active" ? "text-moss" : "text-clay"}`}
                    >
                      {user.status === "active"
                        ? `${user.daysRemaining ?? 0} days left`
                        : user.status}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) => updateDraft(user, { enabled: event.target.checked })}
                      />
                      {draft.enabled ? "Enabled" : "Disabled"}
                    </label>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => void saveUser(user)}
                      disabled={savingId === user.id}
                      className="bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-paper disabled:opacity-50"
                    >
                      {savingId === user.id ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleUsers.length === 0 && (
          <div className="p-8 text-center text-sm text-fog">No users match this search.</div>
        )}
      </div>
    </main>
  );
}
