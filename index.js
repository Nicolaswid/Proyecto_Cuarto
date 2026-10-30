import express from 'express';
import cors from 'cors';
import { crear_cuenta, eliminar_cuenta, editar_usuario, ver_perfil, mi_perfil  } from './Funciones/usuario.js';
import { crear_publicacion, eliminar_publicacion, publicaciones, editar_publicacion } from './Funciones/publicaciones.js';
import { guardar_publicacion, publi_vendida, guardados } from './Funciones/guardados.js';
import { sumarVista } from './Funciones/vistas.js';
import { login } from './Funciones/log_in.js';
import { mis_notificaciones, marcar_notificacion_leida } from './Funciones/notificaciones.js';
import { crear_comentario, listar_comentarios } from './Funciones/comentarios.js';
import { crear_contraoferta, responder_contraoferta, mis_contraofertas, comprar_ahora } from './Funciones/contraofertas.js';
import { mis_ordenes, marcar_enviada, marcar_entregada } from './Funciones/ordenes.js';
import { crear_resena_producto, crear_resena_vendedor, resenas_de_producto, resenas_de_vendedor } from './Funciones/resenas.js';
import { crear_mensaje, ver_conversacion, marcar_leidos, mis_conversaciones } from './Funciones/mensajes.js';
import { listar_productos } from './Funciones/feed.js';
import { tokenOpcional } from './middleware/tokenOpcional.js';
import { verificarToken } from './middleware/verificarToken.js';
const app = express();
  app.use(cors());
  app.use(express.json());

  app.listen(3000, () => {
    console.log('Servidor corriendo en el puerto 3000');
  });

  app.get('/holita', (req, res) => {
    res.send('Backend HOLA funcionando 🚀');
  });

//Publicaciones
app.get('/publicaciones/:usuario_id', verificarToken, publicaciones);
app.post('/crear_publicacion', verificarToken, crear_publicacion);
app.delete('/eliminar_publicacion/:id', verificarToken, eliminar_publicacion);
app.post('/guardar_publicacion', verificarToken, guardar_publicacion);
app.patch('/publicacion_vendida/:id', verificarToken, publi_vendida);
app.patch('/editar_publicacion/:id', verificarToken, editar_publicacion);

// Usuario / Cuenta
app.post('/crear_cuenta', crear_cuenta);
app.delete('/eliminar_cuenta/:nombre_usuario', verificarToken, eliminar_cuenta);
app.patch('/usuario/:id', verificarToken, editar_usuario);

// Perfil
app.get('/usuarios/:nombre_usuario', ver_perfil);
app.get('/mi_perfil', verificarToken, mi_perfil);

// Vista
app.patch('/vistas/:id', sumarVista);

// Guardados
app.get('/guardados/:usuario_id', verificarToken, guardados)

// Log In
app.post('/login', login);

//Prueba Token
app.get('/yo', verificarToken, (req, res) => {
  res.json({ mensaje: 'Pasaste el portero', usuario: req.usuario });
});

//Notificacioness
app.get('/mis_notificaciones', verificarToken, mis_notificaciones);
app.patch('/notificaciones/:id/leida', verificarToken, marcar_notificacion_leida);

//Comentarios
app.post('/comentarios', verificarToken, crear_comentario);
app.get('/publicaciones/:id/comentarios', listar_comentarios);

//Contraofertas
app.post('/contraofertas', verificarToken, crear_contraoferta);
app.post('/contraofertas/:id/responder', verificarToken, responder_contraoferta);
app.get('/mis_contraofertas', verificarToken, mis_contraofertas);
app.post('/comprar_ahora', verificarToken, comprar_ahora);

// Órdenes
app.get('/mis_ordenes', verificarToken, mis_ordenes);
app.patch('/ordenes/:id/enviada', verificarToken, marcar_enviada);
app.patch('/ordenes/:id/entregada', verificarToken, marcar_entregada);

// Reseñas
app.post('/resenas_producto', verificarToken, crear_resena_producto);
app.post('/resenas_vendedor', verificarToken, crear_resena_vendedor);
app.get('/productos/:id/resenas', resenas_de_producto);
app.get('/usuarios/:nombre_usuario/resenas', resenas_de_vendedor);

// Mensajes
app.post('/mensajes', verificarToken, crear_mensaje);
app.get('/mensajes/:otro_usuario_id', verificarToken, ver_conversacion);
app.patch('/mensajes/:otro_usuario_id/leidos', verificarToken, marcar_leidos);
app.get('/mis_conversaciones', verificarToken, mis_conversaciones);

// Productos (el orden lo decide Python; el token es opcional)
app.get('/productos', tokenOpcional, listar_productos);