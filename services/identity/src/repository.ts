import type { FastifyBaseLogger } from "fastify";
import { authSessionSchema } from "@gazelle/contracts-core";
import { createPostgresDb, ensurePersistenceTables, getDatabaseUrl } from "@gazelle/persistence";
import { z } from "zod";

type AuthSession = z.output<typeof authSessionSchema>;

type PersistedSessionRow = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
};

type PersistedPasskeyChallengeRow = {
  challenge: string;
  flow: "register" | "auth";
  user_id: string | null;
  rp_id: string;
  timeout_ms: number;
  expires_at: string | Date;
  consumed_at: string | Date | null;
};

type PersistedPasskeyCredentialRow = {
  credential_id: string;
  user_id: string;
  webauthn_user_id: string;
  public_key: string;
  counter: number;
  transports_json: unknown;
  device_type: "singleDevice" | "multiDevice";
  backed_up: boolean;
};

export type PasskeyChallengeRecord = {
  challenge: string;
  flow: "register" | "auth";
  userId?: string;
  rpId: string;
  timeoutMs: number;
  expiresAt: string;
  consumedAt?: string;
};

export type PasskeyCredentialRecord = {
  credentialId: string;
  userId: string;
  webauthnUserId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
};

export type IdentityRepository = {
  backend: "memory" | "postgres";
  saveSession(
    session: AuthSession,
    authMethod: "apple" | "passkey-register" | "passkey-auth" | "magic-link" | "refresh"
  ): Promise<void>;
  getSessionByAccessToken(accessToken: string): Promise<AuthSession | undefined>;
  getSessionByRefreshToken(refreshToken: string): Promise<AuthSession | undefined>;
  revokeByRefreshToken(refreshToken: string): Promise<void>;
  savePasskeyChallenge(input: PasskeyChallengeRecord): Promise<void>;
  getPasskeyChallenge(flow: "register" | "auth", challenge: string): Promise<PasskeyChallengeRecord | undefined>;
  markPasskeyChallengeConsumed(challenge: string): Promise<void>;
  listPasskeyCredentialsForUser(userId: string): Promise<PasskeyCredentialRecord[]>;
  getPasskeyCredential(credentialId: string): Promise<PasskeyCredentialRecord | undefined>;
  savePasskeyCredential(input: PasskeyCredentialRecord): Promise<void>;
  updatePasskeyCredentialCounter(credentialId: string, counter: number): Promise<void>;
  close(): Promise<void>;
};

function parseIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function isSessionActive(session: AuthSession, revokedAt: string | undefined) {
  if (revokedAt) {
    return false;
  }

  return Date.parse(session.expiresAt) > Date.now();
}

function toPasskeyChallengeRecord(row: PersistedPasskeyChallengeRow): PasskeyChallengeRecord {
  return {
    challenge: row.challenge,
    flow: row.flow,
    userId: row.user_id ?? undefined,
    rpId: row.rp_id,
    timeoutMs: row.timeout_ms,
    expiresAt: parseIsoDate(row.expires_at),
    consumedAt: row.consumed_at ? parseIsoDate(row.consumed_at) : undefined
  };
}

function toPasskeyCredentialRecord(row: PersistedPasskeyCredentialRow): PasskeyCredentialRecord {
  const transportsValue =
    typeof row.transports_json === "string" ? JSON.parse(row.transports_json) : row.transports_json;

  return {
    credentialId: row.credential_id,
    userId: row.user_id,
    webauthnUserId: row.webauthn_user_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: z.array(z.string()).parse(transportsValue),
    deviceType: row.device_type,
    backedUp: row.backed_up
  };
}

