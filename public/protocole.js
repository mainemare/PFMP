'use strict';
/* ===== Protocole d'accord : remplissage du formulaire officiel du lycée (PDF), impression et envoi au référent =====
 * Le PDF fourni par le lycée (protocole-2026-2027.pdf) sert de fond : les réponses sont écrites aux emplacements
 * exacts des pointillés, le document imprimé est donc identique au formulaire papier.
 * Données personnelles de l'élève (nom complet, date de naissance, adresse, téléphones) : jamais enregistrées dans
 * l'application, seulement gardées le temps de la session puis écrites dans le PDF. La partie entreprise est
 * conservée avec la demande correspondante.
 */
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

/* ---------- Données du formulaire ---------- */
let PROTO = null;   // { demandeId, eleve:{...}, ent:{...}, signElec:'', horaires:{} } — session uniquement pour la partie élève
function demandesPourProtocole() {
  const ordre = { protocole: 0, rdv: 1, convention: 2, attente: 3, a_rappeler: 4, sans_reponse: 5, a_appeler: 6, refus: 7 };
  return [...S.el.demandes.liste].sort((a, b) => (ordre[a.statut] ?? 9) - (ordre[b.statut] ?? 9));
}
function nbSemaines(du, au) {
  if (!du || !au || au < du) return '';
  const jours = Math.round((new Date(au + 'T00:00:00') - new Date(du + 'T00:00:00')) / 864e5) + 1;
  return String(Math.max(1, Math.round(jours / 7)));
}
function initProtocole(demandeId) {
  const d = S.el, dt = datesEleve(d), cl = S.classes.find(c => c.id === d.profil.classeId);
  const referent = cl && cl.referentId ? S.profs.find(p => p.id === cl.referentId) : null;
  const eleve = PROTO ? PROTO.eleve : {
    nom: '', prenom: d.profil.prenom || '', naissance: '', classe: cl ? cl.nom : '', adresse: '', telEleve: '', telRepresentants: '',
    referent: referent ? nomComplet(referent) : '', du: dt ? dt.debut : '', au: dt ? dt.fin : '', semaines: dt ? nbSemaines(dt.debut, dt.fin) : '',
  };
  const dem = demandeId ? d.demandes.liste.find(x => x.id === demandeId) : demandesPourProtocole()[0];
  const base = dem && dem.entrepriseId ? S.entreprises.find(e => e.id === dem.entrepriseId) || {} : {};
  const sauve = (dem && dem.protocole) || {};
  const ent = Object.assign({
    entreprise: dem ? dem.nom : '', adresse: (dem && dem.adresse) || base.adresse || '', mail: (dem && dem.email) || base.email || '',
    tel: (dem && dem.tel) || base.tel || '', siret: '', assureur: '', contrat: '', signataire: '', fonctionSignataire: '', mailSignataire: '',
    lieu: '', domaine: base.activite || base.secteur || '', tuteur: dem && dem.interlocuteur || '', fonctionTuteur: '', telTuteur: '', mailTuteur: '',
  }, sauve.ent || {});
  const horaires = Object.assign({}, sauve.horaires || {});
  // Journée type : reprise du lundi s'il est déjà rempli ; jours cochés par défaut : du lundi au vendredi.
  const type = Object.fromEntries(['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a'].map(k => [k, horaires['lundi_' + k] || '']));
  const jours = sauve.jours || { lundi: true, mardi: true, mercredi: true, jeudi: true, vendredi: true, samedi: false };
  PROTO = { demandeId: dem ? dem.id : '', eleve, ent, signElec: sauve.signElec || '', horaires, type, jours };
}
function lireFormulaire() {
  for (const [k] of CHAMPS_ELEVE) PROTO.eleve[k] = val('pe_' + k);
  for (const [k] of CHAMPS_ENTREPRISE) PROTO.ent[k] = val('pn_' + k);
  PROTO.signElec = ($('input[name="pn_signElec"]:checked') || {}).value || '';
  for (const [j] of JOURS) for (const p of ['matin', 'apresmidi']) for (const b of ['de', 'a']) PROTO.horaires[`${j}_${p}_${b}`] = val(`ph_${j}_${p}_${b}`);
  for (const k of ['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a']) PROTO.type[k] = val('pt_' + k);
  for (const c of $$('.pj')) PROTO.jours[c.value] = c.checked;
}
async function memoriserPartieEntreprise() {
  const dem = PROTO.demandeId && S.el.demandes.liste.find(x => x.id === PROTO.demandeId);
  if (!dem) return;
  dem.protocole = { ent: { ...PROTO.ent }, signElec: PROTO.signElec, horaires: { ...PROTO.horaires }, jours: { ...PROTO.jours }, majLe: maintenant() };
  await sauver('demandes');
}

