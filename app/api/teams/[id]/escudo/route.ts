import { put } from "@vercel/blob"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"
import { slugify } from "@/lib/slugify"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const id = Number((await params).id)
    const formData = await request.formData()
    const file = formData.get("escudo") as File | null

    if (!id || !file || file.size === 0) return jsonCors(request, { error: "Archivo inválido" }, 400)
    if (file.size > 5 * 1024 * 1024) return jsonCors(request, { error: "El archivo no puede pesar más de 5MB" }, 400)
    if (!file.type.startsWith("image/")) return jsonCors(request, { error: "El archivo debe ser una imagen" }, 400)

    const blob = await put(`teams/escudos/${id}-${Date.now()}-${slugify(file.name)}`, file, { access: "public" })
    await sql`UPDATE teams SET escudo_url = ${blob.url} WHERE id = ${id}`
    return jsonCors(request, { success: true, url: blob.url })
  } catch (err) {
    return handleApiError(request, err)
  }
}
