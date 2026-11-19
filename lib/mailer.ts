import { createTransport, type Transporter } from "nodemailer"

export type MailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

let _transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter
  const host = process.env.SMTP_HOST
  if (!host) return null

  const port = Number(process.env.SMTP_PORT ?? 587)
  _transporter = createTransport({
    host,
    port,
    // 465 es SMTPS (TLS implícito); el resto negocia STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  })
  return _transporter
}

export async function sendMail(message: MailMessage): Promise<void> {
  const transporter = getTransporter()

  if (!transporter) {
    // Sin SMTP configurado en desarrollo, el correo se imprime en consola para poder
    // seguir el link de activación a mano. En producción es un error de configuración.
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP_HOST is not set")
    }
    console.info(`[Mail:dev] Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}`)
    return
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM ?? "Copa ETec <no-reply@copaetec.online>",
    ...message,
  })
}