function createInMemoryRepository(): IdentityRepository {
  const sessionsByAccessToken = new Map<string, { session: AuthSession; revokedAt?: string }>();
  const accessTokenByRefreshToken = new Map<string, string>();
  const passkeyChallengesByFlow = new Map<"register" | "auth", PasskeyChallengeRecord[]>();
  const passkeyCredentialsById = new Map<string, PasskeyCredentialRecord>();

  return {
    backend: "memory",
    async saveSession(session) {
      sessionsByAccessToken.set(session.accessToken, { session });
      accessTokenByRefreshToken.set(session.refreshToken, session.accessToken);
    },
    async getSessionByAccessToken(accessToken) {
      const entry = sessionsByAccessToken.get(accessToken);
      if (!entry || !isSessionActive(entry.session, entry.revokedAt)) {
        return undefined;
      }
      return entry.session;
    },
    async getSessionByRefreshToken(refreshToken) {
      const accessToken = accessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return undefined;
      }

      const entry = sessionsByAccessToken.get(accessToken);
      if (!entry || !isSessionActive(entry.session, entry.revokedAt)) {
        return undefined;
      }
      return entry.session;
    },
    async revokeByRefreshToken(refreshToken) {
      const accessToken = accessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return;
      }

      const entry = sessionsByAccessToken.get(accessToken);
      if (!entry) {
        return;
      }

      sessionsByAccessToken.set(accessToken, {
        ...entry,
        revokedAt: new Date().toISOString()
      });
    },
    async savePasskeyChallenge(input) {
      const existing = passkeyChallengesByFlow.get(input.flow) ?? [];
      existing.push(input);
      passkeyChallengesByFlow.set(input.flow, existing);
    },
    async getPasskeyChallenge(flow, challenge) {
      const entries = passkeyChallengesByFlow.get(flow) ?? [];
      const activeMatch = entries.find(
        (entry) =>
          entry.challenge === challenge && Date.parse(entry.expiresAt) > Date.now() && entry.consumedAt === undefined
      );
      return activeMatch;
    },
    async markPasskeyChallengeConsumed(challenge) {
      for (const [flow, entries] of passkeyChallengesByFlow.entries()) {
        const updated = entries.map((entry) =>
          entry.challenge === challenge
            ? {
                ...entry,
                consumedAt: new Date().toISOString()
              }
            : entry
        );
        passkeyChallengesByFlow.set(flow, updated);
      }
    },
    async listPasskeyCredentialsForUser(userId) {
      return Array.from(passkeyCredentialsById.values()).filter((credential) => credential.userId === userId);
    },
    async getPasskeyCredential(credentialId) {
      return passkeyCredentialsById.get(credentialId);
    },
    async savePasskeyCredential(input) {
      passkeyCredentialsById.set(input.credentialId, input);
    },
    async updatePasskeyCredentialCounter(credentialId, counter) {
      const existing = passkeyCredentialsById.get(credentialId);
      if (!existing) {
        return;
      }

      passkeyCredentialsById.set(credentialId, {
        ...existing,
        counter
      });
    },
    async close() {
      // no-op
    }
  };
}

