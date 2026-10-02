import pool from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const login = async (req, res) => {
    const { nombre_usuario, contrasena} = req.body;
  
    if (!nombre_usuario || !contrasena) {
      return res.status(400).json({ error: "Falta nombre de usuario o contraseña" });
    }
  
    const result = await pool.query(
      "SELECT id, nombre_usuario, contrasena FROM usuario WHERE nombre_usuario = $1",
      [nombre_usuario]
    );
  
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "El usuario no existe" });
    }
  
    const usuario = result.rows[0];
  
    const ok = await bcrypt.compare(contrasena, usuario.contrasena);
  
    if (!ok) {
      return res.status(401).json({ error: "Usuario o contraseña incorrecta" });
    }
  
    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre_usuario },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
  
    res.json({ token });
  };

export {login};