import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createUserSession } from "@/lib/auth"
import { isAllowedEmailDomain } from "@/lib/email"
import { cookies } from "next/headers"
import { randomBytes, timingSafeEqual } from "crypto"

function matchesSecret(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual || expected.length !== actual.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

function frontendUrl(path: string) {
  const base = process.env.FRONTEND_URL
  if (!base) throw new Error("FRONTEND_URL is not set")
  return new URL(path, base)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const cookieStore = await cookies()
    const expectedState = cookieStore.get("oauth_state")?.value
    const expectedNonce = cookieStore.get("oauth_nonce")?.value

    if (error || !code || !matchesSecret(expectedState, state)) {
      return NextResponse.redirect(frontendUrl("/auth/login?error=Cancelado"))
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
    const protocol = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https")
    const origin = (host ? `${protocol}://${host}` : null) || new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/callback/google`

    if (!clientId || !clientSecret) {
      console.error("Missing Google OAuth credentials")
      return NextResponse.redirect(frontendUrl("/auth/login?error=ServerConfig"))
    }

    // Intercambiar código por tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok) {
      console.error("Google token error:", tokenData)
      return NextResponse.redirect(frontendUrl("/auth/login?error=TokenError"))
    }

    const idToken = tokenData.id_token
    if (!idToken) {
      return NextResponse.redirect(frontendUrl("/auth/login?error=TokenError"))
    }

    const tokenInfoResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    )
    const tokenInfo = await tokenInfoResponse.json()
    const validIssuer = tokenInfo.iss === "accounts.google.com" || tokenInfo.iss === "https://accounts.google.com"
    if (
      !tokenInfoResponse.ok ||
      tokenInfo.aud !== clientId ||
      !validIssuer ||
      tokenInfo.email_verified !== "true" ||
      !matchesSecret(expectedNonce, tokenInfo.nonce)
    ) {
      return NextResponse.redirect(frontendUrl("/auth/login?error=TokenError"))
    }

    // Obtener información del usuario
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    const userData = await userResponse.json()
    if (!userResponse.ok || !userData.email) {
      console.error("Google user info error:", userData)
      return NextResponse.redirect(frontendUrl("/auth/login?error=UserInfoError"))
    }

    const email = userData.email.toLowerCase().trim()
    const name = userData.name || "Usuario"

    if (!isAllowedEmailDomain(email)) {
      return NextResponse.redirect(frontendUrl("/auth/login?error=DomainNotAllowed"))
    }

    cookieStore.delete("oauth_state")
    cookieStore.delete("oauth_nonce")

    // Buscar si el usuario ya existe en la base de datos
    const existingUser = await sql`SELECT id, role FROM users WHERE email = ${email} LIMIT 1`

    let userId: number
    let userRole: string

    if (existingUser.length > 0) {
      // Migración transparente: Si el email ya existía (ej. los amigos que ya se registraron),
      // simplemente vinculamos la cuenta de Google a ese usuario y lo dejamos entrar.
      userId = existingUser[0].id
      userRole = existingUser[0].role
    } else {
      // Usuario nuevo: Insertamos en la DB con un hash de contraseña falso ("OAUTH:...")
      const dummyHash = "OAUTH:" + randomBytes(16).toString("hex")
      const inserted = await sql`
        INSERT INTO users (email, display_name, password_hash, role)
        VALUES (${email}, ${name}, ${dummyHash}, 'user')
        RETURNING id, role
      `
      userId = inserted[0].id
      userRole = inserted[0].role
    }

    // Crear la sesión en las cookies (usa la misma función actual)
    await createUserSession(userId, userRole)

    return NextResponse.redirect(frontendUrl("/predicciones-etec"))
  } catch (err) {
    console.error("OAuth Callback Error:", err)
    return NextResponse.redirect(frontendUrl("/auth/login?error=ServerError"))
  }
}
