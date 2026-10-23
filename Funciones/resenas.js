import pool from '../db.js';
import { crear_notificacion } from './notificaciones.js';

// ---------- Ayudante interno (no es ruta) ----------
// Busca la orden y comprueba que quien reseña sea el COMPRADOR y que el
// estado de la orden esté entre los permitidos (cada tipo de reseña pasa los suyos).
// Devuelve { orden } si todo está bien, o { status, error } si hay que cortar.
const validar_orden_para_resena = async (orden_id, usuario_id, estados_permitidos, mensaje_estado) => {
  const resultado = await pool.query(
    `SELECT o.id, o.producto_id, o.comprador_id, o.vendedor_id, o.estado, p.titulo
     FROM ordenes_de_compra o
     JOIN producto p ON p.id = o.producto_id
     WHERE o.id = $1`,
    [orden_id]
  );

  if (resultado.rows.length === 0) {
    return { status: 404, error: 'Orden no encontrada' };
  }

  const orden = resultado.rows[0];

  // Ajeno a la orden: 404 (no revelamos que existe)
  if (usuario_id !== orden.comprador_id && usuario_id !== orden.vendedor_id) {
    return { status: 404, error: 'Orden no encontrada' };
  }
  // Es el vendedor: existe y la conoce, pero no le corresponde reseñar
  if (usuario_id !== orden.comprador_id) {
    return { status: 403, error: 'Solo el comprador puede dejar reseñas' };
  }
  // ¿El estado actual está en la lista de estados permitidos?
  if (!estados_permitidos.includes(orden.estado)) {
    return { status: 400, error: mensaje_estado };
  }

  return { orden };
};

// ---------- POST /resenas_producto (estrellas, solo si la orden está entregada) ----------
const crear_resena_producto = async (req, res) => {
  const { orden_id, estrellas, comentario } = req.body;

  if (!orden_id || !Number.isInteger(Number(orden_id)) ||
      !Number.isInteger(Number(estrellas)) || Number(estrellas) < 1 || Number(estrellas) > 5) {
    return res.status(400).json({ error: 'Faltan datos o son inválidos (estrellas debe ser de 1 a 5)' });
  }

  // El comentario es opcional en la reseña de producto
  const comentario_limpio =
    typeof comentario === 'string' && comentario.trim() !== '' ? comentario.trim() : null;

  try {
    const validacion = await validar_orden_para_resena(
      orden_id,
      req.usuario.id,
      ['entregada'],
      'Solo podés calificar el producto cuando la orden está entregada'
    );
    if (validacion.error) {
      return res.status(validacion.status).json({ error: validacion.error });
    }
    const { orden } = validacion;

    const resena = await pool.query(
      `INSERT INTO resenas (usuario_id, producto_id, estrellas, comentario, comprobante_transaccion, orden_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, producto_id, estrellas, comentario, comprobante_transaccion, orden_id, fecha`,
      [req.usuario.id, orden.producto_id, Number(estrellas), comentario_limpio, `ORD-${orden.id}`, orden.id]
    );

    await crear_notificacion(
      orden.vendedor_id,
      `${req.usuario.nombre_usuario} dejó una reseña de ${Number(estrellas)} estrellas en "${orden.titulo}"`,
      `/publicaciones/${orden.producto_id}`
    );

    res.status(201).json(resena.rows[0]);
  } catch (error) {
    // 23505 = violación de UNIQUE: esa orden ya tiene su reseña de producto
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya reseñaste este producto' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al crear la reseña' });
  }
};

// ---------- POST /resenas_vendedor (sin estrellas; opcional, pero si se envía el comentario es obligatorio) ----------
// Se puede contar la experiencia desde que la orden está enviada, entregada o cancelada.
const crear_resena_vendedor = async (req, res) => {
  const { orden_id, comentario } = req.body;

  if (!orden_id || !Number.isInteger(Number(orden_id)) ||
      typeof comentario !== 'string' || comentario.trim() === '') {
    return res.status(400).json({ error: 'Para contar tu experiencia, el comentario no puede estar vacío' });
  }

  try {
    const validacion = await validar_orden_para_resena(
      orden_id,
      req.usuario.id,
      ['enviada', 'entregada', 'cancelada'],
      'Todavía no podés contar tu experiencia: la orden tiene que estar enviada, entregada o cancelada'
    );
    if (validacion.error) {
      return res.status(validacion.status).json({ error: validacion.error });
    }
    const { orden } = validacion;

    const resena = await pool.query(
      `INSERT INTO resenas_vendedor (orden_id, comprador_id, vendedor_id, comentario)
       VALUES ($1, $2, $3, $4)
       RETURNING id, orden_id, vendedor_id, comentario, fecha`,
      [orden.id, req.usuario.id, orden.vendedor_id, comentario.trim()]
    );

    await crear_notificacion(
      orden.vendedor_id,
      `${req.usuario.nombre_usuario} contó su experiencia de compra con vos`,
      '/perfil'
    );

    res.status(201).json(resena.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya contaste tu experiencia con este vendedor en esta orden' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al crear la reseña' });
  }
};

// ---------- GET /productos/:id/resenas (público) ----------
const resenas_de_producto = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    const resumen = await pool.query(
      `SELECT COUNT(*)::int AS cantidad, ROUND(AVG(estrellas), 1)::float AS promedio
       FROM resenas WHERE producto_id = $1`,
      [id]
    );

    const lista = await pool.query(
      `SELECT r.id, r.estrellas, r.comentario, r.fecha,
              u.nombre_usuario, u.foto_perfil
       FROM resenas r
       JOIN usuario u ON u.id = r.usuario_id
       WHERE r.producto_id = $1
       ORDER BY r.id DESC`,
      [id]
    );

    res.status(200).json({
      cantidad: resumen.rows[0].cantidad,
      promedio: resumen.rows[0].promedio, // null si no hay reseñas
      resenas: lista.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reseñas' });
  }
};

// ---------- GET /usuarios/:nombre_usuario/resenas (público) ----------
// Relatos que recibió esa persona COMO VENDEDOR
const resenas_de_vendedor = async (req, res) => {
  const { nombre_usuario } = req.params;

  try {
    const usuario = await pool.query(
      `SELECT id FROM usuario WHERE nombre_usuario = $1`,
      [nombre_usuario]
    );
    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const lista = await pool.query(
      `SELECT rv.id, rv.comentario, rv.fecha, p.titulo,
              uc.nombre_usuario AS comprador_nombre_usuario,
              uc.foto_perfil AS comprador_foto_perfil
       FROM resenas_vendedor rv
       JOIN usuario uc ON uc.id = rv.comprador_id
       JOIN ordenes_de_compra o ON o.id = rv.orden_id
       JOIN producto p ON p.id = o.producto_id
       WHERE rv.vendedor_id = $1
       ORDER BY rv.id DESC`,
      [usuario.rows[0].id]
    );

    res.status(200).json(lista.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reseñas' });
  }
};

export { crear_resena_producto, crear_resena_vendedor, resenas_de_producto, resenas_de_vendedor };