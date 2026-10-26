import pool from '../db.js';

// ---------- Ayudante interno: le manda los productos al Python de tu amigo ----------
// Devuelve la lista de ids en el orden que él decidió.
// Si algo sale mal, TIRA un error (quien la llama decide qué hacer).
const pedir_orden_a_python = async (productos, usuario_id) => {
  // La dirección de su servidor. Se lee dentro de la función (como JWT_SECRET).
  const url = process.env.PYTHON_URL || 'http://127.0.0.1:5000/ordenar';

  // La foto no se la mandamos: no la necesita y hace el envío más pesado.
  const para_python = productos.map(({ foto, ...resto }) => resto);

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id, productos: para_python }),
    signal: AbortSignal.timeout(3000) // si tarda más de 3 segundos, se corta
  });

  if (!respuesta.ok) {
    throw new Error(`Python respondió con código ${respuesta.status}`);
  }

  const datos = await respuesta.json();
  if (!Array.isArray(datos.orden)) {
    throw new Error('Python no devolvió { "orden": [ids] }');
  }
  return datos.orden;
};

// ---------- GET /productos (público, con token opcional) ----------
const listar_productos = async (req, res) => {
  try {
    // Si hay un usuario logueado, su id; si es visitante, null
    const usuario_id = req.usuario ? req.usuario.id : null;

    // Ya viene ordenado por fecha: ese es el orden de respaldo.
    const resultado = await pool.query(
      `SELECT p.id, p.titulo, p.descripcion, p.precio::float AS precio, p.talle, p.color,
              p.marca, p.estado_condicion, p.foto, p.visualizaciones,
              p.cantidad_guardados, p.fecha_publicacion,
              p.usuario_publicador_id,
              u.nombre_usuario AS vendedor_nombre_usuario,
              u.verificado AS vendedor_verificado
       FROM producto p
       JOIN usuario u ON u.id = p.usuario_publicador_id
       WHERE p.estado_publicacion = 'disponible'
       ORDER BY p.fecha_publicacion DESC, p.id DESC`
    );
    const productos = resultado.rows;

    let lista_final = productos;
    let quien_ordeno = 'fecha';

    if (productos.length > 0) {
      try {
        const orden = await pedir_orden_a_python(productos, usuario_id);

        // Un Map es un diccionario: buscás por id y encontrás el producto.
        const por_id = new Map(productos.map((p) => [p.id, p]));
        const armada = [];

        for (const id of orden) {
          const producto = por_id.get(Number(id));
          if (producto) {
            armada.push(producto);
            por_id.delete(Number(id)); // si repite un id, no se duplica
          }
        }
        // Los que Python no mencionó van al final
        for (const producto of por_id.values()) {
          armada.push(producto);
        }

        lista_final = armada;
        quien_ordeno = 'python';
      } catch (error) {
        // Python falló: avisamos en la terminal, pero el usuario igual recibe sus productos
        console.warn('No se pudo usar el orden de Python, se usa el de fecha:', error.message);
      }
    }

    res.set('X-Orden', quien_ordeno); // header informativo: 'python' o 'fecha'
    res.status(200).json(lista_final);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
};

export { listar_productos };