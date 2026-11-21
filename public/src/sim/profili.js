// Profili dell'IA per pista e versione (fase 0 del piano, 20-11-2026).
//
// Cubo Corse e Circuit Studio avevano la stessa IA di partenza, poi Circuit Studio l'ha adattata alle strade strette di
// Roncadelle (barriere vere a ridosso del cordolo). Usare quella versione anche su Monza, Porto e Colline rallentava l'IA
// di 1,6-2,9 s al giro (docs/fisica-cc-cs-v2.html §3.4), e Gabriele ha deciso che lì i tempi restano quelli di oggi.
// Quindi ogni differenza è diventata un parametro, e ogni pista (e versione) sceglie un profilo:
//   permanente     = Cubo Corse com'era (Monza, Porto, Colline);
//   cittadino      = Circuit Studio com'era (Roncadelle e Nenni, versioni A);
//   cittadinoVeloce = Circuit Studio con le leve del confronto col ghost di Gabriele (Roncadelle B e Nenni B,
//                    docs/ghost-vs-ia-nenni.html §5, decisione del 17-11).
// Prima i valori di cittadino stavano anche in variabili d'ambiente (KPP, AIDB, STRETTO, KSMAX, KSW, SCALE): ora solo qui.

export const PROFILI_IA = {
  permanente: {
    nome: 'Circuito permanente (Cubo Corse)',
    guidaIA: 'cubo',         // modello di guida (ESC) delle auto dell'IA, qualunque sia quello scelto dal giocatore
    // --- traiettoria (racingline.js)
    cordolo: 1,              // quota del cordolo usabile
    margine: 1.3,            // m dal bordo esterno del cordolo al centro dell'auto
    margineInterno: 1.6,     // all'interno delle curve (curvatura > 1/300 m, ±20 m); null = come margine
    mBarriera: null,         // distanza minima dalla barriera (m, oltre la mezza larghezza); null = nessuna
    ricuci: false,           // media triangolare dopo ogni scala dell'elastico (toglie il dente di sega a 8 m)
    piccoCurvatura: false,   // velocità dal picco della curvatura su ±4 m invece che dalla media su ±6 m
    stretto: 1,              // aderenza utile nei tornanti sotto 17 m di raggio (1 = piena)
    salti: false,            // true: sulle creste niente limite di velocità per non staccarsi da terra (l'IA salta)
    aderenza: 0.9,           // quota dell'aderenza usata nel profilo di velocità
    accG: 0.75, accP: 0.8,   // accelerazione nel profilo: tetto in g e quota della potenza
    decel: 0.86,             // quota della frenata nel profilo
    // --- guida (ai.js)
    kP: 0,                   // correzione sull'errore laterale (1/s²)
    dOk: false,              // spostamento (sorpassi, errori) limitato nel punto di mira, non dove sta l'auto
    miraCorta: false,        // punto di mira accorciato nei tornanti stretti
    guardiaLimiti: true,     // vecchia guardia contro i muri interni a ridosso del cordolo (Cubo Corse)
    guardiaSolidi: false,    // guardia predittiva sui corpi solidi (0,3 e 0,6 s)
    rallentaFuori: false,    // fuori traiettoria (sorpasso) rallenta come se fosse dalla parte stretta
    erroreLargoLimitato: false, // l'errore «largo» non porta oltre la barriera
    anticipo: 0.6, anticipoMin: 10, anticipoTraffico: null, // la velocità obiettivo è il minimo nei prossimi anticipo·v metri
    gas0: 0.55, gasK: 0.25,  // gas = gas0 + gasK·(differenza di velocità)
    freno: 1.2,              // soglia del freno (m/s sopra l'obiettivo)
    gasGraduato: false,      // sotto la soglia: gas 0,25 fisso (Cubo Corse) o graduato (Circuit Studio)
    frenoK: 0.22,            // freno = frenoK·(eccesso di velocità)
  },
};

PROFILI_IA.cittadino = {
  ...PROFILI_IA.permanente,
  nome: 'Cittadino (Circuit Studio)',
  guidaIA: 'misto',
  cordolo: 0.6, margine: 1.6, margineInterno: null, mBarriera: 1.1,
  ricuci: true, piccoCurvatura: true, stretto: 0.9,
  // 21-11 (Gabriele: «salto anche io e sopravvivo»): sulle quote LiDAR l'IA non rallenta più sulle creste. Prima, sulla
  // Nenni B, un'ondulina di 7 cm 70 m prima del traguardo la faceva frenare da 224 a 201 km/h; saltando regge (0 urti,
  // 0 uscite, voli fino a 0,18 s) e gira 0,5 s più forte
  salti: true,
  kP: 2, dOk: true, miraCorta: true, guardiaLimiti: false, guardiaSolidi: true, rallentaFuori: true, erroreLargoLimitato: true,
  freno: 0.5, gasGraduato: true, frenoK: 0.3,
};

// Leve del 17-11 (ghost di Gabriele sulla Nenni B): anticipo corto (0,15 s, almeno 4 m) che torna a 0,6 s con un'auto
// davanti entro 40 m + 0,8 s quasi in linea; gas a fondo appena sotto l'obiettivo; profilo con l'accelerazione vera;
// aderenza 95%, tornanti 100%, cordoli 100%, margine 1,3 m. Il resto come cittadino.
PROFILI_IA.cittadinoVeloce = {
  ...PROFILI_IA.cittadino,
  nome: 'Cittadino veloce (Roncadelle B, Nenni B)',
  cordolo: 1, margine: 1.3, stretto: 1, aderenza: 0.95, accG: 0.85, accP: 0.9,
  anticipo: 0.15, anticipoMin: 4, anticipoTraffico: { anticipo: 0.6, min: 10, dist: 40, perV: 0.8, lato: 3 },
  gas0: 0.9, gasK: 2,
};

/** il profilo della pista (nome in track.profiloIA, o un oggetto già pronto) */
export function profiloIA(track) {
  const p = track && track.profiloIA;
  return (typeof p === 'object' && p) || PROFILI_IA[p] || PROFILI_IA.permanente;
}
