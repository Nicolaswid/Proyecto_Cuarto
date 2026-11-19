import pool from '../db.js';
import { url_valida } from './autoscan.js';

// Columnas que devolvemos (una sola lista para no repetirla en cada consulta)
const COLUMNAS = `id, talle, color, estado_condicion, precio::float AS precio, titulo, descripcion,
  visualizaciones, foto, foto_etiqueta, fotos, marca, tipo_prenda, subtipo_prenda, genero, stock,
  alias, estado_publicacion, fecha_publicacion, usuario_publicador_id, cantidad_guardados`;

// Alias bancario: de 6 a 50 caracteres; solo letras, números, punto o guion
const ALIAS_VALIDO = /^[A-Za-z0-9.-]{6,50}$/;
const MAX_FOTOS_EXTRA = 4;

// Devuelve un texto de error si "fotos" está mal, o null si está bien
const validar_fotos = (fotos) => {
  if (!Array.isArray(fotos)) return 'fotos debe ser una lista de URLs';
  if (fotos.length > MAX_FOTOS_EXTRA) return `Podés subir hasta ${MAX_FOTOS_EXTRA} fotos extra`;
  if (!fotos.every((f) => url_valida(f))) return 'Todas las fotos deben ser URLs https válidas';
  return null;
};

// ---------- POST /crear_publicacion ----------
const crear_publicacion = async (req, res) => {
  const {
    talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
    tipo_prenda, subtipo_prenda, genero, stock, foto_etiqueta, fotos, alias
  } = req.body;

  if (!talle || !color || !estado_condicion || !precio || !titulo || !descripcion ||
      !foto || !marca || typeof tipo_prenda !== 'string' || tipo_prenda.trim() === '') {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (!Number.isFinite(Number(precio)) || Number(precio) <= 0) {
    return res.status(400).json({ error: 'El precio debe ser un número mayor a 0' });
  }

  const alias_limpio = typeof alias === 'string' ? alias.trim() : '';
  if (!ALIAS_VALIDO.test(alias_limpio)) {
    return res.status(400).json({ error: 'El alias es obligatorio: de 6 a 50 caracteres (letras, números, punto o guion)' });
  }

  // Fotos
  if (!url_valida(foto)) {
    return res.status(400).json({ error: 'La foto principal debe ser una URL https válida' });
  }
  const etiqueta_limpia =
    typeof foto_etiqueta === 'string' && foto_etiqueta.trim() !== '' ? foto_etiqueta.trim() : null;
  if (etiqueta_limpia && !url_valida(etiqueta_limpia)) {
    return res.status(400).json({ error: 'foto_etiqueta debe ser una URL https válida' });
  }
  const fotos_finales = fotos === undefined || fotos === null ? [] : fotos;
  const error_fotos = validar_fotos(fotos_finales);
  if (error_fotos) return res.status(400).json({ error: error_fotos });

  // Opcionales
  const tipo_limpio = tipo_prenda.trim();
  const subtipo_limpio =
    typeof subtipo_prenda === 'string' && subtipo_prenda.trim() !== '' ? subtipo_prenda.trim() : null;
  const genero_limpio =
    typeof genero === 'string' && genero.trim() !== '' ? genero.trim() : null;

  if (tipo_limpio.length > 50 || (subtipo_limpio && subtipo_limpio.length > 50) ||
      (genero_limpio && genero_limpio.length > 30)) {
    return res.status(400).json({ error: 'tipo_prenda y subtipo_prenda admiten hasta 50 caracteres, y genero hasta 30' });
  }

  const stock_final = stock === undefined || stock === null ? 1 : Number(stock);
  if (!Number.isInteger(stock_final) || stock_final < 1) {
    return res.status(400).json({ error: 'El stock debe ser un número entero de 1 o más' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO producto (talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
                             tipo_prenda, subtipo_prenda, genero, stock, foto_etiqueta, fotos, alias,
                             usuario_publicador_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${COLUMNAS}`,
      [talle, color, estado_condicion, Number(precio), titulo, descripcion, foto, marca,
       tipo_limpio, subtipo_limpio, genero_limpio, stock_final, etiqueta_limpia, fotos_finales,
       alias_limpio, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear publicación' });
  }
};

// ---------- DELETE /eliminar_publicacion/:id (solo el dueño) ----------
const eliminar_publicacion = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    const resultado = await pool.query(
      `DELETE FROM producto WHERE id = $1 AND usuario_publicador_id = $2 RETURNING id`,
      [id, req.usuario.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }
    res.status(200).json({ mensaje: 'Publicación eliminada' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'No se puede eliminar: la publicación tiene órdenes u ofertas asociadas' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
};

// ---------- GET /publicaciones/:usuario_id (token opcional) ----------
const publicaciones = async (req, res) => {
  const { usuario_id } = req.params;

  if (!Number.isInteger(Number(usuario_id))) {
    return res.status(400).json({ error: 'Falta el id de usuario o no es válido' });
  }

  const soy_el_dueno = Boolean(req.usuario && req.usuario.id === Number(usuario_id));

  try {
    const resultado = await pool.query(
      `SELECT ${COLUMNAS}
       FROM producto
       WHERE usuario_publicador_id = $1
         AND ($2::boolean OR estado_publicacion = 'disponible')
       ORDER BY fecha_publicacion DESC, id DESC`,
      [usuario_id, soy_el_dueno]
    );

    // El alias NO es público: solo lo ve el dueño
    const filas = resultado.rows.map((fila) => {
      if (!soy_el_dueno) delete fila.alias;
      return fila;
    });

    res.status(200).json(filas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las publicaciones del usuario' });
  }
};

// ---------- PATCH /editar_publicacion/:id (solo el dueño) ----------
const editar_publicacion = async (req, res) => {
  const { id } = req.params;
  const {
    talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
    tipo_prenda, subtipo_prenda, genero, stock, foto_etiqueta, alias, fotos
  } = req.body;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Falta el id de publicación o no es válido' });
  }

  // "fotos" va aparte porque es una lista, no un texto
  const posibles = {
    talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
    tipo_prenda, subtipo_prenda, genero, stock, foto_etiqueta, alias
  };
  const opcionales = ['subtipo_prenda', 'genero', 'foto_etiqueta']; // se pueden dejar vacíos
  const campos = [];
  const valores = [];

  for (const nombreCampo in posibles) {
    let valor = posibles[nombreCampo];
    if (valor === undefined) continue; // no lo mandaron: no se toca

    if (typeof valor === 'string') valor = valor.trim();

    const vacio = valor === null || valor === '';
    if (vacio) {
      if (!opcionales.includes(nombreCampo)) {
        return res.status(400).json({ error: `El campo ${nombreCampo} no puede estar vacío` });
      }
      valor = null;
    }

    if ((nombreCampo === 'foto' || nombreCampo === 'foto_etiqueta') && valor !== null && !url_valida(valor)) {
      return res.status(400).json({ error: `${nombreCampo} debe ser una URL https válida` });
    }
    if (nombreCampo === 'alias' && (typeof valor !== 'string' || !ALIAS_VALIDO.test(valor))) {
      return res.status(400).json({ error: 'El alias debe tener de 6 a 50 caracteres (letras, números, punto o guion)' });
    }

    campos.push(nombreCampo);
    valores.push(valor);
  }

  // Si mandan "fotos", REEMPLAZA la lista entera (con [] se vacía)
  if (fotos !== undefined) {
    const error_fotos = validar_fotos(fotos);
    if (error_fotos) return res.status(400).json({ error: error_fotos });
    campos.push('fotos');
    valores.push(fotos);
  }

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No se mandó ningún campo para actualizar' });
  }
  if (precio !== undefined && (!Number.isFinite(Number(precio)) || Number(precio) <= 0)) {
    return res.status(400).json({ error: 'El precio debe ser un número mayor a 0' });
  }
  if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 1)) {
    return res.status(400).json({ error: 'El stock debe ser un número entero de 1 o más' });
  }
  if ((tipo_prenda && String(tipo_prenda).length > 50) ||
      (subtipo_prenda && String(subtipo_prenda).length > 50) ||
      (genero && String(genero).length > 30)) {
    return res.status(400).json({ error: 'tipo_prenda y subtipo_prenda admiten hasta 50 caracteres, y genero hasta 30' });
  }

  const set = campos.map((campo, i) => `${campo} = $${i + 1}`).join(', ');
  const reactivar = stock !== undefined ? ", estado_publicacion = 'disponible'" : '';

  valores.push(id);
  valores.push(req.usuario.id);

  try {
    const resultado = await pool.query(
      `UPDATE producto SET ${set}${reactivar}, fecha_publicacion = NOW()
       WHERE id = $${valores.length - 1} AND usuario_publicador_id = $${valores.length}
       RETURNING ${COLUMNAS}`,
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

// ---------- GET /productos/:id/datos_pago (con token) ----------
const datos_pago = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    const resultado = await pool.query(
      `SELECT p.id, p.titulo, p.precio::float AS precio, p.alias, p.estado_publicacion,
              p.usuario_publicador_id, u.nombre_usuario AS vendedor_nombre_usuario
       FROM producto p
       JOIN usuario u ON u.id = p.usuario_publicador_id
       WHERE p.id = $1`,
      [id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }

    const p = resultado.rows[0];
    if (p.usuario_publicador_id === req.usuario.id) {
      return res.status(400).json({ error: 'Es tu propia publicación' });
    }
    if (p.estado_publicacion !== 'disponible') {
      return res.status(400).json({ error: 'La publicación ya no está disponible' });
    }
    if (!p.alias) {
      return res.status(400).json({ error: 'El vendedor todavía no cargó un alias: no se puede comprar' });
    }

    res.status(200).json({
      producto_id: p.id,
      titulo: p.titulo,
      precio: p.precio,
      alias: p.alias,
      vendedor_nombre_usuario: p.vendedor_nombre_usuario
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los datos de pago' });
  }
};

export { crear_publicacion, eliminar_publicacion, publicaciones, editar_publicacion, datos_pago };