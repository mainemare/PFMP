'use strict';
/* Parcours de stage en trois temps (avant / pendant / fin) et page « Fin de stage » :
 * bilan d'évaluation (journal de bord, portfolio) et attestation de présence (PDF pré-rempli à faire signer
 * par l'entreprise, puis dépôt de l'attestation signée : photo ou PDF, rangée dans le dossier privé du Drive). */
const PHASES = [
  { id: 'avant', n: 1, titre: 'Avant le stage', sous: 'Trouver mon stage', ic: '🔎', c: '#2563eb',
    vues: [['profil', '👤 Mon profil'], ['entreprises', '🏢 Entreprises'], ['offres', '📢 Offres de stage'], ['suivi', '📞 Mes appels'], ['memento', '📝 Memento'], ['cv', '📄 CV'], ['lettre', '✉️ Lettre'], ['protocole', '🤝 Protocole']] },
  { id: 'pendant', n: 2, titre: 'Pendant le stage', sous: 'Garder une trace', ic: '🛠️', c: '#0d9488',
    vues: [['bord', '📓 Journal de bord'], ['portfolio', '🗂️ Portfolio']] },
  { id: 'fin', n: 3, titre: 'Fin du stage', sous: 'Évaluation et attestation', ic: '🏁', c: '#7c3aed',
    vues: [['fin', '🏁 Évaluation et attestation']] },
];
function phaseEleve(d) {
  const dt = datesEleve(d);
  if (!dt || today() < dt.debut) return 'avant';
  return today() <= dt.fin ? 'pendant' : 'fin';
}
const phaseDeVue = v => (PHASES.find(p => p.vues.some(([x]) => x === v)) || {}).id;

/* ---------- Menu élève groupé par étape ---------- */
function navEleve(d, pastilles) {
  const ici = phaseEleve(d), bouton = ([v, l]) => {
    const n = pastilles[v];
    return `<button data-a="aller" data-v="${v}" class="${S.vue === v ? 'actif' : ''}">${l}${n ? `<span class="pastille">${n}</span>` : ''}</button>`;
  };
  return bouton(['accueil', '🏠 Accueil']) + PHASES.map(p => `<div class="nav-groupe ${p.id === ici ? 'ici' : ''}" style="--ph:${p.c}" role="group" aria-label="${p.titre}">
    <span class="nav-etape">${p.n} · ${p.titre}</span>${p.vues.map(bouton).join('')}</div>`).join('');
}

/* ---------- Accueil : « Mon parcours » ---------- */
function etatAttestation(d) {
  const a = d.attestation || {};
  return a.valide ? ['✅', 'Attestation validée'] : a.fichierLe ? ['🟣', 'Attestation déposée, en attente de validation'] : ['⬜', 'Attestation à faire signer puis déposer'];
}
function bilanBord(d) {
  const jours = joursBord(d).filter(j => j <= today()), complets = jours.filter(j => ['complet', 'absent'].includes(etatJour(d, j))).length;
  return { total: joursBord(d).length, passes: jours.length, complets };
}
function blocParcours(d) {
  const ici = phaseEleve(d), n = niveau(d), b = bilanBord(d), ev = d.prof.portfolio, att = etatAttestation(d);
  const etat = {
    avant: n >= 5 ? '✅ Convention signée' : `Niveau ${n} : ${NIV[n].l}`,
    pendant: b.total ? `📓 ${b.complets}/${b.passes || 0} jour(s) remplis · 🗂️ ${ev && ev.valide ? `portfolio noté ${fmtNote(ev.total)}/20` : d.portfolio && Object.keys(d.portfolio).length ? 'portfolio commencé' : 'portfolio à rédiger'}` : 'Commence le premier jour du stage',
    fin: `${att[0]} ${att[1]}`,
  };
  return `<section class="carte parcours"><h2>Mon parcours de stage</h2><div class="parcours-etapes">${PHASES.map(p => `
    <div class="parcours-etape ${p.id === ici ? 'ici' : ''}" style="--ph:${p.c}">
      <div class="parcours-tete"><span class="parcours-num">${p.n}</span><div><b>${p.ic} ${p.titre}</b><div class="petit">${p.sous}</div></div>${p.id === ici ? '<span class="parcours-ici">📍 Tu es ici</span>' : ''}</div>
      <p class="petit parcours-etat">${etat[p.id]}</p>
      <div class="parcours-liens">${p.vues.map(([v, l]) => `<button class="btn mini ${p.id === ici ? '' : 'sec'}" data-a="aller" data-v="${v}">${l}</button>`).join('')}</div>
    </div>`).join('')}</div></section>`;
}

