import express from 'express';
import cors from 'cors';
import { crear_cuenta, eliminar_cuenta } from "/funciones/crea_elimina_usu.js";
import { crear_publicacion, eliminar_publicacion } from './funciones/crea_elimina_publi.js';


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