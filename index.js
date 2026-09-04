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
console.log();