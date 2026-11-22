// Cubo Corse unito (fase 0): il modello grafico di un'auto, qualunque sia la pista.
// spec.modello = 'voxel' → CarVisual (carmodel.js, le auto di Cubo Corse, con i danni a cubetti);
// spec.modello = 'lowpoly' → AutoLowPoly (pacchetto/auto3d.js, le auto di Circuit Studio, negli stili del menu).
// Stessa interfaccia: group, body, eye, bonnet, update(car, dt, t), setCockpit(on), dispose(); damage() solo voxel.
import { CarVisual } from './carmodel.js';
import { AutoLowPoly } from './pacchetto/auto3d.js';

/** normali nulle (triangoli degeneri) → in su: altrimenti lo shader fa normalize(0) = NaN e il pixel esce nero
 *  (quadrati neri con antialias e bagliore, Circuit Studio 10-11). Le geometrie condivise si sistemano una volta. */
function sanaNormali(root) {
  root.traverse((o) => {
    const n = o.isMesh && o.geometry.attributes.normal;
    if (!n || o.geometry.userData.normaliSane) return;
    const A = n.array; let k = 0;
    for (let i = 0; i < A.length; i += 3) {
      const l = A[i] * A[i] + A[i + 1] * A[i + 1] + A[i + 2] * A[i + 2];
      if (!(l > 1e-6) || !isFinite(l)) { A[i] = 0; A[i + 1] = 1; A[i + 2] = 0; k++; }
    }
    if (k) n.needsUpdate = true;
    o.geometry.userData.normaliSane = true;
  });
}

/** opt: { stile (auto low-poly: attuale | lowpoly | realistico), numeri (false per il ghost), pbr (mondo voxel) } */
export function creaVisuale(spec, livery, number, opt = {}) {
  if (spec.modello === 'lowpoly') {
    const a = new AutoLowPoly(spec, livery, number, { numeri: opt.numeri !== false, stile: opt.stile || 'attuale', pbr: !!opt.pbr });
    sanaNormali(a.group);
    return a;
  }
  return new CarVisual(spec, livery, number);
}
