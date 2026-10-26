import pool from '../db.js';
import bcrypt from 'bcrypt';

const crear_cuenta = async (req, res) => {
  const {
    nombre_usuario, nombre, apellido, fecha_nacimiento, email, contrasena, numero_telefono,
    instagram, foto_perfil
  } = req.body;

  if (!nombre_usuario || !nombre || !apellido || !fecha_nacimiento || !email || !contrasena || !numero_telefono) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  const hashedcontrasena = await bcrypt.hash(contrasena, 10);
  const columnas = ['nombre_usuario', 'nombre', 'apellido', 'fecha_nacimiento', 'email', 'contrasena', 'numero_telefono'];
  const valores = [nombre_usuario, nombre, apellido, fecha_nacimiento, email, hashedcontrasena, numero_telefono];

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

const estadisticas = async (usuario_id) => {
  const resultado = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM producto
        WHERE usuario_publicador_id = $1 AND estado_publicacion = 'disponible') AS publicaciones_disponibles,
       (SELECT COUNT(*)::int FROM ordenes_de_compra
        WHERE vendedor_id = $1 AND estado = 'entregada') AS ventas_entregadas,
       (SELECT COUNT(*)::int FROM resenas_vendedor
        WHERE vendedor_id = $1) AS relatos_recibidos`,
    [usuario_id]
  );
  return resultado.rows[0];
};

// GET /usuarios/:nombre_usuario (público)
const ver_perfil = async (req, res) => {
  const { nombre_usuario } = req.params;

  try {
    // Columnas elegidas a mano: Ni email ni contrasena.
    // Un usuario baneado se trata como inexistente.
    const usuario = await pool.query(
      `SELECT id, nombre_usuario, nombre, apellido, instagram, verificado, foto_perfil
       FROM usuario
       WHERE nombre_usuario = $1 AND estado <> 'ban'`,
      [nombre_usuario]
    );

    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const datos = usuario.rows[0];
    const stats = await estadisticas(datos.id);

    // "..." junta los dos objetos en uno solo
    res.status(200).json({ ...datos, ...stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
};

//  GET /mi_perfil (con token): lo mismo + datos privados
const mi_perfil = async (req, res) => {
  try {
    const usuario = await pool.query(
      `SELECT id, nombre_usuario, nombre, apellido, fecha_nacimiento, instagram,
              verificado, estado, foto_perfil, numero_telefono
       FROM usuario WHERE id = $1`,
      [req.usuario.id]
    );

    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const stats = await estadisticas(req.usuario.id);
    res.status(200).json({ ...usuario.rows[0], ...stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
};

export { crear_cuenta, eliminar_cuenta, editar_usuario, ver_perfil, mi_perfil };