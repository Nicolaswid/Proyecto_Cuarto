import pool from '../db.js';
import { crear_notificacion } from './notificaciones.js';

// Cantidad de personas DISTINTAS que tienen que reportar a alguien para suspenderlo.
const UMBRAL_SUSPENSION = 3;

const MAX_LARGO_MOTIVO = 100;
const MAX_LARGO_COMENTARIO = 500;

// ---------- POST /reportar ----------
const reportar_usuario = async (req, res) => {
  const { usuario_reportado_id, motivo, comentario } = req.body;

  // 1) Validar el formato primero (400), sin tocar la base
  if (!usuario_reportado_id || !Number.isInteger(Number(usuario_reportado_id)) ||
      typeof motivo !== 'string' || motivo.trim() === '') {
    return res.status(400).json({ error: 'Faltan datos obligatorios (usuario_reportado_id y motivo)' });
  }
  if (motivo.trim().length > MAX_LARGO_MOTIVO) {
    return res.status(400).json({ error: `El motivo no puede superar los ${MAX_LARGO_MOTIVO} caracteres` });
  }

  // El comentario es opcional: si no viene o está vacío, se guarda null
  const comentario_limpio =
    typeof comentario === 'string' && comentario.trim() !== '' ? comentario.trim() : null;
  if (comentario_limpio && comentario_limpio.length > MAX_LARGO_COMENTARIO) {
    return res.status(400).json({ error: `El comentario no puede superar los ${MAX_LARGO_COMENTARIO} caracteres` });
  }

  // Number() porque el front podría mandar "14" (texto) en vez de 14
  if (Number(usuario_reportado_id) === req.usuario.id) {
    return res.status(400).json({ error: 'No podés reportarte a vos mismo' });
  }

  try {
    // 2) ¿Existe el usuario reportado? (un baneado se trata como inexistente)
    const reportado = await pool.query(
      `SELECT id FROM usuario WHERE id = $1 AND estado <> 'baneado'`,
      [usuario_reportado_id]
    );
    if (reportado.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // 3) Guardar el reporte. Si ya lo reportaste, el UNIQUE lo rechaza (error 23505).
    await pool.query(
      `INSERT INTO reportes (usuario_reportador_id, usuario_reportado_id, motivo, comentario)
       VALUES ($1, $2, $3, $4)`,
      [req.usuario.id, usuario_reportado_id, motivo.trim(), comentario_limpio]
    );

    // 4) Contar cuántas personas DISTINTAS reportaron a ese usuario
    const conteo = await pool.query(
      `SELECT COUNT(DISTINCT usuario_reportador_id)::int AS total
       FROM reportes WHERE usuario_reportado_id = $1`,
      [usuario_reportado_id]
    );

    // 5) Si llegó al umbral, suspender.
    if (conteo.rows[0].total >= UMBRAL_SUSPENSION) {
      const suspension = await pool.query(
        `UPDATE usuario SET estado = 'suspendido'
         WHERE id = $1 AND estado = 'activo'
         RETURNING id`,
        [usuario_reportado_id]
      );

      if (suspension.rows.length > 0) {
        await crear_notificacion(
          Number(usuario_reportado_id),
          'Tu cuenta fue suspendida por reportes de otros usuarios',
          '/mi_perfil'
        );
      }
    }

    // 6) Siempre la misma respuesta: no revelamos el conteo ni si hubo suspensión
    res.status(201).json({ mensaje: 'Reporte enviado' });
  } catch (error) {
    // 23505 = violación de UNIQUE: ya reportaste a esta persona
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya reportaste a este usuario' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al enviar el reporte' });
  }
};

export { reportar_usuario };