const codes = [
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid_input",
  "already_exists",
  "service_unavailable",
  "dependency_unavailable",
  "csrf",
  "bad_request",
];
export function errorKey(code: unknown) {
  return typeof code === "string" && codes.includes(code) ? code : "fallback";
}
