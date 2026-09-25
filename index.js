import express from 'express';
import cors from 'cors';
import { crear_cuenta, eliminar_cuenta, editar_usuario } from "./Funciones/crea_elimina_usu.js";
import { crear_publicacion, eliminar_publicacion, publicaciones, editar_publicacion } from './Funciones/publicaciones.js';
import { guardar_publicacion, publi_vendida, guardados } from './Funciones/guardados.js';
import { sumarVista } from './Funciones/vistas.js';
const app = express();
  app.use(cors());
  app.use(express.json());

  app.listen(3000, () => {
    console.log('Servidor corriendo en el puerto 3000');
  });

  app.get('/holita', (req, res) => {
    res.send('Backend HOLA funcionando 🚀');
  });

app.post('/crear_cuenta', crear_cuenta);
app.delete('/eliminar_cuenta/:nombre_usuario', eliminar_cuenta);
app.post('/crear_publicacion', crear_publicacion);
app.delete('/eliminar_publicacion/:id', eliminar_publicacion);
app.post('/guardar_publicacion', guardar_publicacion);
app.patch('/vistas/:id', sumarVista);
app.patch('/publicacion_vendida/:id', publi_vendida);
app.get('/publicaciones/:usuario_id', publicaciones);
app.get('/guardados/:usuario_id', guardados)
app.patch('/usuario/:id', editar_usuario);
app.patch('/publicacion/:id', editar_publicacion);