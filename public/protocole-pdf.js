'use strict';
/* ===== Protocole d'accord : fabrication du PDF sur le formulaire officiel du lycée =====
 * Partagé par l'application (élève) et la page de l'entreprise (signature-tuteur.html).
 * Données : { eleve, ent, signElec, horaires, sigEnt }. */
const PROTOCOLE_PDF = 'protocole-2026-2027.pdf';
const PDFLIB = { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', sri: 'sha512-z8IYLHO8bTgFqj+yrPyIJnzBDf7DDhWwiEsk4sY+Oe6J2M+WQequeGS7qioI5vT6rXgVRb4K1UVQC5ER7MKzKQ==' };

// Emplacements mesurés sur le PDF (points, origine en bas à gauche) : x de départ, y de la ligne, largeur disponible.
const CHAMPS_ELEVE = [
  ['nom', 'Nom', 64, 643.4, 170], ['prenom', 'Prénom', 278, 643.4, 124], ['naissance', 'Né(e) le', 447, 643.4, 112, 'date'],
  ['classe', 'Élève en classe de', 238, 629.3, 320], ['adresse', 'Adresse de l’élève', 120, 615.3, 440],
  ['telEleve', 'Téléphone de l’élève', 131, 601.2, 135], ['telRepresentants', 'Téléphone du/des représentant(s) légal(aux)', 230, 587.2, 326],
  ['referent', 'Enseignant référent', 127, 573.1, 280], ['du', 'Stage du', 104, 544.6, 150, 'date'], ['au', 'au', 280, 544.6, 128, 'date'],
  ['semaines', 'Soit … semaine(s)', 444, 544.6, 28],
];
const CHAMPS_ENTREPRISE = [
  ['entreprise', 'Entreprise', 94, 497.6, 444], ['adresse', 'Adresse complète', 119, 483.6, 422], ['mail', 'Adresse mail de l’entreprise', 161, 469.6, 380, 'email'],
  ['tel', 'Téléphone', 89, 455.5, 140], ['siret', 'N° SIRET', 276, 455.5, 262], ['assureur', 'Nom de l’assureur', 121, 441.5, 108],
  ['contrat', 'N° de contrat', 299, 441.5, 242], ['signataire', 'Nom et prénom du signataire de la convention', 236, 427.4, 178],
  ['fonctionSignataire', 'Fonction du signataire', 462, 427.4, 88], ['mailSignataire', 'Adresse mail du signataire', 154, 413.4, 384, 'email'],
  ['lieu', 'Lieu de formation si différent', 165, 372.9, 380], ['domaine', 'Domaine d’activités de l’entreprise', 41, 338.8, 188],
  ['tuteur', 'Nom et prénom du tuteur', 41, 302.1, 190], ['fonctionTuteur', 'Fonction du tuteur', 128, 283.8, 100],
  ['telTuteur', 'Tél. du tuteur', 61, 265.6, 165], ['mailTuteur', 'Mail du tuteur', 66, 247.2, 160, 'email'],
];
const CASES_SIGNATURE = { oui: [266.3, 390.2], non: [319.2, 390.2] };
const JOURS = [['lundi', 'Lundi', 305.7], ['mardi', 'Mardi', 287], ['mercredi', 'Mercredi', 268.1], ['jeudi', 'Jeudi', 249.3], ['vendredi', 'Vendredi', 230.4], ['samedi', 'Samedi', 210.7]];
// Centres des cases « De : __ H __ à __ H __ » (matin puis après-midi).
const COLONNES_HORAIRES = { matin: [355.5, 382, 406.5, 433], apresmidi: [481, 506.5, 528.5, 553] };

/* ---------- Fabrication du PDF ---------- */
let promessePdfLib = null;
function chargerPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!promessePdfLib) promessePdfLib = new Promise((ok, ko) => {
    const s = document.createElement('script'); Object.assign(s, { src: PDFLIB.js, integrity: PDFLIB.sri, crossOrigin: 'anonymous' });
    s.onload = () => ok(window.PDFLib); s.onerror = () => { promessePdfLib = null; ko(new Error('Impossible de préparer le PDF (connexion Internet ?)')); };
    document.head.append(s);
  });
  return promessePdfLib;
}
const dateFr = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
async function fabriquerPdfProtocole(PROTO) {
  const { PDFDocument, StandardFonts, rgb } = await chargerPdfLib();
  const modele = await fetch(PROTOCOLE_PDF).then(r => { if (!r.ok) throw new Error('Formulaire du lycée introuvable.'); return r.arrayBuffer(); });
  const doc = await PDFDocument.load(modele), page = doc.getPages()[0], police = await doc.embedFont(StandardFonts.Helvetica);
  const encre = rgb(0.05, 0.1, 0.45);
  // Garde seulement les caractères que la police sait écrire (accents français compris).
  const nettoyer = t => [...String(t || '').replace(/\s+/g, ' ').trim()].filter(c => { try { police.encodeText(c); return true; } catch { return false; } }).join('');
  const ecrire = (texte, x, y, largeur, { taille = 9.5, centre = false } = {}) => {
    let t = nettoyer(texte); if (!t) return;
    while (taille > 6 && police.widthOfTextAtSize(t, taille) > largeur) taille -= 0.25;   // réduit la taille si le texte est long
    while (t.length > 1 && police.widthOfTextAtSize(t, taille) > largeur) t = t.slice(0, -1);
    const w = police.widthOfTextAtSize(t, taille);
    page.drawText(t, { x: centre ? x - w / 2 : x, y: y + 1.2, size: taille, font: police, color: encre });
  };
  for (const [k, , x, y, w, type] of CHAMPS_ELEVE) ecrire(type === 'date' ? dateFr(PROTO.eleve[k]) : PROTO.eleve[k], x, y, w, k === 'semaines' ? { centre: true, taille: 10 } : {});
  if (PROTO.eleve.semaines) { /* déjà centré dans la case « Soit … » */ }
  for (const [k, , x, y, w] of CHAMPS_ENTREPRISE) ecrire(PROTO.ent[k], x, y, w);
  if (CASES_SIGNATURE[PROTO.signElec]) { const [x, y] = CASES_SIGNATURE[PROTO.signElec]; page.drawText('X', { x, y, size: 11, font: await doc.embedFont(StandardFonts.HelveticaBold), color: encre }); }
  for (const [j, , y] of JOURS) for (const p of ['matin', 'apresmidi']) {
    const c = COLONNES_HORAIRES[p];
    [['de', 0], ['a', 2]].forEach(([b, i]) => {
      const v = PROTO.horaires[`${j}_${p}_${b}`]; if (!v) return;
      const [h, m] = v.split(':');
      ecrire(String(+h), c[i], y, 16, { centre: true, taille: 9 });
      ecrire(m || '00', c[i + 1], y, 18, { centre: true, taille: 9 });
    });
  }
  // Signature et cachet de l'entreprise, sous « Signature et cachet de l'entreprise : » (colonne de gauche).
  const images = [PROTO.sigEnt && PROTO.sigEnt.img, PROTO.sigEnt && PROTO.sigEnt.cachet].filter(Boolean);
  // Avec une signature à distance, on garde une ligne en bas de la case pour « Signé électroniquement par… ».
  const signeDistance = !!(PROTO.sigEnt && PROTO.sigEnt.signataire);
  const zone = signeDistance ? { x: 42, y: 169, w: 226, h: 53 } : { x: 42, y: 160, w: 226, h: 62 };
  for (let k = 0; k < images.length; k++) {
    const url = images[k], octets = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), c => c.charCodeAt(0));
    const img = url.startsWith('data:image/png') ? await doc.embedPng(octets) : await doc.embedJpg(octets);
    const bw = images.length > 1 ? zone.w / 2 - 4 : zone.w, sc = Math.min(bw / img.width, zone.h / img.height);
    page.drawImage(img, { x: zone.x + k * (zone.w / 2 + 4) + (bw - img.width * sc) / 2, y: zone.y + (zone.h - img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
  }
  if (PROTO.sigEnt && PROTO.sigEnt.signataire) {
    try { page.drawText(`Signé électroniquement par ${PROTO.sigEnt.signataire} le ${dateFr(String(PROTO.sigEnt.signeLe || '').slice(0, 10))}`.replace(/[^\u0020-\u00FF’]/g, ''), { x: zone.x, y: 161, size: 6.5, font: police, color: encre }); } catch { /* caractère non imprimable */ }
  }
  doc.setTitle(`Protocole d'accord - ${PROTO.eleve.prenom} ${PROTO.eleve.nom}`.trim()); doc.setCreator('Suivi des stages');
  return doc.save();
}
