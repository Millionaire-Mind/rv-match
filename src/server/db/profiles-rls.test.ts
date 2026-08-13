import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * Integration test proving the Postgres-level fix for the profiles
 * privilege-escalation hole (see
 * supabase/migrations/20260101000009_fix_profiles_privilege_escalation.sql).
 *
 * The old `profiles_update_own` RLS policy only checked WHICH ROW a caller
 * could update (id = auth.uid()), not WHICH COLUMNS - so an authenticated
 * user could set their own platform_role to 'platform_admin' and pass RLS.
 * This test executes as the actual `authenticated` Postgres role (not the
 * superuser connection Drizzle uses elsewhere), with `auth.uid()` pointed
 * at a real profile, to prove that path is now rejected at the database
 * level while legitimate self-service profile edits keep working.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

let userId: string;

beforeAll(async () => {
  const email = `rls-test-${Date.now()}@example.com`;
  const [user] = await sql<{ id: string }[]>`
    insert into auth.users (email, encrypted_password)
    values (${email}, 'not-a-real-hash')
    returning id
  `;
  userId = user.id;
});

afterAll(async () => {
  await sql`delete from auth.users where id = ${userId}`;
  await sql.end();
});

async function asAuthenticatedUser(fn: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('rvmatch.current_user_id', ${userId}, true)`;
    await tx.unsafe("set local role authenticated");
    await fn(tx);
  });
}

describe("profiles RLS + column privileges", () => {
  it("blocks an authenticated user from setting their own platform_role", async () => {
    await expect(
      asAuthenticatedUser(async (tx) => {
        await tx`update profiles set platform_role = 'platform_admin' where id = ${userId}`;
      }),
    ).rejects.toThrow(/permission denied for (column platform_role|table profiles)/i);

    const [row] = await sql`select platform_role from profiles where id = ${userId}`;
    expect(row.platform_role).toBe("consumer");
  });

  it("still allows an authenticated user to update their own full_name/phone", async () => {
    await asAuthenticatedUser(async (tx) => {
      await tx`update profiles set full_name = 'Updated Name', phone = '555-0100' where id = ${userId}`;
    });

    const [row] = await sql`select full_name, phone from profiles where id = ${userId}`;
    expect(row.full_name).toBe("Updated Name");
    expect(row.phone).toBe("555-0100");
  });

  it("blocks an authenticated user from updating a row that isn't their own", async () => {
    const otherEmail = `rls-test-other-${Date.now()}@example.com`;
    const [other] = await sql<{ id: string }[]>`
      insert into auth.users (email, encrypted_password)
      values (${otherEmail}, 'not-a-real-hash')
      returning id
    `;

    await asAuthenticatedUser(async (tx) => {
      const result = await tx`update profiles set full_name = 'Hijacked' where id = ${other.id}`;
      expect(result.count).toBe(0); // RLS hides the other row entirely - zero rows affected, not an error
    });

    const [row] = await sql`select full_name from profiles where id = ${other.id}`;
    expect(row.full_name).not.toBe("Hijacked");

    await sql`delete from auth.users where id = ${other.id}`;
  });
});
