const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
const app = express();
  app.use(cors());
  app.use(express.json());

  app.listen(3000, () => {
    console.log('Servidor corriendo en el puerto 3000');
  });

  app.get('/holita', (req, res) => {
    res.send('Backend HOLA funcionando 🚀');
  });