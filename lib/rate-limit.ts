// Simple in-memory rate limiting.
const rateLimitCache = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  let record = rateLimitCache.get(key)

  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs }
  }

  if (record.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: record.resetAt - now,
    }
  }

  record.count += 1
  rateLimitCache.set(key, record)

  return {
    allowed: true,
    remaining: maxAttempts - record.count,
    resetIn: record.resetAt - now,
  }
}

// Cleanup function to avoid memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of rateLimitCache.entries()) {
      if (now > record.resetAt) {
        rateLimitCache.delete(key)
      }
    }
  }, 1000 * 60 * 60) // cleanup every hour
}
