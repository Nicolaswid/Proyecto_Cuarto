import pool from '../db.js';

export async function sumarVista(req, res) {
  const { id } = req.params;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Falta el id de la publicación o no es válido' });
  }

  try {
    const resultado = await pool.query(
      'UPDATE producto SET visualizaciones = visualizaciones + 1 WHERE id = $1 RETURNING *',
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }

    return res.status(200).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al actualizar las visualizaciones' });
  }
}