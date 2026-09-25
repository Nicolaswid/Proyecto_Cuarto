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

const publicaciones = async (req, res) => {
  const { usuario_id } = req.params;

  if (!usuario_id || isNaN(usuario_id)) {
    return res.status(400).json({ error: 'Falta el id de usuario o no es válido' });
  }

  try {
    const resultado = await pool.query(
      'SELECT * FROM producto WHERE usuario_publicador_id = $1 ORDER BY fecha_publicacion DESC',
      [usuario_id]
    );

    return res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener las publicaciones del usuario' });
  }
}

const editar_publicacion = async (req, res) => {
  const { id } = req.params;
  const { talle, color, estado_condicion, precio, titulo, descripcion, foto, marca } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Falta el id de publicación o no es válido' });
  }

  const posibles = { talle, color, estado_condicion, precio, titulo, descripcion, foto, marca };

  const campos = [];
  const valores = [];

  for (const nombreCampo in posibles) {
    const valor = posibles[nombreCampo];
    if (valor !== undefined) {
      campos.push(nombreCampo);
      valores.push(valor);
    }
  }

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No se mandó ningún campo para actualizar' });
  }

  const set = campos.map((campo, i) => `${campo} = $${i + 1}`).join(', ');
  valores.push(id);

  try {
    const resultado = await pool.query(
      // Además de lo que mandó el Front, actualizamos fecha_publicacion a AHORA
      `UPDATE producto SET ${set}, fecha_publicacion = NOW() WHERE id = $${valores.length} RETURNING *`,
      valores
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }

    res.status(200).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la publicación' });
  }
};

export { crear_publicacion, eliminar_publicacion, publicaciones, editar_publicacion };