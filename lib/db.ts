import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

let _sql: NeonQueryFunction<false, false> | null = null

function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }
  _sql = neon(url)
  return _sql
}

// Proxy que difiere la creación del cliente Neon hasta el primer uso (en tiempo
// de request), evitando que `next build` falle al evaluar los módulos de ruta
// cuando DATABASE_URL no está disponible durante la recolección de page data.
export const sql = new Proxy((() => {}) as unknown as NeonQueryFunction<false, false>, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args)
  },
  get(_target, prop, receiver) {
    return Reflect.get(getSql() as unknown as object, prop, receiver)
  },
}) as NeonQueryFunction<false, false>
