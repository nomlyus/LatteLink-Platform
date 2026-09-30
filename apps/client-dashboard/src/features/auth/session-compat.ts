import { isApiRequestError } from "../../api";

export function isSessionAuthFailure(error: unknown) {
  if (isApiRequestError(error)) {
    return error.statusCode === 401;
  }
  return (
    error instanceof Error &&
    (error.message.toLowerCase().includes("refresh") || error.message.toLowerCase().includes("auth"))
  );
}
