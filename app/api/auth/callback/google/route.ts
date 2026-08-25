import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createUserSession } from "@/lib/auth"
import { randomBytes } from "crypto"

function frontendUrl(path: string) {
  const base = process.env.FRONTEND_URL
  if (!base) throw new Error("FRONTEND_URL is not set")
  return new URL(path, base)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error || !code) {
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

    // Validar el dominio permitido (por defecto los de la institución)
    const allowedDomainsEnv = process.env.ALLOWED_EMAIL_DOMAINS?.toLowerCase().trim()
      || "@etec.um.edu.ar,@um.edu.ar,@alumno.etec.um.edu.ar"

    if (allowedDomainsEnv) {
      const allowedDomains = allowedDomainsEnv.split(',').map(d => d.trim().replace(/^@/, ''))
      const emailDomain = email.split('@')[1]

      const hasValidDomain = allowedDomains.some(domain => emailDomain === domain || email.endsWith(`@${domain}`))

      if (!hasValidDomain) {
        return NextResponse.redirect(frontendUrl("/auth/login?error=DomainNotAllowed"))
      }
    }

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