/* ---------- Vue élève ---------- */
function vueProtocole() {
  if (!PROTO) initProtocole();
  const P = PROTO, liste = demandesPourProtocole(), cl = S.classes.find(c => c.id === S.el.profil.classeId);
  const referent = cl && cl.referentId ? S.profs.find(p => p.id === cl.referentId) : null;
  const champ = (pref, [k, l, , , , type], v) => `<label>${l}<input id="${pref}_${k}" ${type === 'date' ? 'type="date"' : type === 'email' ? 'type="email"' : ''} value="${esc(v[k] || '')}"></label>`;
  const heure = id => `<input type="time" id="${id}" value="${esc(P.horaires[id.slice(3)] || '')}" aria-label="${id}">`;
  return `<section class="carte"><h2>📝 Protocole d’accord</h2>
    <p class="doux">Remplis le protocole d’accord du lycée : il sera imprimé sur le formulaire officiel, exactement comme la version papier. Tu peux le compléter avec l’entreprise, l’imprimer et l’envoyer à ton professeur référent.</p>
    <div class="alerte info petit">🔒 Ton nom, ta date de naissance, ton adresse et les téléphones ne sont <b>pas enregistrés</b> dans l’application : ils sont seulement écrits dans le PDF. Si tu fermes l’application, il faudra les saisir à nouveau.</div>
    <label>Entreprise concernée<select data-c="protoDemande"><option value="">— Autre entreprise (à saisir) —</option>${liste.map(x => `<option value="${x.id}" ${x.id === P.demandeId ? 'selected' : ''}>${esc(x.nom)} · ${(STATUTS[x.statut] || STATUTS.a_appeler)[0]}</option>`).join('')}</select></label>
    ${blocValidation(S.el, liste.find(x => x.id === P.demandeId))}
    ${typeof blocConventionEleve === 'function' ? blocConventionEleve(liste.find(x => x.id === P.demandeId)) : ''}</section>
  <section class="carte"><h3>À compléter par l’élève</h3><div class="deux">${CHAMPS_ELEVE.map(c => champ('pe', c, P.eleve)).join('')}</div></section>
  <section class="carte"><h3>À compléter par l’entreprise</h3><p class="doux petit">Tu peux remplir ce que tu sais déjà ; l’entreprise complètera ou corrigera le reste et apposera sa signature et son cachet.</p>
    <div class="deux">${CHAMPS_ENTREPRISE.map(c => champ('pn', c, P.ent)).join('')}</div>
    <fieldset class="choix"><legend>Accepte la signature électronique de la convention</legend>
      <label><input type="radio" name="pn_signElec" value="oui" ${P.signElec === 'oui' ? 'checked' : ''}>Oui</label>
      <label><input type="radio" name="pn_signElec" value="non" ${P.signElec === 'non' ? 'checked' : ''}>Non</label>
      <label><input type="radio" name="pn_signElec" value="" ${!P.signElec ? 'checked' : ''}>Ne sait pas encore</label></fieldset>
    <h3 style="margin-top:14px">Horaires du stagiaire</h3>
    <p class="doux petit">Astuce : saisis les horaires d’une journée type, coche les jours qui ont les mêmes horaires, puis clique sur « Répercuter ». Tu peux ensuite modifier un jour à la main.</p>
    <div class="table-scroll"><table class="horaires"><tr><th></th><th></th><th colspan="2">Matin</th><th colspan="2">Après-midi</th></tr>
      <tr><th></th><th class="petit">Mêmes<br>horaires</th><th>De</th><th>À</th><th>De</th><th>À</th></tr>
      <tr class="type"><th>Journée type</th><td><label class="petit tous"><input type="checkbox" data-c="protoTousJours" ${JOURS.every(([j]) => P.jours[j]) ? 'checked' : ''} aria-label="Cocher tous les jours">tous</label></td>
        ${['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a'].map(k => `<td><input type="time" id="pt_${k}" value="${esc(P.type[k] || '')}" aria-label="Journée type ${k}"></td>`).join('')}</tr>
      <tr class="type"><td colspan="6"><button type="button" class="btn mini" data-a="protoRepercuter">⬇️ Répercuter sur les jours cochés</button>
        <button type="button" class="btn mini sec" data-a="protoEffacerJours">Effacer les jours cochés</button></td></tr>
      ${JOURS.map(([j, l]) => `<tr><th>${l}</th><td class="centre"><input type="checkbox" class="pj" value="${j}" ${P.jours[j] ? 'checked' : ''} aria-label="${l} : mêmes horaires que la journée type"></td>
        <td>${heure(`ph_${j}_matin_de`)}</td><td>${heure(`ph_${j}_matin_a`)}</td><td>${heure(`ph_${j}_apresmidi_de`)}</td><td>${heure(`ph_${j}_apresmidi_a`)}</td></tr>`).join('')}</table></div>
    <p class="doux petit">Moins de 15 ans : 7 h/jour et 30 h/semaine au maximum. 15 ans et plus : 8 h/jour et 35 h/semaine. Élève mineur : 2 jours de repos consécutifs.</p></section>
  <section class="carte"><div class="actions">
    <button class="btn" data-a="protoApercu">👁️ Aperçu et impression</button>
    <button class="btn sec" data-a="protoTelecharger">⬇️ Télécharger le PDF</button>
    <button class="btn sec" data-a="protoEnvoyer">✉️ Envoyer pour validation à mon professeur référent${referent ? ` (${esc(nomComplet(referent))})` : ''}</button></div>
    <p class="doux petit" style="margin-top:8px">Le PDF est fabriqué sur ton appareil. L’envoi transmet le PDF par e-mail à ton professeur référent, sans le garder dans l’application.</p></section>`;
}
C.protoDemande = el => { if (PROTO) lireFormulaire(); const eleve = PROTO && PROTO.eleve; PROTO = null; initProtocole(el.value || null); if (!el.value) { PROTO.demandeId = ''; for (const [k] of CHAMPS_ENTREPRISE) PROTO.ent[k] = ''; } if (eleve) PROTO.eleve = eleve; render(); };
A.protocolePour = el => { if (PROTO) lireFormulaire(); const eleve = PROTO && PROTO.eleve; PROTO = null; initProtocole(el.dataset.id); if (eleve) PROTO.eleve = eleve; S.vue = 'protocole'; render(); window.scrollTo(0, 0); };
// Mise à jour automatique du nombre de semaines quand les dates changent.
document.addEventListener('change', ev => {
  if (ev.target.id === 'pe_du' || ev.target.id === 'pe_au') { const n = nbSemaines(val('pe_du'), val('pe_au')); if (n) $('#pe_semaines').value = n; }
});

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
async function fabriquerPdf() {
  lireFormulaire();
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
  doc.setTitle(`Protocole d'accord - ${PROTO.eleve.prenom} ${PROTO.eleve.nom}`.trim()); doc.setCreator('Suivi des stages');
  return doc.save();
}
const nomFichier = () => `Protocole_${(PROTO.eleve.nom || S.el.profil.nom || 'eleve')}_${PROTO.eleve.prenom || ''}_${PROTO.ent.entreprise || ''}`
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) + '.pdf';
function verifierMinimum() {
  lireFormulaire();
  const manque = [['nom', 'ton nom'], ['prenom', 'ton prénom'], ['classe', 'ta classe']].filter(([k]) => !PROTO.eleve[k]).map(([, l]) => l);
  if (!PROTO.ent.entreprise) manque.push('le nom de l’entreprise');
  if (manque.length) throw new Error('À compléter d’abord : ' + manque.join(', ') + '.');
}
function telecharger(octets) {
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' })), a = document.createElement('a');
  a.href = url; a.download = nomFichier(); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
A.protoApercu = async () => {
  verifierMinimum(); const octets = await fabriquerPdf(); await memoriserPartieEntreprise();
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
  modal(`<h2>Aperçu du protocole d’accord</h2><iframe id="apercuPdf" class="apercu-pdf" src="${url}" title="Aperçu du protocole d’accord"></iframe>
    <div class="actions"><button class="btn" data-a="protoImprimer">🖨️ Imprimer</button><a class="btn sec" href="${url}" download="${esc(nomFichier())}">⬇️ Télécharger</a>
    <a class="btn sec" href="${url}" target="_blank" rel="noopener">↗️ Ouvrir dans un nouvel onglet</a></div>
    <p class="doux petit">Sur téléphone, si l’aperçu ne s’affiche pas, utilise « Télécharger » ou « Ouvrir dans un nouvel onglet ».</p>`, true);
};
A.protoImprimer = () => { const f = $('#apercuPdf'); try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(f.src, '_blank'); } };
A.protoTelecharger = async () => { verifierMinimum(); telecharger(await fabriquerPdf()); await memoriserPartieEntreprise(); toast('PDF téléchargé'); };
A.protoEnvoyer = async () => {
  verifierMinimum();
  const octets = await fabriquerPdf();
  let b64 = ''; const t = new Uint8Array(octets);
  for (let i = 0; i < t.length; i += 0x8000) b64 += String.fromCharCode.apply(null, t.subarray(i, i + 0x8000));
  b64 = btoa(b64);
  // La demande de validation est enregistrée même si l'e-mail ne part pas : le référent la voit dans sa console.
  await memoriserPartieEntreprise();
  const dem = PROTO.demandeId && S.el.demandes.liste.find(x => x.id === PROTO.demandeId);
  if (dem) { dem.protocole.soumisLe = maintenant(); await sauver('demandes'); }
  try {
    const r = await api('POST', '/api/protocole/envoyer', { pdf: b64, fichier: nomFichier(), entreprise: PROTO.ent.entreprise });
    if (dem) { dem.protocoleEnvoyeLe = maintenant(); await sauver('demandes'); }
    journal(`Protocole d’accord envoyé au professeur référent pour validation (${PROTO.ent.entreprise})`);
    toast(`Protocole envoyé à ${r && r.destinataire ? r.destinataire : 'ton professeur référent'} pour validation`);
    render();
  } catch (e) {
    // Envoi impossible (pas d'adresse, service indisponible…) : on propose le PDF pour l'envoyer soi-même.
    journal(`Protocole d’accord soumis au professeur référent pour validation (${PROTO.ent.entreprise})`);
    render();
    modal(`<h2>E-mail non envoyé</h2><p>${esc(e.message)}</p>
      ${dem ? '<p>✅ Ta demande de validation est quand même enregistrée : ton professeur référent la verra dans sa console.</p>' : ''}
      <p>Tu peux aussi télécharger le PDF et le remettre à ton professeur, ou le déposer dans ton espace documentaire de l’ENT.</p>
      <button class="btn" data-a="protoTelecharger">⬇️ Télécharger le PDF</button>`);
  }
};

