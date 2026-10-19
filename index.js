import express from 'express';
import cors from 'cors';
import { crear_cuenta, eliminar_cuenta, editar_usuario } from './Funciones/usuario.js';
import { crear_publicacion, eliminar_publicacion, publicaciones, editar_publicacion } from './Funciones/publicaciones.js';
import { guardar_publicacion, publi_vendida, guardados } from './Funciones/guardados.js';
import { sumarVista } from './Funciones/vistas.js';
import { login } from './Funciones/log_in.js';
import { mis_notificaciones, marcar_notificacion_leida } from './Funciones/notificaciones.js';
import { crear_comentario, listar_comentarios } from './Funciones/comentarios.js';
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
app.get('/publicaciones/:usuario_id', publicaciones);
app.post('/crear_publicacion', crear_publicacion);
app.delete('/eliminar_publicacion/:id', eliminar_publicacion);
app.post('/guardar_publicacion', guardar_publicacion);
app.patch('/publicacion_vendida/:id', publi_vendida);
app.patch('/editar_publicacion/:id', editar_publicacion);

// Usuario / Cuenta
app.post('/crear_cuenta', crear_cuenta);
app.delete('/eliminar_cuenta/:nombre_usuario', eliminar_cuenta);
app.patch('/usuario/:id', editar_usuario);

// Vista
app.patch('/vistas/:id', sumarVista);

// Guardados
app.get('/guardados/:usuario_id', guardados)

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