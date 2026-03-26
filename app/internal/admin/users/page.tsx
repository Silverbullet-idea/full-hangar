"use client";

import { FormEvent, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "beta";
  is_active: boolean;
  google_sub: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "beta">("beta");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/internal/admin/users");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load users");
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/internal/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email: email || undefined,
          password,
          role,
          is_active: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to create user");
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("beta");
      await loadUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create user");
    }
  }

  async function updateUser(user: AdminUser, updates: Record<string, unknown>) {
    setError("");
    try {
      const response = await fetch("/api/internal/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...updates }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to update user");
      await loadUsers();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update user");
    }
  }

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <h1 className="text-2xl font-semibold">Admin Users</h1>
        <p className="text-sm text-brand-muted">
          Create and manage admin/beta users. Google login uses each user email.
        </p>
      </header>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Create User</h2>
        <form className="grid gap-2 md:grid-cols-5" onSubmit={createUser}>
          <input
            className="rounded border border-brand-dark bg-transparent px-3 py-2"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            className="rounded border border-brand-dark bg-transparent px-3 py-2"
            placeholder="Email (for Google login)"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="rounded border border-brand-dark bg-transparent px-3 py-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <select
            className="rounded border border-brand-dark bg-transparent px-3 py-2"
            value={role}
            onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "beta")}
          >
            <option value="beta">Beta</option>
            <option value="admin">Admin</option>
          </select>
          <button className="fh-cta-on-orange-fill rounded bg-brand-orange px-3 py-2 font-semibold" type="submit">
            Create User
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Users</h2>
        {loading ? (
          <div className="h-16 animate-pulse rounded bg-[#1d1d1d]" />
        ) : (
          <div className="overflow-auto rounded border border-brand-dark">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[#111111] text-left text-xs uppercase text-brand-muted">
                <tr>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Google Linked</th>
                  <th className="px-3 py-2">Last Login</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-brand-dark">
                    <td className="px-3 py-2">{user.username}</td>
                    <td className="px-3 py-2">{user.email || "—"}</td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2">{user.is_active ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">{user.google_sub ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">{user.last_login_at ? user.last_login_at.replace("T", " ").slice(0, 16) : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          className="rounded border border-brand-dark px-2 py-1 text-xs"
                          onClick={() => updateUser(user, { is_active: !user.is_active })}
                        >
                          {user.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="rounded border border-brand-dark px-2 py-1 text-xs"
                          onClick={() => updateUser(user, { role: user.role === "admin" ? "beta" : "admin" })}
                        >
                          Set {user.role === "admin" ? "Beta" : "Admin"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
