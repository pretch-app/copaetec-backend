import { put } from "@vercel/blob"
import { sql } from "@/lib/db"
import { getGallery } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toStr, validateRequestOrigin } from "@/lib/api-helpers"
import { slugify } from "@/lib/slugify"
import { isValidImageFile } from "@/lib/uploads"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const gallery = await getGallery()
    return jsonCors(request, gallery)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function POST(request: Request) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const formData = await request.formData()
    const file = formData.get("photo") as File | null

    if (!file || file.size === 0) return jsonCors(request, { error: "Archivo inválido" }, 400)
    if (file.size > 4 * 1024 * 1024) return jsonCors(request, { error: "El archivo no puede pesar más de 4MB" }, 400)
    if (!(await isValidImageFile(file))) return jsonCors(request, { error: "Formato de imagen no permitido" }, 400)

    const blob = await put(`gallery/${Date.now()}-${slugify(file.name)}`, file, { access: "public" })
    await sql`INSERT INTO gallery (url, caption) VALUES (${blob.url}, ${toStr(formData.get("caption"))})`
    return jsonCors(request, { success: true, url: blob.url })
  } catch (err) {
    return handleApiError(request, err)
  }
}
