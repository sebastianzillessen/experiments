// Tiny helper: load profile.yaml as JSON into window.__profile.
// Run from the project dir:
//   node load-profile.js  > profile.json
// then in Chrome devtools:
//   window.__profile = <paste JSON>
//
// Keeps the YAML file out of the browser's filesystem and avoids any
// network round-trip at 07:00.

const fs = require("fs");
const path = require("path");

function parseYaml(src) {
  // Minimal YAML: 2-space indent, scalars, nested maps. No lists, no anchors.
  // Good enough for profile.yaml; swap for `js-yaml` if you need more.
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = raw.trim();
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (rest === "" || rest === "{}") {
      parent[key] = rest === "{}" ? {} : {};
      stack.push({ indent, obj: parent[key] });
    } else {
      let v = rest;
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      parent[key] = v;
    }
  }
  return root;
}

const file = path.join(__dirname, "profile.yaml");
if (!fs.existsSync(file)) {
  console.error("profile.yaml not found — copy from profile.example.yaml first");
  process.exit(1);
}
const data = parseYaml(fs.readFileSync(file, "utf8"));
process.stdout.write(JSON.stringify(data, null, 2) + "\n");
