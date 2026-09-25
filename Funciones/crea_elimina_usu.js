import pool from '../db.js';

const crear_cuenta = async (req, res) => {
  const {
    nombre_usuario, nombre, apellido, fecha_nacimiento, email, contrasena, numero_telefono,
    instagram, foto_perfil
  } = req.body;

  if (!nombre_usuario || !nombre || !apellido || !fecha_nacimiento || !email || !contrasena || !numero_telefono) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const columnas = ['nombre_usuario', 'nombre', 'apellido', 'fecha_nacimiento', 'email', 'contrasena', 'numero_telefono'];
  const valores = [nombre_usuario, nombre, apellido, fecha_nacimiento, email, contrasena, numero_telefono];

  if (instagram) {
    columnas.push('instagram');
    valores.push(instagram);
  }

  if (foto_perfil) {
    columnas.push('foto_perfil');
    valores.push(foto_perfil);
  }

  // Armamos los huecos $1, $2, $3... según cuántos valores terminamos teniendo
  const huecos = valores.map((_, i) => `$${i + 1}`).join(', ');

  try {
    const resultado = await pool.query(
      `INSERT INTO usuario (${columnas.join(', ')}) VALUES (${huecos}) RETURNING *`,
      valores
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El nombre de usuario o email ya está en uso' });
    }
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

const editar_usuario = async (req, res) => {
  const { id } = req.params;
  const { nombre_usuario, instagram, foto_perfil, numero_telefono } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Falta el id de usuario o no es válido' });
  }

  const campos = [];
  const valores = [];

  if (nombre_usuario) {
    campos.push('nombre_usuario');
    valores.push(nombre_usuario);
  }
  if (instagram) {
    campos.push('instagram');
    valores.push(instagram);
  }
  if (foto_perfil) {
    campos.push('foto_perfil');
    valores.push(foto_perfil);
  }
  if (numero_telefono) {
    campos.push('numero_telefono');
    valores.push(numero_telefono);
  }

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No se mandó ningún campo para actualizar' });
  }

  // Armamos "nombre_usuario = $1, instagram = $2, ..." según lo que haya llegado
  const set = campos.map((campo, i) => `${campo} = $${i + 1}`).join(', ');

  // El id va al FINAL de valores, porque lo usamos en el WHERE, después de todos los $ del SET
  valores.push(id);

  try {
    const resultado = await pool.query(
      `UPDATE usuario SET ${set} WHERE id = $${valores.length} RETURNING *`,
      valores
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.status(200).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
    }
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

export { crear_cuenta, eliminar_cuenta, editar_usuario};