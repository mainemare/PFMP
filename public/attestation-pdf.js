'use strict';
/* Attestation de stage (Annexe 3) : même mise en page que le modèle du lycée, remplie par l'application.
 * Partagé par l'application (aperçu, PDF final de l'élève) et la page de l'entreprise (lien de signature).
 * Données : { entreprise, adresse, siret, representant, fonction, numero, debut, fin, jours, gratification, faitA, faitLe,
 *   eleve: { nom, prenom, naissance, classe }, etab: { nom, adresse, chef }, sig: { img, cachet, nom, fonction, date } } */
const CHAMPS_ATT_ENT = [['entreprise', 'Nom de l’entreprise'], ['adresse', 'Adresse'], ['siret', 'N° d’immatriculation (SIRET)'], ['representant', 'Représenté(e) par (nom)'], ['fonction', 'Fonction']];
const CHAMPS_ATT_PERIODE = [['numero', 'Période n°', 'text'], ['debut', 'Du', 'date'], ['fin', 'Au', 'date'], ['jours', 'Durée effective totale (en jours)', 'number'], ['gratification', 'Gratification versée (€)', 'text'], ['faitA', 'Fait à', 'text'], ['faitLe', 'Le', 'date']];
const dateAtt = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('/') : (v || '');

async function fabriquerPdfAttestation(A) {
  const L = await chargerPdfLib(), doc = await L.PDFDocument.create(), W = 595.28, H = 841.89, page = doc.addPage([W, H]);
  const f = { n: await doc.embedFont(L.StandardFonts.Helvetica), b: await doc.embedFont(L.StandardFonts.HelveticaBold), i: await doc.embedFont(L.StandardFonts.HelveticaOblique), t: await doc.embedFont(L.StandardFonts.TimesRomanBold) };
  const noir = L.rgb(0, 0, 0), orange = L.rgb(0.9, 0.45, 0.12), bleu = L.rgb(0.05, 0.15, 0.45), jeux = new Map();
  const propre = (font, s) => { if (!jeux.has(font)) jeux.set(font, new Set(font.getCharacterSet()));
    const ok = jeux.get(font); return [...String(s == null ? '' : s).replace(/[\n\r\t]+/g, ' ')].map(c => ok.has(c.codePointAt(0)) ? c : c === '’' ? "'" : c === '…' ? '...' : '').join(''); };
  const larg = (s, t, font) => font.widthOfTextAtSize(propre(font, s), t);
  const txt = (s, x, y, t, font = f.n, coul = noir) => page.drawText(propre(font, s), { x, y: H - y, size: t, font, color: coul });
  // Texte coupé pour tenir dans une largeur donnée (taille réduite si besoin)
  const ajuste = (s, x, y, t, max, font = f.n, coul = noir) => { let tt = t; while (tt > 6 && larg(s, tt, font) > max) tt -= 0.5; txt(s, x, y, tt, font, coul); };
  const cadre = (x, y, w, h, ep = 0.8) => page.drawRectangle({ x, y: H - y - h, width: w, height: h, borderWidth: ep, borderColor: noir });
  const val = (v, pointilles) => v ? String(v) : pointilles;
  // Libellé puis valeur (en bleu foncé : ce qui est rempli)
  const champ = (libelle, v, x, y, max, pointilles = '..............................') => { txt(libelle, x, y, 9); const dx = larg(libelle, 9, f.n) + 3; ajuste(val(v, pointilles), x + dx, y, 9, max - dx, f.n, v ? bleu : noir); };

  // En-tête
  const titre = 'ATTESTATION DE STAGE - Annexe 3';
  txt(titre, (W - larg(titre, 13, f.t)) / 2, 87, 13, f.t, orange);
  txt('Conformément à l’article D. 124-9 du code de l’éducation, une attestation de stage est délivrée par', 68, 100, 8.6, f.i);
  txt('l’organisme d’accueil à tout élève.', 68, 111, 8.6, f.i);
  txt('Ce document doit être complété et signé le dernier jour de la période de formation en milieu', 68, 135, 9.6, f.i, orange);
  txt('professionnel par un responsable autorisé de l’entreprise d’accueil et remis au stagiaire.', 68, 149, 9.6, f.i, orange);

  // Entreprise
  txt('L’entreprise (ou l’organisme d’accueil) :', 70, 170, 9);
  cadre(63, 182, 473, 110);
  champ('Nom :', A.entreprise, 66, 206, 460);
  champ('Adresse :', A.adresse, 66, 227, 460);
  champ('N° d’immatriculation de l’entreprise :', A.siret, 66, 248, 460);
  champ('Représenté(e) par (nom) :', A.representant, 66, 268, 225);
  champ('Fonction :', A.fonction, 290, 268, 240);

  // Élève
  const e = A.eleve || {};
  txt('Atteste que l’élève désigné ci-dessous :', 68, 307, 9);
  cadre(63, 317, 473, 68);
  const nomE = String(e.nom || '').toUpperCase(), xPrenom = Math.min(330, Math.max(151, 66 + larg('Nom : ', 9, f.n) + larg(nomE || '................', 9, f.n) + 18));
  champ('Nom :', nomE, 66, 341, xPrenom - 72, '................');
  champ('Prénom :', e.prenom, xPrenom, 341, 530 - xPrenom, '................');
  champ('Date de naissance :', dateAtt(e.naissance), 66, 361, 180, '..../..../........');
  champ('Classe :', e.classe, 252, 361, 200, '.........');

  // Établissement
  const t = A.etab || {};
  txt('Scolarisé dans l’établissement ci-après :', 68, 400, 9);
  cadre(63, 410, 473, 89);
  champ('Nom :', t.nom, 66, 434, 460);
  champ('Adresse :', t.adresse, 66, 455, 460);
  txt('Représenté par (nom) :', 66, 475, 9); const xr = 66 + larg('Représenté par (nom) :', 9, f.n) + 3;
  txt(`${t.chef || '..............................'},`, xr, 475, 9, f.b); txt('en qualité de chef d’établissement', xr + larg(`${t.chef || '..............................'},`, 9, f.b) + 4, 475, 9);

  // Période
  txt('A effectué une période de formation en milieu professionnel dans notre entreprise ou organisme', 68, 520, 9);
  cadre(64, 542, 470, 89, 2.2);
  const [d1, d2] = [A.debut, A.fin].map(v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse() : null);
  let x = 116; const seg = (s, coul = noir) => { txt(s, x, 566, 11.5, f.n, coul); x += larg(s, 11.5, f.n); };
  seg('Période n° '); seg(val(A.numero, '....'), A.numero ? bleu : noir); seg('   du   ');
  if (d1) { seg(d1[0], bleu); seg(' / '); seg(d1[1], bleu); seg(' / '); seg(d1[2], bleu); } else seg('...... / ...... / ......');
  seg('   au   ');
  if (d2) { seg(d2[0], bleu); seg(' / '); seg(d2[1], bleu); seg(' / '); seg(d2[2], bleu); } else seg('...... / ...... / ......');
  x = 138; const seg2 = (s, coul = noir, font = f.n) => { txt(s, x, 594, 10.5, font, coul); x += larg(s, 10.5, font); };
  seg2('Soit une durée effective totale de :   '); seg2(val(A.jours, '......'), A.jours ? bleu : noir, A.jours ? f.b : f.n); seg2(' jours     ');
  const enJ = '(en nombre de jours)'; txt(enJ, x, 594, 10.5); page.drawLine({ start: { x, y: H - 596 }, end: { x: x + larg(enJ, 10.5, f.n), y: H - 596 }, thickness: 0.6, color: noir });

  // Gratification, lieu et date
  x = 68; const seg3 = (s, t, coul = noir) => { txt(s, x, 653, t, f.n, coul); x += larg(s, t, f.n); };
  seg3('Le montant total de ', 8.6); seg3(val(A.gratification, '....................'), 8.6, A.gratification ? bleu : noir); seg3(' € a été versé au stagiaire à titre de gratification.', 8.6);
  x = 68; const seg4 = (s, coul = noir) => { txt(s, x, 681, 9.6, f.n, coul); x += larg(s, 9.6, f.n); };
  seg4('Fait à '); seg4(val(A.faitA, '.................................'), A.faitA ? bleu : noir); seg4(', le '); seg4(val(dateAtt(A.faitLe), '....................'), A.faitLe ? bleu : noir);
  txt('Signature et cachet de l’entreprise ou de l’organisme d’accueil :', 68, 710, 9.6);

  // Signature et cachet (lien de signature ou photo)
  const s = A.sig;
  if (s && (s.img || s.cachet)) {
    const image = async u => { const o = Uint8Array.from(atob(u.slice(u.indexOf(',') + 1)), c => c.charCodeAt(0)); return u.startsWith('data:image/png') ? doc.embedPng(o) : doc.embedJpg(o); };
    const place = async (u, x0, w, h) => { const im = await image(u), k = Math.min(w / im.width, h / im.height); page.drawImage(im, { x: x0, y: H - 722 - im.height * k, width: im.width * k, height: im.height * k }); };
    if (s.img) await place(s.img, 80, 190, 72);
    if (s.cachet) await place(s.cachet, 300, 200, 80);
    if (s.nom) txt(`Signé électroniquement par ${s.nom}${s.fonction ? ` (${s.fonction})` : ''} le ${new Date(s.date).toLocaleDateString('fr-FR')}`, 68, 812, 7.5, f.i, L.rgb(0.3, 0.3, 0.35));
  }
  return doc.save();
}
