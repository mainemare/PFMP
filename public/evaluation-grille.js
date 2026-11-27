'use strict';
/* Fiche d'évaluation de l'apprenant en entreprise (Bac pro MELEC, épreuve E3) : grille du lycée.
 * Partagée par l'application (professeur) et la page du tuteur (lien de signature).
 * Barème par compétence : - (0 à 3), + (4 à 6), ++ (6 à 7), +++ (8 à 10). Note sur 20 pondérée (total des pondérations : 240),
 * calculée sur les seules compétences évaluées pendant le stage. Les critères en gras rouge (essentiels) sont repérés par « e ». */
const NIVEAUX_EV = [['-', 'Pas de réussite ou non fait', [0, 1, 2, 3], 2], ['+', 'Réussite partielle', [4, 5, 6], 5], ['++', 'Réussite totale avec aide', [6, 7], 7], ['+++', 'Réussite totale en autonomie', [8, 9, 10], 9]];
const E_ = (t) => ({ t, e: true }), N_ = (t) => ({ t, e: false });
const GRILLE_E3 = [
  { activite: 'Préparation', comps: [
    { id: 'C1', titre: 'C1-C01 Analyser les conditions de l’opération et son contexte', poids: 18, crit: [E_('Les informations nécessaires sont recueillies'), E_('Les contraintes techniques et d’exécutions sont repérées'), N_('Les contraintes liées à l’efficacité énergétique sont repérées'), E_('Les risques professionnels sont évalués'), E_('Les mesures de préventions de santé et sécurité au travail sont proposées'), N_('Les contraintes environnementales sont recensées'), N_('Les interactions avec les autres intervenants sont repérées'), E_('Les habilitations et certifications nécessaires à l’opération sont identifiées')] },
    { id: 'C3', titre: 'C3 Définir une installation à l’aide de solutions préétablies', poids: 12, crit: [N_('Le dossier technique des opérations est constitué et complet'), N_('La solution technique proposée répond au besoin du client et elle est pertinente'), N_('La solution technique proposée intègre les enjeux d’efficacité énergétique')] },
    { id: 'C10', titre: 'C10-C07 Exploiter les outils numériques dans le contexte professionnel', poids: 18, crit: [N_('Les applications numériques (logiciel de représentation graphique, de dimensionnement, de chiffrage…) sont exploitées avec pertinence'), E_('La recherche d’information est faite avec pertinence'), E_('Les moyens et outils de communication numériques sont exploités avec pertinence'), E_('Les moyens et outils de communication sont exploités de manière éthique et responsable')] }] },
  { activite: 'Réalisation', comps: [
    { id: 'C2', titre: 'C2-C02 Organiser l’opération dans son contexte', poids: 25.2, crit: [E_('Après inventaire, les matériels, équipements et outillage manquants sont listés'), N_('Le bon d’approvisionnement ou bon de commande est complété'), N_('Les tâches sont réparties en fonction des habilitations et certification des électriciens'), N_('La répartition prend en compte l’avancement des autres intervenants'), N_('Les activités sont organisées de manière chronologique'), E_('Les contraintes propres au poste de travail y compris environnementales sont prises en compte'), N_('Les activités sont (ré)organisées en fonction des aléas (techniques, organisationnels)'), E_('Les règles de sécurité et de santé au travail sont respectées'), E_('Le poste de travail est organisé'), E_('Le poste de travail est approvisionné en matériel, équipements et outillage'), E_('Le lieu d’activité est restitué quotidiennement propre et en ordre')] },
    { id: 'C4', titre: 'C4-C03 Réaliser une installation de manière éco-responsable', poids: 42, crit: [E_('Les matériels sont posés conformément aux prescriptions et règles de l’art'), E_('Le façonnage est réalisé conformément aux prescriptions et règles de l’art'), E_('Les câblages et les raccordements sont réalisés conformément aux prescriptions et règles de l’art'), N_('Les adaptations techniques nécessaires sont réalisées'), E_('Les réalisations respectent les contraintes liées à l’efficacité énergétique'), E_('Les autocontrôles sont réalisés et les fiches d’autocontrôles sont complétées'), E_('Les déchets sont triés et évacués de manière sélective'), E_('Le consommable est utilisé sans gaspillage'), E_('Les règles de santé et de sécurité au travail sont respectées'), E_('Les procédures de respect de l’environnement des lieux et des biens sont appliquées')] }] },
  { activite: 'Mise en service', comps: [
    { id: 'C5', titre: 'C5-C04 Contrôler les grandeurs caractéristiques de l’installation', poids: 14, crit: [E_('Les contrôles (visuels, caractéristiques…) sont réalisés'), E_('Les mesures (électriques, dimensionnelles…) sont réalisées'), N_('Les mesures liées à l’efficacité énergétique sont réalisées'), E_('Les essais adaptés sont réalisés'), N_('Les grandeurs contrôlées sont correctement interprétées au regard des prescriptions'), E_('Les règles de santé et de sécurité au travail sont respectées')] },
    { id: 'C6', titre: 'C6 Régler, paramétrer les matériels de l’installation', poids: 14, crit: [N_('Les réglages sont réalisés conformément aux prescriptions'), N_('Les réglages prennent en compte l’efficacité énergétique'), N_('Les paramétrages guidés sont réalisés conformément aux prescriptions'), N_('Les règles de santé et de sécurité au travail sont respectées')] },
    { id: 'C7', titre: 'C7-C05 Valider le fonctionnement de l’installation', poids: 14, crit: [N_('L’installation est mise en fonctionnement conformément aux prescriptions'), E_('Le fonctionnement est conforme aux spécifications du cahier des charges (y compris celles liées à l’efficacité énergétique)'), E_('Les opérations nécessaires à la levée de réserve sont faites'), E_('Les règles de santé et de sécurité au travail sont respectées')] }] },
  { activite: 'Maintenance', comps: [
    { id: 'C8', titre: 'C8 Diagnostiquer un fonctionnement', poids: 28, crit: [N_('Les informations relatives au dysfonctionnement sont analysées'), N_('Le fonctionnement de l’installation est analysé'), N_('Le diagnostic est posé'), N_('Le diagnostic est pertinent et complet'), N_('Les règles de santé et de sécurité au travail sont respectées')] },
    { id: 'C9', titre: 'C9 Remplacer un matériel électrique', poids: 12, crit: [E_('Le matériel électrique à remplacer est identifié'), E_('Le matériel électrique à remplacer est correctement déposé'), N_('Le matériel électrique de remplacement est correctement choisi'), E_('Le matériel électrique de remplacement est correctement installé'), E_('Le fonctionnement est vérifié après rétablissement des énergies'), E_('Les règles de santé et de sécurité au travail sont respectées')] }] },
  { activite: 'Communication', comps: [
    { id: 'C11', titre: 'C11 Compléter les documents liés aux opérations', poids: 12, crit: [N_('Les documents à compléter sont identifiés'), N_('Les informations nécessaires sont identifiées'), N_('Les documents sont complétés ou modifiés correctement')] },
    { id: 'C12', titre: 'C12 Communiquer entre professionnels sur l’opération', poids: 16.8, crit: [E_('Les informations nécessaires à la communication (contraintes des autres intervenants, aléas rencontrés, consignes de la hiérarchie, préparation de la réunion de chantier) sont identifiées'), E_('Les contraintes techniques sont expliquées / remontées à sa hiérarchie'), N_('Les choix technologiques sont argumentés'), N_('Les choix économiques sont expliqués'), N_('Les contraintes techniques liées à la performance énergétique de l’installation sont expliquées'), E_('L’état d’avancement de l’opération est justifié / remonté à la hiérarchie'), E_('Les difficultés sont remontées à la hiérarchie')] },
    { id: 'C13', titre: 'C13 Communiquer avec le client/usager sur l’opération', poids: 14, crit: [N_('Les besoins du client sont collectés'), N_('Les contraintes techniques d’utilisation et de performances énergétiques de l’installation sont expliquées'), E_('Les usages et le fonctionnement de l’installation sont maîtrisés par le client'), N_('Les choix technologiques et économiques sont expliqués'), E_('L’état d’avancement de l’opération et ses contraintes sont expliqués'), N_('Les prestations complémentaires sont expliquées'), N_('La satisfaction client est collectée')] }] },
];
const COMPS_E3 = GRILLE_E3.flatMap(a => a.comps);
const ATTITUDES_E3 = [
  ['AP1', 'Habileté', ['Maladroit', 'Habileté inférieure à la moyenne', 'Habileté moyenne', 'Habileté supérieure', 'Très habile']],
  ['AP2', 'Sociabilité', ['Indiscipliné', 'Ne s’intègre pas', 'S’intègre difficilement', 'Accepte les règles du groupe', 'Excellente intégration']],
  ['AP3', 'Intérêt porté au travail', ['Exécute sans intérêt', 'Peu d’écoute et de curiosité', 'Écoute et curiosité moyennes', 'Est attentif(ve), s’intéresse', 'Se passionne et se perfectionne']],
  ['AP4', 'Initiative', ['Attend tout des autres', 'Esprit d’initiative limité', 'Esprit d’initiative moyen', 'Esprit d’initiative supérieur', 'Très porté à agir, à proposer']],
  ['AP5', 'Analyse critique du travail', ['Sans qualité', 'Niveau de qualité insuffisant', 'Niveau de qualité passable', 'Bon niveau de qualité', 'Excellent']],
];
const POIDS_TOTAL_E3 = 240;
const nouvelleEval = () => ({ crit: {}, comp: {}, ap: {}, synthese: '' });
const fmtN = v => String(Math.round(v * 100) / 100).replace('.', ',');

