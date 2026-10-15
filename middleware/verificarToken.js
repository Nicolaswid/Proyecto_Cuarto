//CHEQUEAR

import jwt from 'jsonwebtoken';

const verificarToken = (req, res, next) => {
  const encabezado = req.headers.authorization;

  if (!encabezado || !encabezado.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta el token' });
  }

  const token = encabezado.split(' ')[1];

  try {
    const datos = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = { id: datos.id, nombre_usuario: datos.nombre_usuario };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o vencido' });
  }
};

export { verificarToken };