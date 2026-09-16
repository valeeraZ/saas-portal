import { writeFileSync } from "node:fs";
process.env.PORTAL_TLS_KEY_FILE = ".local/auth-config/.local/tls.key";
process.env.PORTAL_TLS_CERT_FILE = ".local/auth-config/.local/tls.crt";
writeFileSync(".local/portal.pid", String(process.pid));
await import("../server.ts");
