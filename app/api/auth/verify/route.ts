import { NextResponse } from "next/server"
import { consumeVerificationToken } from "@/lib/verification"

function frontendUrl(path: string) {
  const base = process.env.FRONTEND_URL
  if (!base) throw new Error("FRONTEND_URL is not set")
  return new URL(path, base)
}

// Es el destino del link del correo: se abre en el navegador, así que responde
// con una redirección al login del frontend en vez de JSON.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? ""

  try {
    const verified = await consumeVerificationToken(token)
    if (!verified) {
      return NextResponse.redirect(frontendUrl("/auth/login?error=InvalidVerificationToken"))
    }
    return NextResponse.redirect(frontendUrl("/auth/login?verified=1"))
  } catch (err) {
    console.error("[Verify Error]:", err)
    return NextResponse.redirect(frontendUrl("/auth/login?error=ServerError"))
  }
}
