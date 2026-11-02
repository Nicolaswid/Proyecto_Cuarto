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
  
// Recién ahora, con la contraseña correcta, revisamos el estado de la cuenta.
    // (Si lo hiciéramos antes, cualquiera podría descubrir quién está baneado.)
    if (usuario.estado === 'baneado') {
      return res.status(403).json({ error: "Tu cuenta fue baneada" });
    }
    if (usuario.estado === 'suspendido') {
      return res.status(403).json({ error: "Tu cuenta está suspendida por reportes de otros usuarios" });
    }

    const token = jwt.sign(
      { id: usuario.id, nombre_usuario: usuario.nombre_usuario },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
  
    res.json({ token });  
    
  };
export {login};