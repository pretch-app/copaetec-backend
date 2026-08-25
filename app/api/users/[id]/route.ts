import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    if (id === currentUser.id) return jsonCors(request, { error: "No puedes eliminar tu propio usuario" }, 400)

    await sql`DELETE FROM users WHERE id = ${id}`
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
