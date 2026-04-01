import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { authSessionSchema } from "@gazelle/contracts-core";
import {
  operatorSessionSchema,
  resolveOperatorCapabilities,
  type OperatorRole,
  type OperatorUser
} from "@gazelle/contracts-auth";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
  sql
} from "@gazelle/persistence";
import { z } from "zod";

type AuthSession = z.output<typeof authSessionSchema>;
type OperatorSession = z.output<typeof operatorSessionSchema>;

type PersistedSessionRow = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  access_expires_at: string | Date | null;
  expires_at: string | Date;
  revoked_at: string | Date | null;
};

type StoredSession = AuthSession & {
  refreshExpiresAt: string;
};

type StoredOperatorSession = {
  accessToken: string;
  refreshToken: string;
  operatorUserId: string;
  expiresAt: string;
  refreshExpiresAt: string;
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

type PersistedMagicLinkRow = {
  token: string;
  email: string;
  user_id: string | null;
  expires_at: string | Date;
  consumed_at: string | Date | null;
};

type PersistedOperatorUserRow = {
  operator_user_id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  role: OperatorRole;
  location_id: string;
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type PersistedOperatorMagicLinkRow = {
  token: string;
  email: string;
  operator_user_id: string | null;
  expires_at: string | Date;
  consumed_at: string | Date | null;
};

type PersistedOperatorSessionRow = {
  access_token: string;
  refresh_token: string;
  operator_user_id: string;
  access_expires_at: string | Date | null;
  expires_at: string | Date;
  revoked_at: string | Date | null;
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

export type IdentityUserRecord = {
  userId: string;
  appleSub?: string;
  email?: string;
};

export type MagicLinkRecord = {
  token: string;
  email: string;
  userId: string | null;
  expiresAt: string;
  consumedAt: string | null;
};

export type OperatorUserRecord = OperatorUser;

export type OperatorMagicLinkRecord = {
  token: string;
  email: string;
  operatorUserId: string | null;
  expiresAt: string;
  consumedAt: string | null;
};

export type IdentityRepository = {
  backend: "memory" | "postgres";
  saveSession(
    session: StoredSession,
    authMethod: "apple" | "passkey-register" | "passkey-auth" | "magic-link" | "refresh"
  ): Promise<void>;
  findOrCreateUserByAppleSub(appleSub: string, email?: string): Promise<string>;
  findOrCreateUserByEmail(email: string): Promise<string>;
  rotateRefreshSession(
    refreshToken: string,
    createNextSession: (userId: string) => StoredSession,
    authMethod: "refresh"
  ): Promise<AuthSession | undefined>;
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
  saveMagicLink(input: { token: string; email: string; expiresAt: string }): Promise<void>;
  getMagicLink(token: string): Promise<MagicLinkRecord | undefined>;
  consumeMagicLink(token: string, userId: string): Promise<void>;
  listOperatorUsers(locationId?: string): Promise<OperatorUserRecord[]>;
  getOperatorUserById(operatorUserId: string): Promise<OperatorUserRecord | undefined>;
  getOperatorUserByEmail(email: string): Promise<OperatorUserRecord | undefined>;
  verifyOperatorPassword(email: string, password: string): Promise<OperatorUserRecord | undefined>;
  createOperatorUser(input: {
    displayName: string;
    email: string;
    role: OperatorRole;
    locationId: string;
    password: string;
  }): Promise<OperatorUserRecord>;
  updateOperatorUser(
    operatorUserId: string,
    input: { displayName?: string; email?: string; role?: OperatorRole; active?: boolean; password?: string }
  ): Promise<OperatorUserRecord | undefined>;
  saveOperatorMagicLink(input: { token: string; email: string; expiresAt: string }): Promise<void>;
  getOperatorMagicLink(token: string): Promise<OperatorMagicLinkRecord | undefined>;
  consumeOperatorMagicLink(token: string, operatorUserId: string): Promise<void>;
  saveOperatorSession(session: StoredOperatorSession, authMethod: "magic-link" | "password" | "refresh"): Promise<void>;
  rotateOperatorRefreshSession(
    refreshToken: string,
    createNextSession: (operatorUserId: string) => StoredOperatorSession,
    authMethod: "refresh"
  ): Promise<StoredOperatorSession | undefined>;
  getOperatorSessionByAccessToken(accessToken: string): Promise<StoredOperatorSession | undefined>;
  getOperatorSessionByRefreshToken(refreshToken: string): Promise<StoredOperatorSession | undefined>;
  revokeOperatorByRefreshToken(refreshToken: string): Promise<void>;
  pingDb(): Promise<void>;
  close(): Promise<void>;
};

function parseIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function isAccessSessionActive(session: AuthSession, revokedAt: string | undefined) {
  if (revokedAt) {
    return false;
  }

  return Date.parse(session.expiresAt) > Date.now();
}

function isRefreshSessionActive(refreshExpiresAt: string, revokedAt: string | undefined) {
  if (revokedAt) {
    return false;
  }

  return Date.parse(refreshExpiresAt) > Date.now();
}

function toPublicSession(session: StoredSession): AuthSession {
  return authSessionSchema.parse(session);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashOperatorPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyOperatorPasswordHash(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(scryptSync(password, salt, expected.length).toString("hex"), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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

function toMagicLinkRecord(row: PersistedMagicLinkRow): MagicLinkRecord {
  return {
    token: row.token,
    email: row.email,
    userId: row.user_id ?? null,
    expiresAt: parseIsoDate(row.expires_at),
    consumedAt: row.consumed_at ? parseIsoDate(row.consumed_at) : null
  };
}

function getDefaultOperatorLocationId() {
  const configured = process.env.DEFAULT_OPERATOR_LOCATION_ID?.trim();
  return configured && configured.length > 0 ? configured : "flagship-01";
}

function getDefaultOperatorPassword(role: OperatorRole) {
  switch (role) {
    case "owner":
      return process.env.DEFAULT_OPERATOR_OWNER_PASSWORD?.trim() || "LatteLinkOwner123!";
    case "manager":
      return process.env.DEFAULT_OPERATOR_MANAGER_PASSWORD?.trim() || "LatteLinkManager123!";
    case "staff":
    default:
      return process.env.DEFAULT_OPERATOR_STAFF_PASSWORD?.trim() || "LatteLinkStaff123!";
  }
}

function getDefaultOperatorSeeds(): Array<{
  displayName: string;
  email: string;
  role: OperatorRole;
  locationId: string;
  password: string;
}> {
  const locationId = getDefaultOperatorLocationId();
  return [
    {
      displayName: process.env.DEFAULT_OPERATOR_OWNER_NAME?.trim() || "Store Owner",
      email: normalizeEmail(process.env.DEFAULT_OPERATOR_OWNER_EMAIL?.trim() || "owner@gazellecoffee.com"),
      role: "owner",
      locationId,
      password: getDefaultOperatorPassword("owner")
    },
    {
      displayName: process.env.DEFAULT_OPERATOR_MANAGER_NAME?.trim() || "Store Manager",
      email: normalizeEmail(process.env.DEFAULT_OPERATOR_MANAGER_EMAIL?.trim() || "manager@gazellecoffee.com"),
      role: "manager",
      locationId,
      password: getDefaultOperatorPassword("manager")
    },
    {
      displayName: process.env.DEFAULT_OPERATOR_STAFF_NAME?.trim() || "Lead Barista",
      email: normalizeEmail(process.env.DEFAULT_OPERATOR_STAFF_EMAIL?.trim() || "staff@gazellecoffee.com"),
      role: "staff",
      locationId,
      password: getDefaultOperatorPassword("staff")
    }
  ];
}

function toOperatorUserRecord(row: PersistedOperatorUserRow): OperatorUserRecord {
  return {
    operatorUserId: row.operator_user_id,
    displayName: row.display_name,
    email: normalizeEmail(row.email),
    role: row.role,
    locationId: row.location_id,
    active: row.active,
    capabilities: resolveOperatorCapabilities(row.role),
    createdAt: parseIsoDate(row.created_at),
    updatedAt: parseIsoDate(row.updated_at)
  };
}

function toOperatorMagicLinkRecord(row: PersistedOperatorMagicLinkRow): OperatorMagicLinkRecord {
  return {
    token: row.token,
    email: normalizeEmail(row.email),
    operatorUserId: row.operator_user_id ?? null,
    expiresAt: parseIsoDate(row.expires_at),
    consumedAt: row.consumed_at ? parseIsoDate(row.consumed_at) : null
  };
}

function toStoredOperatorSession(row: PersistedOperatorSessionRow): StoredOperatorSession {
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    operatorUserId: row.operator_user_id,
    expiresAt: parseIsoDate(row.access_expires_at ?? row.expires_at),
    refreshExpiresAt: parseIsoDate(row.expires_at)
  };
}

export function createInMemoryIdentityRepository(): IdentityRepository {
  const sessionsByAccessToken = new Map<string, { session: StoredSession; revokedAt?: string }>();
  const accessTokenByRefreshToken = new Map<string, string>();
  const operatorSessionsByAccessToken = new Map<string, { session: StoredOperatorSession; revokedAt?: string }>();
  const operatorAccessTokenByRefreshToken = new Map<string, string>();
  const passkeyChallengesByFlow = new Map<"register" | "auth", PasskeyChallengeRecord[]>();
  const passkeyCredentialsById = new Map<string, PasskeyCredentialRecord>();
  const usersById = new Map<string, IdentityUserRecord>();
  const userIdByAppleSub = new Map<string, string>();
  const userIdByEmail = new Map<string, string>();
  const magicLinksByToken = new Map<string, MagicLinkRecord>();
  const operatorUsersById = new Map<string, OperatorUserRecord>();
  const operatorUserIdByEmail = new Map<string, string>();
  const operatorPasswordHashByUserId = new Map<string, string>();
  const operatorMagicLinksByToken = new Map<string, OperatorMagicLinkRecord>();

  for (const seed of getDefaultOperatorSeeds()) {
    const now = new Date().toISOString();
    const operatorUserId = randomUUID();
    const record: OperatorUserRecord = {
      operatorUserId,
      displayName: seed.displayName,
      email: seed.email,
      role: seed.role,
      locationId: seed.locationId,
      active: true,
      capabilities: resolveOperatorCapabilities(seed.role),
      createdAt: now,
      updatedAt: now
    };
    operatorUsersById.set(operatorUserId, record);
    operatorUserIdByEmail.set(record.email, operatorUserId);
    operatorPasswordHashByUserId.set(operatorUserId, hashOperatorPassword(seed.password));
  }

  return {
    backend: "memory",
    async saveSession(session) {
      sessionsByAccessToken.set(session.accessToken, { session });
      accessTokenByRefreshToken.set(session.refreshToken, session.accessToken);
    },
    async findOrCreateUserByAppleSub(appleSub, email) {
      const normalizedEmail = email ? normalizeEmail(email) : undefined;
      const existingUserId =
        userIdByAppleSub.get(appleSub) ?? (normalizedEmail ? userIdByEmail.get(normalizedEmail) : undefined);
      const userId = existingUserId ?? randomUUID();
      const existingUser = usersById.get(userId);

      usersById.set(userId, {
        userId,
        appleSub,
        email: normalizedEmail ?? existingUser?.email
      });
      userIdByAppleSub.set(appleSub, userId);
      if (normalizedEmail) {
        userIdByEmail.set(normalizedEmail, userId);
      }

      return userId;
    },
    async findOrCreateUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const existingUserId = userIdByEmail.get(normalizedEmail);
      if (existingUserId) {
        const existingUser = usersById.get(existingUserId);
        usersById.set(existingUserId, {
          userId: existingUserId,
          appleSub: existingUser?.appleSub,
          email: normalizedEmail
        });
        return existingUserId;
      }

      const userId = randomUUID();
      usersById.set(userId, {
        userId,
        email: normalizedEmail
      });
      userIdByEmail.set(normalizedEmail, userId);
      return userId;
    },
    async rotateRefreshSession(refreshToken, createNextSession) {
      const accessToken = accessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return undefined;
      }

      const entry = sessionsByAccessToken.get(accessToken);
      if (!entry || !isRefreshSessionActive(entry.session.refreshExpiresAt, entry.revokedAt)) {
        return undefined;
      }

      sessionsByAccessToken.set(accessToken, {
        ...entry,
        revokedAt: new Date().toISOString()
      });
      accessTokenByRefreshToken.delete(refreshToken);

      const nextSession = createNextSession(entry.session.userId);
      sessionsByAccessToken.set(nextSession.accessToken, { session: nextSession });
      accessTokenByRefreshToken.set(nextSession.refreshToken, nextSession.accessToken);
      return toPublicSession(nextSession);
    },
    async getSessionByAccessToken(accessToken) {
      const entry = sessionsByAccessToken.get(accessToken);
      if (!entry || !isAccessSessionActive(entry.session, entry.revokedAt)) {
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
      if (!entry || !isRefreshSessionActive(entry.session.refreshExpiresAt, entry.revokedAt)) {
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
      accessTokenByRefreshToken.delete(refreshToken);
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
    async saveMagicLink(input) {
      magicLinksByToken.set(input.token, {
        token: input.token,
        email: normalizeEmail(input.email),
        userId: null,
        expiresAt: input.expiresAt,
        consumedAt: null
      });
    },
    async getMagicLink(token) {
      const record = magicLinksByToken.get(token);
      return record ? { ...record } : undefined;
    },
    async consumeMagicLink(token, userId) {
      const record = magicLinksByToken.get(token);
      if (!record) {
        return;
      }

      magicLinksByToken.set(token, {
        ...record,
        userId,
        consumedAt: new Date().toISOString()
      });
    },
    async listOperatorUsers(locationId) {
      return Array.from(operatorUsersById.values())
        .filter((user) => (locationId ? user.locationId === locationId : true))
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
    },
    async getOperatorUserById(operatorUserId) {
      const record = operatorUsersById.get(operatorUserId);
      return record ? { ...record } : undefined;
    },
    async getOperatorUserByEmail(email) {
      const operatorUserId = operatorUserIdByEmail.get(normalizeEmail(email));
      if (!operatorUserId) {
        return undefined;
      }

      const record = operatorUsersById.get(operatorUserId);
      return record ? { ...record } : undefined;
    },
    async verifyOperatorPassword(email, password) {
      const operatorUserId = operatorUserIdByEmail.get(normalizeEmail(email));
      if (!operatorUserId) {
        return undefined;
      }

      const record = operatorUsersById.get(operatorUserId);
      const passwordHash = operatorPasswordHashByUserId.get(operatorUserId);
      if (!record || !record.active || !verifyOperatorPasswordHash(password, passwordHash)) {
        return undefined;
      }

      return { ...record };
    },
    async createOperatorUser(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const existingId = operatorUserIdByEmail.get(normalizedEmail);
      if (existingId) {
        const existing = operatorUsersById.get(existingId);
        if (existing) {
          return existing;
        }
      }

      const now = new Date().toISOString();
      const record: OperatorUserRecord = {
        operatorUserId: randomUUID(),
        displayName: input.displayName.trim(),
        email: normalizedEmail,
        role: input.role,
        locationId: input.locationId,
        active: true,
        capabilities: resolveOperatorCapabilities(input.role),
        createdAt: now,
        updatedAt: now
      };

      operatorUsersById.set(record.operatorUserId, record);
      operatorUserIdByEmail.set(record.email, record.operatorUserId);
      operatorPasswordHashByUserId.set(record.operatorUserId, hashOperatorPassword(input.password));
      return { ...record };
    },
    async updateOperatorUser(operatorUserId, input) {
      const existing = operatorUsersById.get(operatorUserId);
      if (!existing) {
        return undefined;
      }

      const nextEmail = input.email ? normalizeEmail(input.email) : existing.email;
      const conflictingId = operatorUserIdByEmail.get(nextEmail);
      if (conflictingId && conflictingId !== operatorUserId) {
        throw new Error("OPERATOR_EMAIL_ALREADY_EXISTS");
      }

      if (nextEmail !== existing.email) {
        operatorUserIdByEmail.delete(existing.email);
        operatorUserIdByEmail.set(nextEmail, operatorUserId);
      }

      const nextRole = input.role ?? existing.role;
      const updated: OperatorUserRecord = {
        ...existing,
        displayName: input.displayName?.trim() || existing.displayName,
        email: nextEmail,
        role: nextRole,
        active: input.active ?? existing.active,
        capabilities: resolveOperatorCapabilities(nextRole),
        updatedAt: new Date().toISOString()
      };

      operatorUsersById.set(operatorUserId, updated);
      if (input.password) {
        operatorPasswordHashByUserId.set(operatorUserId, hashOperatorPassword(input.password));
      }
      return { ...updated };
    },
    async saveOperatorMagicLink(input) {
      const operator = Array.from(operatorUsersById.values()).find((user) => user.email === normalizeEmail(input.email));
      operatorMagicLinksByToken.set(input.token, {
        token: input.token,
        email: normalizeEmail(input.email),
        operatorUserId: operator?.operatorUserId ?? null,
        expiresAt: input.expiresAt,
        consumedAt: null
      });
    },
    async getOperatorMagicLink(token) {
      const record = operatorMagicLinksByToken.get(token);
      return record ? { ...record } : undefined;
    },
    async consumeOperatorMagicLink(token, operatorUserId) {
      const record = operatorMagicLinksByToken.get(token);
      if (!record) {
        return;
      }

      operatorMagicLinksByToken.set(token, {
        ...record,
        operatorUserId,
        consumedAt: new Date().toISOString()
      });
    },
    async saveOperatorSession(session) {
      operatorSessionsByAccessToken.set(session.accessToken, { session });
      operatorAccessTokenByRefreshToken.set(session.refreshToken, session.accessToken);
    },
    async rotateOperatorRefreshSession(refreshToken, createNextSession) {
      const accessToken = operatorAccessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return undefined;
      }

      const entry = operatorSessionsByAccessToken.get(accessToken);
      if (!entry || !isRefreshSessionActive(entry.session.refreshExpiresAt, entry.revokedAt)) {
        return undefined;
      }

      operatorSessionsByAccessToken.set(accessToken, {
        ...entry,
        revokedAt: new Date().toISOString()
      });
      operatorAccessTokenByRefreshToken.delete(refreshToken);

      const nextSession = createNextSession(entry.session.operatorUserId);
      operatorSessionsByAccessToken.set(nextSession.accessToken, { session: nextSession });
      operatorAccessTokenByRefreshToken.set(nextSession.refreshToken, nextSession.accessToken);
      return nextSession;
    },
    async getOperatorSessionByAccessToken(accessToken) {
      const entry = operatorSessionsByAccessToken.get(accessToken);
      if (!entry) {
        return undefined;
      }

      const candidate = {
        accessToken: entry.session.accessToken,
        refreshToken: entry.session.refreshToken,
        expiresAt: entry.session.expiresAt,
        userId: entry.session.operatorUserId
      };
      if (!isAccessSessionActive(authSessionSchema.parse(candidate), entry.revokedAt)) {
        return undefined;
      }

      return entry.session;
    },
    async getOperatorSessionByRefreshToken(refreshToken) {
      const accessToken = operatorAccessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return undefined;
      }

      const entry = operatorSessionsByAccessToken.get(accessToken);
      if (!entry || !isRefreshSessionActive(entry.session.refreshExpiresAt, entry.revokedAt)) {
        return undefined;
      }

      return entry.session;
    },
    async revokeOperatorByRefreshToken(refreshToken) {
      const accessToken = operatorAccessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return;
      }

      const entry = operatorSessionsByAccessToken.get(accessToken);
      if (!entry) {
        return;
      }

      operatorSessionsByAccessToken.set(accessToken, {
        ...entry,
        revokedAt: new Date().toISOString()
      });
      operatorAccessTokenByRefreshToken.delete(refreshToken);
    },
    async pingDb() {
      // no-op for in-memory
    },
    async close() {
      // no-op
    }
  };
}

async function ensureDefaultOperatorUsers(db: ReturnType<typeof createPostgresDb>) {
  for (const seed of getDefaultOperatorSeeds()) {
    await db
      .insertInto("operator_users")
      .values({
        operator_user_id: randomUUID(),
        email: seed.email,
        display_name: seed.displayName,
        password_hash: hashOperatorPassword(seed.password),
        role: seed.role,
        location_id: seed.locationId,
        active: true
      })
      .onConflict((oc) =>
        oc.column("email").doUpdateSet({
          display_name: seed.displayName,
          role: seed.role,
          location_id: seed.locationId,
          active: true,
          updated_at: new Date().toISOString()
        })
      )
      .execute();

    await db
      .updateTable("operator_users")
      .set({
        password_hash: hashOperatorPassword(seed.password),
        updated_at: new Date().toISOString()
      })
      .where("email", "=", seed.email)
      .where("password_hash", "is", null)
      .execute();
  }
}

async function createPostgresRepository(connectionString: string): Promise<IdentityRepository> {
  const db = createPostgresDb(connectionString);
  await runMigrations(db);
  await ensureDefaultOperatorUsers(db);

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
            access_expires_at: session.expiresAt,
            expires_at: session.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod
          } as never)
          .execute();
        return;
      } catch {
        await db
          .updateTable("identity_sessions")
          .set({
            refresh_token: session.refreshToken,
            user_id: session.userId,
            access_expires_at: session.expiresAt,
            expires_at: session.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod,
            updated_at: new Date().toISOString()
          } as never)
          .where("access_token", "=", session.accessToken)
          .execute();
      }
    },
    async findOrCreateUserByAppleSub(appleSub, email) {
      const normalizedEmail = email ? normalizeEmail(email) : undefined;
      const now = new Date().toISOString();

      return db.transaction().execute(async (trx) => {
        const existingAppleRow = await trx
          .selectFrom("identity_users")
          .select(["user_id", "email"])
          .where("apple_sub", "=", appleSub)
          .executeTakeFirst();

        if (existingAppleRow) {
          if (normalizedEmail) {
            const existingEmailRow = await trx
              .selectFrom("identity_users")
              .select(["user_id"])
              .where("email", "=", normalizedEmail)
              .executeTakeFirst();

            if (!existingEmailRow || existingEmailRow.user_id === existingAppleRow.user_id) {
              await trx
                .updateTable("identity_users")
                .set({
                  email: normalizedEmail,
                  updated_at: now
                })
                .where("user_id", "=", existingAppleRow.user_id)
                .execute();
            }
          } else {
            await trx
              .updateTable("identity_users")
              .set({
                updated_at: now
              })
              .where("user_id", "=", existingAppleRow.user_id)
              .execute();
          }

          return existingAppleRow.user_id;
        }

        if (normalizedEmail) {
          const existingEmailRow = await trx
            .selectFrom("identity_users")
            .select(["user_id"])
            .where("email", "=", normalizedEmail)
            .executeTakeFirst();

          if (existingEmailRow) {
            await trx
              .updateTable("identity_users")
              .set({
                apple_sub: appleSub,
                updated_at: now
              })
              .where("user_id", "=", existingEmailRow.user_id)
              .execute();

            return existingEmailRow.user_id;
          }
        }

        const userId = randomUUID();

        try {
          await trx
            .insertInto("identity_users")
            .values({
              user_id: userId,
              apple_sub: appleSub,
              email: normalizedEmail ?? null
            })
            .execute();
          return userId;
        } catch {
          const concurrentAppleRow = await trx
            .selectFrom("identity_users")
            .select(["user_id"])
            .where("apple_sub", "=", appleSub)
            .executeTakeFirst();

          if (concurrentAppleRow) {
            return concurrentAppleRow.user_id;
          }

          if (normalizedEmail) {
            const concurrentEmailRow = await trx
              .selectFrom("identity_users")
              .select(["user_id"])
              .where("email", "=", normalizedEmail)
              .executeTakeFirst();

            if (concurrentEmailRow) {
              await trx
                .updateTable("identity_users")
                .set({
                  apple_sub: appleSub,
                  updated_at: now
                })
                .where("user_id", "=", concurrentEmailRow.user_id)
                .execute();

              return concurrentEmailRow.user_id;
            }
          }

          throw new Error("Failed to resolve identity user for Apple Sign-In");
        }
      });
    },
    async findOrCreateUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const now = new Date().toISOString();

      return db.transaction().execute(async (trx) => {
        const existingRow = await trx
          .selectFrom("identity_users")
          .select(["user_id"])
          .where("email", "=", normalizedEmail)
          .executeTakeFirst();

        if (existingRow) {
          await trx
            .updateTable("identity_users")
            .set({
              updated_at: now
            })
            .where("user_id", "=", existingRow.user_id)
            .execute();

          return existingRow.user_id;
        }

        const userId = randomUUID();

        try {
          await trx
            .insertInto("identity_users")
            .values({
              user_id: userId,
              apple_sub: null,
              email: normalizedEmail
            })
            .execute();
          return userId;
        } catch {
          const concurrentRow = await trx
            .selectFrom("identity_users")
            .select(["user_id"])
            .where("email", "=", normalizedEmail)
            .executeTakeFirst();

          if (!concurrentRow) {
            throw new Error("Failed to resolve identity user for email");
          }

          await trx
            .updateTable("identity_users")
            .set({
              updated_at: now
            })
            .where("user_id", "=", concurrentRow.user_id)
            .execute();

          return concurrentRow.user_id;
        }
      });
    },
    async rotateRefreshSession(refreshToken, createNextSession, authMethod) {
      return db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom("identity_sessions")
          .selectAll()
          .where("refresh_token", "=", refreshToken)
          .forUpdate()
          .executeTakeFirst();

        if (!row) {
          return undefined;
        }

        const persisted = row as unknown as PersistedSessionRow;
        const revokedAt = persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined;
        if (!isRefreshSessionActive(parseIsoDate(persisted.expires_at), revokedAt)) {
          return undefined;
        }

        await trx
          .updateTable("identity_sessions")
          .set({
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .where("access_token", "=", persisted.access_token)
          .execute();

        const nextSession = createNextSession(persisted.user_id);
        await trx
          .insertInto("identity_sessions")
          .values({
            access_token: nextSession.accessToken,
            refresh_token: nextSession.refreshToken,
            user_id: nextSession.userId,
            access_expires_at: nextSession.expiresAt,
            expires_at: nextSession.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod
          } as never)
          .execute();

        return toPublicSession(nextSession);
      });
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

      const persisted = row as unknown as PersistedSessionRow;
      const session = authSessionSchema.parse({
        accessToken: persisted.access_token,
        refreshToken: persisted.refresh_token,
        userId: persisted.user_id,
        expiresAt: parseIsoDate(persisted.access_expires_at ?? persisted.expires_at)
      });

      if (!isAccessSessionActive(session, persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
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

      const persisted = row as unknown as PersistedSessionRow;
      const session = authSessionSchema.parse({
        accessToken: persisted.access_token,
        refreshToken: persisted.refresh_token,
        userId: persisted.user_id,
        expiresAt: parseIsoDate(persisted.access_expires_at ?? persisted.expires_at)
      });

      if (!isRefreshSessionActive(parseIsoDate(persisted.expires_at), persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
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
    async saveMagicLink(input) {
      await db
        .insertInto("identity_magic_links")
        .values({
          token: input.token,
          email: normalizeEmail(input.email),
          user_id: null,
          expires_at: input.expiresAt,
          consumed_at: null
        })
        .execute();
    },
    async getMagicLink(token) {
      const row = await db
        .selectFrom("identity_magic_links")
        .selectAll()
        .where("token", "=", token)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toMagicLinkRecord(row as PersistedMagicLinkRow);
    },
    async consumeMagicLink(token, userId) {
      await db
        .updateTable("identity_magic_links")
        .set({
          user_id: userId,
          consumed_at: new Date().toISOString()
        })
        .where("token", "=", token)
        .execute();
    },
    async listOperatorUsers(locationId) {
      const query = db.selectFrom("operator_users").selectAll().orderBy("display_name", "asc");
      const rows = locationId ? await query.where("location_id", "=", locationId).execute() : await query.execute();
      return rows.map((row) => toOperatorUserRecord(row as PersistedOperatorUserRow));
    },
    async getOperatorUserById(operatorUserId) {
      const row = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("operator_user_id", "=", operatorUserId)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toOperatorUserRecord(row as PersistedOperatorUserRow);
    },
    async getOperatorUserByEmail(email) {
      const row = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("email", "=", normalizeEmail(email))
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toOperatorUserRecord(row as PersistedOperatorUserRow);
    },
    async verifyOperatorPassword(email, password) {
      const row = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("email", "=", normalizeEmail(email))
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as PersistedOperatorUserRow;
      if (!persisted.active || !verifyOperatorPasswordHash(password, persisted.password_hash)) {
        return undefined;
      }

      return toOperatorUserRecord(persisted);
    },
    async createOperatorUser(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const now = new Date().toISOString();
      const operatorUserId = randomUUID();

      try {
        await db
          .insertInto("operator_users")
          .values({
            operator_user_id: operatorUserId,
            email: normalizedEmail,
            display_name: input.displayName.trim(),
            password_hash: hashOperatorPassword(input.password),
            role: input.role,
            location_id: input.locationId,
            active: true
          })
          .execute();
      } catch {
        const existing = await db
          .selectFrom("operator_users")
          .selectAll()
          .where("email", "=", normalizedEmail)
          .executeTakeFirst();
        if (!existing) {
          throw new Error("Failed to create operator user");
        }

        await db
          .updateTable("operator_users")
          .set({
            display_name: input.displayName.trim(),
            password_hash: existing.password_hash ?? hashOperatorPassword(input.password),
            role: input.role,
            location_id: input.locationId,
            active: true,
            updated_at: now
          })
          .where("operator_user_id", "=", existing.operator_user_id)
          .execute();

        const updated = await db
          .selectFrom("operator_users")
          .selectAll()
          .where("operator_user_id", "=", existing.operator_user_id)
          .executeTakeFirstOrThrow();

        return toOperatorUserRecord(updated as PersistedOperatorUserRow);
      }

      const created = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("operator_user_id", "=", operatorUserId)
        .executeTakeFirstOrThrow();
      return toOperatorUserRecord(created as PersistedOperatorUserRow);
    },
    async updateOperatorUser(operatorUserId, input) {
      const existing = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("operator_user_id", "=", operatorUserId)
        .executeTakeFirst();

      if (!existing) {
        return undefined;
      }

      const nextEmail = input.email ? normalizeEmail(input.email) : existing.email;
      if (nextEmail !== existing.email) {
        const conflicting = await db
          .selectFrom("operator_users")
          .select("operator_user_id")
          .where("email", "=", nextEmail)
          .executeTakeFirst();
        if (conflicting && conflicting.operator_user_id !== operatorUserId) {
          throw new Error("OPERATOR_EMAIL_ALREADY_EXISTS");
        }
      }

      await db
        .updateTable("operator_users")
        .set({
          email: nextEmail,
          display_name: input.displayName?.trim() ?? existing.display_name,
          ...(input.password ? { password_hash: hashOperatorPassword(input.password) } : {}),
          role: input.role ?? existing.role,
          active: input.active ?? existing.active,
          updated_at: new Date().toISOString()
        })
        .where("operator_user_id", "=", operatorUserId)
        .execute();

      const updated = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("operator_user_id", "=", operatorUserId)
        .executeTakeFirstOrThrow();

      return toOperatorUserRecord(updated as PersistedOperatorUserRow);
    },
    async saveOperatorMagicLink(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const operator = await db
        .selectFrom("operator_users")
        .select("operator_user_id")
        .where("email", "=", normalizedEmail)
        .executeTakeFirst();

      await db
        .insertInto("operator_magic_links")
        .values({
          token: input.token,
          email: normalizedEmail,
          operator_user_id: operator?.operator_user_id ?? null,
          expires_at: input.expiresAt,
          consumed_at: null
        })
        .execute();
    },
    async getOperatorMagicLink(token) {
      const row = await db
        .selectFrom("operator_magic_links")
        .selectAll()
        .where("token", "=", token)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toOperatorMagicLinkRecord(row as PersistedOperatorMagicLinkRow);
    },
    async consumeOperatorMagicLink(token, operatorUserId) {
      await db
        .updateTable("operator_magic_links")
        .set({
          operator_user_id: operatorUserId,
          consumed_at: new Date().toISOString()
        })
        .where("token", "=", token)
        .execute();
    },
    async saveOperatorSession(session, authMethod) {
      try {
        await db
          .insertInto("operator_sessions")
          .values({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            operator_user_id: session.operatorUserId,
            access_expires_at: session.expiresAt,
            expires_at: session.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod
          })
          .execute();
        return;
      } catch {
        await db
          .updateTable("operator_sessions")
          .set({
            refresh_token: session.refreshToken,
            operator_user_id: session.operatorUserId,
            access_expires_at: session.expiresAt,
            expires_at: session.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod,
            updated_at: new Date().toISOString()
          })
          .where("access_token", "=", session.accessToken)
          .execute();
      }
    },
    async rotateOperatorRefreshSession(refreshToken, createNextSession, authMethod) {
      return db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom("operator_sessions")
          .selectAll()
          .where("refresh_token", "=", refreshToken)
          .forUpdate()
          .executeTakeFirst();

        if (!row) {
          return undefined;
        }

        const persisted = row as unknown as PersistedOperatorSessionRow;
        const revokedAt = persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined;
        if (!isRefreshSessionActive(parseIsoDate(persisted.expires_at), revokedAt)) {
          return undefined;
        }

        await trx
          .updateTable("operator_sessions")
          .set({
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .where("access_token", "=", persisted.access_token)
          .execute();

        const nextSession = createNextSession(persisted.operator_user_id);
        await trx
          .insertInto("operator_sessions")
          .values({
            access_token: nextSession.accessToken,
            refresh_token: nextSession.refreshToken,
            operator_user_id: nextSession.operatorUserId,
            access_expires_at: nextSession.expiresAt,
            expires_at: nextSession.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod
          })
          .execute();

        return nextSession;
      });
    },
    async getOperatorSessionByAccessToken(accessToken) {
      const row = await db
        .selectFrom("operator_sessions")
        .selectAll()
        .where("access_token", "=", accessToken)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as unknown as PersistedOperatorSessionRow;
      const session = toStoredOperatorSession(persisted);
      const accessSession = authSessionSchema.parse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        userId: session.operatorUserId
      });

      if (!isAccessSessionActive(accessSession, persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
        return undefined;
      }

      return session;
    },
    async getOperatorSessionByRefreshToken(refreshToken) {
      const row = await db
        .selectFrom("operator_sessions")
        .selectAll()
        .where("refresh_token", "=", refreshToken)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as unknown as PersistedOperatorSessionRow;
      if (!isRefreshSessionActive(parseIsoDate(persisted.expires_at), persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
        return undefined;
      }

      return toStoredOperatorSession(persisted);
    },
    async revokeOperatorByRefreshToken(refreshToken) {
      await db
        .updateTable("operator_sessions")
        .set({
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where("refresh_token", "=", refreshToken)
        .execute();
    },
    async pingDb() {
      await sql`SELECT 1`.execute(db);
    },
    async close() {
      await db.destroy();
    }
  };
}

export async function createIdentityRepository(logger: FastifyBaseLogger): Promise<IdentityRepository> {
  const databaseUrl = getDatabaseUrl();
  const allowInMemory = allowsInMemoryPersistence();
  if (!databaseUrl) {
    if (!allowInMemory) {
      throw buildPersistenceStartupError({
        service: "identity",
        reason: "missing_database_url"
      });
    }

    logger.warn({ backend: "memory" }, "identity persistence backend selected with explicit in-memory mode");
    return createInMemoryIdentityRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "identity persistence backend selected");
    return repository;
  } catch (error) {
    if (!allowInMemory) {
      logger.error({ error }, "failed to initialize postgres persistence");
      throw buildPersistenceStartupError({
        service: "identity",
        reason: "postgres_initialization_failed"
      });
    }

    logger.error({ error }, "failed to initialize postgres persistence; using explicit in-memory fallback");
    return createInMemoryIdentityRepository();
  }
}
