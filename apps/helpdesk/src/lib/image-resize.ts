// Redução de foto no navegador, antes do envio.
//
// A câmera de um celular comum gera 3–6 MB por foto, com 12 megapixels que
// ninguém vai ampliar para ver um notebook. Reduzir aqui encurta o envio em
// rede móvel de minutos para segundos e poupa o disco da VPS. Se o navegador
// não conseguir decodificar o formato (HEIC fora do Safari, por exemplo), o
// arquivo original segue como está — o servidor ainda valida tipo e tamanho.

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    // createImageBitmap aplica a rotação do EXIF por padrão — sem isso, foto
    // tirada com o celular em pé chegaria deitada.
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));

    // Já pequena e em JPEG: recomprimir só perderia qualidade.
    if (escala === 1 && file.type === "image/jpeg" && file.size < 1_000_000) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALIDADE),
    );
    if (!blob || blob.size >= file.size) return file;

    const nome = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${nome}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
