import { readFileSync } from "node:fs"
import path from "node:path"
import { parse } from "yaml"

type OpenApiDocument = {
  openapi?: unknown
  info?: unknown
  paths?: Record<string, unknown>
}

const root = process.cwd()
const sourcePath = path.join(root, "docs", "openapi.yaml")
const generatedPath = path.join(root, "docs", "openapi.json")
const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head"])

function loadDocument(filePath: string): OpenApiDocument {
  const document = parse(readFileSync(filePath, "utf8")) as OpenApiDocument
  if (!document || typeof document !== "object") throw new Error(`${filePath} no contiene un objeto`)
  if (typeof document.openapi !== "string" || !/^3\.\d+\.\d+$/.test(document.openapi)) {
    throw new Error(`${filePath} no declara una versión OpenAPI 3 válida`)
  }
  if (!document.info || typeof document.info !== "object") throw new Error(`${filePath} no contiene info`)
  if (!document.paths || typeof document.paths !== "object") throw new Error(`${filePath} no contiene paths`)
  return document
}

function validatePaths(filePath: string, document: OpenApiDocument) {
  const paths = document.paths ?? {}
  for (const [route, item] of Object.entries(paths)) {
    if (!route.startsWith("/")) throw new Error(`Ruta inválida en ${filePath}: ${route}`)
    if (!item || typeof item !== "object") throw new Error(`Definición inválida para ${route}`)

    for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
      if (!methods.has(method)) continue
      if (!operation || typeof operation !== "object") throw new Error(`Operación inválida: ${method.toUpperCase()} ${route}`)
      const responses = (operation as { responses?: unknown }).responses
      if (!responses || typeof responses !== "object" || Object.keys(responses).length === 0) {
        throw new Error(`La operación ${method.toUpperCase()} ${route} no tiene respuestas`)
      }
    }
  }
}

const source = loadDocument(sourcePath)
const generated = loadDocument(generatedPath)
validatePaths(sourcePath, source)
validatePaths(generatedPath, generated)

if (JSON.stringify(source) !== JSON.stringify(generated)) {
  throw new Error("openapi.json está desactualizado; ejecuta npm run docs:generate")
}

console.log(`OpenAPI válido: ${Object.keys(source.paths ?? {}).length} rutas documentadas`)
