import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", async () => (await import("../helpers/mocks")).dbModule)
vi.mock("next/headers", async () => (await import("../helpers/mocks")).headersModule)
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.example/${path}` })),
}))

import { put } from "@vercel/blob"
import { ADMIN, USER, apiRequest, db, findQuery, json, loginAs, resetMocks, routeParams } from "../helpers/mocks"
import { GET as listTeams, POST as createTeam } from "@/app/api/teams/route"
import { DELETE as deleteTeam, PATCH as updateTeam } from "@/app/api/teams/[id]/route"
import { POST as uploadEscudo } from "@/app/api/teams/[id]/escudo/route"
import { POST as uploadPhoto } from "@/app/api/teams/[id]/photo/route"
import { GET as listPlayers, POST as createPlayer } from "@/app/api/players/route"
import { DELETE as deletePlayer } from "@/app/api/players/[id]/route"
import { GET as listGallery, POST as uploadGallery } from "@/app/api/gallery/route"
import { DELETE as deleteGallery } from "@/app/api/gallery/[id]/route"
import { GET as listNews, POST as createNews } from "@/app/api/news/route"
import { DELETE as deleteNews, GET as getNews } from "@/app/api/news/[id]/route"
import { GET as listUsers } from "@/app/api/users/route"
import { DELETE as deleteUser } from "@/app/api/users/[id]/route"

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP")])

function image(bytes: Uint8Array, type: string, name = "Foto Equipo.png") {
  return new File([bytes], name, { type })
}

function form(fields: Record<string, string | File>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => resetMocks())

describe("equipos", () => {
  it("lista los equipos sin iniciar sesión", async () => {
    db.respond = () => [{ id: 1, name: "Los Pibes" }]
    expect(await (await listTeams(apiRequest("/api/teams"))).json()).toEqual([{ id: 1, name: "Los Pibes" }])
  })

  it("crea un equipo con slug y lo edita", async () => {
    await loginAs(ADMIN)
    const created = await createTeam(
      apiRequest("/api/teams", { method: "POST", body: { name: "Los Pibes del Fondo", captain: "Ana", grupo: "A" } }),
    )
    expect(created.status).toBe(200)
    expect(findQuery("INSERT INTO teams")?.values).toEqual(["Los Pibes del Fondo", "los-pibes-del-fondo", "Ana", "A"])

    await updateTeam(apiRequest("/api/teams/1", { method: "PATCH", body: { name: "Los Pibes" } }), routeParams({ id: "1" }))
    expect(findQuery("UPDATE teams SET")?.values).toEqual(["Los Pibes", null, null, 1])

    await deleteTeam(apiRequest("/api/teams/1", { method: "DELETE" }), routeParams({ id: "1" }))
    expect(findQuery("DELETE FROM teams")?.values).toEqual([1])
  })

  it("valida los datos del equipo", async () => {
    await loginAs(ADMIN)
    expect((await createTeam(apiRequest("/api/teams", { method: "POST", body: { name: "  " } }))).status).toBe(400)
    expect(
      (await updateTeam(apiRequest("/api/teams/1", { method: "PATCH", body: {} }), routeParams({ id: "1" }))).status,
    ).toBe(400)
    expect((await deleteTeam(apiRequest("/api/teams/x", { method: "DELETE" }), routeParams({ id: "x" }))).status).toBe(400)
  })

  it("un usuario común no puede crear equipos", async () => {
    await loginAs(USER)
    expect((await createTeam(apiRequest("/api/teams", { method: "POST", body: { name: "X" } }))).status).toBe(403)
  })
})

describe("subida de imágenes", () => {
  it("sube el escudo y la foto de un equipo", async () => {
    await loginAs(ADMIN)

    const escudo = await uploadEscudo(
      apiRequest("/api/teams/1/escudo", { method: "POST", formData: form({ escudo: image(PNG, "image/png") }) }),
      routeParams({ id: "1" }),
    )
    expect(await json(escudo)).toMatchObject({ success: true })
    expect(vi.mocked(put).mock.calls[0][0]).toMatch(/^teams\/escudos\/1-\d+-foto-equipo-png$/)
    expect(findQuery("UPDATE teams SET escudo_url")).toBeDefined()

    const photo = await uploadPhoto(
      apiRequest("/api/teams/1/photo", { method: "POST", formData: form({ photo: image(JPEG, "image/jpeg") }) }),
      routeParams({ id: "1" }),
    )
    expect(photo.status).toBe(200)
    expect(findQuery("UPDATE teams SET photo_url")).toBeDefined()
  })

  it("rechaza archivos que no son imágenes aunque digan serlo", async () => {
    await loginAs(ADMIN)
    const fake = new File([new TextEncoder().encode("<script>alert(1)</script>")], "x.png", { type: "image/png" })

    const response = await uploadEscudo(
      apiRequest("/api/teams/1/escudo", { method: "POST", formData: form({ escudo: fake }) }),
      routeParams({ id: "1" }),
    )
    expect(await json(response)).toEqual({ error: "Formato de imagen no permitido" })
    const gif = new File([new Uint8Array(12)], "x.gif", { type: "image/gif" })
    expect(
      (await uploadPhoto(apiRequest("/api/teams/1/photo", { method: "POST", formData: form({ photo: gif }) }), routeParams({ id: "1" })))
        .status,
    ).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it("rechaza archivos de más de 4MB o vacíos", async () => {
    await loginAs(ADMIN)
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })
    const response = await uploadGallery(apiRequest("/api/gallery", { method: "POST", formData: form({ photo: big }) }))
    expect(await json(response)).toEqual({ error: "El archivo no puede pesar más de 4MB" })
    const empty = await uploadEscudo(
      apiRequest("/api/teams/1/escudo", { method: "POST", formData: form({ caption: "sin archivo" }) }),
      routeParams({ id: "1" }),
    )
    expect(empty.status).toBe(400)
  })

  it("sube y borra fotos de la galería", async () => {
    await loginAs(ADMIN)
    const response = await uploadGallery(
      apiRequest("/api/gallery", { method: "POST", formData: form({ photo: image(WEBP, "image/webp"), caption: "Final" }) }),
    )
    expect(response.status).toBe(200)
    expect(findQuery("INSERT INTO gallery")?.values[1]).toBe("Final")

    await deleteGallery(apiRequest("/api/gallery/3", { method: "DELETE" }), routeParams({ id: "3" }))
    expect(findQuery("DELETE FROM gallery")?.values).toEqual([3])
  })

  it("lista la galería sin iniciar sesión", async () => {
    db.respond = () => [{ id: 1, url: "https://blob.example/x" }]
    expect(await (await listGallery(apiRequest("/api/gallery"))).json()).toHaveLength(1)
  })
})

describe("jugadores", () => {
  it("crea, lista y borra jugadores", async () => {
    await loginAs(ADMIN, (text) => (text.startsWith("SELECT * FROM players") ? [{ id: 8, name: "Juan" }] : []))
    await createPlayer(
      apiRequest("/api/players", { method: "POST", body: { team_id: 1, name: "Juan", number: "10", position: "DEL" } }),
    )
    expect(findQuery("INSERT INTO players")?.values).toEqual([1, "Juan", 10, "DEL"])
    expect(await (await listPlayers(apiRequest("/api/players"))).json()).toEqual([{ id: 8, name: "Juan" }])
    await deletePlayer(apiRequest("/api/players/8", { method: "DELETE" }), routeParams({ id: "8" }))
    expect(findQuery("DELETE FROM players")?.values).toEqual([8])
  })

  it("pide equipo y nombre", async () => {
    await loginAs(ADMIN)
    expect((await createPlayer(apiRequest("/api/players", { method: "POST", body: { name: "Juan" } }))).status).toBe(400)
    expect((await deletePlayer(apiRequest("/api/players/0", { method: "DELETE" }), routeParams({ id: "0" }))).status).toBe(400)
  })
})

describe("noticias", () => {
  it("publica una noticia con foto y video de YouTube", async () => {
    await loginAs(ADMIN)
    const response = await createNews(
      apiRequest("/api/news", {
        method: "POST",
        formData: form({
          title: "Arrancó la Copa",
          content: "Primer partido",
          youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1",
          photo: image(PNG, "image/png"),
        }),
      }),
    )
    expect(response.status).toBe(200)
    const insert = findQuery("INSERT INTO news")?.values
    expect(insert?.[0]).toBe("Arrancó la Copa")
    expect(insert?.[2]).toMatch(/^https:\/\/blob\.example\/news\//)
    expect(insert?.slice(3)).toEqual(["dQw4w9WgXcQ", "blue", ADMIN.id])
  })

  it("pide título y descripción", async () => {
    await loginAs(ADMIN)
    const response = await createNews(apiRequest("/api/news", { method: "POST", formData: form({ title: "Sin texto" }) }))
    expect(response.status).toBe(400)
  })

  it("lista, muestra y borra noticias", async () => {
    db.respond = (text, values) => {
      if (text.includes("FROM news n") && values.length === 0) return [{ id: 1, title: "A" }]
      if (text.includes("FROM news n") && values[0] === 1) return [{ id: 1, title: "A" }]
      return []
    }
    expect(await (await listNews(apiRequest("/api/news"))).json()).toEqual([{ id: 1, title: "A" }])
    expect((await getNews(apiRequest("/api/news/1"), routeParams({ id: "1" }))).status).toBe(200)
    expect((await getNews(apiRequest("/api/news/2"), routeParams({ id: "2" }))).status).toBe(404)

    await loginAs(ADMIN)
    await deleteNews(apiRequest("/api/news/1", { method: "DELETE" }), routeParams({ id: "1" }))
    expect(findQuery("DELETE FROM news")?.values).toEqual([1])
  })
})

describe("usuarios", () => {
  it("el admin lista usuarios y borra a otro", async () => {
    await loginAs(ADMIN, (text) => (text.includes("ORDER BY created_at DESC") ? [ADMIN, USER] : []))
    expect(await (await listUsers(apiRequest("/api/users"))).json()).toHaveLength(2)
    const response = await deleteUser(apiRequest("/api/users/3", { method: "DELETE" }), routeParams({ id: "3" }))
    expect(response.status).toBe(200)
    expect(findQuery("DELETE FROM users")?.values).toEqual([3])
  })

  it("el admin no puede borrarse a sí mismo", async () => {
    await loginAs(ADMIN)
    const response = await deleteUser(apiRequest("/api/users/1", { method: "DELETE" }), routeParams({ id: "1" }))
    expect(await json(response)).toEqual({ error: "No puedes eliminar tu propio usuario" })
    expect(findQuery("DELETE FROM users")).toBeUndefined()
  })

  it("un usuario común no ve la lista", async () => {
    await loginAs(USER)
    expect((await listUsers(apiRequest("/api/users"))).status).toBe(403)
  })
})
