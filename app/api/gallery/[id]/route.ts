import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    await sql`DELETE FROM gallery WHERE id = ${id}`
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
