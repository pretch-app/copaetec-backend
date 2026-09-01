import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toStr, validateRequestOrigin } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const id = Number(( await params).id)
    const body = await request.json()
    const name = toStr(body.name)
    if (!id || !name) return jsonCors(request, { error: "Datos inválidos" }, 400)
    await sql`
      UPDATE teams SET
        name = ${name},
        captain = ${toStr(body.captain)},
        grupo = ${toStr(body.grupo)}
      WHERE id = ${id}
    `
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    await sql`DELETE FROM teams WHERE id = ${id}`
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
