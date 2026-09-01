const DEFAULT_ALLOWED_DOMAINS = ["etec.um.edu.ar", "um.edu.ar", "alumno.etec.um.edu.ar"]

export function isAllowedEmailDomain(email: string): boolean {
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS
    ? process.env.ALLOWED_EMAIL_DOMAINS.split(",")
    : DEFAULT_ALLOWED_DOMAINS
  )
    .map((domain) => domain.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean)

  const emailDomain = email.slice(email.lastIndexOf("@") + 1).toLowerCase()
  return domains.includes(emailDomain)
}
