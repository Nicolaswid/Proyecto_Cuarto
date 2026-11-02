import pool from '../db.js';
import { crear_notificacion } from './notificaciones.js';

// ---------- Ayudantes internos (no son rutas) ----------

// Cancela la transacción y responde con un error. Se usa para los cortes
// "esperados" (404, 400...) que ocurren cuando ya hicimos BEGIN.
const cortar = async (client, res, status, mensaje) => {
  await client.query('ROLLBACK');
  return res.status(status).json({ error: mensaje });
};

// Rechaza todas las ofertas 'pendiente' de un producto (menos la indicada)
// y devuelve un Set con los ids de usuarios a los que hay que avisar.
// Un Set es una lista que no permite repetidos.
const cerrar_ofertas_pendientes = async (client, producto_id, excluir_id, vendedor_id) => {
  const resultado = await client.query(
    `UPDATE contra_ofertas
     SET estado = 'rechazada'
     WHERE producto_id = $1 AND estado = 'pendiente' AND id <> $2
     RETURNING usuario_id,
       (SELECT c2.usuario_id FROM contra_ofertas c2
        WHERE c2.id = contra_ofertas.responde_a) AS autor_anterior`,
    [producto_id, excluir_id]
  );

  const destinatarios = new Set();
  for (const fila of resultado.rows) {
    // Si la oferta cerrada era del vendedor, hay que avisarle al comprador
    // a quien le había contraofertado (autor de la oferta anterior).
    const destinatario = fila.usuario_id === vendedor_id ? fila.autor_anterior : fila.usuario_id;
    if (destinatario) destinatarios.add(destinatario);
  }
  return destinatarios;
};

