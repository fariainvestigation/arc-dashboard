const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");

const root = path.resolve(__dirname, "..");
const output = path.resolve(process.argv[2] || path.join(root, "ARC_FULL_PROGRAM_NEW_DESIGN_REVIEW.html"));
const indexPath = path.join(root, "index.html");
const localAssets = [
  "arc_report_header.js",
  "arc_shared_keys.js",
  "arc_unified_bridge.js"
];

let html = fs.readFileSync(indexPath, "utf8").replace(/^\uFEFF/, "");
const baseHref = pathToFileURL(root + path.sep).href;

html = html.replace(/<head>/i, `<head>\n  <base href="${baseHref}">`);

const stylesheet = fs.readFileSync(path.join(root, "arc_uniform_design.css"), "utf8");
html = html.replace(
  /\s*<link\s+rel="stylesheet"\s+href="arc_uniform_design\.css"\s*>/i,
  `\n  <style data-inline-source="arc_uniform_design.css">\n${stylesheet}\n  </style>`
);

for (const asset of localAssets) {
  const source = fs.readFileSync(path.join(root, asset), "utf8").replace(/^\uFEFF/, "");
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = new RegExp(`\\s*<script\\s+src=["']${escaped}["']\\s*><\\/script>`, "i");
  html = html.replace(tag, `\n  <script data-inline-source="${asset}">\n${source}\n  </script>`);
}

fs.writeFileSync(output, html, "utf8");

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
scripts.forEach((match, index) => {
  new vm.Script(match[1], { filename: `${path.basename(output)}:inline-${index + 1}` });
});

if (!html.includes("07_Intelligence_Slides_Analysis_Investigator.html")) {
  throw new Error("The ARC Investigation Rebuilt route is missing from the review file.");
}
if (/<script\s+src=["'](?:arc_report_header|arc_shared_keys|arc_unified_bridge)\.js/i.test(html)) {
  throw new Error("A required local bridge script was not inlined.");
}

console.log(output);
console.log(`Validated ${scripts.length} inline scripts.`);