async function createPostgresRepository(connectionString: string): Promise<IdentityRepository> {
  const db = createPostgresDb(connectionString);
  await ensurePersistenceTables(db);

  return {
    backend: "postgres",
    async saveSession(session, authMethod) {
      try {
        await db
          .insertInto("identity_sessions")
          .values({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            user_id: session.userId,
            expires_at: session.expiresAt,
            revoked_at: null,
            auth_method: authMethod
          })
          .execute();
        return;
      } catch {
        await db
          .updateTable("identity_sessions")
          .set({
            refresh_token: session.refreshToken,
            user_id: session.userId,
            expires_at: session.expiresAt,
            revoked_at: null,
            auth_method: authMethod,
            updated_at: new Date().toISOString()
          })
          .where("access_token", "=", session.accessToken)
          .execute();
      }
    },
    async getSessionByAccessToken(accessToken) {
      const row = await db
        .selectFrom("identity_sessions")
        .selectAll()
        .where("access_token", "=", accessToken)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as PersistedSessionRow;
      const session = authSessionSchema.parse({
        accessToken: persisted.access_token,
        refreshToken: persisted.refresh_token,
        userId: persisted.user_id,
        expiresAt: parseIsoDate(persisted.expires_at)
      });

      if (!isSessionActive(session, persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
        return undefined;
      }

      return session;
    },
    async getSessionByRefreshToken(refreshToken) {
      const row = await db
        .selectFrom("identity_sessions")
        .selectAll()
        .where("refresh_token", "=", refreshToken)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as PersistedSessionRow;
      const session = authSessionSchema.parse({
        accessToken: persisted.access_token,
        refreshToken: persisted.refresh_token,
        userId: persisted.user_id,
        expiresAt: parseIsoDate(persisted.expires_at)
      });

      if (!isSessionActive(session, persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
        return undefined;
      }

      return session;
    },
    async revokeByRefreshToken(refreshToken) {
      await db
        .updateTable("identity_sessions")
        .set({
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where("refresh_token", "=", refreshToken)
        .execute();
    },
    async savePasskeyChallenge(input) {
      try {
        await db
          .insertInto("identity_passkey_challenges")
          .values({
            challenge: input.challenge,
            flow: input.flow,
            user_id: input.userId ?? null,
            rp_id: input.rpId,
            timeout_ms: input.timeoutMs,
            expires_at: input.expiresAt,
            consumed_at: input.consumedAt ?? null
          })
          .execute();
      } catch {
        // ignore duplicate key races
      }
    },
    async getPasskeyChallenge(flow, challenge) {
      const row = await db
        .selectFrom("identity_passkey_challenges")
        .selectAll()
        .where("flow", "=", flow)
        .where("challenge", "=", challenge)
        .where("expires_at", ">", new Date().toISOString())
        .where("consumed_at", "is", null)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toPasskeyChallengeRecord(row as PersistedPasskeyChallengeRow);
    },
    async markPasskeyChallengeConsumed(challenge) {
      await db
        .updateTable("identity_passkey_challenges")
        .set({
          consumed_at: new Date().toISOString()
        })
        .where("challenge", "=", challenge)
        .execute();
    },
    async listPasskeyCredentialsForUser(userId) {
      const rows = await db
        .selectFrom("identity_passkey_credentials")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute();

      return rows.map((row) => toPasskeyCredentialRecord(row as PersistedPasskeyCredentialRow));
    },
    async getPasskeyCredential(credentialId) {
      const row = await db
        .selectFrom("identity_passkey_credentials")
        .selectAll()
        .where("credential_id", "=", credentialId)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toPasskeyCredentialRecord(row as PersistedPasskeyCredentialRow);
    },
    async savePasskeyCredential(input) {
      try {
        await db
          .insertInto("identity_passkey_credentials")
          .values({
            credential_id: input.credentialId,
            user_id: input.userId,
            webauthn_user_id: input.webauthnUserId,
            public_key: input.publicKey,
            counter: input.counter,
            transports_json: input.transports,
            device_type: input.deviceType,
            backed_up: input.backedUp
          })
          .execute();
      } catch {
        await db
          .updateTable("identity_passkey_credentials")
          .set({
            user_id: input.userId,
            webauthn_user_id: input.webauthnUserId,
            public_key: input.publicKey,
            counter: input.counter,
            transports_json: input.transports,
            device_type: input.deviceType,
            backed_up: input.backedUp,
            updated_at: new Date().toISOString()
          })
          .where("credential_id", "=", input.credentialId)
          .execute();
      }
    },
    async updatePasskeyCredentialCounter(credentialId, counter) {
      await db
        .updateTable("identity_passkey_credentials")
        .set({
          counter,
          updated_at: new Date().toISOString()
        })
        .where("credential_id", "=", credentialId)
        .execute();
    },
    async close() {
      await db.destroy();
    }
  };
}

export async function createIdentityRepository(logger: FastifyBaseLogger): Promise<IdentityRepository> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    logger.info({ backend: "memory" }, "identity persistence backend selected");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "identity persistence backend selected");
    return repository;
  } catch (error) {
    logger.error({ error }, "failed to initialize postgres persistence; falling back to in-memory");
    return createInMemoryRepository();
  }
}
