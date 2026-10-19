import pool from '../db.js';
import { crear_notificacion } from './notificaciones.js';

const crear_comentario = async (req, res) => {
  const { publicacion_id, texto } = req.body;

  if (!publicacion_id || !Number.isInteger(Number(publicacion_id)) ||
      typeof texto !== 'string' || texto.trim() === '') {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  
  try {
    const publicacion = await pool.query(
      `SELECT titulo, usuario_publicador_id FROM producto WHERE id = $1`,
      [publicacion_id]
    );

    if (publicacion.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }

    const { titulo, usuario_publicador_id } = publicacion.rows[0];

    const comentario = await pool.query(
      `INSERT INTO comentario (usuario_id, publicacion_id, texto)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.usuario.id, publicacion_id, texto.trim()]
    );

    // Avisarle al dueño de la publicación (salvo que se comente a sí mismo)
    if (usuario_publicador_id !== req.usuario.id) {
      await crear_notificacion(
        usuario_publicador_id,
        `${req.usuario.nombre_usuario} comentó tu publicación "${titulo}"`,
        `/publicaciones/${publicacion_id}`
      );
    }

    res.status(201).json(comentario.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear comentario' });
  }
};

const listar_comentarios = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    const resultado = await pool.query(
      `SELECT c.id, c.texto, c.fecha, u.nombre_usuario, u.foto_perfil
       FROM comentario c
       JOIN usuario u ON u.id = c.usuario_id
       WHERE c.publicacion_id = $1
       ORDER BY c.fecha ASC`,
      [id]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
};

export { crear_comentario, listar_comentarios };