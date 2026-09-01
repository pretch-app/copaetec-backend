import { put } from "@vercel/blob"
import { sql } from "@/lib/db"
import { getAllNews } from "@/lib/queries"
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
    const news = await getAllNews()
    return jsonCors(request, news)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function POST(request: Request) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    const user = await requireAdmin()
    const formData = await request.formData()
    const title = toStr(formData.get("title"))
    const content = toStr(formData.get("content"))
    const color = toStr(formData.get("color")) || "blue"
    const youtubeUrl = toStr(formData.get("youtube_url"))
    const file = formData.get("photo") as File | null

    if (!title || !content) return jsonCors(request, { error: "El título y la descripción son obligatorios" }, 400)

    let imageUrl: string | null = null
    if (file && file.size > 0) {
       if (file.size > 4 * 1024 * 1024) return jsonCors(request, { error: "El archivo no puede pesar más de 4MB" }, 400)
       if (!(await isValidImageFile(file))) return jsonCors(request, { error: "Formato de imagen no permitido" }, 400)
      const blob = await put(`news/${Date.now()}-${slugify(file.name)}`, file, { access: "public" })
      imageUrl = blob.url
    }

    let youtubeId: string | null = null
    if (youtubeUrl) {
      const match = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)
      youtubeId = match ? match[1] : null
    }

    await sql`
      INSERT INTO news (title, content, image_url, youtube_id, color, author_id)
      VALUES (${title}, ${content}, ${imageUrl}, ${youtubeId}, ${color}, ${user.id})
    `
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