/* ---------- Page « Fin de stage » ---------- */
function entrepriseDuStage(d) {
  const l = d.demandes.liste, dem = l.find(x => x.statut === 'convention') || l.find(x => x.statut === 'protocole');
  if (!dem) return { nom: '', adresse: '', tuteur: '' };
  const base = S.entreprises.find(e => e.id === dem.entrepriseId) || {}, pr = base.protocole || {};
  return { nom: dem.nom || base.nom || '', adresse: pr.adresse || dem.adresse || base.adresse || '', tuteur: pr.tuteur || dem.contact || dem.interlocuteur || '' };
}
function vueFinStage() {
  const d = S.el, dt = datesEleve(d), a = d.attestation, b = bilanBord(d), ev = d.prof.portfolio, nb = nbAnnotations(a);
  const pf = d.portfolio || {}, pfCommence = Object.keys(pf).length > 0, auto = pfCommence ? totalPf(noteAutoPf(pf)) : 0;
  const ent = entrepriseDuStage(d), fini = dt && today() > dt.fin;
  return `<div class="bandeau-phase" style="--ph:#7c3aed"><span>3</span><div><b>🏁 Fin du stage</b><br>Évaluation et attestation de présence</div></div>
  ${!fini ? `<div class="alerte info">${dt ? `Ton stage se termine le <b>${fmt(dt.fin)}</b>.` : 'Les dates de ton stage ne sont pas encore fixées.'} Prépare dès maintenant ton attestation : l’entreprise doit la remplir et la signer <b>le dernier jour</b>.</div>` : ''}
  <div class="grille">
  <section class="carte"><h2>📊 Mon évaluation</h2>
    <h3>📓 Journal de bord</h3>
    ${b.total ? `<p><b>${b.complets}</b> jour(s) complet(s) sur <b>${b.passes}</b> jour(s) passé(s)${b.passes < b.total ? ` (${b.total} jours de stage prévus)` : ''}.</p>
      ${nbBordEnRetard(d) ? `<p class="petit">⚠️ ${nbBordEnRetard(d)} jour(s) encore à compléter. <button class="lien" style="display:inline" data-a="aller" data-v="bord">Compléter</button></p>` : ''}`
      : '<p class="doux">Rien à afficher pour le moment.</p>'}
    <h3>🗂️ Portfolio (compte rendu d’activité)</h3>
    ${ev && ev.valide ? `<p class="note-finale">✅ Note de ton professeur : <b>${fmtNote(ev.total)} / 20</b></p>${ev.general ? `<div class="correction">💬 ${esc(ev.general)}</div>` : ''}`
      : pfCommence ? `<p>Note indicative : <b>${fmtNote(auto)} / 20</b> <span class="petit doux">(calcul automatique, en attente de la note de ton professeur)</span></p>`
      : '<p>⬜ Pas encore commencé.</p>'}
    <div class="actions"><button class="btn sec" data-a="aller" data-v="portfolio">Ouvrir mon portfolio</button></div>
  </section>
  <section class="carte"><h2>📝 Attestation de présence</h2>
    <p class="petit doux">Obligatoire : elle prouve les jours effectués en entreprise (article 21 de la convention) et permet le versement de l’allocation de stage de l’État.</p>
    ${a.fichierLe ? `<div class="fichier-depose"><span class="icone-pdf" aria-hidden="true">PDF</span><div><b>Attestation signée</b> déposée le ${fmtDT(a.fichierLe)}
        <br>${a.valide ? '✅ Validée par ton professeur.' : nb ? `✏️ ${nb} annotation(s) de ton professeur : regarde-les.` : '🟣 En attente de vérification par ton professeur.'}</div></div>
      ${blocCorrection(a)}<div class="actions"><button class="btn sec" data-a="voirFichier" data-t="attestation">👁️ Voir</button></div>` : ''}
    <ol class="etapes-att">
      <li><b>Télécharge l’attestation pré-remplie</b> et imprime-la (ou envoie-la à ton tuteur).
        <label class="petit">Ton nom de famille, écrit en entier sur l’attestation <span class="doux">(n’est pas enregistré)</span><input id="att_nom" value="${esc(identiteCV().nom || '')}" autocomplete="family-name"></label>
        ${ent.nom ? `<p class="petit doux">Entreprise : <b>${esc(ent.nom)}</b>${ent.tuteur ? ` · tuteur : ${esc(ent.tuteur)}` : ''}</p>` : '<p class="petit doux">Aucune entreprise au statut « protocole » ou « convention » dans tes appels : le nom de l’entreprise sera à écrire à la main.</p>'}
        <button class="btn" data-a="attPdf">⬇️ Télécharger l’attestation</button></li>
      <li><b>Le dernier jour</b>, l’entreprise indique le nombre de jours de présence, signe et appose son cachet.</li>
      <li><b>Dépose l’attestation signée</b> : une photo bien nette ou un PDF.
        <br><label class="btn depot-fichier">📷 ${a.fichierLe ? 'Déposer une nouvelle version' : 'Photo ou PDF de l’attestation'}<input type="file" accept="image/*,application/pdf,.pdf" data-c="deposerAttestation"></label></li>
    </ol>
    <p class="doux petit">🔒 Rangée dans le dossier privé de l’application, visible seulement par tes professeurs. Garde aussi l’original papier.</p>
  </section></div>`;
}

