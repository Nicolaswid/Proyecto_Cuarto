import crypto from "node:crypto";

export function verificarFirma(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=") || !appSecret) {
    return false;
  }

  const firmaRecibida = signatureHeader.slice("sha256=".length);
  const firmaCalculada = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(firmaCalculada);
  const b = Buffer.from(firmaRecibida);
  // timingSafeEqual tira error si los largos difieren
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function enviarAIA(data) {
  try {
    const respuesta = await fetch(process.env.PYTHON_URL_WHATSAPP, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        JSON_PAYLOAD: data,
        backend_key: process.env.BACKEND_KEY,
      }),
    });
    if (!respuesta.ok) {
      console.error(`La IA respondió ${respuesta.status}`);
    }
  } catch (err) {
    console.error("Error al enviar el mensaje a la IA:", err);
  }
}