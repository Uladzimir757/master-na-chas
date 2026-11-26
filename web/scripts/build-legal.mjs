// Копирует юридические черновики из ../docs/legal в lib/legalContent.ts
// (строки в коде: статический экспорт, Render может собирать web/ отдельно).
// Запуск: node scripts/build-legal.mjs — после правки docs/legal/*.md.
import { readFileSync, writeFileSync } from "node:fs";

const src = (f) => readFileSync(new URL(`../../docs/legal/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const docs = {
  terms: { pl: "regulamin.pl.md", en: "terms.en.md" },
  privacy: { pl: "polityka-prywatnosci.pl.md", en: "privacy-policy.en.md" },
};
let out = "// АВТОГЕНЕРАЦИЯ: node scripts/build-legal.mjs. Не править руками.\n";
out += "export const LEGAL: Record<\"terms\" | \"privacy\", Record<\"pl\" | \"en\", string>> = {\n";
for (const [k, v] of Object.entries(docs)) {
  out += `  ${k}: {\n`;
  for (const [l, f] of Object.entries(v)) out += `    ${l}: ${JSON.stringify(src(f))},\n`;
  out += "  },\n";
}
out += "};\n";
writeFileSync(new URL("../lib/legalContent.ts", import.meta.url), out);
console.log("ok");
