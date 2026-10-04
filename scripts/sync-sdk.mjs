import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const sdk = resolve(process.argv[2] ?? "../saas-sdk");
if (
  execFileSync("git", ["status", "--porcelain"], {
    cwd: sdk,
    encoding: "utf8",
  }).trim()
)
  throw new Error(
    "Commit SDK changes before syncing packages so provenance identifies the exact source.",
  );
const root = resolve(import.meta.dirname, "..");
const destination = join(root, "vendor/sdk");
const wanted = [
  "@saas-platform/theme",
  "@saas-platform/ui",
  "@saas-platform/shell",
];
const metadata = JSON.parse(
  readFileSync(join(sdk, "artifacts/npm-pack.json"), "utf8"),
).filter((p) => wanted.includes(p.name));
if (metadata.length !== wanted.length)
  throw new Error("Run npm run pack in saas-sdk first");
mkdirSync(destination, { recursive: true });
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const packages = metadata.map((p) => {
  const bytes = readFileSync(join(sdk, "artifacts", p.filename));
  const integrity =
    "sha512-" + createHash("sha512").update(bytes).digest("base64");
  if (integrity !== p.integrity)
    throw new Error("Package integrity mismatch: " + p.name);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = p.filename.replace(
    /\.tgz$/,
    "-" + sha256.slice(0, 12) + ".tgz",
  );
  copyFileSync(join(sdk, "artifacts", p.filename), join(destination, filename));
  manifest.dependencies[p.name] = "file:vendor/sdk/" + filename;
  return {
    name: p.name,
    version: p.version,
    filename,
    sourceFilename: p.filename,
    integrity,
    sha256,
  };
});
for (const name of readdirSync(destination))
  if (name.endsWith(".tgz") && !packages.some((p) => p.filename === name))
    unlinkSync(join(destination, name));
writeFileSync(
  join(root, "package.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  join(destination, "manifest.json"),
  JSON.stringify(
    {
      source: "https://github.com/valeeraZ/saas-sdk",
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: sdk,
        encoding: "utf8",
      }).trim(),
      packages,
    },
    null,
    2,
  ) + "\n",
);
console.log("Synced SDK packages; run npm install to update the lockfile.");
