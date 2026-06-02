import type { OperatorUser } from "./api.js";

export function replaceTeamUser(teamUsers: OperatorUser[], updatedUser: OperatorUser) {
  return teamUsers.map((user) => (user.operatorUserId === updatedUser.operatorUserId ? updatedUser : user));
}
