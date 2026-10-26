import jwt from 'jsonwebtoken';

// Igual que verificarToken, pero NUNCA corta el pedido:
// - token válido  -> req.usuario = { id, nombre_usuario }
// - sin token, o token inválido/vencido -> req.usuario queda sin definir
const tokenOpcional = (req, res, next) => {
  const cabecera = req.headers.authorization;

  if (cabecera && cabecera.startsWith('Bearer ')) {
    const token = cabecera.split(' ')[1];
    try {
      // JWT_SECRET se lee DENTRO de la función, como en tu middleware
      const datos = jwt.verify(token, process.env.JWT_SECRET);
      req.usuario = { id: datos.id, nombre_usuario: datos.nombre_usuario };
    } catch (error) {
      // Token vencido o inválido: lo tratamos como visitante, no como error
    }
  }

  next(); // pase lo que pase, el pedido sigue
};

export { tokenOpcional };