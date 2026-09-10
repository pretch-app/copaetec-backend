// Marcas diacríticas combinantes (rango U+0300–U+036F). Se construye con
// `RegExp` para que el rango quede escrito en ASCII y no dependa de la
// codificación del archivo.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g")

// Normalización de texto para el matcheo por reglas del chatbot.
// Deja sólo minúsculas sin acentos, dígitos y espacios simples, de modo que
// "¿Cómo salió el último de Los Pumas?" y "como salio el ultimo de los pumas"
// se comparen igual.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

// Índice de una frase dentro del texto normalizado, respetando límites de
// palabra. Devuelve -1 si no aparece. Se usa también para ordenar equipos según
// el orden en que el usuario los nombró ("River vs Boca").
export function phraseIndex(haystack: string, phrase: string): number {
  if (!phrase) return -1
  return ` ${haystack} `.indexOf(` ${phrase} `)
}

export function containsPhrase(haystack: string, phrase: string): boolean {
  return phraseIndex(haystack, phrase) !== -1
}

export function containsAny(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => containsPhrase(haystack, phrase))
}