// Niveau proposé pour une compétence d'après ses critères évalués (moyenne des niveaux)
function suggestionComp(ev, c) {
  const l = (ev.crit[c.id] || []).map(n => NIVEAUX_EV.findIndex(x => x[0] === n)).filter(i => i >= 0);
  if (!l.length) return null;
  const i = Math.round(l.reduce((s, x) => s + x, 0) / l.length);
  return { niv: NIVEAUX_EV[i][0], note: NIVEAUX_EV[i][3] };
}
// Note de chaque compétence : choisie, sinon proposée d'après les critères
const noteComp = (ev, c) => { const x = ev.comp[c.id]; return x && x.niv ? x : suggestionComp(ev, c); };
function noteEval(ev) {
  let pts = 0, poids = 0, n = 0;
  for (const c of COMPS_E3) { const x = noteComp(ev, c); if (!x) continue; pts += c.poids * x.note / 10; poids += c.poids; n++; }
  return { n, pts, poids, sur20: poids ? Math.round(pts / poids * 20 * 100) / 100 : null };
}

/* ---------- Grille à remplir (HTML), branchée sans dépendre de l'application ---------- */
function grilleEvalHTML(ev, lecture) {
  const choix = (cid, i, val) => NIVEAUX_EV.map(([n, l]) => `<button type="button" class="ev-n ${val === n ? 'on' : ''}" data-ev-crit="${cid}" data-i="${i}" data-n="${n}" title="${l}" ${lecture ? 'disabled' : ''}>${n}</button>`).join('');
  const selComp = c => { const x = ev.comp[c.id], s = suggestionComp(ev, c), v = x && x.niv ? `${x.niv}|${x.note}` : '';
    return `<select class="ev-comp" data-ev-comp="${c.id}" ${lecture ? 'disabled' : ''} aria-label="Note de ${c.id} sur 10"><option value="">${s ? `Proposé : ${s.niv} (${s.note}/10)` : 'Non évaluée'}</option>
      ${NIVEAUX_EV.map(([n, l, notes]) => `<optgroup label="${n} · ${l}">${notes.slice().reverse().map(k => `<option value="${n}|${k}" ${v === `${n}|${k}` ? 'selected' : ''}>${n} · ${k}/10</option>`).join('')}</optgroup>`).join('')}</select>`; };
  return `<div class="ev-legende petit">${NIVEAUX_EV.map(([n, l, notes]) => `<span><b>${n}</b> ${l} (${notes[0]} à ${notes[notes.length - 1]})</span>`).join('')}<span class="ev-ess">En gras : critère essentiel</span></div>
    ${GRILLE_E3.map(a => `<h4 class="ev-activite">${a.activite}</h4>${a.comps.map(c => `<div class="ev-comp-bloc" data-c="${c.id}">
      <div class="ev-comp-tete"><b>${c.titre}</b><span class="petit doux">pondération ${fmtN(c.poids)}</span>${selComp(c)}</div>
      <table class="ev-table">${c.crit.map((k, i) => `<tr><td class="${k.e ? 'ev-e' : ''}">${k.t}</td><td class="ev-choix">${choix(c.id, i, (ev.crit[c.id] || [])[i])}</td></tr>`).join('')}</table></div>`).join('')}`).join('')}
    <h4 class="ev-activite">Attitudes professionnelles <span class="petit doux">(une seule case par aptitude, hors note)</span></h4>
    <div class="ev-ap">${ATTITUDES_E3.map(([id, t, l]) => `<fieldset><legend>${id} · ${t}</legend>${l.map((x, i) => `<label class="petit"><input type="radio" name="ev_${id}" data-ev-ap="${id}" value="${i}" ${ev.ap[id] === i ? 'checked' : ''} ${lecture ? 'disabled' : ''}>${x}</label>`).join('')}</fieldset>`).join('')}</div>
    <label>Synthèse<textarea class="ev-synthese" rows="3" ${lecture ? 'disabled' : ''}>${String(ev.synthese || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</textarea></label>
    <div class="ev-total" role="status" aria-live="polite"></div>`;
}
function majTotalEval(root, ev) {
  const r = noteEval(ev), z = root.querySelector('.ev-total');
  if (z) z.innerHTML = r.n ? `Note : <b>${fmtN(r.sur20)} / 20</b> <span class="petit doux">· ${r.n} compétence(s) évaluée(s) sur ${COMPS_E3.length} · ${fmtN(r.pts)} points sur ${fmtN(r.poids)} (pondération totale ${POIDS_TOTAL_E3})</span>` : '<span class="doux">Aucune compétence évaluée pour l’instant.</span>';
  for (const c of COMPS_E3) { const s = root.querySelector(`[data-ev-comp="${c.id}"] option[value=""]`), g = suggestionComp(ev, c); if (s) s.textContent = g ? `Proposé : ${g.niv} (${g.note}/10)` : 'Non évaluée'; }
}
// Branche la grille : chaque clic met à jour l'objet ev et la note.
function brancherGrilleEval(root, ev, onChange) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ev-crit]'); if (!b || b.disabled) return;
    const l = ev.crit[b.dataset.evCrit] = ev.crit[b.dataset.evCrit] || [], i = +b.dataset.i;
    l[i] = l[i] === b.dataset.n ? null : b.dataset.n;   // second clic : retire l'évaluation du critère
    b.parentNode.querySelectorAll('.ev-n').forEach(x => x.classList.toggle('on', x.dataset.n === l[i]));
    majTotalEval(root, ev); if (onChange) onChange();
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.evComp) { const [niv, note] = t.value.split('|'); if (t.value) ev.comp[t.dataset.evComp] = { niv, note: +note }; else delete ev.comp[t.dataset.evComp]; }
    else if (t.dataset.evAp) ev.ap[t.dataset.evAp] = +t.value;
    else return;
    majTotalEval(root, ev); if (onChange) onChange();
  });
  root.addEventListener('input', e => { if (e.target.classList.contains('ev-synthese')) { ev.synthese = e.target.value; if (onChange) onChange(); } });
  majTotalEval(root, ev);
}

