import type { OperatorUser } from "./api.js";

const pendingTeamUserUpdates = new Map<string, OperatorUser>();

export function replaceTeamUser(teamUsers: OperatorUser[], updatedUser: OperatorUser) {
  return teamUsers.map((user) => (user.operatorUserId === updatedUser.operatorUserId ? updatedUser : user));
}

function isAtLeastAsFresh(candidate: OperatorUser, pending: OperatorUser) {
  const candidateUpdatedAt = Date.parse(candidate.updatedAt);
  const pendingUpdatedAt = Date.parse(pending.updatedAt);
  if (Number.isFinite(candidateUpdatedAt) && Number.isFinite(pendingUpdatedAt)) {
    return candidateUpdatedAt >= pendingUpdatedAt;
  }

  return (
    candidate.displayName === pending.displayName &&
    candidate.email === pending.email &&
    candidate.role === pending.role &&
    candidate.active === pending.active
  );
}

export function rememberPendingTeamUserUpdate(updatedUser: OperatorUser) {
  pendingTeamUserUpdates.set(updatedUser.operatorUserId, updatedUser);
}

export function mergePendingTeamUserUpdates(teamUsers: OperatorUser[]) {
  return teamUsers.map((user) => {
    const pending = pendingTeamUserUpdates.get(user.operatorUserId);
    if (!pending) {
      return user;
    }

    if (isAtLeastAsFresh(user, pending)) {
      pendingTeamUserUpdates.delete(user.operatorUserId);
      return user;
    }

    return pending;
  });
}
