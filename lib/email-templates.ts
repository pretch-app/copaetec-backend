import type { MailMessage } from "./mailer"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function verificationEmail(params: {
  to: string
  name: string
  link: string
  expiresInHours: number
}): MailMessage {
  const name = escapeHtml(params.name)
  const link = escapeHtml(params.link)

  const text = [
    `Hola ${params.name},`,
    "",
    "Gracias por registrarte en la Copa ETec. Para activar tu cuenta abrí este link:",
    params.link,
    "",
    `El link vence en ${params.expiresInHours} horas. Si no creaste esta cuenta, ignorá este correo.`,
  ].join("\n")

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px">
      <tr>
        <td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:20px">Activá tu cuenta de la Copa ETec</h1>
          <p style="margin:0 0 16px;line-height:1.5">Hola ${name}, gracias por registrarte. Confirmá tu correo para empezar a jugar el prode.</p>
          <p style="margin:0 0 24px">
            <a href="${link}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Activar cuenta</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#52525b;line-height:1.5">Si el botón no funciona, copiá este link en el navegador:</p>
          <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#16a34a">${link}</a></p>
          <p style="margin:0;font-size:12px;color:#71717a;line-height:1.5">El link vence en ${params.expiresInHours} horas. Si no creaste esta cuenta, ignorá este correo.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { to: params.to, subject: "Activá tu cuenta de la Copa ETec", html, text }
}