/* ---------- Fiche d'évaluation en PDF ---------- */
async function fabriquerPdfEvaluation(E) {   // E : { ev, eleve: { nom, prenom, classe }, numero, debut, fin, session, entreprise, tuteur: {nom, fonction, date, img, cachet}, prof: {nom, date} }
  const L = await chargerPdfLib(), doc = await L.PDFDocument.create(), W = 595.28, H = 841.89, M = 36;
  const f = { n: await doc.embedFont(L.StandardFonts.Helvetica), b: await doc.embedFont(L.StandardFonts.HelveticaBold) };
  const noir = L.rgb(0, 0, 0), rouge = L.rgb(0.8, 0.05, 0.05), saumon = L.rgb(0.98, 0.84, 0.72), gris = L.rgb(0.35, 0.35, 0.4), bleu = L.rgb(0.05, 0.15, 0.45), jeux = new Map();
  const propre = (font, s) => { if (!jeux.has(font)) jeux.set(font, new Set(font.getCharacterSet())); const ok = jeux.get(font);
    return [...String(s == null ? '' : s).replace(/[\n\r\t]+/g, ' ')].map(c => ok.has(c.codePointAt(0)) ? c : c === '’' ? "'" : c === '…' ? '...' : '').join(''); };
  const larg = (s, t, font) => font.widthOfTextAtSize(propre(font, s), t);
  let page, y;
  const txt = (s, x, yy, t, font = f.n, coul = noir) => page.drawText(propre(font, s), { x, y: H - yy, size: t, font, color: coul });
  const couper = (s, t, l, font = f.n) => { const out = []; let c = ''; for (const m of String(s).split(/\s+/)) { const e = c ? c + ' ' + m : m; if (c && larg(e, t, font) > l) { out.push(c); c = m; } else c = e; } out.push(c); return out; };
  const rect = (x, yy, w, h, o = {}) => page.drawRectangle({ x, y: H - yy - h, width: w, height: h, borderWidth: o.bord == null ? 0.6 : o.bord, borderColor: o.bord === 0 ? undefined : noir, color: o.fond });
  const nouvelle = () => { page = doc.addPage([W, H]); y = M; };
  const place = h => { if (y + h > H - M) nouvelle(); };
  const r = noteEval(E.ev), dateF = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('/') : (v || '…');

  // En-tête
  nouvelle();
  rect(M, y, W - 2 * M, 92, { fond: saumon });
  const t1 = 'BAC PRO MELEC'; txt(t1, (W - larg(t1, 20, f.b)) / 2, y + 26, 20, f.b, rouge);
  const t2 = 'EPREUVE E3 - FICHE D’EVALUATION DE L’APPRENANT EN ENTREPRISE'; txt(t2, (W - larg(t2, 11, f.b)) / 2, y + 46, 11, f.b);
  const t3 = `N° : ${E.numero || '…'}/6   ·   Période de formation du ${dateF(E.debut)} au ${dateF(E.fin)}`; txt(t3, (W - larg(t3, 10, f.n)) / 2, y + 64, 10);
  const t4 = 'Lycée polyvalent Raymond Queneau - Yvetot'; txt(t4, (W - larg(t4, 8.5, f.n)) / 2, y + 80, 8.5, f.n, gris);
  y += 104;
  const e = E.eleve || {};
  txt(`Candidat : ${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`, M, y, 10, f.b); txt(`Classe : ${e.classe || ''}`, 300, y, 10); txt(`Session : ${E.session || ''}`, 430, y, 10); y += 14;
  txt(`Entreprise : ${E.entreprise || ''}`, M, y, 10); y += 18;

  // Tableau des compétences
  const xC = M, wC = W - 2 * M - 4 * 26, cols = NIVEAUX_EV.map((_, i) => xC + wC + i * 26);
  const entete = () => { rect(xC, y, wC, 16, { fond: saumon }); txt('CRITERES D’EVALUATION', xC + 4, y + 11.5, 8.5, f.b); NIVEAUX_EV.forEach(([n], i) => { rect(cols[i], y, 26, 16, { fond: saumon }); txt(n, cols[i] + 13 - larg(n, 8.5, f.b) / 2, y + 11.5, 8.5, f.b); }); y += 16; };
  entete();
  for (const a of GRILLE_E3) {
    place(16); txt(a.activite.toUpperCase(), xC + 2, y + 11, 8, f.b, gris); y += 14;
    for (const c of a.comps) {
      const x = noteComp(E.ev, c);
      place(18); if (y === M) entete();
      rect(xC, y, wC, 16, { fond: saumon }); txt(`${c.titre.toUpperCase()}`, xC + 3, y + 11, 7.3, f.b);
      const etiquette = x ? `${x.note}/10` : 'n.é.'; txt(etiquette, xC + wC - 4 - larg(etiquette, 7.5, f.b), y + 11, 7.5, f.b, bleu);
      NIVEAUX_EV.forEach(([n], i) => { rect(cols[i], y, 26, 16, { fond: saumon }); if (x && x.niv === n) txt('X', cols[i] + 10, y + 11.5, 9, f.b, bleu); });
      y += 16;
      c.crit.forEach((k, i) => {
        const lignes = couper(k.t, 7.3, wC - 8, k.e ? f.b : f.n), h = 4 + lignes.length * 9;
        place(h); if (y === M) entete();
        rect(xC, y, wC, h); lignes.forEach((l, j) => txt(l, xC + 3, y + 9.5 + j * 9, 7.3, k.e ? f.b : f.n, k.e ? rouge : noir));
        const v = (E.ev.crit[c.id] || [])[i];
        NIVEAUX_EV.forEach(([n], j) => { rect(cols[j], y, 26, h); if (v === n) txt('X', cols[j] + 10, y + h / 2 + 3.5, 9, f.b, bleu); });
        y += h;
      });
    }
  }
  place(30); y += 6;
  txt('- : Pas de réussite ou non fait     + : Réussite partielle     ++ : Réussite totale avec aide     +++ : Réussite totale en autonomie', M, y + 8, 7.5, f.n, gris); y += 18;

  // Attitudes professionnelles
  place(30 + 5 * 11);
  txt('Évaluation des attitudes professionnelles', M, y + 10, 11, f.b); y += 18;
  const wA = (W - 2 * M) / 5;
  ATTITUDES_E3.forEach(([id, t, l], k) => {
    const x0 = M + k * wA, tt = `${id} ${t.toUpperCase()}`; let s = 6.3; while (s > 4.5 && larg(tt, s, f.b) > wA - 6) s -= 0.2;
    rect(x0, y, wA, 14, { fond: saumon }); txt(tt, x0 + 3, y + 10, s, f.b);
    l.forEach((s, i) => { const yy = y + 14 + i * 11; rect(x0, yy, wA, 11); txt((E.ev.ap[id] === i ? 'X ' : '   ') + s, x0 + 3, yy + 8, 6.2, E.ev.ap[id] === i ? f.b : f.n, E.ev.ap[id] === i ? bleu : noir); });
  });
  y += 14 + 5 * 11 + 12;

  // Synthèse, note et signatures
  const syn = couper(E.ev.synthese || '', 9, W - 2 * M - 12);
  place(60 + syn.length * 11);
  rect(M, y, W - 2 * M, 22 + syn.length * 11); txt('Synthèse :', M + 6, y + 13, 9.5, f.b); syn.forEach((l, i) => txt(l, M + 6, y + 26 + i * 11, 9, f.n, bleu));
  y += 30 + syn.length * 11;
  place(110);
  rect(M, y, W - 2 * M, 24, { fond: saumon });
  txt(r.n ? `NOTE : ${fmtN(r.sur20)} / 20` : 'NOTE : non évaluée', M + 8, y + 16, 12, f.b, r.n ? bleu : noir);
  if (r.n) txt(`${r.n} compétence(s) évaluée(s) · ${fmtN(r.pts)} points sur ${fmtN(r.poids)} (pondération totale ${POIDS_TOTAL_E3})`, M + 170, y + 15, 8, f.n, gris);
  y += 32;
  const wS = (W - 2 * M - 12) / 2, h = 78;
  rect(M, y, wS, h); txt('Date de la visite et signature professeur', M + 6, y + 12, 8.5, f.b);
  if (E.prof) { txt(E.prof.nom || '', M + 6, y + 30, 9, f.n, bleu); txt(`Visite du ${dateF(E.prof.date)}`, M + 6, y + 44, 9, f.n, bleu); if (E.prof.valide) txt(`Validé électroniquement le ${dateF(String(E.prof.valide).slice(0, 10))}`, M + 6, y + 70, 7, f.n, gris); }
  const x2 = M + wS + 12; rect(x2, y, wS, h); txt('Cachet de l’entreprise et signature tuteur', x2 + 6, y + 12, 8.5, f.b);
  const t = E.tuteur;
  if (t) {
    const image = async u => { const o = Uint8Array.from(atob(u.slice(u.indexOf(',') + 1)), c => c.charCodeAt(0)); return u.startsWith('data:image/png') ? doc.embedPng(o) : doc.embedJpg(o); };
    const pose = async (u, x0, w, hh) => { const im = await image(u), k = Math.min(w / im.width, hh / im.height); page.drawImage(im, { x: x0, y: H - y - 16 - im.height * k, width: im.width * k, height: im.height * k }); };
    if (t.img) await pose(t.img, x2 + 6, wS / 2 - 10, 42);
    if (t.cachet) await pose(t.cachet, x2 + wS / 2, wS / 2 - 8, 46);
    if (t.nom) txt(`Signé par ${t.nom}${t.fonction ? ` (${t.fonction})` : ''} le ${new Date(t.date).toLocaleDateString('fr-FR')}`, x2 + 6, y + 70, 7, f.n, gris);
  }
  return doc.save();
}
