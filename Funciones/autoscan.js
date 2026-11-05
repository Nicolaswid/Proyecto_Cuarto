// Analizar imágenes puede tardar mucho más que ordenar productos
const TIMEOUT_MS = 30000;
const MAX_LARGO_URL = 2000;

// ¿Es una URL https válida? (y del host permitido, si lo configuraste en el .env)
const url_valida = (valor) => {
  if (typeof valor !== 'string' || valor.length > MAX_LARGO_URL) return false;

  let url;
  try {
    url = new URL(valor); // si no es una URL, esto tira un error
  } catch (error) {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  // Se lee DENTRO de la función (como JWT_SECRET). Si está vacío, no se restringe.
  const host_permitido = process.env.IMAGENES_HOST_PERMITIDO;
  if (host_permitido && url.hostname !== host_permitido) return false;

  return true;
};

//  POST /analizar_prenda 
const analizar_prenda = async (req, res) => {
  const { img_main, img_etiqueta } = req.body;

  // 1) Validar primero (400), sin llamar a Python
  if (!img_main || !img_etiqueta) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (img_main e img_etiqueta)' });
  }
  if (!url_valida(img_main) || !url_valida(img_etiqueta)) {
    return res.status(400).json({ error: 'Las imágenes deben ser URLs https válidas' });
  }

  try {
    const url = process.env.PYTHON_PRENDA_URL || 'http://127.0.0.1:5000/analizar_prenda';

    // 2) Mandarle las imágenes a Python, con la clave compartida
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backend_key: process.env.BACKEND_KEY,
        img_main,
        img_etiqueta
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!respuesta.ok) {
      throw new Error(`Python respondió con código ${respuesta.status}`);
    }

    // 3) Leer lo que devolvió: { status, prenda }
    const datos = await respuesta.json();

    if (datos.status !== 'ok' || !datos.prenda) {
      console.warn('Python no pudo analizar la prenda. status:', datos.status);
      return res.status(400).json({ error: 'No se pudo analizar la prenda con esas imágenes' });
    }

    // 4) Devolver SOLO los campos conocidos (lo demás que mande Python no sale).
    //    "?? null": si Python no mandó el campo, el front recibe null en vez de nada.
    const p = datos.prenda;
    res.status(200).json({
      prenda: {
        img_main: p.img_main ?? null,
        img_etiqueta: p.img_etiqueta ?? null,
        categoria: p.categoria ?? null,
        subcategoria: p.subcategoria ?? null,
        color: p.color ?? null,
        marca: p.marca ?? null,
        talle: p.talle ?? null,
        detalles: p.detalles ?? null
      }
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.warn('Python tardó más de', TIMEOUT_MS, 'ms');
      return res.status(500).json({ error: 'El análisis tardó demasiado, probá de nuevo' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al analizar la prenda' });
  }
};

export { analizar_prenda };