// ---------- POST /contraofertas : el comprador hace una oferta inicial ----------
const crear_contraoferta = async (req, res) => {
  const { producto_id, nuevo_precio, comentario } = req.body;

  if (!producto_id || !Number.isInteger(Number(producto_id)) ||
      !Number.isFinite(Number(nuevo_precio)) || Number(nuevo_precio) <= 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios o son inválidos' });
  }

  // El comentario es opcional: si viene vacío o no es texto, guardamos null
  const comentario_limpio =
    typeof comentario === 'string' && comentario.trim() !== '' ? comentario.trim() : null;

  try {
    const prod = await pool.query(
      `SELECT titulo, usuario_publicador_id, estado_publicacion
       FROM producto WHERE id = $1`,
      [producto_id]
    );

    if (prod.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }

    const { titulo, usuario_publicador_id, estado_publicacion } = prod.rows[0];

    if (usuario_publicador_id === req.usuario.id) {
      return res.status(400).json({ error: 'No podés ofertar por tu propia publicación' });
    }
    if (estado_publicacion !== 'disponible') {
      return res.status(400).json({ error: 'La publicación ya no está disponible' });
    }

    // Evitar que el mismo comprador llene al vendedor de ofertas
    const repetida = await pool.query(
      `SELECT id FROM contra_ofertas
       WHERE producto_id = $1 AND usuario_id = $2 AND estado = 'pendiente'`,
      [producto_id, req.usuario.id]
    );
    if (repetida.rows.length > 0) {
      return res.status(400).json({ error: 'Ya tenés una oferta pendiente en esta publicación' });
    }

    const oferta = await pool.query(
      `INSERT INTO contra_ofertas (usuario_id, producto_id, nuevo_precio, comentario)
       VALUES ($1, $2, $3, $4)
       RETURNING id, usuario_id, producto_id, nuevo_precio, responde_a, comentario, estado`,
      [req.usuario.id, producto_id, Number(nuevo_precio), comentario_limpio]
    );

    // Ojo: "$${...}" es un signo $ literal seguido de una variable ${...}
    await crear_notificacion(
      usuario_publicador_id,
      `${req.usuario.nombre_usuario} te ofertó $${Number(nuevo_precio)} por "${titulo}"`,
      '/mis_contraofertas'
    );

    res.status(201).json(oferta.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear la oferta' });
  }
};

// ---------- POST /contraofertas/:id/responder : aceptar | rechazar | contraofertar ----------
const responder_contraoferta = async (req, res) => {
  const { id } = req.params;
  const { accion, nuevo_precio, comentario } = req.body;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ error: 'Id inválido' });
  }
  if (!['aceptar', 'rechazar', 'contraofertar'].includes(accion)) {
    return res.status(400).json({ error: 'La acción debe ser aceptar, rechazar o contraofertar' });
  }
  if (accion === 'contraofertar' &&
      (!Number.isFinite(Number(nuevo_precio)) || Number(nuevo_precio) <= 0)) {
    return res.status(400).json({ error: 'Para contraofertar hace falta un nuevo_precio válido' });
  }

  const comentario_limpio =
    typeof comentario === 'string' && comentario.trim() !== '' ? comentario.trim() : null;

  let client; // declarado afuera para poder usarlo en catch y finally
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1) Lectura simple, solo para saber a qué producto pertenece la oferta
    const previa = await client.query(
      `SELECT producto_id FROM contra_ofertas WHERE id = $1`,
      [id]
    );
    if (previa.rows.length === 0) {
      return await cortar(client, res, 404, 'Oferta no encontrada');
    }

    // 2) Candado sobre el PRODUCTO (siempre primero el producto, después la oferta)
    const prodRes = await client.query(
      `SELECT id, titulo, estado_publicacion, usuario_publicador_id
       FROM producto WHERE id = $1 FOR UPDATE`,
      [previa.rows[0].producto_id]
    );
    const producto = prodRes.rows[0];

    // 3) Candado sobre la OFERTA, ya leyendo su estado actualizado
    const ofertaRes = await client.query(
      `SELECT id, usuario_id, producto_id, nuevo_precio, responde_a, estado
       FROM contra_ofertas WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const oferta = ofertaRes.rows[0];

    // 4) ¿Quién es el comprador de esta negociación?
    const vendedor_id = producto.usuario_publicador_id;
    let comprador_id;
    if (oferta.usuario_id !== vendedor_id) {
      comprador_id = oferta.usuario_id; // la hizo el comprador
    } else {
      // la hizo el vendedor: el comprador es el autor de la oferta a la que respondió
      const padre = await client.query(
        `SELECT usuario_id FROM contra_ofertas WHERE id = $1`,
        [oferta.responde_a]
      );
      comprador_id = padre.rows[0].usuario_id;
    }

    // 5) Validaciones de permisos y estado
    const soy_parte = req.usuario.id === vendedor_id || req.usuario.id === comprador_id;
    if (!soy_parte) {
      // Existe pero no es tuya: 404 para no revelar que existe
      return await cortar(client, res, 404, 'Oferta no encontrada');
    }
    if (req.usuario.id === oferta.usuario_id) {
      return await cortar(client, res, 400, 'No podés responder a tu propia oferta');
    }
    if (oferta.estado !== 'pendiente') {
      return await cortar(client, res, 400, 'Esta oferta ya fue respondida');
    }
    if (producto.estado_publicacion !== 'disponible') {
      return await cortar(client, res, 400, 'La publicación ya no está disponible');
    }

    // 6) Ejecutar la acción. Las notificaciones se juntan en una lista
    //    y se mandan recién después del COMMIT.
    const nombre = req.usuario.nombre_usuario;
    const notificaciones = []; // cada elemento: [usuario_id, texto, link]
    let respuesta;

    if (accion === 'aceptar') {
      await client.query(
        `UPDATE contra_ofertas SET estado = 'aceptada' WHERE id = $1`,
        [oferta.id]
      );
      await client.query(
        `UPDATE producto SET estado_publicacion = 'vendido' WHERE id = $1`,
        [producto.id]
      );
      const orden = await client.query(
        `INSERT INTO ordenes_de_compra (producto_id, comprador_id, vendedor_id, precio_final)
         VALUES ($1, $2, $3, $4)
         RETURNING id, producto_id, comprador_id, vendedor_id, precio_final, estado, fecha`,
        [producto.id, comprador_id, vendedor_id, oferta.nuevo_precio]
      );
      const cerradas = await cerrar_ofertas_pendientes(client, producto.id, oferta.id, vendedor_id);

      notificaciones.push([
        oferta.usuario_id,
        `${nombre} aceptó tu oferta por "${producto.titulo}". Se generó la orden de compra`,
        '/mis_ordenes'
      ]);
      // A los demás con ofertas abiertas les avisamos que se vendió (sin repetir a las partes)
      cerradas.delete(comprador_id);
      cerradas.delete(vendedor_id);
      for (const uid of cerradas) {
        notificaciones.push([
          uid,
          `Tu oferta por "${producto.titulo}" se cerró porque el producto se vendió`,
          '/mis_contraofertas'
        ]);
      }
      respuesta = { mensaje: 'Oferta aceptada', orden: orden.rows[0] };

    } else if (accion === 'rechazar') {
      await client.query(
        `UPDATE contra_ofertas SET estado = 'rechazada' WHERE id = $1`,
        [oferta.id]
      );
      notificaciones.push([
        oferta.usuario_id,
        `${nombre} rechazó tu oferta por "${producto.titulo}"`,
        '/mis_contraofertas'
      ]);
      respuesta = { mensaje: 'Oferta rechazada' };

    } else {
      // contraofertar: la anterior pasa a 'contraofertada' y se crea una fila nueva
      await client.query(
        `UPDATE contra_ofertas SET estado = 'contraofertada' WHERE id = $1`,
        [oferta.id]
      );
      const nueva = await client.query(
        `INSERT INTO contra_ofertas (usuario_id, producto_id, nuevo_precio, responde_a, comentario)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, usuario_id, producto_id, nuevo_precio, responde_a, comentario, estado`,
        [req.usuario.id, producto.id, Number(nuevo_precio), oferta.id, comentario_limpio]
      );
      notificaciones.push([
        oferta.usuario_id,
        `${nombre} te hizo una contraoferta de $${Number(nuevo_precio)} por "${producto.titulo}"`,
        '/mis_contraofertas'
      ]);
      respuesta = { mensaje: 'Contraoferta enviada', contraoferta: nueva.rows[0] };
    }

    // 7) Confirmar TODO junto y recién ahora avisar
    await client.query('COMMIT');

    for (const [usuario_id, texto, link] of notificaciones) {
      await crear_notificacion(usuario_id, texto, link);
    }

    res.status(200).json(respuesta);
  } catch (error) {
    // Si algo explotó a mitad de camino, deshacemos todo.
    // El .catch(() => {}) evita que un fallo del ROLLBACK tape el error original.
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Error al responder la oferta' });
  } finally {
    if (client) client.release(); // SIEMPRE devolver la conexión
  }
};

// ---------- GET /mis_contraofertas : las que hice y las que me tocan ----------
const mis_contraofertas = async (req, res) => {
  try {
    // "padre" es la oferta a la que respondió cada fila (sirve para encontrar
    // al comprador cuando la fila es una contraoferta del vendedor)
    const resultado = await pool.query(
      `SELECT c.id, c.producto_id, p.titulo, c.nuevo_precio, c.responde_a,
              c.comentario, c.estado, c.usuario_id AS autor_id,
              u.nombre_usuario AS autor_nombre_usuario,
              (c.estado = 'pendiente' AND c.usuario_id <> $1) AS me_toca_responder
       FROM contra_ofertas c
       JOIN producto p ON p.id = c.producto_id
       JOIN usuario u ON u.id = c.usuario_id
       LEFT JOIN contra_ofertas padre ON padre.id = c.responde_a
       WHERE c.usuario_id = $1
          OR p.usuario_publicador_id = $1
          OR padre.usuario_id = $1
       ORDER BY c.id DESC`,
      [req.usuario.id]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las ofertas' });
  }
};

// ---------- POST /comprar_ahora : compra al precio publicado ----------
const comprar_ahora = async (req, res) => {
  const { producto_id } = req.body;

  if (!producto_id || !Number.isInteger(Number(producto_id))) {
    return res.status(400).json({ error: 'Falta el producto_id o es inválido' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Candado sobre el producto: dos compras simultáneas no pueden pasar a la vez
    const prodRes = await client.query(
      `SELECT id, titulo, precio, estado_publicacion, usuario_publicador_id
       FROM producto WHERE id = $1 FOR UPDATE`,
      [producto_id]
    );
    if (prodRes.rows.length === 0) {
      return await cortar(client, res, 404, 'Publicación no encontrada');
    }

    const producto = prodRes.rows[0];
    const vendedor_id = producto.usuario_publicador_id;

    if (vendedor_id === req.usuario.id) {
      return await cortar(client, res, 400, 'No podés comprar tu propia publicación');
    }
    if (producto.estado_publicacion !== 'disponible') {
      return await cortar(client, res, 400, 'La publicación ya no está disponible');
    }

    const orden = await client.query(
      `INSERT INTO ordenes_de_compra (producto_id, comprador_id, vendedor_id, precio_final)
       VALUES ($1, $2, $3, $4)
       RETURNING id, producto_id, comprador_id, vendedor_id, precio_final, estado, fecha`,
      [producto.id, req.usuario.id, vendedor_id, producto.precio]
    );
    await client.query(
      `UPDATE producto SET estado_publicacion = 'vendido' WHERE id = $1`,
      [producto.id]
    );
    // excluir_id = 0: no existe ninguna oferta con id 0, así que se cierran todas
    const cerradas = await cerrar_ofertas_pendientes(client, producto.id, 0, vendedor_id);

    await client.query('COMMIT');

    await crear_notificacion(
      vendedor_id,
      `${req.usuario.nombre_usuario} compró "${producto.titulo}" por $${producto.precio}`,
      '/mis_ordenes'
    );
    cerradas.delete(req.usuario.id); // el comprador ya sabe que compró
    cerradas.delete(vendedor_id);
    for (const uid of cerradas) {
      await crear_notificacion(
        uid,
        `Tu oferta por "${producto.titulo}" se cerró porque el producto se vendió`,
        '/mis_contraofertas'
      );
    }

    res.status(201).json({ mensaje: 'Compra realizada', orden: orden.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Error al realizar la compra' });
  } finally {
    if (client) client.release();
  }
};

export { crear_contraoferta, responder_contraoferta, mis_contraofertas, comprar_ahora };