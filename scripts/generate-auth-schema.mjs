import { getAuthTables } from "@better-auth/core/db";
import { writeFileSync } from "node:fs";
const tables = getAuthTables({});
let source =
  "// Generated from installed Better Auth getAuthTables({}); review before migration.\nimport { pgSchema, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';\nexport const appAuth = pgSchema('app_auth');\n";
for (const [name, table] of Object.entries(tables)) {
  let fields = ["id: text('id').primaryKey()"];
  let indexes = [];
  for (const [key, f] of Object.entries(table.fields)) {
    let field =
      f.type === "date"
        ? `timestamp('${key}', {withTimezone:true})`
        : f.type === "boolean"
          ? `boolean('${key}')`
          : `text('${key}')`;
    if (f.required) field += ".notNull()";
    if (f.unique) field += ".unique()";
    if (f.defaultValue === false) field += ".default(false)";
    if (f.type === "date" && f.defaultValue) field += ".defaultNow()";
    if (f.references)
      field += `.references(()=>${f.references.model}.${f.references.field}, {onDelete:'${f.references.onDelete}'})`;
    fields.push(`${key}: ${field}`);
    if (f.index) indexes.push(`index('${name}_${key}_idx').on(t.${key})`);
  }
  source += `export const ${name}=appAuth.table('${name}', {\n${fields.join(",\n")}\n}${indexes.length ? `, (t)=>[${indexes.join(",")}]` : ""});\n`;
}
writeFileSync("src/server/db/auth-schema.ts", source);
console.log("Auth table schema generated from installed library.");
