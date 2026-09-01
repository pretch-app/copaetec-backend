const IMAGE_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10",
  "image/webp": (bytes) =>
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP",
}

export async function isValidImageFile(file: File): Promise<boolean> {
  const signature = IMAGE_SIGNATURES[file.type]
  if (!signature) return false
  return signature(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
}