/* ---------- Validation du protocole par le professeur référent ---------- */
const validationDe = (d, demandeId) => ((d.prof.validations || {})[demandeId]) || null;
function blocValidation(d, dem) {
  if (!dem || !dem.protocole || !dem.protocole.soumisLe) return '';
  const v = validationDe(d, dem.id);
  if (!v || (dem.protocole.soumisLe > v.date)) return `<div class="alerte attention petit">⏳ Protocole soumis à ton professeur référent le ${fmtDT(dem.protocole.soumisLe)} : en attente de validation.</div>`;
  if (v.avis === 'favorable') return `<div class="alerte ok petit">✅ Protocole <b>validé</b> par ${esc(v.par)} le ${fmtDT(v.date)}${v.motif ? ` — « ${esc(v.motif)} »` : ''}. Tu peux maintenant créer ta convention de stage.</div>`;
  return `<div class="alerte urgent petit">❌ Protocole <b>refusé</b> par ${esc(v.par)} le ${fmtDT(v.date)}${v.motif ? ` — motif : « ${esc(v.motif)} »` : ''}. Corrige ton protocole puis renvoie-le, ou cherche une autre entreprise.</div>`;
}

/* ---------- Horaires : journée type répercutée sur les jours cochés ---------- */
const CRENEAUX = ['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a'];
const joursCoches = () => $$('.pj:checked').map(c => c.value);
function signaler(champ) {   // petit éclair jaune sur les champs modifiés
  champ.classList.add('flash');
  setTimeout(() => champ.classList.toggle('flash', false), 700);
}
A.protoRepercuter = () => {
  const type = Object.fromEntries(CRENEAUX.map(k => [k, val('pt_' + k)]));
  if (!CRENEAUX.some(k => type[k])) throw new Error('Saisis d’abord les horaires de la journée type.');
  const jours = joursCoches();
  if (!jours.length) throw new Error('Coche au moins un jour.');
  for (const j of jours) for (const k of CRENEAUX) { const champ = $(`#ph_${j}_${k}`); champ.value = type[k]; signaler(champ); }
  lireFormulaire();
  toast(`Horaires répercutés sur ${jours.length} jour(s)`);
};
A.protoEffacerJours = () => {
  const jours = joursCoches();
  if (!jours.length) throw new Error('Coche au moins un jour.');
  for (const j of jours) for (const k of CRENEAUX) $(`#ph_${j}_${k}`).value = '';
  lireFormulaire();
  toast(`Horaires effacés pour ${jours.length} jour(s)`);
};
C.protoTousJours = el => { for (const c of $$('.pj')) c.checked = el.checked; };
document.addEventListener('change', ev => {   // la case « tous » suit l'état des cases des jours
  if (!ev.target.classList || !ev.target.classList.contains('pj')) return;
  const tous = $('[data-c="protoTousJours"]'); if (tous) tous.checked = $$('.pj').every(c => c.checked);
});
