import { NextResponse } from "next/server"
import { randomBytes } from "crypto"

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const protocol = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https")
  const origin = (host ? `${protocol}://${host}` : null) || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const redirectUri = `${origin}/api/auth/callback/google`

  if (!clientId) {
    return NextResponse.json({ error: "Falta configurar GOOGLE_CLIENT_ID en las variables de entorno" }, { status: 500 })
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  const state = randomBytes(32).toString("hex")
  const nonce = randomBytes(32).toString("hex")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", "openid email profile")
  authUrl.searchParams.set("access_type", "online")
  authUrl.searchParams.set("prompt", "select_account")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("nonce", nonce)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 600,
  })
  response.cookies.set("oauth_nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 600,
  })
  return response
}
