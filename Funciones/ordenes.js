import pool from '../db.js';
import { crear_notificacion } from './notificaciones.js';

// Cantidad de órdenes ENTREGADAS que hay que SUPERAR para ser verificado.
// Para probar, bajalo a 1 (con la 2ª entrega ya se verifica). Después volvelo a 20.
const UMBRAL_VERIFICADO = 20;

// ---------- GET /mis_ordenes : las órdenes donde soy comprador o vendedor ----------
const mis_ordenes = async (req, res) => {
  try {
    // uc = usuario comprador, uv = usuario vendedor (la tabla usuario aparece
    // dos veces, por eso lleva dos apodos). Nunca devolvemos email ni contrasena.
    const resultado = await pool.query(
      `SELECT o.id, o.producto_id, p.titulo, p.foto, o.precio_final, o.estado, o.fecha,
              o.comprador_id, uc.nombre_usuario AS comprador_nombre_usuario,
              o.vendedor_id, uv.nombre_usuario AS vendedor_nombre_usuario,
              CASE WHEN o.comprador_id = $1 THEN 'comprador' ELSE 'vendedor' END AS mi_rol
       FROM ordenes_de_compra o
       JOIN producto p ON p.id = o.producto_id
       JOIN usuario uc ON uc.id = o.comprador_id
       JOIN usuario uv ON uv.id = o.vendedor_id
       WHERE o.comprador_id = $1 OR o.vendedor_id = $1
       ORDER BY o.id DESC`,
      [req.usuario.id]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las órdenes' });
  }
};

// ---------- PATCH /ordenes/:id/enviada : solo el VENDEDOR ----------
const marcar_enviada = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    // 1) Leer la orden (con el título del producto para la notificación)
    const orden = await pool.query(
      `SELECT o.id, o.comprador_id, o.vendedor_id, o.estado, p.titulo
       FROM ordenes_de_compra o
       JOIN producto p ON p.id = o.producto_id
       WHERE o.id = $1`,
      [id]
    );

    if (orden.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const { comprador_id, vendedor_id, estado, titulo } = orden.rows[0];

    // 2) Ajeno a la orden: 404 (no revelamos que existe)
    if (req.usuario.id !== vendedor_id && req.usuario.id !== comprador_id) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // 3) Es parte de la orden, pero no es el vendedor: 403
    if (req.usuario.id !== vendedor_id) {
      return res.status(403).json({ error: 'Solo el vendedor puede marcar la orden como enviada' });
    }

    // 4) Solo se puede enviar una orden que está "confirmada"
    if (estado !== 'confirmada') {
      return res.status(400).json({ error: `La orden está '${estado}', no se puede marcar como enviada` });
    }

    // 5) UPDATE con doble chequeo del estado (por si alguien se adelantó)
    const actualizada = await pool.query(
      `UPDATE ordenes_de_compra
       SET estado = 'enviada'
       WHERE id = $1 AND estado = 'confirmada'
       RETURNING id, producto_id, comprador_id, vendedor_id, precio_final, estado, fecha`,
      [id]
    );

    if (actualizada.rows.length === 0) {
      return res.status(400).json({ error: 'La orden cambió de estado, actualizá la pantalla' });
    }

    // 6) Avisarle al comprador
    await crear_notificacion(
      comprador_id,
      `${req.usuario.nombre_usuario} marcó como enviada tu compra de "${titulo}"`,
      '/mis_ordenes'
    );

    res.status(200).json(actualizada.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la orden' });
  }
};

// ---------- PATCH /ordenes/:id/entregada : solo el COMPRADOR ----------
const marcar_entregada = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    const orden = await pool.query(
      `SELECT o.id, o.comprador_id, o.vendedor_id, o.estado, p.titulo
       FROM ordenes_de_compra o
       JOIN producto p ON p.id = o.producto_id
       WHERE o.id = $1`,
      [id]
    );

    if (orden.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const { comprador_id, vendedor_id, estado, titulo } = orden.rows[0];

    if (req.usuario.id !== vendedor_id && req.usuario.id !== comprador_id) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    if (req.usuario.id !== comprador_id) {
      return res.status(403).json({ error: 'Solo el comprador puede marcar la orden como entregada' });
    }

    // Solo se puede recibir una orden que fue enviada
    if (estado !== 'enviada') {
      return res.status(400).json({ error: `La orden está '${estado}', no se puede marcar como entregada` });
    }

    const actualizada = await pool.query(
      `UPDATE ordenes_de_compra
       SET estado = 'entregada'
       WHERE id = $1 AND estado = 'enviada'
       RETURNING id, producto_id, comprador_id, vendedor_id, precio_final, estado, fecha`,
      [id]
    );

    if (actualizada.rows.length === 0) {
      return res.status(400).json({ error: 'La orden cambió de estado, actualizá la pantalla' });
    }

    // ---- Verificación del vendedor ----
    // Recontamos las órdenes entregadas del vendedor. "::int" convierte el
    // resultado a número (si no, pg lo devuelve como texto).
    const conteo = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM ordenes_de_compra
       WHERE vendedor_id = $1 AND estado = 'entregada'`,
      [vendedor_id]
    );

    let vendedor_verificado_ahora = false;

    if (conteo.rows[0].total > UMBRAL_VERIFICADO) {
      // "AND verificado = false": solo cambia si todavía NO era verificado.
      // Así, RETURNING trae una fila únicamente la PRIMERA vez que se verifica.
      const verificacion = await pool.query(
        `UPDATE usuario SET verificado = true
         WHERE id = $1 AND verificado = false
         RETURNING id`,
        [vendedor_id]
      );
      vendedor_verificado_ahora = verificacion.rows.length > 0;
    }

    // ---- Notificaciones ----
    await crear_notificacion(
      vendedor_id,
      `${req.usuario.nombre_usuario} confirmó que recibió "${titulo}"`,
      '/mis_ordenes'
    );
    if (vendedor_verificado_ahora) {
      await crear_notificacion(
        vendedor_id,
        '¡Felicitaciones! Ya sos un vendedor verificado',
        '/perfil'
      );
    }

    res.status(200).json({ orden: actualizada.rows[0], vendedor_verificado_ahora });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la orden' });
  }
};

export { mis_ordenes, marcar_enviada, marcar_entregada };