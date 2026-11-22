// Tipos de figura, pruebas de selección (hit-test) y tiradores de edición.
import { dist, distToSegment, distToQuad, curveCtrl, pointInPoly, centroid } from './geometry';

export const TOOLS = [
  { id: 'select', label: 'Seleccionar', hint: 'Mover, seleccionar varios con Mayús o arrastrando un recuadro' },
  { id: 'pan', label: 'Mano', hint: 'Desplazar el campo' },
  { id: 'pen', label: 'Lápiz', hint: 'Dibujo libre' },
  { id: 'line', label: 'Línea', hint: 'Línea recta' },
  { id: 'dline', label: 'Discontinua', hint: 'Línea discontinua' },
  { id: 'arrow', label: 'Flecha', hint: 'Flecha recta' },
  { id: 'carrow', label: 'Flecha curva', hint: 'Arrastra; la curva dobla hacia el lado en que muevas el dedo. Ajústala con el punto central' },
  { id: 'rect', label: 'Rectángulo', hint: 'Arrastra' },
  { id: 'oval', label: 'Óvalo', hint: 'Arrastra; luego mueve sus puntos para deformarlo como quieras' },
  { id: 'polygon', label: 'Polígono', hint: 'Toca los vértices; doble toque o Enter para cerrar' },
  { id: 'erase', label: 'Borrador', hint: 'Toca o arrastra sobre lo que quieras borrar' },
  { id: 'shadowpick', label: 'Elegir sombras', hint: 'Toca los jugadores que proyectan sombra (vuelve a tocar para quitarlos); sin elegir, lo hacen todos' },
  { id: 'text', label: 'Texto', hint: 'Toca para escribir una nota' },
  { id: 'player', label: 'Ficha', hint: 'Toca para colocar un jugador' },
  { id: 'ball', label: 'Balón', hint: 'Toca para colocar el balón' }
];

export const CLOSED = new Set(['rect', 'oval', 'polygon', 'tri', 'quad', 'poly']);
export const FILLABLE = CLOSED;
export const isClosed = (t) => CLOSED.has(t);
export const isArrow = (t) => t === 'arrow' || t === 'carrow';

// Puntos que se pueden arrastrar para editar una figura libre
export function handlesOf(shape, pts) {
  if (shape.attach) return [];
  return pts;
}

export function labelAnchor(shape, pts) {
  if (shape.type === 'text') return pts[0];
  return centroid(pts);
}

// ¿Toca el punto p (en mundo) a la figura? tol en unidades de mundo
export function hitShape(shape, pts, p, tol) {
  const t = tol + (shape.width || 2) / 2;
  switch (shape.type) {
    case 'text': return dist(p, pts[0]) < 18 + tol;
    case 'carrow': return pts.length >= 3 && distToQuad(p, pts[0], curveCtrl(pts[0], pts[1], pts[2]), pts[2]) <= t;
    case 'pen':
    case 'line': case 'dline': case 'arrow': case 'link': {
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= t) return true;
      return false;
    }
    default: { // polígonos cerrados
      if (pointInPoly(p, pts) && shape.fill) return true;
      for (let i = 0; i < pts.length; i++) if (distToSegment(p, pts[i], pts[(i + 1) % pts.length]) <= t) return true;
      return false;
    }
  }
}

// Figura que contiene o roza el punto: se prueba de arriba hacia abajo
export function pickShape(shapes, ptsOf, p, tol) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitShape(shapes[i], ptsOf(shapes[i]), p, tol)) return shapes[i];
  }
  return null;
}

// Figura dentro de un recuadro de selección (todos sus puntos dentro)
export function shapeInRect(pts, r) {
  return pts.length > 0 && pts.every((p) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1);
}

export function describe(shape) {
  const names = {
    pen: 'Lápiz', line: 'Línea', dline: 'Línea discontinua', arrow: 'Flecha', carrow: 'Flecha curva', rect: 'Rectángulo', oval: 'Óvalo', polygon: 'Polígono', link: 'Conexión', tri: 'Triángulo vinculado',
    quad: 'Estructura vinculada', poly: 'Polígono vinculado', text: 'Texto'
  };
  return names[shape.type] || 'Figura';
}