/* Attestation pré-remplie (PDF) */
A.attPdf = async () => {
  const d = S.el, dt = datesEleve(d), ent = entrepriseDuStage(d), cl = S.classes.find(c => c.id === d.profil.classeId) || {};
  const nomFam = val('att_nom');
  try { if (nomFam) localStorage.setItem(cleIdentite(), JSON.stringify(Object.assign(identiteCV(), { nom: nomFam }))); } catch { /* */ }
  const o = await outilsPdf(false), { f, W, L } = o, etab = Object.assign({}, CONV.ETAB_DEFAUT, typeof etabCourant === 'function' ? etabCourant() : {});
  const gris = L.rgb(0.4, 0.42, 0.48), fond = L.rgb(0.95, 0.95, 0.98), x0 = 50, lg = W - 100;
  o.nouvellePage();
  lignesEtab(etab).forEach((l, i) => o.txt(l, x0, 50 + i * 12, 10, f.b));
  String(etab.adressePostale || '').split('\n').forEach((l, i) => o.txt(l, x0, 76 + i * 10, 8, f.n, gris));
  o.centre('ATTESTATION DE STAGE', W / 2, 140, 17, f.b);
  o.centre('Période de formation en milieu professionnel (PFMP)', W / 2, 158, 11, f.n);
  o.centre('À compléter et signer par l’entreprise le dernier jour du stage (article 21 de la convention)', W / 2, 174, 8.5, f.i, gris);
  let y = 200;
  const bloc = (titre, lignes) => {
    o.rect(x0, y, lg, 18, { bord: 0, fond }); o.txt(titre, x0 + 8, y + 12.5, 10, f.b); y += 18;
    const h = lignes.length * 20 + 6; o.rect(x0, y, lg, h, { bord: 0.6 });
    lignes.forEach(([k, v], i) => { const yy = y + 17 + i * 20; o.txt(k, x0 + 8, yy, 9.5, f.n, gris);
      if (v) o.txt(v, x0 + 150, yy, 10, f.b); else o.ligne(x0 + 150, yy + 2, x0 + lg - 10, yy + 2, 0.4, gris); });
    y += h + 14;
  };
  bloc('L’entreprise (ou organisme) d’accueil', [['Nom', ent.nom], ['Adresse', ent.adresse], ['Tuteur', ent.tuteur]]);
  bloc('atteste que l’élève', [['Nom et prénom', `${String(nomFam || d.profil.nom).toUpperCase()} ${d.profil.prenom}`.trim()], ['Classe', cl.nom || ''], ['Diplôme préparé', cl.diplome || '']]);
  bloc('a effectué sa période de formation en milieu professionnel', [['Du', dt ? fmt(dt.debut) : ''], ['Au', dt ? fmt(dt.fin) : '']]);
  // Partie remplie à la main par l'entreprise
  o.txt('Nombre de jours de présence effectués :', x0, y + 10, 11, f.b); o.ligne(x0 + 220, y + 12, x0 + 290, y + 12, 0.6); o.txt('jour(s)', x0 + 296, y + 10, 11); y += 30;
  o.txt('Absences éventuelles (dates et motifs) :', x0, y, 10, f.b); y += 6; o.rect(x0, y, lg, 56, { bord: 0.6 }); y += 74;
  o.txt('Activités principales confiées à l’élève :', x0, y, 10, f.b); y += 6; o.rect(x0, y, lg, 70, { bord: 0.6 }); y += 90;
  o.txt('Fait à', x0, y, 10); o.ligne(x0 + 32, y + 2, x0 + 200, y + 2, 0.5, gris); o.txt('le', x0 + 210, y, 10); o.ligne(x0 + 225, y + 2, x0 + 320, y + 2, 0.5, gris); y += 16;
  o.rect(x0 + lg / 2, y, lg / 2, 92, { bord: 0.8 });
  o.txt('Nom, qualité et signature du responsable', x0 + lg / 2 + 8, y + 14, 8.5, f.b); o.txt('Cachet de l’entreprise', x0 + lg / 2 + 8, y + 26, 8.5, f.b);
  o.couper('Original remis à l’élève, copie conservée par l’entreprise. L’élève dépose une photo de l’attestation signée dans l’application de suivi des stages du lycée.', 8, lg / 2 - 20, f.i)
    .forEach((l, i) => o.txt(l, x0, y + 14 + i * 11, 8, f.i, gris));
  ouvrirPdf(await o.doc.save(), `Attestation de stage ${d.profil.prenom}.pdf`);
};

