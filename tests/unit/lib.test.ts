import { describe, expect, it, afterEach } from "vitest"
import { hashPassword, verifyPasswordHash } from "@/lib/auth"
import { toBool, toInt, toStr } from "@/lib/api-helpers"
import { isAllowedEmailDomain } from "@/lib/email"
import { slugify } from "@/lib/slugify"

describe("slugify", () => {
  it("normalizes accents, spaces and punctuation", () => {
    expect(slugify("  Club Atlético / Norte! ")).toBe("club-atletico-norte")
  })
})

describe("request helpers", () => {
  it("converts valid integers and rejects unsafe values", () => {
    expect(toInt("42")).toBe(42)
    expect(toInt("-7")).toBe(-7)
    expect(toInt("1.5")).toBeNull()
    expect(toInt("9007199254740992")).toBeNull()
  })

  it("normalizes strings and booleans", () => {
    expect(toStr("  Copa ETec  ")).toBe("Copa ETec")
    expect(toStr("   ")).toBeNull()
    expect(toBool("true")).toBe(true)
    expect(toBool("false")).toBe(false)
    expect(toBool("yes")).toBeNull()
  })
})

describe("authentication helpers", () => {
  it("verifies a generated password hash and rejects another password", () => {
    const hash = hashPassword("correct-password")

    expect(verifyPasswordHash("correct-password", hash)).toBe(true)
    expect(verifyPasswordHash("wrong-password", hash)).toBe(false)
  })
})

describe("allowed email domains", () => {
  afterEach(() => {
    delete process.env.ALLOWED_EMAIL_DOMAINS
  })

  it("uses the configured domains", () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "example.edu, @another.edu"

    expect(isAllowedEmailDomain("student@example.edu")).toBe(true)
    expect(isAllowedEmailDomain("student@another.edu")).toBe(true)
    expect(isAllowedEmailDomain("student@other.edu")).toBe(false)
  })
})
