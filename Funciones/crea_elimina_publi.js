import pool from '../db.js';

const crear_publicacion = async (req, res) => {
  const { talle, color, estado_condicion, precio, titulo, descripcion, foto, marca, usuario_publicador_id } = req.body;

  if (!talle || !color || !estado_condicion || !precio || !titulo || !descripcion || !foto || !marca || !usuario_publicador_id) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO producto (talle, color, estado_condicion, precio, titulo, descripcion, foto, marca, usuario_publicador_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [talle, color, estado_condicion, precio, titulo, descripcion, foto, marca, usuario_publicador_id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear publicación' });
  }
};

const eliminar_publicacion = async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      `DELETE FROM producto WHERE id = $1 RETURNING *`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }

    res.status(200).json({ mensaje: 'Publicación eliminada', publicacion: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
};

export { crear_publicacion, eliminar_publicacion };