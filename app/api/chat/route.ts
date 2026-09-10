import { answerQuestion, MAX_QUESTION_LENGTH } from "@/lib/chatbot/engine"
import { jsonCors, preflight } from "@/lib/cors"
import { ApiError, getClientIp, handleApiError, toStr } from "@/lib/api-helpers"
import { checkRateLimit } from "@/lib/rate-limit"

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  try {
    const ip = await getClientIp(request)
    const limit = checkRateLimit(`chat:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
    if (!limit.allowed) {
      throw new ApiError("Demasiadas consultas seguidas. Probá de nuevo en un momento.", 429)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ApiError("Cuerpo inválido", 400)
    }

    const question = toStr((body as { question?: unknown })?.question as string | null | undefined)
    if (!question) throw new ApiError("Falta la pregunta", 400)
    if (question.length > MAX_QUESTION_LENGTH) {
      throw new ApiError(`La pregunta no puede superar los ${MAX_QUESTION_LENGTH} caracteres`, 400)
    }

    const answer = await answerQuestion(question)
    return jsonCors(request, answer)
  } catch (err) {
    return handleApiError(request, err)
  }
}
