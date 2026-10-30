import pool from '../db.js';

// 1. Agarrar productos de BDD
// 2. Pasarselos a Python
// 3. Recibir de Python
// 4. Mandarselo al front

const listar_productos = async (req, res) => {
  try {
    const usuario_id = req.usuario ? req.usuario.id : null;

    // 1. Agarrar productos de BDD
    const publicaciones_para_py = await pool.query(
      `SELECT
         p.id,
         p.titulo,
         (SELECT nombre_usuario FROM usuario u WHERE u.id = p.usuario_publicador_id) AS vendedor,
         p.visualizaciones AS cant_visualizaciones,
         (SELECT COUNT(*)::int FROM comentario c WHERE c.publicacion_id = p.id) AS cant_comentarios,
         (SELECT COUNT(*)::int FROM resenas r JOIN producto pr ON pr.id = r.producto_id
            WHERE pr.usuario_publicador_id = p.usuario_publicador_id) AS cant_reseñas,
         (SELECT AVG(r.estrellas)::float FROM resenas r JOIN producto pr ON pr.id = r.producto_id
            WHERE pr.usuario_publicador_id = p.usuario_publicador_id) AS valor_reseñas,
         (SELECT COUNT(*)::int FROM guardados g WHERE g.publicacion_id = p.id) AS cant_guardados,
         EXISTS (SELECT 1 FROM ordenes_de_compra o
            WHERE o.vendedor_id = p.usuario_publicador_id AND o.comprador_id = $1::int) AS ex_comprador,
         EXISTS (SELECT 1 FROM guardados g
            WHERE g.usuario_id = $1::int AND g.publicacion_id = p.id) AS guardado,
         EXISTS (SELECT 1 FROM direcciones d_vend
            JOIN direcciones d_act ON d_act.pais = d_vend.pais AND d_act.provincia = d_vend.provincia
            WHERE d_vend.usuario_id = p.usuario_publicador_id AND d_act.usuario_id = $1::int) AS misma_provincia,
         EXISTS (SELECT 1 FROM direcciones d_vend
            JOIN direcciones d_act ON d_act.pais = d_vend.pais AND d_act.provincia = d_vend.provincia
                                   AND d_act.ciudad = d_vend.ciudad
            WHERE d_vend.usuario_id = p.usuario_publicador_id AND d_act.usuario_id = $1::int) AS misma_ciudad,
         (SELECT COUNT(*)::int FROM reportes rep
            WHERE rep.usuario_reportado_id = p.usuario_publicador_id) AS cant_reportes_vendedor,
         p.fecha_publicacion AS fecha_publicacion
       FROM producto p
       WHERE p.estado_publicacion = 'disponible'
         AND ($1::int IS NULL OR p.usuario_publicador_id != $1::int)
         AND NOT EXISTS (SELECT 1 FROM reportes rep
            WHERE rep.usuario_reportador_id = $1::int AND rep.usuario_reportado_id = p.usuario_publicador_id)`,
      [usuario_id]
    );
    if (publicaciones_para_py.rows.length === 0) {
      return res.status(200).json([]);
    }
    // 2 y 3. Pasarselos a Python y recibir
    const pedir_orden_a_python = async (publicaciones_para_py) => {
      // Dirección del servidor de Lucio
      const url = process.env.PYTHON_URL || 'http://127.0.0.1:5000/ordenar';
    
      const post_body = {
        backend_key: process.env.BACKEND_KEY, // clave compartida
        publicaciones: publicaciones_para_py
      };
    
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(post_body),
        signal: AbortSignal.timeout(3000) // si tarda más de 3 segundos, se corta
      });
    
      if (!respuesta.ok) {
        throw new Error(`Python respondió con código ${respuesta.status}`);
      }
    
      //Python devuelve un array de objetos con id
      const datos = await respuesta.json();
      if (!Array.isArray(datos)) {
        throw new Error('Python no devolvió un array');
      }
      return datos.map((p) => p.id); // nos quedamos solo con los ids, en el orden que mandó
    };
    const orden = await pedir_orden_a_python(publicaciones_para_py.rows);

    // 4. Mandarselo al front
        const productos_ordenados = [];

        for (const id of orden) {
          const resultado = await pool.query(
            `SELECT p.id, p.titulo, p.descripcion, p.precio::float AS precio, p.talle, p.color,
                    p.marca, p.estado_condicion, p.foto, p.visualizaciones,
                    p.cantidad_guardados, p.fecha_publicacion,
                    p.usuario_publicador_id,
                    u.nombre_usuario AS vendedor_nombre_usuario,
                    u.verificado AS vendedor_verificado
             FROM producto p
             JOIN usuario u ON u.id = p.usuario_publicador_id
             WHERE p.id = $1`,
            [id]
          );
    
          if (resultado.rows.length > 0) {
            productos_ordenados.push(resultado.rows[0]);
          }
        }
    
        res.status(200).json(productos_ordenados);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
};

export { listar_productos };