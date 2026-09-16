// Reaching this route means Proxy did not complete the external rewrite.
// Fail closed rather than forwarding without the Proxy authorization boundary.
function unavailable() {
  return Response.json(
    { error: "application_proxy_unavailable" },
    {
      status: 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
export {
  unavailable as GET,
  unavailable as HEAD,
  unavailable as POST,
  unavailable as PUT,
  unavailable as PATCH,
  unavailable as DELETE,
  unavailable as OPTIONS,
};
