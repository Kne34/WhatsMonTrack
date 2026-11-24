// Lists texts passed to tr() that have no English entry in src/lib/i18n-en.ts.
// Run: npm run check:i18n (exits with 1 when something is missing).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

const root = join(import.meta.dirname, "..");
const ts = createRequire(import.meta.url)("typescript");

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(join(root, "src"));

const dictFile = join(root, "src/lib/i18n-en.ts");
const dict = new Map();
(function read(node, sf) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && ts.isStringLiteral(node.initializer)) dict.set(node.name.text, node.initializer.text);
  ts.forEachChild(node, (n) => read(n, sf));
})(ts.createSourceFile(dictFile, readFileSync(dictFile, "utf8"), ts.ScriptTarget.Latest, true));

const missing = new Map();
const placeholders = [];
const names = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  (function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === "tr") {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        const en = dict.get(arg.text);
        if (en === undefined) missing.set(arg.text, relative(root, file));
        else if (names(en) !== names(arg.text)) placeholders.push(`${arg.text}  ->  ${en}`);
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
}

for (const [text, file] of missing) console.log(`missing  ${JSON.stringify(text)}  (${file})`);
for (const p of placeholders) console.log(`placeholders differ  ${p}`);
console.log(`${dict.size} English texts, ${missing.size} missing, ${placeholders.length} with different placeholders`);
process.exit(missing.size || placeholders.length ? 1 : 0);
