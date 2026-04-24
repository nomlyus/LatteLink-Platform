import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { authSessionSchema } from "@lattelink/contracts-core";
import {
  resolveInternalAdminCapabilities,
  resolveOperatorCapabilities,
  type InternalAdminRole,
  type InternalAdminUser,
  type OperatorRole,
  type OperatorUser
} from "@lattelink/contracts-auth";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
  sql
} from "@lattelink/persistence";
import { z } from "zod";

type AuthSession = z.output<typeof authSessionSchema>;

type PersistedSessionRow = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  access_expires_at: string | Date | null;
  expires_at: string | Date;
  revoked_at: string | Date | null;
};

type PersistedIdentityUserRow = {
  user_id: string;
  apple_sub: string | null;
  apple_client_id: string | null;
  apple_refresh_token: string | null;
  email: string | null;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  birthday: string | Date | null;
  profile_completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
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

type StoredInternalAdminSession = {
  accessToken: string;
  refreshToken: string;
  internalAdminUserId: string;
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

type PersistedOperatorUserRow = {
  operator_user_id: string;
  email: string;
  google_sub: string | null;
  display_name: string;
  password_hash: string | null;
  role: OperatorRole;
  location_id: string;
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type PersistedOperatorLocationAccessRow = {
  operator_user_id: string;
  location_id: string;
};

type PersistedOperatorSessionRow = {
  access_token: string;
  refresh_token: string;
  operator_user_id: string;
  access_expires_at: string | Date | null;
  expires_at: string | Date;
  revoked_at: string | Date | null;
};

type PersistedInternalAdminUserRow = {
  internal_admin_user_id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: InternalAdminRole;
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type PersistedInternalAdminSessionRow = {
  access_token: string;
  refresh_token: string;
  internal_admin_user_id: string;
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
  name?: string;
  displayName?: string;
  phoneNumber?: string;
  birthday?: string;
  profileCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type CustomerAuthMethod = "apple" | "passkey";

export type AppleAccountRecord = {
  appleSub: string;
  clientId?: string;
  refreshToken?: string;
};

export type OperatorUserRecord = OperatorUser;
export type InternalAdminUserRecord = InternalAdminUser;

export type IdentityRepository = {
  backend: "memory" | "postgres";
  saveSession(
    session: StoredSession,
    authMethod: "apple" | "passkey-register" | "passkey-auth" | "refresh"
  ): Promise<void>;
  findOrCreateUserByAppleSub(input: {
    appleSub: string;
    email?: string;
    clientId: string;
    refreshToken?: string;
  }): Promise<{ userId: string; hasRefreshToken: boolean }>;
  findOrCreateUserByEmail(email: string): Promise<string>;
  getAppleAccountForUser(userId: string): Promise<AppleAccountRecord | undefined>;
  getUserById(userId: string): Promise<IdentityUserRecord | undefined>;
  deleteCustomerAccount(userId: string): Promise<boolean>;
  updateCustomerProfile(
    userId: string,
    input: { name: string; phoneNumber?: string; birthday?: string }
  ): Promise<IdentityUserRecord | undefined>;
  listAuthMethodsForUser(userId: string): Promise<CustomerAuthMethod[]>;
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
  listOperatorUsers(locationId?: string): Promise<OperatorUserRecord[]>;
  getOperatorUserById(operatorUserId: string): Promise<OperatorUserRecord | undefined>;
  getOperatorUserByEmail(email: string): Promise<OperatorUserRecord | undefined>;
  getOperatorUserByGoogleSub(googleSub: string): Promise<OperatorUserRecord | undefined>;
  resolveOperatorUserForGoogleSignIn(input: {
    googleSub: string;
    email?: string;
    emailVerified: boolean;
  }): Promise<OperatorUserRecord | undefined>;
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
  saveOperatorSession(session: StoredOperatorSession, authMethod: "password" | "google" | "refresh"): Promise<void>;
  rotateOperatorRefreshSession(
    refreshToken: string,
    createNextSession: (operatorUserId: string) => StoredOperatorSession,
    authMethod: "refresh"
  ): Promise<StoredOperatorSession | undefined>;
  getOperatorSessionByAccessToken(accessToken: string): Promise<StoredOperatorSession | undefined>;
  getOperatorSessionByRefreshToken(refreshToken: string): Promise<StoredOperatorSession | undefined>;
  revokeOperatorByRefreshToken(refreshToken: string): Promise<void>;
  getInternalAdminUserById(internalAdminUserId: string): Promise<InternalAdminUserRecord | undefined>;
  getInternalAdminUserByEmail(email: string): Promise<InternalAdminUserRecord | undefined>;
  verifyInternalAdminPassword(email: string, password: string): Promise<InternalAdminUserRecord | undefined>;
  saveInternalAdminSession(
    session: StoredInternalAdminSession,
    authMethod: "password" | "refresh"
  ): Promise<void>;
  rotateInternalAdminRefreshSession(
    refreshToken: string,
    createNextSession: (internalAdminUserId: string) => StoredInternalAdminSession,
    authMethod: "refresh"
  ): Promise<StoredInternalAdminSession | undefined>;
  getInternalAdminSessionByAccessToken(accessToken: string): Promise<StoredInternalAdminSession | undefined>;
  getInternalAdminSessionByRefreshToken(refreshToken: string): Promise<StoredInternalAdminSession | undefined>;
  revokeInternalAdminByRefreshToken(refreshToken: string): Promise<void>;
  pingDb(): Promise<void>;
  close(): Promise<void>;
};

function parseIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function parseDbDate(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return undefined;
  }

  return rawValue.slice(0, 10);
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

function toIdentityUserRecord(row: PersistedIdentityUserRow): IdentityUserRecord {
  return {
    userId: row.user_id,
    appleSub: row.apple_sub ?? undefined,
    email: row.email ? normalizeEmail(row.email) : undefined,
    name: row.name?.trim() || undefined,
    displayName: row.display_name?.trim() || undefined,
    phoneNumber: row.phone_number?.trim() || undefined,
    birthday: parseDbDate(row.birthday),
    profileCompletedAt: row.profile_completed_at ? parseIsoDate(row.profile_completed_at) : undefined,
    createdAt: parseIsoDate(row.created_at),
    updatedAt: parseIsoDate(row.updated_at)
  };
}

function normalizeCustomerAuthMethod(
  value: "apple" | "passkey-register" | "passkey-auth" | "refresh"
): CustomerAuthMethod | undefined {
  switch (value) {
    case "apple":
      return "apple";
    case "passkey-register":
    case "passkey-auth":
      return "passkey";
    case "refresh":
    default:
      return undefined;
  }
}

function toSortedCustomerAuthMethods(methods: Iterable<CustomerAuthMethod>): CustomerAuthMethod[] {
  const ordered: CustomerAuthMethod[] = [];
  const methodSet = new Set(methods);

  for (const method of ["apple", "passkey"] as const) {
    if (methodSet.has(method)) {
      ordered.push(method);
    }
  }

  return ordered;
}

function normalizeOperatorLocationIds(primaryLocationId: string, locationIds?: readonly string[]) {
  return Array.from(new Set([primaryLocationId, ...(locationIds ?? [])]));
}

function isStoreRole(role: OperatorRole) {
  return role === "store";
}

function getDefaultInternalAdminSeeds(): Array<{
  displayName: string;
  email: string;
  role: InternalAdminRole;
  password: string;
}> {
  const seeds: Array<{
    displayName: string;
    email: string;
    role: InternalAdminRole;
    password: string;
  }> = [
    {
      displayName: process.env.DEFAULT_INTERNAL_ADMIN_OWNER_NAME?.trim() || "Platform Owner",
      email: normalizeEmail(process.env.DEFAULT_INTERNAL_ADMIN_OWNER_EMAIL?.trim() || "admin@gazellecoffee.com"),
      role: "platform_owner",
      password: process.env.DEFAULT_INTERNAL_ADMIN_OWNER_PASSWORD?.trim() || "GazelleAdmin123!"
    },
    {
      displayName: process.env.DEFAULT_INTERNAL_ADMIN_OPERATOR_NAME?.trim() || "Platform Operator",
      email: normalizeEmail(process.env.DEFAULT_INTERNAL_ADMIN_OPERATOR_EMAIL?.trim() || "ops@gazellecoffee.com"),
      role: "platform_operator",
      password: process.env.DEFAULT_INTERNAL_ADMIN_OPERATOR_PASSWORD?.trim() || "GazelleOps123!"
    }
  ];

  const supportEmail = process.env.DEFAULT_INTERNAL_ADMIN_SUPPORT_EMAIL?.trim();
  const supportPassword = process.env.DEFAULT_INTERNAL_ADMIN_SUPPORT_PASSWORD?.trim();
  if (supportEmail && supportPassword) {
    seeds.push({
      displayName: process.env.DEFAULT_INTERNAL_ADMIN_SUPPORT_NAME?.trim() || "Support Read Only",
      email: normalizeEmail(supportEmail),
      role: "support_readonly",
      password: supportPassword
    });
  }

  return seeds;
}

function toOperatorUserRecord(row: PersistedOperatorUserRow, locationIds?: readonly string[]): OperatorUserRecord {
  return {
    operatorUserId: row.operator_user_id,
    displayName: row.display_name,
    email: normalizeEmail(row.email),
    role: row.role,
    locationId: row.location_id,
    locationIds: normalizeOperatorLocationIds(row.location_id, locationIds),
    active: row.active,
    capabilities: resolveOperatorCapabilities(row.role),
    createdAt: parseIsoDate(row.created_at),
    updatedAt: parseIsoDate(row.updated_at)
  };
}

function toInternalAdminUserRecord(row: PersistedInternalAdminUserRow): InternalAdminUserRecord {
  return {
    internalAdminUserId: row.internal_admin_user_id,
    displayName: row.display_name,
    email: normalizeEmail(row.email),
    role: row.role,
    active: row.active,
    capabilities: resolveInternalAdminCapabilities(row.role),
    createdAt: parseIsoDate(row.created_at),
    updatedAt: parseIsoDate(row.updated_at)
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

function toStoredInternalAdminSession(row: PersistedInternalAdminSessionRow): StoredInternalAdminSession {
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    internalAdminUserId: row.internal_admin_user_id,
    expiresAt: parseIsoDate(row.access_expires_at ?? row.expires_at),
    refreshExpiresAt: parseIsoDate(row.expires_at)
  };
}

export function createInMemoryIdentityRepository(): IdentityRepository {
  const sessionsByAccessToken = new Map<string, { session: StoredSession; revokedAt?: string }>();
  const accessTokenByRefreshToken = new Map<string, string>();
  const customerAuthMethodsByUserId = new Map<string, Set<CustomerAuthMethod>>();
  const operatorSessionsByAccessToken = new Map<string, { session: StoredOperatorSession; revokedAt?: string }>();
  const operatorAccessTokenByRefreshToken = new Map<string, string>();
  const internalAdminSessionsByAccessToken = new Map<string, { session: StoredInternalAdminSession; revokedAt?: string }>();
  const internalAdminAccessTokenByRefreshToken = new Map<string, string>();
  const passkeyChallengesByFlow = new Map<"register" | "auth", PasskeyChallengeRecord[]>();
  const passkeyCredentialsById = new Map<string, PasskeyCredentialRecord>();
  const usersById = new Map<string, IdentityUserRecord>();
  const appleRefreshTokenByUserId = new Map<string, string>();
  const appleClientIdByUserId = new Map<string, string>();
  const userIdByAppleSub = new Map<string, string>();
  const userIdByEmail = new Map<string, string>();
  const operatorUsersById = new Map<string, OperatorUserRecord>();
  const operatorLocationIdsByUserId = new Map<string, Set<string>>();
  const operatorUserIdByEmail = new Map<string, string>();
  const operatorUserIdByGoogleSub = new Map<string, string>();
  const operatorPasswordHashByUserId = new Map<string, string>();
  const internalAdminUsersById = new Map<string, InternalAdminUserRecord>();
  const internalAdminUserIdByEmail = new Map<string, string>();
  const internalAdminPasswordHashByUserId = new Map<string, string>();

  function setOperatorLocationAccess(operatorUserId: string, primaryLocationId: string, extraLocationIds?: Iterable<string>) {
    operatorLocationIdsByUserId.set(
      operatorUserId,
      new Set(normalizeOperatorLocationIds(primaryLocationId, extraLocationIds ? Array.from(extraLocationIds) : undefined))
    );
  }

  function getOperatorLocationIds(operatorUserId: string, primaryLocationId: string) {
    return normalizeOperatorLocationIds(primaryLocationId, Array.from(operatorLocationIdsByUserId.get(operatorUserId) ?? []));
  }

  function cloneOperatorRecord(record: OperatorUserRecord) {
    return {
      ...record,
      locationIds: getOperatorLocationIds(record.operatorUserId, record.locationId)
    };
  }

  function ensureStoreAccountAvailable(locationId: string, excludeOperatorUserId?: string) {
    for (const record of operatorUsersById.values()) {
      if (record.operatorUserId === excludeOperatorUserId || record.role !== "store") {
        continue;
      }

      if (getOperatorLocationIds(record.operatorUserId, record.locationId).includes(locationId)) {
        throw new Error("STORE_ACCOUNT_ALREADY_EXISTS");
      }
    }
  }

  for (const seed of getDefaultInternalAdminSeeds()) {
    const now = new Date().toISOString();
    const internalAdminUserId = randomUUID();
    const record: InternalAdminUserRecord = {
      internalAdminUserId,
      displayName: seed.displayName,
      email: seed.email,
      role: seed.role,
      active: true,
      capabilities: resolveInternalAdminCapabilities(seed.role),
      createdAt: now,
      updatedAt: now
    };
    internalAdminUsersById.set(internalAdminUserId, record);
    internalAdminUserIdByEmail.set(record.email, internalAdminUserId);
    internalAdminPasswordHashByUserId.set(internalAdminUserId, hashOperatorPassword(seed.password));
  }

  return {
    backend: "memory",
    async saveSession(session, authMethod) {
      const normalizedAuthMethod = normalizeCustomerAuthMethod(authMethod);
      if (normalizedAuthMethod) {
        const methods = customerAuthMethodsByUserId.get(session.userId) ?? new Set<CustomerAuthMethod>();
        methods.add(normalizedAuthMethod);
        customerAuthMethodsByUserId.set(session.userId, methods);
      }

      sessionsByAccessToken.set(session.accessToken, { session });
      accessTokenByRefreshToken.set(session.refreshToken, session.accessToken);
    },
    async findOrCreateUserByAppleSub(input) {
      const normalizedEmail = input.email ? normalizeEmail(input.email) : undefined;
      const existingUserId =
        userIdByAppleSub.get(input.appleSub) ?? (normalizedEmail ? userIdByEmail.get(normalizedEmail) : undefined);
      const userId = existingUserId ?? randomUUID();
      const existingUser = usersById.get(userId);
      const now = new Date().toISOString();

      usersById.set(userId, {
        userId,
        appleSub: input.appleSub,
        email: normalizedEmail ?? existingUser?.email,
        name: existingUser?.name,
        displayName: existingUser?.displayName,
        phoneNumber: existingUser?.phoneNumber,
        birthday: existingUser?.birthday,
        profileCompletedAt: existingUser?.profileCompletedAt,
        createdAt: existingUser?.createdAt ?? now,
        updatedAt: now
      });
      userIdByAppleSub.set(input.appleSub, userId);
      if (normalizedEmail) {
        userIdByEmail.set(normalizedEmail, userId);
      }

      if (input.refreshToken) {
        appleRefreshTokenByUserId.set(userId, input.refreshToken);
        appleClientIdByUserId.set(userId, input.clientId);
      }

      return {
        userId,
        hasRefreshToken: appleRefreshTokenByUserId.has(userId)
      };
    },
    async findOrCreateUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const existingUserId = userIdByEmail.get(normalizedEmail);
      const now = new Date().toISOString();
      if (existingUserId) {
        const existingUser = usersById.get(existingUserId);
        usersById.set(existingUserId, {
          userId: existingUserId,
          appleSub: existingUser?.appleSub,
          email: normalizedEmail,
          name: existingUser?.name,
          displayName: existingUser?.displayName,
          phoneNumber: existingUser?.phoneNumber,
          birthday: existingUser?.birthday,
          profileCompletedAt: existingUser?.profileCompletedAt,
          createdAt: existingUser?.createdAt ?? now,
          updatedAt: now
        });
        return existingUserId;
      }

      const userId = randomUUID();
      usersById.set(userId, {
        userId,
        email: normalizedEmail,
        createdAt: now,
        updatedAt: now
      });
      userIdByEmail.set(normalizedEmail, userId);
      return userId;
    },
    async getUserById(userId) {
      return usersById.get(userId);
    },
    async getAppleAccountForUser(userId) {
      const user = usersById.get(userId);
      if (!user?.appleSub) {
        return undefined;
      }

      return {
        appleSub: user.appleSub,
        clientId: appleClientIdByUserId.get(userId),
        refreshToken: appleRefreshTokenByUserId.get(userId)
      };
    },
    async deleteCustomerAccount(userId) {
      const existing = usersById.get(userId);
      if (!existing) {
        return false;
      }

      usersById.delete(userId);
      customerAuthMethodsByUserId.delete(userId);

      if (existing.appleSub) {
        userIdByAppleSub.delete(existing.appleSub);
      }
      if (existing.email) {
        userIdByEmail.delete(existing.email);
      }
      appleRefreshTokenByUserId.delete(userId);
      appleClientIdByUserId.delete(userId);

      for (const [accessToken, entry] of sessionsByAccessToken.entries()) {
        if (entry.session.userId !== userId) {
          continue;
        }

        accessTokenByRefreshToken.delete(entry.session.refreshToken);
        sessionsByAccessToken.delete(accessToken);
      }

      for (const [flow, entries] of passkeyChallengesByFlow.entries()) {
        passkeyChallengesByFlow.set(
          flow,
          entries.filter((entry) => entry.userId !== userId)
        );
      }

      for (const [credentialId, credential] of passkeyCredentialsById.entries()) {
        if (credential.userId === userId) {
          passkeyCredentialsById.delete(credentialId);
        }
      }

      return true;
    },
    async updateCustomerProfile(userId, input) {
      const existing = usersById.get(userId);
      if (!existing) {
        return undefined;
      }

      const updated: IdentityUserRecord = {
        ...existing,
        name: input.name.trim(),
        displayName: input.name.trim(),
        phoneNumber: input.phoneNumber !== undefined ? input.phoneNumber.trim() : existing.phoneNumber,
        birthday: input.birthday !== undefined ? input.birthday.trim() : existing.birthday,
        profileCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      usersById.set(userId, updated);
      return updated;
    },
    async listAuthMethodsForUser(userId) {
      const methods = new Set<CustomerAuthMethod>(customerAuthMethodsByUserId.get(userId) ?? []);
      const user = usersById.get(userId);
      if (user?.appleSub) {
        methods.add("apple");
      }
      return toSortedCustomerAuthMethods(methods);
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
    async listOperatorUsers(locationId) {
      return Array.from(operatorUsersById.values())
        .filter((user) => (locationId ? getOperatorLocationIds(user.operatorUserId, user.locationId).includes(locationId) : true))
        .map((user) => cloneOperatorRecord(user))
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
    },
    async getOperatorUserById(operatorUserId) {
      const record = operatorUsersById.get(operatorUserId);
      return record ? cloneOperatorRecord(record) : undefined;
    },
    async getOperatorUserByEmail(email) {
      const operatorUserId = operatorUserIdByEmail.get(normalizeEmail(email));
      if (!operatorUserId) {
        return undefined;
      }

      const record = operatorUsersById.get(operatorUserId);
      return record ? cloneOperatorRecord(record) : undefined;
    },
    async getOperatorUserByGoogleSub(googleSub) {
      const operatorUserId = operatorUserIdByGoogleSub.get(googleSub);
      if (!operatorUserId) {
        return undefined;
      }

      const record = operatorUsersById.get(operatorUserId);
      return record ? cloneOperatorRecord(record) : undefined;
    },
    async resolveOperatorUserForGoogleSignIn(input) {
      const existingByGoogleSub = operatorUserIdByGoogleSub.get(input.googleSub);
      if (existingByGoogleSub) {
        const existing = operatorUsersById.get(existingByGoogleSub);
        return existing && existing.active ? cloneOperatorRecord(existing) : undefined;
      }

      if (!input.emailVerified || !input.email) {
        return undefined;
      }

      const normalizedEmail = normalizeEmail(input.email);
      const operatorUserId = operatorUserIdByEmail.get(normalizedEmail);
      if (!operatorUserId) {
        return undefined;
      }

      const existing = operatorUsersById.get(operatorUserId);
      if (!existing || !existing.active) {
        return undefined;
      }

      operatorUserIdByGoogleSub.set(input.googleSub, operatorUserId);
      return cloneOperatorRecord(existing);
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

      return cloneOperatorRecord(record);
    },
    async createOperatorUser(input) {
      const normalizedEmail = normalizeEmail(input.email);
      if (isStoreRole(input.role)) {
        ensureStoreAccountAvailable(input.locationId);
      }
      const existingId = operatorUserIdByEmail.get(normalizedEmail);
      if (existingId) {
        const existing = operatorUsersById.get(existingId);
        if (existing) {
          const updated: OperatorUserRecord = {
            ...existing,
            displayName: input.displayName.trim(),
            role: input.role,
            locationId: input.locationId,
            active: true,
            capabilities: resolveOperatorCapabilities(input.role),
            updatedAt: new Date().toISOString()
          };

          operatorUsersById.set(existingId, updated);
          setOperatorLocationAccess(existingId, updated.locationId, [
            ...getOperatorLocationIds(existingId, existing.locationId),
            input.locationId
          ]);
          if (!operatorPasswordHashByUserId.has(existingId)) {
            operatorPasswordHashByUserId.set(existingId, hashOperatorPassword(input.password));
          }

          return cloneOperatorRecord(updated);
        }
      }

      const now = new Date().toISOString();
      const record: OperatorUserRecord = {
        operatorUserId: randomUUID(),
        displayName: input.displayName.trim(),
        email: normalizedEmail,
        role: input.role,
        locationId: input.locationId,
        locationIds: [input.locationId],
        active: true,
        capabilities: resolveOperatorCapabilities(input.role),
        createdAt: now,
        updatedAt: now
      };

      operatorUsersById.set(record.operatorUserId, record);
      setOperatorLocationAccess(record.operatorUserId, record.locationId);
      operatorUserIdByEmail.set(record.email, record.operatorUserId);
      operatorPasswordHashByUserId.set(record.operatorUserId, hashOperatorPassword(input.password));
      return cloneOperatorRecord(record);
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
      if (isStoreRole(nextRole)) {
        ensureStoreAccountAvailable(existing.locationId, operatorUserId);
      }
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
      setOperatorLocationAccess(operatorUserId, updated.locationId, getOperatorLocationIds(operatorUserId, existing.locationId));
      return cloneOperatorRecord(updated);
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
    async getInternalAdminUserById(internalAdminUserId) {
      const record = internalAdminUsersById.get(internalAdminUserId);
      return record ? { ...record } : undefined;
    },
    async getInternalAdminUserByEmail(email) {
      const internalAdminUserId = internalAdminUserIdByEmail.get(normalizeEmail(email));
      if (!internalAdminUserId) {
        return undefined;
      }

      const record = internalAdminUsersById.get(internalAdminUserId);
      return record ? { ...record } : undefined;
    },
    async verifyInternalAdminPassword(email, password) {
      const internalAdminUserId = internalAdminUserIdByEmail.get(normalizeEmail(email));
      if (!internalAdminUserId) {
        return undefined;
      }

      const record = internalAdminUsersById.get(internalAdminUserId);
      const passwordHash = internalAdminPasswordHashByUserId.get(internalAdminUserId);
      if (!record || !record.active || !verifyOperatorPasswordHash(password, passwordHash)) {
        return undefined;
      }

      return { ...record };
    },
    async saveInternalAdminSession(session) {
      internalAdminSessionsByAccessToken.set(session.accessToken, { session });
      internalAdminAccessTokenByRefreshToken.set(session.refreshToken, session.accessToken);
    },
    async rotateInternalAdminRefreshSession(refreshToken, createNextSession) {
      const accessToken = internalAdminAccessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return undefined;
      }

      const entry = internalAdminSessionsByAccessToken.get(accessToken);
      if (!entry || !isRefreshSessionActive(entry.session.refreshExpiresAt, entry.revokedAt)) {
        return undefined;
      }

      internalAdminSessionsByAccessToken.set(accessToken, {
        ...entry,
        revokedAt: new Date().toISOString()
      });
      internalAdminAccessTokenByRefreshToken.delete(refreshToken);

      const nextSession = createNextSession(entry.session.internalAdminUserId);
      internalAdminSessionsByAccessToken.set(nextSession.accessToken, { session: nextSession });
      internalAdminAccessTokenByRefreshToken.set(nextSession.refreshToken, nextSession.accessToken);
      return nextSession;
    },
    async getInternalAdminSessionByAccessToken(accessToken) {
      const entry = internalAdminSessionsByAccessToken.get(accessToken);
      if (!entry) {
        return undefined;
      }

      const candidate = {
        accessToken: entry.session.accessToken,
        refreshToken: entry.session.refreshToken,
        expiresAt: entry.session.expiresAt,
        userId: entry.session.internalAdminUserId
      };
      if (!isAccessSessionActive(authSessionSchema.parse(candidate), entry.revokedAt)) {
        return undefined;
      }

      return entry.session;
    },
    async getInternalAdminSessionByRefreshToken(refreshToken) {
      const accessToken = internalAdminAccessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return undefined;
      }

      const entry = internalAdminSessionsByAccessToken.get(accessToken);
      if (!entry || !isRefreshSessionActive(entry.session.refreshExpiresAt, entry.revokedAt)) {
        return undefined;
      }

      return entry.session;
    },
    async revokeInternalAdminByRefreshToken(refreshToken) {
      const accessToken = internalAdminAccessTokenByRefreshToken.get(refreshToken);
      if (!accessToken) {
        return;
      }

      const entry = internalAdminSessionsByAccessToken.get(accessToken);
      if (!entry) {
        return;
      }

      internalAdminSessionsByAccessToken.set(accessToken, {
        ...entry,
        revokedAt: new Date().toISOString()
      });
      internalAdminAccessTokenByRefreshToken.delete(refreshToken);
    },
    async pingDb() {
      // no-op for in-memory
    },
    async close() {
      // no-op
    }
  };
}

async function ensureDefaultInternalAdminUsers(db: ReturnType<typeof createPostgresDb>) {
  for (const seed of getDefaultInternalAdminSeeds()) {
    await db
      .insertInto("internal_admin_users")
      .values({
        internal_admin_user_id: randomUUID(),
        email: seed.email,
        display_name: seed.displayName,
        password_hash: hashOperatorPassword(seed.password),
        role: seed.role,
        active: true
      })
      .onConflict((oc) =>
        oc.column("email").doUpdateSet({
          display_name: seed.displayName,
          role: seed.role,
          active: true,
          updated_at: new Date().toISOString()
        })
      )
      .execute();
  }
}

async function createPostgresRepository(connectionString: string): Promise<IdentityRepository> {
  const db = createPostgresDb(connectionString);
  await runMigrations(db);
  await ensureDefaultInternalAdminUsers(db);

  const loadOperatorLocationIdsByUserId = async (operatorUserIds: readonly string[]) => {
    const uniqueOperatorUserIds = Array.from(new Set(operatorUserIds));
    const locationIdsByUserId = new Map<string, string[]>();
    if (uniqueOperatorUserIds.length === 0) {
      return locationIdsByUserId;
    }

    const rows = await db
      .selectFrom("operator_location_access")
      .select(["operator_user_id", "location_id"])
      .where("operator_user_id", "in", uniqueOperatorUserIds)
      .orderBy("location_id", "asc")
      .execute();

    for (const row of rows as PersistedOperatorLocationAccessRow[]) {
      const existing = locationIdsByUserId.get(row.operator_user_id) ?? [];
      existing.push(row.location_id);
      locationIdsByUserId.set(row.operator_user_id, existing);
    }

    return locationIdsByUserId;
  };

  const hydrateOperatorUser = async (row: PersistedOperatorUserRow | undefined) => {
    if (!row) {
      return undefined;
    }

    const locationIdsByUserId = await loadOperatorLocationIdsByUserId([row.operator_user_id]);
    return toOperatorUserRecord(row, locationIdsByUserId.get(row.operator_user_id));
  };

  const hydrateOperatorUsers = async (rows: PersistedOperatorUserRow[]) => {
    const locationIdsByUserId = await loadOperatorLocationIdsByUserId(rows.map((row) => row.operator_user_id));
    return rows.map((row) => toOperatorUserRecord(row, locationIdsByUserId.get(row.operator_user_id)));
  };

  const grantOperatorLocationAccess = async (executor: typeof db, operatorUserId: string, locationId: string) => {
    await executor
      .insertInto("operator_location_access")
      .values({
        operator_user_id: operatorUserId,
        location_id: locationId
      })
      .onConflict((oc) => oc.columns(["operator_user_id", "location_id"]).doNothing())
      .execute();
  };

  const ensureStoreAccountAvailable = async (locationId: string, excludeOperatorUserId?: string) => {
    const query = db
      .selectFrom("operator_users")
      .innerJoin(
        "operator_location_access",
        "operator_location_access.operator_user_id",
        "operator_users.operator_user_id"
      )
      .select("operator_users.operator_user_id")
      .where("operator_users.role", "=", "store")
      .where("operator_location_access.location_id", "=", locationId);

    const existing = excludeOperatorUserId
      ? await query.where("operator_users.operator_user_id", "!=", excludeOperatorUserId).executeTakeFirst()
      : await query.executeTakeFirst();

    if (existing) {
      throw new Error("STORE_ACCOUNT_ALREADY_EXISTS");
    }
  };

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
    async findOrCreateUserByAppleSub(input) {
      const normalizedEmail = input.email ? normalizeEmail(input.email) : undefined;
      const now = new Date().toISOString();

      return db.transaction().execute(async (trx) => {
        const existingAppleRow = await trx
          .selectFrom("identity_users")
          .select(["user_id", "email", "apple_refresh_token"])
          .where("apple_sub", "=", input.appleSub)
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
                  ...(input.refreshToken
                    ? {
                        apple_client_id: input.clientId,
                        apple_refresh_token: input.refreshToken
                      }
                    : {}),
                  updated_at: now
                })
                .where("user_id", "=", existingAppleRow.user_id)
                .execute();
            }
          } else {
            await trx
              .updateTable("identity_users")
              .set({
                ...(input.refreshToken
                  ? {
                      apple_client_id: input.clientId,
                      apple_refresh_token: input.refreshToken
                    }
                  : {}),
                updated_at: now
              })
              .where("user_id", "=", existingAppleRow.user_id)
              .execute();
          }

          return {
            userId: existingAppleRow.user_id,
            hasRefreshToken: Boolean(input.refreshToken ?? existingAppleRow.apple_refresh_token)
          };
        }

        if (normalizedEmail) {
          const existingEmailRow = await trx
            .selectFrom("identity_users")
            .select(["user_id", "apple_refresh_token"])
            .where("email", "=", normalizedEmail)
            .executeTakeFirst();

          if (existingEmailRow) {
            await trx
              .updateTable("identity_users")
              .set({
                apple_sub: input.appleSub,
                ...(input.refreshToken
                  ? {
                      apple_client_id: input.clientId,
                      apple_refresh_token: input.refreshToken
                    }
                  : {}),
                updated_at: now
              })
              .where("user_id", "=", existingEmailRow.user_id)
              .execute();

            return {
              userId: existingEmailRow.user_id,
              hasRefreshToken: Boolean(input.refreshToken ?? existingEmailRow.apple_refresh_token)
            };
          }
        }

        const userId = randomUUID();

        try {
          await trx
            .insertInto("identity_users")
            .values({
              user_id: userId,
              apple_sub: input.appleSub,
              apple_client_id: input.refreshToken ? input.clientId : null,
              apple_refresh_token: input.refreshToken ?? null,
              email: normalizedEmail ?? null
            })
            .execute();
          return {
            userId,
            hasRefreshToken: Boolean(input.refreshToken)
          };
        } catch {
          const concurrentAppleRow = await trx
            .selectFrom("identity_users")
            .select(["user_id", "apple_refresh_token"])
            .where("apple_sub", "=", input.appleSub)
            .executeTakeFirst();

          if (concurrentAppleRow) {
            if (input.refreshToken) {
              await trx
                .updateTable("identity_users")
                .set({
                  apple_client_id: input.clientId,
                  apple_refresh_token: input.refreshToken,
                  updated_at: now
                })
                .where("user_id", "=", concurrentAppleRow.user_id)
                .execute();
            }

            return {
              userId: concurrentAppleRow.user_id,
              hasRefreshToken: Boolean(input.refreshToken ?? concurrentAppleRow.apple_refresh_token)
            };
          }

          if (normalizedEmail) {
            const concurrentEmailRow = await trx
              .selectFrom("identity_users")
              .select(["user_id", "apple_refresh_token"])
              .where("email", "=", normalizedEmail)
              .executeTakeFirst();

            if (concurrentEmailRow) {
              await trx
                .updateTable("identity_users")
                .set({
                  apple_sub: input.appleSub,
                  ...(input.refreshToken
                    ? {
                        apple_client_id: input.clientId,
                        apple_refresh_token: input.refreshToken
                      }
                    : {}),
                  updated_at: now
                })
                .where("user_id", "=", concurrentEmailRow.user_id)
                .execute();

              return {
                userId: concurrentEmailRow.user_id,
                hasRefreshToken: Boolean(input.refreshToken ?? concurrentEmailRow.apple_refresh_token)
              };
            }
          }

          throw new Error("Failed to resolve identity user for Apple Sign-In");
        }
      });
    },
    async getAppleAccountForUser(userId) {
      const row = await db
        .selectFrom("identity_users")
        .select(["apple_sub", "apple_client_id", "apple_refresh_token"])
        .where("user_id", "=", userId)
        .executeTakeFirst();

      if (!row?.apple_sub) {
        return undefined;
      }

      return {
        appleSub: row.apple_sub,
        clientId: row.apple_client_id ?? undefined,
        refreshToken: row.apple_refresh_token ?? undefined
      };
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
    async getUserById(userId) {
      const row = await db
        .selectFrom("identity_users")
        .selectAll()
        .where("user_id", "=", userId)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toIdentityUserRecord(row as PersistedIdentityUserRow);
    },
    async deleteCustomerAccount(userId) {
      return db.transaction().execute(async (trx) => {
        const user = await trx
          .selectFrom("identity_users")
          .select(["user_id", "email"])
          .where("user_id", "=", userId)
          .forUpdate()
          .executeTakeFirst();

        if (!user) {
          return false;
        }

        const orders = await trx
          .selectFrom("orders")
          .select(["order_id", "quote_id"])
          .where("user_id", "=", userId)
          .execute();

        const orderIds = orders.map((row) => row.order_id);
        const quoteIds = orders.map((row) => row.quote_id);

        await trx.deleteFrom("notifications_outbox").where("user_id", "=", userId).execute();
        await trx.deleteFrom("notifications_order_state_dispatches").where("user_id", "=", userId).execute();
        await trx.deleteFrom("notifications_push_tokens").where("user_id", "=", userId).execute();

        await trx.deleteFrom("loyalty_idempotency_keys").where("user_id", "=", userId).execute();
        await trx.deleteFrom("loyalty_ledger_entries").where("user_id", "=", userId).execute();
        await trx.deleteFrom("loyalty_balances").where("user_id", "=", userId).execute();

        if (orderIds.length > 0) {
          await trx.deleteFrom("payments_webhook_deduplication").where("order_id", "in", orderIds).execute();
          await trx.deleteFrom("payments_refunds").where("order_id", "in", orderIds).execute();
          await trx.deleteFrom("payments_charges").where("order_id", "in", orderIds).execute();
          await trx.deleteFrom("orders_payment_idempotency").where("order_id", "in", orderIds).execute();
        }

        if (quoteIds.length > 0) {
          await trx.deleteFrom("orders_create_idempotency").where("quote_id", "in", quoteIds).execute();
        }

        await trx.deleteFrom("orders").where("user_id", "=", userId).execute();

        if (quoteIds.length > 0) {
          await trx.deleteFrom("orders_quotes").where("quote_id", "in", quoteIds).execute();
        }

        await trx.deleteFrom("identity_passkey_credentials").where("user_id", "=", userId).execute();
        await trx.deleteFrom("identity_passkey_challenges").where("user_id", "=", userId).execute();
        await trx.deleteFrom("identity_sessions").where("user_id", "=", userId).execute();

        await trx.deleteFrom("identity_users").where("user_id", "=", userId).execute();
        return true;
      });
    },
    async updateCustomerProfile(userId, input) {
      const existing = await db
        .selectFrom("identity_users")
        .selectAll()
        .where("user_id", "=", userId)
        .executeTakeFirst();

      if (!existing) {
        return undefined;
      }

      await db
        .updateTable("identity_users")
        .set({
          name: input.name.trim(),
          display_name: input.name.trim(),
          ...(input.phoneNumber !== undefined ? { phone_number: input.phoneNumber.trim() } : {}),
          ...(input.birthday !== undefined ? { birthday: input.birthday.trim() } : {}),
          profile_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where("user_id", "=", userId)
        .execute();

      const updated = await db
        .selectFrom("identity_users")
        .selectAll()
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();

      return toIdentityUserRecord(updated as PersistedIdentityUserRow);
    },
    async listAuthMethodsForUser(userId) {
      const [userRow, sessionRows] = await Promise.all([
        db
          .selectFrom("identity_users")
          .select(["apple_sub"])
          .where("user_id", "=", userId)
          .executeTakeFirst(),
        db
          .selectFrom("identity_sessions")
          .select(["auth_method"])
          .where("user_id", "=", userId)
          .execute()
      ]);

      const methods = new Set<CustomerAuthMethod>();
      if (userRow?.apple_sub) {
        methods.add("apple");
      }

      for (const row of sessionRows) {
        const method = normalizeCustomerAuthMethod(row.auth_method);
        if (method) {
          methods.add(method);
        }
      }

      return toSortedCustomerAuthMethods(methods);
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
    async listOperatorUsers(locationId) {
      const rows = locationId
        ? await db
            .selectFrom("operator_users")
            .innerJoin(
              "operator_location_access",
              "operator_location_access.operator_user_id",
              "operator_users.operator_user_id"
            )
            .selectAll("operator_users")
            .where("operator_location_access.location_id", "=", locationId)
            .orderBy("operator_users.display_name", "asc")
            .execute()
        : await db.selectFrom("operator_users").selectAll().orderBy("display_name", "asc").execute();
      return hydrateOperatorUsers(rows as PersistedOperatorUserRow[]);
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

      return hydrateOperatorUser(row as PersistedOperatorUserRow);
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

      return hydrateOperatorUser(row as PersistedOperatorUserRow);
    },
    async getOperatorUserByGoogleSub(googleSub) {
      const row = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("google_sub", "=", googleSub)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return hydrateOperatorUser(row as PersistedOperatorUserRow);
    },
    async resolveOperatorUserForGoogleSignIn(input) {
      const normalizedEmail = input.email ? normalizeEmail(input.email) : undefined;
      const now = new Date().toISOString();

      const operatorUserId = await db.transaction().execute(async (trx) => {
        const existingGoogle = await trx
          .selectFrom("operator_users")
          .selectAll()
          .where("google_sub", "=", input.googleSub)
          .executeTakeFirst();

        if (existingGoogle) {
          if (!existingGoogle.active) {
            return undefined;
          }

          if (input.emailVerified && normalizedEmail && normalizedEmail !== existingGoogle.email) {
            const conflicting = await trx
              .selectFrom("operator_users")
              .select("operator_user_id")
              .where("email", "=", normalizedEmail)
              .executeTakeFirst();

            if (!conflicting || conflicting.operator_user_id === existingGoogle.operator_user_id) {
              await trx
                .updateTable("operator_users")
                .set({
                  email: normalizedEmail,
                  updated_at: now
                })
                .where("operator_user_id", "=", existingGoogle.operator_user_id)
                .execute();
            }
          }

          const refreshed = await trx
            .selectFrom("operator_users")
            .select("operator_user_id")
            .where("operator_user_id", "=", existingGoogle.operator_user_id)
            .executeTakeFirstOrThrow();

          return refreshed.operator_user_id;
        }

        if (!input.emailVerified || !normalizedEmail) {
          return undefined;
        }

        const existingEmail = await trx
          .selectFrom("operator_users")
          .selectAll()
          .where("email", "=", normalizedEmail)
          .executeTakeFirst();

        if (!existingEmail || !existingEmail.active) {
          return undefined;
        }

        try {
          await trx
            .updateTable("operator_users")
            .set({
              google_sub: input.googleSub,
              updated_at: now
            })
            .where("operator_user_id", "=", existingEmail.operator_user_id)
            .execute();
        } catch {
          const concurrentGoogle = await trx
            .selectFrom("operator_users")
            .selectAll()
            .where("google_sub", "=", input.googleSub)
            .executeTakeFirst();

          if (!concurrentGoogle || !concurrentGoogle.active) {
            return undefined;
          }

          return concurrentGoogle.operator_user_id;
        }

        const updated = await trx
          .selectFrom("operator_users")
          .select("operator_user_id")
          .where("operator_user_id", "=", existingEmail.operator_user_id)
          .executeTakeFirstOrThrow();

        return updated.operator_user_id;
      });
      if (!operatorUserId) {
        return undefined;
      }

      const refreshed = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("operator_user_id", "=", operatorUserId)
        .executeTakeFirst();
      return hydrateOperatorUser(refreshed as PersistedOperatorUserRow | undefined);
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

      return hydrateOperatorUser(persisted);
    },
    async createOperatorUser(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const now = new Date().toISOString();
      const operatorUserId = randomUUID();

      if (isStoreRole(input.role)) {
        await ensureStoreAccountAvailable(input.locationId);
      }

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
        await grantOperatorLocationAccess(db, operatorUserId, input.locationId);
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
        await grantOperatorLocationAccess(db, existing.operator_user_id, input.locationId);

        const updated = await db
          .selectFrom("operator_users")
          .selectAll()
          .where("operator_user_id", "=", existing.operator_user_id)
          .executeTakeFirstOrThrow();

        return (await hydrateOperatorUser(updated as PersistedOperatorUserRow)) as OperatorUserRecord;
      }

      const created = await db
        .selectFrom("operator_users")
        .selectAll()
        .where("operator_user_id", "=", operatorUserId)
        .executeTakeFirstOrThrow();
      return (await hydrateOperatorUser(created as PersistedOperatorUserRow)) as OperatorUserRecord;
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

      const nextRole = input.role ?? existing.role;
      if (isStoreRole(nextRole)) {
        await ensureStoreAccountAvailable(existing.location_id, operatorUserId);
      }

      await db
        .updateTable("operator_users")
        .set({
          email: nextEmail,
          display_name: input.displayName?.trim() ?? existing.display_name,
          ...(input.password ? { password_hash: hashOperatorPassword(input.password) } : {}),
          role: nextRole,
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

      return (await hydrateOperatorUser(updated as PersistedOperatorUserRow)) as OperatorUserRecord;
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
    async getInternalAdminUserById(internalAdminUserId) {
      const row = await db
        .selectFrom("internal_admin_users")
        .selectAll()
        .where("internal_admin_user_id", "=", internalAdminUserId)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toInternalAdminUserRecord(row as PersistedInternalAdminUserRow);
    },
    async getInternalAdminUserByEmail(email) {
      const row = await db
        .selectFrom("internal_admin_users")
        .selectAll()
        .where("email", "=", normalizeEmail(email))
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return toInternalAdminUserRecord(row as PersistedInternalAdminUserRow);
    },
    async verifyInternalAdminPassword(email, password) {
      const row = await db
        .selectFrom("internal_admin_users")
        .selectAll()
        .where("email", "=", normalizeEmail(email))
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as PersistedInternalAdminUserRow;
      if (!persisted.active || !verifyOperatorPasswordHash(password, persisted.password_hash)) {
        return undefined;
      }

      return toInternalAdminUserRecord(persisted);
    },
    async saveInternalAdminSession(session, authMethod) {
      try {
        await db
          .insertInto("internal_admin_sessions")
          .values({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            internal_admin_user_id: session.internalAdminUserId,
            access_expires_at: session.expiresAt,
            expires_at: session.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod
          })
          .execute();
        return;
      } catch {
        await db
          .updateTable("internal_admin_sessions")
          .set({
            refresh_token: session.refreshToken,
            internal_admin_user_id: session.internalAdminUserId,
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
    async rotateInternalAdminRefreshSession(refreshToken, createNextSession, authMethod) {
      return db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom("internal_admin_sessions")
          .selectAll()
          .where("refresh_token", "=", refreshToken)
          .forUpdate()
          .executeTakeFirst();

        if (!row) {
          return undefined;
        }

        const persisted = row as unknown as PersistedInternalAdminSessionRow;
        const revokedAt = persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined;
        if (!isRefreshSessionActive(parseIsoDate(persisted.expires_at), revokedAt)) {
          return undefined;
        }

        await trx
          .updateTable("internal_admin_sessions")
          .set({
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .where("access_token", "=", persisted.access_token)
          .execute();

        const nextSession = createNextSession(persisted.internal_admin_user_id);
        await trx
          .insertInto("internal_admin_sessions")
          .values({
            access_token: nextSession.accessToken,
            refresh_token: nextSession.refreshToken,
            internal_admin_user_id: nextSession.internalAdminUserId,
            access_expires_at: nextSession.expiresAt,
            expires_at: nextSession.refreshExpiresAt,
            revoked_at: null,
            auth_method: authMethod
          })
          .execute();

        return nextSession;
      });
    },
    async getInternalAdminSessionByAccessToken(accessToken) {
      const row = await db
        .selectFrom("internal_admin_sessions")
        .selectAll()
        .where("access_token", "=", accessToken)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as unknown as PersistedInternalAdminSessionRow;
      const session = toStoredInternalAdminSession(persisted);
      const accessSession = authSessionSchema.parse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        userId: session.internalAdminUserId
      });

      if (!isAccessSessionActive(accessSession, persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
        return undefined;
      }

      return session;
    },
    async getInternalAdminSessionByRefreshToken(refreshToken) {
      const row = await db
        .selectFrom("internal_admin_sessions")
        .selectAll()
        .where("refresh_token", "=", refreshToken)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const persisted = row as unknown as PersistedInternalAdminSessionRow;
      if (!isRefreshSessionActive(parseIsoDate(persisted.expires_at), persisted.revoked_at ? parseIsoDate(persisted.revoked_at) : undefined)) {
        return undefined;
      }

      return toStoredInternalAdminSession(persisted);
    },
    async revokeInternalAdminByRefreshToken(refreshToken) {
      await db
        .updateTable("internal_admin_sessions")
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
