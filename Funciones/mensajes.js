import pool from '../db.js';
import { crear_notificacion } from './notificaciones.js';

// Largo máximo de un mensaje
const MAX_LARGO_MENSAJE = 2000;

// POST /mensajes : mandar un mensaje
const crear_mensaje = async (req, res) => {
  const { receptor_id, texto } = req.body;

  // 1) Validar el formato primero (400), sin tocar la base
  if (!receptor_id || !Number.isInteger(Number(receptor_id)) ||
      typeof texto !== 'string' || texto.trim() === '') {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (texto.trim().length > MAX_LARGO_MENSAJE) {
    return res.status(400).json({ error: `El mensaje no puede superar los ${MAX_LARGO_MENSAJE} caracteres` });
  }
  // Number() porque el front podría mandar "14" (texto) en vez de 14
  if (Number(receptor_id) === req.usuario.id) {
    return res.status(400).json({ error: 'No podés enviarte mensajes a vos mismo' });
  }

  try {
    // 2) ¿Existe el receptor? (un usuario baneado se trata como inexistente)
    const receptor = await pool.query(
      `SELECT id FROM usuario WHERE id = $1 AND estado <> 'baneado'`,
      [receptor_id]
    );
    if (receptor.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // 3) Guardar el mensaje (fecha_envio y leido los completa Postgres solo)
    const mensaje = await pool.query(
      `INSERT INTO mensajes (usuario_emisor_id, usuario_receptor_id, texto)
       VALUES ($1, $2, $3)
       RETURNING id, usuario_emisor_id, usuario_receptor_id, texto, fecha_envio, leido`,
      [req.usuario.id, receptor_id, texto.trim()]
    );

    // 4) Avisar al receptor: una notificación por cada mensaje
    await crear_notificacion(
      Number(receptor_id),
      `${req.usuario.nombre_usuario} te envió un mensaje`,
      `/mensajes/${req.usuario.id}`
    );

    res.status(201).json(mensaje.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
};

// GET /mensajes/:otro_usuario_id : el chat entre A y B 
const ver_conversacion = async (req, res) => {
  const { otro_usuario_id } = req.params;

  if (!Number.isInteger(Number(otro_usuario_id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    // es_mio le sirve al front para dibujar el mensaje a la derecha o a la izquierda
    const resultado = await pool.query(
      `SELECT id, usuario_emisor_id, usuario_receptor_id, texto, fecha_envio, leido,
              (usuario_emisor_id = $1) AS es_mio
       FROM mensajes
       WHERE (usuario_emisor_id = $1 AND usuario_receptor_id = $2)
          OR (usuario_emisor_id = $2 AND usuario_receptor_id = $1)
       ORDER BY id ASC`,
      [req.usuario.id, otro_usuario_id]
    );
    // Sin mensajes devuelve [] (no es un error: es un chat vacío)
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los mensajes' });
  }
};

// PATCH /mensajes/:otro_usuario_id/leidos : marcar como leídos los que ME mandó
const marcar_leidos = async (req, res) => {
  const { otro_usuario_id } = req.params;

  if (!Number.isInteger(Number(otro_usuario_id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    // Solo los mensajes que ESA persona me mandó a MÍ, y que todavía no estaban leídos
    const resultado = await pool.query(
      `UPDATE mensajes
       SET leido = true
       WHERE usuario_emisor_id = $2 AND usuario_receptor_id = $1 AND leido = false
       RETURNING id`,
      [req.usuario.id, otro_usuario_id]
    );
    // Si no había nada para marcar, marcados vale 0 (tampoco es un error)
    res.status(200).json({ marcados: resultado.rows.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al marcar los mensajes' });
  }
};

//  GET /mis_conversaciones : una fila por persona, con el último mensaje 
const mis_conversaciones = async (req, res) => {
  try {
    const resultado = await pool.query(
      `WITH mios AS (
         -- Todos mis mensajes (enviados o recibidos), anotando quién es "el otro"
         SELECT id, texto, fecha_envio, usuario_emisor_id,
                CASE WHEN usuario_emisor_id = $1 THEN usuario_receptor_id
                     ELSE usuario_emisor_id END AS otro_id
         FROM mensajes
         WHERE usuario_emisor_id = $1 OR usuario_receptor_id = $1
       ),
       ultimos AS (
         -- De cada persona, solo el mensaje más nuevo
         SELECT DISTINCT ON (otro_id) id, otro_id, texto, fecha_envio, usuario_emisor_id
         FROM mios
         ORDER BY otro_id, id DESC
       )
       SELECT u.id AS usuario_id, u.nombre_usuario, u.foto_perfil,
              ul.texto AS ultimo_mensaje,
              ul.fecha_envio AS fecha_ultimo_mensaje,
              (ul.usuario_emisor_id = $1) AS ultimo_es_mio,
              (SELECT COUNT(*)::int FROM mensajes m2
               WHERE m2.usuario_emisor_id = u.id
                 AND m2.usuario_receptor_id = $1
                 AND m2.leido = false) AS sin_leer
       FROM ultimos ul
       JOIN usuario u ON u.id = ul.otro_id
       ORDER BY ul.id DESC`,
      [req.usuario.id]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las conversaciones' });
  }
};

export { crear_mensaje, ver_conversacion, marcar_leidos, mis_conversaciones };