import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parse } from "yaml"

const root = process.cwd()
const sourcePath = path.join(root, "docs", "openapi.yaml")
const outputPath = path.join(root, "docs", "openapi.json")
const specification = parse(readFileSync(sourcePath, "utf8"))

if (!specification || typeof specification !== "object") {
  throw new Error("La especificación OpenAPI está vacía o no es un objeto")
}

mkdirSync(path.dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(specification, null, 2)}\n`, "utf8")
console.log(`OpenAPI generado en ${path.relative(root, outputPath)}`)