/* Dépôt de l'attestation signée : une photo est mise en page dans un PDF (A4) avant l'envoi. */
async function imageVersPdf(fichier) {
  const url = URL.createObjectURL(fichier), img = new Image();
  try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('Image illisible : reprends la photo.')); img.src = url; }); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  const r = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  const L = await chargerPdfLib(), doc = await L.PDFDocument.create(), jpg = await doc.embedJpg(await (await fetch(c.toDataURL('image/jpeg', 0.82))).arrayBuffer());
  const [W, H] = jpg.width > jpg.height ? [841.89, 595.28] : [595.28, 841.89], s = Math.min((W - 40) / jpg.width, (H - 40) / jpg.height);
  doc.addPage([W, H]).drawImage(jpg, { x: (W - jpg.width * s) / 2, y: (H - jpg.height * s) / 2, width: jpg.width * s, height: jpg.height * s });
  return new Uint8Array(await doc.save());
}
C.deposerAttestation = async el => {
  const f = el.files[0]; el.value = '';
  if (!f) return;
  toast('Préparation du document…');
  const o = /^image\//.test(f.type) ? await imageVersPdf(f) : new Uint8Array(await f.arrayBuffer());
  if (String.fromCharCode(...o.subarray(0, 5)) !== '%PDF-') throw new Error('Choisis une photo ou un fichier PDF.');
  if (o.length > MAX_PDF) throw new Error(`Fichier trop lourd (${tailleLisible(o.length)}) : 4 Mo maximum.`);
  toast('Envoi de l’attestation…');
  const d = await api('POST', '/api/fichier/deposer', { type: 'attestation', pdf: enBase64(o) });
  S.el.attestation = Object.assign(DEF.attestation(), d);
  journal('Attestation de stage signée déposée'); render(); toast('Attestation déposée : ton professeur est prévenu');
};
