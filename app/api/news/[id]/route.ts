import { sql } from "@/lib/db"
import { getNewsById } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id)
    const item = await getNewsById(id)
    if (!item) return jsonCors(request, { error: "Noticia no encontrada" }, 404)
    return jsonCors(request, item)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    await sql`DELETE FROM news WHERE id = ${id}`
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
