import pool from '../db.js';

const crear_cuenta = async (req, res) => {
  const { nombre_usuario, nombre, apellido, fecha_nacimiento, email, contrasena, numero_telefono } = req.body;

  // Chequeo: que ESTÉN todos los campos obligatorios
  if (!nombre_usuario || !nombre || !apellido || !fecha_nacimiento || !email || !contrasena || !numero_telefono) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO usuario (nombre_usuario, nombre, apellido, fecha_nacimiento, email, contrasena, numero_telefono)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nombre_usuario, nombre, apellido, fecha_nacimiento, email, contrasena, numero_telefono]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

const eliminar_cuenta = async (req, res) => {
  const { nombre_usuario } = req.params;

  try {
    const resultado = await pool.query(
      `DELETE FROM usuario WHERE nombre_usuario = $1 RETURNING *`,
      [nombre_usuario]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.status(200).json({ mensaje: 'Usuario eliminado', usuario: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

export { crear_cuenta, eliminar_cuenta };