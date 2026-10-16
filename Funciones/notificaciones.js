import pool from '../db.js';

// Función interna: la llaman otros archivos cuando pasa algo. NO es una ruta.
const crear_notificacion = async (usuario_id, contenido, a_donde_lleva) => {
  try {
    await pool.query(
      `INSERT INTO notificacion (usuario_id, contenido, a_donde_lleva)
       VALUES ($1, $2, $3)`,
      [usuario_id, contenido, a_donde_lleva]
    );
  } catch (error) {
    console.error('No se pudo crear la notificación:', error);
  }
};

const mis_notificaciones = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, contenido, a_donde_lleva, fecha_envio, leido
       FROM notificacion
       WHERE usuario_id = $1
       ORDER BY fecha_envio DESC`,
      [req.usuario.id]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

const marcar_notificacion_leida = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    const resultado = await pool.query(
      `UPDATE notificacion SET leido = true
       WHERE id = $1 AND usuario_id = $2
       RETURNING id, contenido, a_donde_lleva, fecha_envio, leido`,
      [id, req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    res.status(200).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar notificación' });
  }
};

export { crear_notificacion, mis_notificaciones, marcar_notificacion_leida };