import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const phase = process.env.AUDIT_PHASE ?? "candidate";
const listing = JSON.parse(execFileSync("pnpm", ["list", "--json", "--depth", "Infinity", "--prod"], { encoding: "utf8" }))[0];
const lockHash = createHash("sha256").update(await readFile("pnpm-lock.yaml")).digest("hex");
const components = new Map();
const relations = new Map();

function purl(name, version) {
  const encoded = name.startsWith("@") ? `%40${name.slice(1).split("/").map(encodeURIComponent).join("/")}` : encodeURIComponent(name);
  return `pkg:npm/${encoded}@${version}`;
}

function visit(name, item) {
  if (!item?.version) return null;
  const ref = purl(name, item.version);
  components.set(ref, { type: "library", name, version: item.version, purl: ref, "bom-ref": ref });
  const children = [];
  for (const [childName, child] of Object.entries(item.dependencies ?? {})) {
    const childRef = visit(childName, child);
    if (childRef) children.push(childRef);
  }
  relations.set(ref, [...new Set(children)].sort());
  return ref;
}

const rootRef = `pkg:npm/aperture-hours@${listing.version}`;
const rootChildren = [];
for (const [name, item] of Object.entries(listing.dependencies ?? {})) {
  const ref = visit(name, item);
  if (ref) rootChildren.push(ref);
}
relations.set(rootRef, [...new Set(rootChildren)].sort());
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${lockHash.slice(0, 8)}-${lockHash.slice(8, 12)}-4${lockHash.slice(13, 16)}-a${lockHash.slice(17, 20)}-${lockHash.slice(20, 32)}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: { components: [{ type: "application", name: "aperture-hours-pnpm-sbom", version: "1.0.0" }] },
    component: { type: "application", name: listing.name, version: listing.version, purl: rootRef, "bom-ref": rootRef },
    properties: [{ name: "aperture-hours:pnpm-lock-sha256", value: lockHash }]
  },
  components: [...components.values()].sort((a, b) => a.purl.localeCompare(b.purl)),
  dependencies: [...relations.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ref, dependsOn]) => ({ ref, dependsOn }))
};
const destination = path.resolve(`../reports/${phase}/sbom.json`);
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(sbom, null, 2)}\n`);
console.log(JSON.stringify({ destination, components: sbom.components.length, lockHash }, null, 2));
