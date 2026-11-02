import pool from '../db.js';

// ---------- POST /crear_publicacion ----------
const crear_publicacion = async (req, res) => {
  // usuario_publicador_id YA NO viene del body: sale del token
  const {
    talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
    tipo_prenda, subtipo_prenda, genero, stock
  } = req.body;

  if (!talle || !color || !estado_condicion || !precio || !titulo || !descripcion ||
      !foto || !marca || !tipo_prenda || !subtipo_prenda || !genero) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (!Number.isFinite(Number(precio)) || Number(precio) <= 0) {
    return res.status(400).json({ error: 'El precio debe ser un número mayor a 0' });
  }

  // stock es opcional: si no viene, vale 1 (igual que el DEFAULT de la base)
  const stock_final = stock === undefined ? 1 : Number(stock);
  if (!Number.isInteger(stock_final) || stock_final < 1) {
    return res.status(400).json({ error: 'El stock debe ser un número entero de 1 o más' });
  }

  // Largos máximos de las columnas VARCHAR
  if (String(tipo_prenda).length > 50 || String(subtipo_prenda).length > 50 || String(genero).length > 30) {
    return res.status(400).json({ error: 'tipo_prenda y subtipo_prenda admiten hasta 50 caracteres, y genero hasta 30' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO producto (talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
                             tipo_prenda, subtipo_prenda, genero, stock, usuario_publicador_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, talle, color, estado_condicion, precio::float AS precio, titulo, descripcion,
                 visualizaciones, foto, marca, tipo_prenda, subtipo_prenda, genero, stock,
                 estado_publicacion, fecha_publicacion, usuario_publicador_id, cantidad_guardados`,
      [talle, color, estado_condicion, Number(precio), titulo, descripcion, foto, marca,
       tipo_prenda, subtipo_prenda, genero, stock_final, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear publicación' });
  }
};

//  DELETE /eliminar_publicacion/:id (solo el dueño) 
const eliminar_publicacion = async (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }

  try {
    // Filtra por id Y por dueño. Si es de otro, no encuentra nada: 404
    const resultado = await pool.query(
      `DELETE FROM producto WHERE id = $1 AND usuario_publicador_id = $2 RETURNING id`,
      [id, req.usuario.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }
    res.status(200).json({ mensaje: 'Publicación eliminada' });
  } catch (error) {
    // 23503 = foreign key (ON DELETE RESTRICT): tiene órdenes u ofertas asociadas
    if (error.code === '23503') {
      return res.status(400).json({ error: 'No se puede eliminar: la publicación tiene órdenes u ofertas asociadas' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
};

//  GET /publicaciones/:usuario_id (público, token opcional) 
const publicaciones = async (req, res) => {
  const { usuario_id } = req.params;

  if (!Number.isInteger(Number(usuario_id))) {
    return res.status(400).json({ error: 'Falta el id de usuario o no es válido' });
  }

  // El dueño ve todas (incluidas las vendidas). Los demás, solo las disponibles.
  const soy_el_dueno = Boolean(req.usuario && req.usuario.id === Number(usuario_id));

  try {
    const resultado = await pool.query(
      `SELECT id, talle, color, estado_condicion, precio::float AS precio, titulo, descripcion,
              visualizaciones, foto, marca, tipo_prenda, subtipo_prenda, genero, stock,
              estado_publicacion, fecha_publicacion, usuario_publicador_id, cantidad_guardados
       FROM producto
       WHERE usuario_publicador_id = $1
         AND ($2::boolean OR estado_publicacion = 'disponible')
       ORDER BY fecha_publicacion DESC, id DESC`,
      [usuario_id, soy_el_dueno]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las publicaciones del usuario' });
  }
};

//  PATCH /editar_publicacion/:id (solo el dueño) 
const editar_publicacion = async (req, res) => {
  const { id } = req.params;
  const {
    talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
    tipo_prenda, subtipo_prenda, genero, stock
  } = req.body;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Falta el id de publicación o no es válido' });
  }

  const posibles = {
    talle, color, estado_condicion, precio, titulo, descripcion, foto, marca,
    tipo_prenda, subtipo_prenda, genero, stock
  };
  const campos = [];
  const valores = [];

  for (const nombreCampo in posibles) {
    const valor = posibles[nombreCampo];
    if (valor === undefined) continue; // no lo mandaron: no se toca

    // Mandarlo vacío o null no vale
    if (valor === null || (typeof valor === 'string' && valor.trim() === '')) {
      return res.status(400).json({ error: `El campo ${nombreCampo} no puede estar vacío` });
    }
    campos.push(nombreCampo);
    valores.push(valor);
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
  if ((tipo_prenda !== undefined && String(tipo_prenda).length > 50) ||
      (subtipo_prenda !== undefined && String(subtipo_prenda).length > 50) ||
      (genero !== undefined && String(genero).length > 30)) {
    return res.status(400).json({ error: 'tipo_prenda y subtipo_prenda admiten hasta 50 caracteres, y genero hasta 30' });
  }

  const set = campos.map((campo, i) => `${campo} = $${i + 1}`).join(', ');

  // Al final van el id de la publicación y el id del dueño (sale del token)
  valores.push(id);
  valores.push(req.usuario.id);

  try {
    const resultado = await pool.query(
      `UPDATE producto SET ${set}, fecha_publicacion = NOW()
       WHERE id = $${valores.length - 1} AND usuario_publicador_id = $${valores.length}
       RETURNING id, talle, color, estado_condicion, precio::float AS precio, titulo, descripcion,
                 visualizaciones, foto, marca, tipo_prenda, subtipo_prenda, genero, stock,
                 estado_publicacion, fecha_publicacion, usuario_publicador_id, cantidad_guardados`,
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