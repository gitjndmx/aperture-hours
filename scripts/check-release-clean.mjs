import { access } from "node:fs/promises";
import path from "node:path";

const forbidden = [".audit-plan.json", ".env.local"];
const present = [];
for (const name of forbidden) {
  try {
    await access(path.resolve(name));
    present.push(name);
  } catch {}
}
if (present.length) throw new Error(`Release tree contains local-only files: ${present.join(", ")}`);
console.log(JSON.stringify({ status: "clean", absent: forbidden }));
