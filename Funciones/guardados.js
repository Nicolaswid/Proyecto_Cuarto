import pool from '../db.js';

const guardar_publicacion = async (req, res) => {
    const { usuario_id, publicacion_id, texto } = req.body;
  
    try {
      const guardado = await pool.query(
        `INSERT INTO guardados (usuario_id, publicacion_id, texto)
        VALUES ($1, $2, $3) RETURNING *`,
        [usuario_id, publicacion_id, texto]
      );

      if (!usuario_id || !publicacion_id) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
      }
  
      res.status(201).json({
        mensaje: 'Publicación guardada',
        guardado: guardado.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al guardar publicación' });
    }
  };

  const publi_vendida = async (req, res) => {
    const { id } = req.params;
  
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Falta el id de la publicación o no es válido' });
    }
  
    try {
      const resultado = await pool.query(
        "UPDATE producto SET estado_publicacion = 'vendido' WHERE id = $1 RETURNING *",
        [id]
      );
  
      if (resultado.rows.length === 0) {
        return res.status(404).json({ error: 'Publicación no encontrada' });
      }
  
      return res.status(200).json(resultado.rows[0]);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Error al marcar la publicación como vendida' });
    }
  }

  const guardados = async (req, res) => {
  const { usuario_id } = req.params;

  if (!usuario_id || isNaN(usuario_id)) {
    return res.status(400).json({ error: 'Falta el id de usuario o no es válido' });
  }

  try {
    const resultado = await pool.query(
      'SELECT * FROM guardados WHERE usuario_id = $1 ORDER BY fecha DESC',
      [usuario_id]
    );

    return res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener los guardados del usuario' });
  }
}

  export {guardar_publicacion, publi_vendida, guardados};