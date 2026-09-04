const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (error, resultado) => {
  if (error) {
    console.log('❌ Algo falló:', error);
  } else {
    console.log('✅ Conexión exitosa. Hora del servidor:', resultado.rows[0]);
  }
  pool.end(); // cerramos la conexión, porque esto es solo una prueba puntual
});