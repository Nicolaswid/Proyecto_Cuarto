import pool from '../db.js';

const MAX_LARGO_TEXTO = 500;

// Recuenta los guardados reales de una publicación y los escribe en cantidad_guardados.
// Se recalcula en vez de sumar/restar 1, así nunca se desincroniza.
const RECONTAR =
  `UPDATE producto
   SET cantidad_guardados = (SELECT COUNT(*)::int FROM guardados WHERE publicacion_id = $1)
   WHERE id = $1`;

// ---------- POST /guardar_publicacion ----------
const guardar_publicacion = async (req, res) => {
  const { publicacion_id, texto } = req.body;

  // El usuario sale del token (ya no del body)
  if (!publicacion_id || !Number.isInteger(Number(publicacion_id))) {
    return res.status(400).json({ error: 'Falta publicacion_id o no es válido' });
  }
  const texto_limpio =
    typeof texto === 'string' && texto.trim() !== '' ? texto.trim() : null;
  if (texto_limpio && texto_limpio.length > MAX_LARGO_TEXTO) {
    return res.status(400).json({ error: `El texto no puede superar los ${MAX_LARGO_TEXTO} caracteres` });
  }

  let client;
  try {
    const prod = await pool.query(
      `SELECT usuario_publicador_id FROM producto WHERE id = $1`,
      [publicacion_id]
    );
    if (prod.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }
    if (prod.rows[0].usuario_publicador_id === req.usuario.id) {
      return res.status(400).json({ error: 'No podés guardar tu propia publicación' });
    }

    // Transacción: guardar + actualizar el contador, todo o nada
    client = await pool.connect();
    await client.query('BEGIN');

    const guardado = await client.query(
      `INSERT INTO guardados (usuario_id, publicacion_id, texto)
       VALUES ($1, $2, $3)
       RETURNING id, usuario_id, publicacion_id, texto, fecha`,
      [req.usuario.id, publicacion_id, texto_limpio]
    );
    await client.query(RECONTAR, [publicacion_id]);

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Publicación guardada', guardado: guardado.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    // 23505 = UNIQUE: ya la tenías guardada
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya guardaste esta publicación' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al guardar publicación' });
  } finally {
    if (client) client.release();
  }
};

// ---------- DELETE /guardar_publicacion/:publicacion_id (des-guardar) ----------
const sacar_guardado = async (req, res) => {
  const { publicacion_id } = req.params;

  if (!Number.isInteger(Number(publicacion_id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Filtra por usuario Y publicación: solo podés borrar TUS guardados
    const borrado = await client.query(
      `DELETE FROM guardados WHERE usuario_id = $1 AND publicacion_id = $2 RETURNING id`,
      [req.usuario.id, publicacion_id]
    );
    if (borrado.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No tenés guardada esa publicación' });
    }
    await client.query(RECONTAR, [publicacion_id]);

    await client.query('COMMIT');
    res.status(200).json({ mensaje: 'Guardado eliminado' });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Error al quitar el guardado' });
  } finally {
    if (client) client.release();
  }
};

// ---------- GET /guardados/:usuario_id (privado: solo los tuyos) ----------
const guardados = async (req, res) => {
  const { usuario_id } = req.params;

  if (!Number.isInteger(Number(usuario_id))) {
    return res.status(400).json({ error: 'Falta el id de usuario o no es válido' });
  }
  // Los guardados son privados: si no es el tuyo, 404
  if (Number(usuario_id) !== req.usuario.id) {
    return res.status(404).json({ error: 'No encontrado' });
  }

  try {
    const resultado = await pool.query(
      `SELECT g.id, g.usuario_id, g.publicacion_id, g.texto, g.fecha,
              p.titulo, p.precio::float AS precio, p.foto, p.estado_publicacion
       FROM guardados g
       JOIN producto p ON p.id = g.publicacion_id
       WHERE g.usuario_id = $1
       ORDER BY g.fecha DESC, g.id DESC`,
      [req.usuario.id]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los guardados del usuario' });
  }
};

export { guardar_publicacion, sacar_guardado, guardados };