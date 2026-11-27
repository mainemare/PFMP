'use strict';
/* ===== Protocole d'accord : remplissage du formulaire officiel du lycée (PDF), impression et envoi au référent =====
 * Le PDF fourni par le lycée (protocole-2026-2027.pdf) sert de fond : les réponses sont écrites aux emplacements
 * exacts des pointillés, le document imprimé est donc identique au formulaire papier.
 * Données personnelles de l'élève (nom complet, date de naissance, adresse, téléphones) : jamais enregistrées dans
 * l'application, seulement gardées le temps de la session puis écrites dans le PDF. La partie entreprise est
 * conservée avec la demande correspondante.
 */
// Constantes du formulaire et fabrication du PDF : protocole-pdf.js (partagé avec la page de l’entreprise).

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
  const referent = S.profs.find(p => p.id === referentsDe(cl)[0]) || null;
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
    lieu: '', domaine: base.activite || base.secteur || '', tuteur: (dem && dem.interlocuteur) || base.contact || '', fonctionTuteur: '', telTuteur: '', mailTuteur: '',
  }, Object.fromEntries(Object.entries(base.protocole || {}).filter(([k, v]) => v && k !== 'majLe')), sauve.ent || {});
  const horaires = Object.assign({}, sauve.horaires || {});
  // Journée type : reprise du lundi s'il est déjà rempli ; jours cochés par défaut : du lundi au vendredi.
  const type = Object.fromEntries(['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a'].map(k => [k, horaires['lundi_' + k] || '']));
  const jours = sauve.jours || { lundi: true, mardi: true, mercredi: true, jeudi: true, vendredi: true, samedi: false };
  const sigEnt = PROTO && PROTO.demandeId === (dem ? dem.id : '') ? PROTO.sigEnt : { img: '', cachet: '', mode: 'pad' };
  PROTO = { demandeId: dem ? dem.id : '', eleve, ent, signElec: sauve.signElec || '', horaires, type, jours, sigEnt };
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
  const referent = S.profs.find(p => p.id === referentsDe(cl)[0]) || null;
  const champ = (pref, [k, l, , , , type], v) => `<label>${l}<input id="${pref}_${k}" ${type === 'date' ? 'type="date"' : type === 'email' ? 'type="email"' : ''} value="${esc(v[k] || '')}"></label>`;
  const heure = id => `<input type="time" id="${id}" value="${esc(P.horaires[id.slice(3)] || '')}" aria-label="${id}">`;
  return `<section class="carte"><h2>📝 Protocole d’accord</h2>
    <p class="doux">Remplis le protocole d’accord du lycée : il sera imprimé sur le formulaire officiel, exactement comme la version papier. Tu peux le compléter avec l’entreprise, l’imprimer et l’envoyer à ton professeur référent.</p>
    <div class="alerte info petit">🔒 Ton nom, ta date de naissance, ton adresse et les téléphones ne sont <b>pas enregistrés</b> dans l’application : ils sont seulement écrits dans le PDF. Si tu fermes l’application, il faudra les saisir à nouveau.</div>
    <label>Entreprise concernée<select data-c="protoDemande"><option value="">— Autre entreprise (à saisir) —</option>${liste.map(x => `<option value="${x.id}" ${x.id === P.demandeId ? 'selected' : ''}>${esc(x.nom)} · ${(STATUTS[x.statut] || STATUTS.a_appeler)[0]}</option>`).join('')}</select></label>
    ${blocValidation(S.el, liste.find(x => x.id === P.demandeId))}
    ${typeof blocConventionEleve === 'function' ? blocConventionEleve(liste.find(x => x.id === P.demandeId)) : ''}</section>
  <section class="carte"><h3>À compléter par l’élève</h3><div class="deux">${CHAMPS_ELEVE.map(c => champ('pe', c, P.eleve)).join('')}</div></section>
  <section class="carte"><h3>À compléter par l’entreprise</h3><p class="doux petit">Tu n’as pas à tout remplir : ce qui est connu vient de ta demande et du fichier des entreprises du lycée. Le plus simple : envoie le lien à ton tuteur (en bas, « 📱 Envoyer un lien au tuteur ») ; l’entreprise complète elle-même ses coordonnées et les horaires, puis signe.</p>
    <div class="deux">${CHAMPS_ENTREPRISE.map(c => champ('pn', c, P.ent)).join('')}</div>
    <fieldset class="choix"><legend>Accepte la signature électronique de la convention</legend>
      <label><input type="radio" name="pn_signElec" value="oui" ${P.signElec === 'oui' ? 'checked' : ''}>Oui</label>
      <label><input type="radio" name="pn_signElec" value="non" ${P.signElec === 'non' ? 'checked' : ''}>Non</label>
      <label><input type="radio" name="pn_signElec" value="" ${!P.signElec ? 'checked' : ''}>Ne sait pas encore</label></fieldset>
    <h3 style="margin-top:14px">Horaires du stagiaire</h3>
    <p class="doux petit">Astuce : saisis les horaires d’une journée type, coche les jours qui ont les mêmes horaires, puis clique sur « Répercuter ». Tu peux ensuite modifier un jour à la main.</p>
    <div class="table-scroll"><table class="horaires"><tr><th></th><th></th><th colspan="2">Matin</th><th colspan="2">Après-midi</th><th>Total</th></tr>
      <tr><th></th><th class="petit">Mêmes<br>horaires</th><th>De</th><th>À</th><th>De</th><th>À</th><th class="petit">par jour</th></tr>
      <tr class="type"><th>Journée type</th><td><label class="petit tous"><input type="checkbox" data-c="protoTousJours" ${JOURS.every(([j]) => P.jours[j]) ? 'checked' : ''} aria-label="Cocher tous les jours">tous</label></td>
        ${['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a'].map(k => `<td><input type="time" id="pt_${k}" value="${esc(P.type[k] || '')}" aria-label="Journée type ${k}"></td>`).join('')}<td class="total" id="pt_total"></td></tr>
      <tr class="type"><td colspan="7"><button type="button" class="btn mini" data-a="protoRepercuter">⬇️ Répercuter sur les jours cochés</button>
        <button type="button" class="btn mini sec" data-a="protoEffacerJours">Effacer les jours cochés</button></td></tr>
      ${JOURS.map(([j, l]) => `<tr><th>${l}</th><td class="centre"><input type="checkbox" class="pj" value="${j}" ${P.jours[j] ? 'checked' : ''} aria-label="${l} : mêmes horaires que la journée type"></td>
        <td>${heure(`ph_${j}_matin_de`)}</td><td>${heure(`ph_${j}_matin_a`)}</td><td>${heure(`ph_${j}_apresmidi_de`)}</td><td>${heure(`ph_${j}_apresmidi_a`)}</td><td class="total" id="ptot_${j}"></td></tr>`).join('')}</table></div>
    <div id="totalSemaine" class="total-semaine" role="status" aria-live="polite"></div>
    <p class="doux petit">Moins de 15 ans : 7 h/jour et 30 h/semaine au maximum. 15 ans et plus : 8 h/jour et 35 h/semaine. Élève mineur : 2 jours de repos consécutifs.</p>
    ${blocSignatureEntreprise()}</section>
  <section class="carte"><div class="actions">
    <button class="btn" data-a="protoApercu">👁️ Aperçu et impression</button>
    <button class="btn sec" data-a="protoTelecharger">⬇️ Télécharger le PDF</button>
    <button class="btn sec" data-a="protoEnvoyer">✉️ Envoyer pour validation à mon professeur référent${referent ? ` (${esc(nomComplet(referent))})` : ''}</button></div>
    <p class="doux petit" style="margin-top:8px">Le PDF est fabriqué sur ton appareil. L’envoi transmet le PDF par e-mail à ton professeur référent, sans le garder dans l’application.</p></section>${blocPronoteEleve(liste.find(x => x.id === P.demandeId))}`;
}
C.protoDemande = el => { if (PROTO) lireFormulaire(); const eleve = PROTO && PROTO.eleve; PROTO = null; initProtocole(el.value || null); if (!el.value) { PROTO.demandeId = ''; for (const [k] of CHAMPS_ENTREPRISE) PROTO.ent[k] = ''; } if (eleve) PROTO.eleve = eleve; render(); };
A.protocolePour = el => { if (PROTO) lireFormulaire(); const eleve = PROTO && PROTO.eleve; PROTO = null; initProtocole(el.dataset.id); if (eleve) PROTO.eleve = eleve; S.vue = 'protocole'; render(); window.scrollTo(0, 0); };
// Mise à jour automatique du nombre de semaines quand les dates changent.
document.addEventListener('change', ev => {
  if (ev.target.id === 'pe_du' || ev.target.id === 'pe_au') { const n = nbSemaines(val('pe_du'), val('pe_au')); if (n) $('#pe_semaines').value = n; }
});

/* ---------- Fabrication du PDF ---------- */
async function fabriquerPdf() { lireFormulaire(); return fabriquerPdfProtocole(PROTO); }
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
  majTotaux(); toast(`Horaires répercutés sur ${jours.length} jour(s)`);
};
A.protoEffacerJours = () => {
  const jours = joursCoches();
  if (!jours.length) throw new Error('Coche au moins un jour.');
  for (const j of jours) for (const k of CRENEAUX) $(`#ph_${j}_${k}`).value = '';
  lireFormulaire();
  majTotaux(); toast(`Horaires effacés pour ${jours.length} jour(s)`);
};
C.protoTousJours = el => { for (const c of $$('.pj')) c.checked = el.checked; };

/* ---------- Heures par jour et par semaine, avec les limites légales selon l'âge ---------- */
const enMinutes = v => { if (!v) return null; const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0); };
const fmtHeures = m => m ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}` : '—';
function dureeChamps(prefixe) {
  let t = 0;
  for (const p of ['matin', 'apresmidi']) {
    const a = enMinutes(val(`${prefixe}_${p}_de`)), b = enMinutes(val(`${prefixe}_${p}_a`));
    if (a != null && b != null && b > a) t += b - a;
  }
  return t;
}
// Moins de 15 ans : 7 h/jour, 30 h/semaine. 15 à 17 ans : 8 h/jour, 35 h/semaine. Majeur : durée légale de 35 h/semaine.
function limitesAge() {
  const naissance = val('pe_naissance'), debut = val('pe_du');
  if (!naissance) return { jour: 8 * 60, semaine: 35 * 60, texte: 'âge inconnu : limites des 15-17 ans appliquées (8 h/jour, 35 h/semaine)' };
  const n = new Date(naissance + 'T00:00:00'), d = new Date((debut || today()) + 'T00:00:00');
  let age = d.getFullYear() - n.getFullYear(); if (d < new Date(d.getFullYear(), n.getMonth(), n.getDate())) age--;
  if (age < 15) return { jour: 7 * 60, semaine: 30 * 60, texte: `${age} ans au début du stage : 7 h/jour et 30 h/semaine au maximum` };
  if (age < 18) return { jour: 8 * 60, semaine: 35 * 60, texte: `${age} ans au début du stage : 8 h/jour et 35 h/semaine au maximum` };
  return { jour: 10 * 60, semaine: 35 * 60, texte: `${age} ans : élève majeur, durée légale de 35 h/semaine` };
}
function majTotaux() {
  const zone = $('#totalSemaine'); if (!zone) return;
  const lim = limitesAge(); let semaine = 0, joursTravailles = 0; const trop = [];
  const pt = $('#pt_total'); if (pt) pt.textContent = fmtHeures(dureeChamps('pt'));
  for (const [j, l] of JOURS) {
    const m = dureeChamps('ph_' + j), c = $('#ptot_' + j); semaine += m; if (m) joursTravailles++;
    if (c) { c.textContent = fmtHeures(m); c.classList.toggle('depasse', m > lim.jour); }
    if (m > lim.jour) trop.push(l);
  }
  const depasse = semaine > lim.semaine;
  zone.className = 'total-semaine' + (depasse || trop.length ? ' depasse' : semaine ? ' ok' : '');
  zone.innerHTML = `<b>Total : ${semaine ? fmtHeures(semaine) : "0 h"} par semaine</b>${joursTravailles ? ` sur ${joursTravailles} jour${joursTravailles > 1 ? 's' : ''}` : ''}
    <span class="petit">${depasse ? ` — ⚠️ dépasse le maximum de ${fmtHeures(lim.semaine)}` : semaine ? ' ✓' : ''}${trop.length ? ` — ⚠️ trop d’heures le ${trop.join(', ').toLowerCase()} (maximum ${fmtHeures(lim.jour)} par jour)` : ''}</span>
    <div class="petit doux">${esc(lim.texte)}.</div>`;
}
document.addEventListener('input', ev => { if (/^(ph_|pt_|pe_naissance|pe_du)/.test(ev.target.id || '')) majTotaux(); });
document.addEventListener('change', ev => { if (/^(ph_|pt_|pe_naissance|pe_du)/.test(ev.target.id || '')) majTotaux(); });
document.addEventListener('change', ev => {   // la case « tous » suit l'état des cases des jours
  if (!ev.target.classList || !ev.target.classList.contains('pj')) return;
  const tous = $('[data-c="protoTousJours"]'); if (tous) tous.checked = $$('.pj').every(c => c.checked);
});

/* ---------- Signature et cachet de l'entreprise sur le protocole ---------- */
function blocSignatureEntreprise() {
  const s = PROTO.sigEnt || {};
  return `<h3 style="margin-top:16px">✍️ Signature et cachet de l’entreprise</h3>
    <p class="doux petit">À faire avec la personne de l’entreprise avant l’envoi au professeur : elle signe directement sur l’écran, ou tu prends en photo sa signature et le tampon de l’entreprise. Ils apparaîtront sur le PDF dans la case « Signature et cachet de l’entreprise ».</p>
    <div class="onglets"><button type="button" class="${s.mode !== 'photo' ? 'actif' : ''}" data-a="protoSigMode" data-m="pad">✍️ Signer sur l’écran</button>
      <button type="button" class="${s.mode === 'photo' ? 'actif' : ''}" data-a="protoSigMode" data-m="photo">📷 Photo de la signature</button>
      <button type="button" class="${s.mode === 'lien' ? 'actif' : ''}" data-a="protoSigMode" data-m="lien">📱 Envoyer un lien au tuteur</button></div>
    ${s.img ? `<img class="apercu-img" src="${s.img}" alt="Signature de l’entreprise">${s.signataire ? `<p class="petit">✅ Signé à distance par <b>${esc(s.signataire)}</b> le ${fmtDT(s.signeLe)}</p>` : ''}<button type="button" class="btn mini sec" data-a="protoSigRefaire">Refaire la signature</button>`
      : s.mode === 'lien' ? blocLienTuteur()
      : s.mode === 'photo' ? '<input type="file" accept="image/*" capture="environment" data-c="protoSigPhoto" aria-label="Photo de la signature">'
      : '<canvas id="protoPad" class="pad-signature" aria-label="Signature de l’entreprise"></canvas><div class="actions"><button type="button" class="btn mini" data-a="protoSigValider">Valider la signature</button><button type="button" class="btn mini sec" data-a="protoSigEffacer">Effacer</button></div>'}
    <h4 class="petit" style="margin:14px 0 4px">Tampon (cachet) de l’entreprise <span class="doux">(photo, facultatif)</span></h4>
    ${s.cachet ? `<img class="apercu-img" src="${s.cachet}" alt="Cachet de l’entreprise"><button type="button" class="btn mini sec" data-a="protoCachetRetirer">Retirer le cachet</button>`
      : '<input type="file" accept="image/*" capture="environment" data-c="protoCachetPhoto" aria-label="Photo du cachet">'}
    <p class="doux petit">🔒 La signature et le cachet ne sont pas enregistrés dans l’application : ils sont seulement ajoutés au PDF.</p>`;
}
let padProtocole = null;
function initPadProtocole() { const c = $('#protoPad'); padProtocole = c ? CONV.padSignature(c) : null; }
const majProto = () => { lireFormulaire(); render(); };
A.protoSigMode = el => { PROTO.sigEnt.mode = el.dataset.m; majProto(); };
A.protoSigEffacer = () => { if (padProtocole) padProtocole.effacer(); };
A.protoSigValider = () => {
  if (!padProtocole || padProtocole.vide()) throw new Error('La personne de l’entreprise doit d’abord signer dans le cadre.');
  PROTO.sigEnt.img = padProtocole.image(); majProto(); toast('Signature ajoutée au protocole');
};
A.protoSigRefaire = () => { PROTO.sigEnt.img = ''; PROTO.sigEnt.signataire = ''; majProto(); };
A.protoCachetRetirer = () => { PROTO.sigEnt.cachet = ''; majProto(); };
C.protoSigPhoto = async el => { PROTO.sigEnt.img = await CONV.photoEnImage(el.files[0]); majProto(); toast('Photo de la signature ajoutée'); };
C.protoCachetPhoto = async el => { PROTO.sigEnt.cachet = await CONV.photoEnImage(el.files[0]); majProto(); toast('Cachet ajouté'); };

/* ---------- Signature à distance : lien éphémère envoyé par SMS au tuteur ----------
 * Le PDF (sans signature) est chiffré sur l'appareil de l'élève ; la clé n'est que dans le lien.
 * Le lien et sa clé sont gardés sur cet appareil le temps de récupérer la signature. */
const cleLienTuteur = () => 'protosig_' + (PROTO.demandeId || 'libre');
function lienTuteurMemorise() { try { const x = JSON.parse(localStorage.getItem(cleLienTuteur()) || 'null'); return x && new Date(x.expire) > new Date() ? x : null; } catch { return null; } }
function memoriserLienTuteur(x) { try { if (x) localStorage.setItem(cleLienTuteur(), JSON.stringify(x)); else localStorage.removeItem(cleLienTuteur()); } catch { /* stockage indisponible */ } }
// Lien robuste pour les SMS : après « # », une seule suite de chiffres et de lettres a-f (identifiant puis clé en hexadécimal),
// sans « & », « = », « - » ni « _ » que certaines applications de SMS coupent. La clé n'est jamais envoyée au serveur.
const cleHex = b64 => [...atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4))].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
const urlLienTuteur = x => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'signature-tuteur.html#' + x.id + cleHex(x.cle);
// Le lien est seul sur la dernière ligne, sans rien derrière : aucune application ne le colle au texte qui suit.
const texteSms = x => `Bonjour, voici le protocole d’accord de stage de ${PROTO.eleve.prenom || S.el.profil.prenom} (lycée Raymond Queneau, Yvetot) à compléter et à signer avant le ${fmtDT(x.expire)}. Merci !\n${urlLienTuteur(x)}`;
function blocLienTuteur() {
  const x = lienTuteurMemorise();
  if (!x) return `<div class="lien-tuteur"><p class="petit">Envoie un lien par SMS à ton tuteur : sur son téléphone, l’entreprise <b>complète sa partie</b> (coordonnées, horaires), relit le protocole, puis signe avec le doigt ou prend son tampon en photo. Tout revient ensuite ici.</p>
    <div class="deux"><label>Téléphone portable du tuteur <span class="doux petit">(n’est pas enregistré)</span><input id="proto_tel_tuteur" type="tel" placeholder="06 12 34 56 78"></label>
      <label>Le lien expire dans<select id="proto_duree"><option value="24">24 heures</option><option value="48" selected>48 heures</option><option value="72">72 heures</option></select></label></div>
    <div class="actions"><button type="button" class="btn" data-a="protoLienCreer">📱 Créer le lien et l’envoyer par SMS</button></div>
    <p class="doux petit">Remplis d’abord ta partie (élève). Le SMS part de ton téléphone.</p></div>`;
  return `<div class="lien-tuteur" id="protoSigAttente"><p>⏳ <b>En attente de la signature du tuteur</b> · lien valable jusqu’au ${fmtDT(x.expire)}</p>
    <div class="actions"><a class="btn sec" href="sms:${esc((x.tel || '').replace(/[^\d+]/g, ''))}?&body=${encodeURIComponent(texteSms(x))}">📱 Renvoyer le SMS</a>
      <button type="button" class="btn sec" data-a="protoLienCopier">📋 Copier le lien</button><button type="button" class="btn" data-a="protoLienVerifier">🔄 Vérifier si c’est signé</button>
      <button type="button" class="lien petit" style="display:inline" data-a="protoLienAnnuler">Annuler le lien</button></div>
    <p class="doux petit">La page vérifie toute seule toutes les 20 secondes. Les réponses de l’entreprise remplaceront la partie entreprise et les horaires.</p></div>`;
}
A.protoLienCreer = async () => {
  verifierMinimum();
  const tel = val('proto_tel_tuteur'), heures = +val('proto_duree') || 48;
  if (tel && !/^[\d\s+.()-]{8,20}$/.test(tel)) throw new Error('Numéro de téléphone invalide.');
  toast('Préparation du lien…');
  const cle = CONV.nouvelleCle(), dem = PROTO.demandeId && S.el.demandes.liste.find(d => d.id === PROTO.demandeId);
  const proto = { eleve: { ...PROTO.eleve }, ent: { ...PROTO.ent }, signElec: PROTO.signElec, horaires: { ...PROTO.horaires }, jours: { ...PROTO.jours } };
  const chiffre = await CONV.chiffrer({ proto, eleve: `${PROTO.eleve.prenom} ${PROTO.eleve.nom}`.trim(), classe: PROTO.eleve.classe || '', entreprise: PROTO.ent.entreprise || '' }, cle);
  const r = await api('POST', '/api/protosig/creer', { chiffre, heures, entrepriseId: dem && dem.entrepriseId || undefined });
  const x = { id: r.id, cle, expire: r.expire, tel };
  memoriserLienTuteur(x); journal(`Protocole envoyé au tuteur pour signature (${PROTO.ent.entreprise || 'entreprise'})`);
  majProto();
  location.href = `sms:${tel.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(texteSms(x))}`;
};
A.protoLienCopier = async () => {
  const x = lienTuteurMemorise(); if (!x) return;
  try { await navigator.clipboard.writeText(urlLienTuteur(x)); toast('Lien copié : colle-le dans un SMS ou un e-mail au tuteur'); } catch { prompt('Copie ce lien :', urlLienTuteur(x)); }
};
A.protoLienAnnuler = async () => {
  const x = lienTuteurMemorise(); if (!x || !confirm('Annuler ce lien ? Le tuteur ne pourra plus signer avec.')) return;
  try { await api('POST', '/api/protosig/supprimer', { id: x.id }); } catch { /* déjà expiré */ }
  memoriserLienTuteur(null); majProto(); toast('Lien annulé');
};
async function verifierLienTuteur(silencieux) {
  const x = lienTuteurMemorise(); if (!x) return;
  let r;
  try { r = await api('POST', '/api/protosig/etat', { id: x.id }); }
  catch (e) { if (/expir|introuvable/i.test(e.message)) { memoriserLienTuteur(null); majProto(); } if (!silencieux) throw e; return; }
  if (!r.signe) { if (!silencieux) toast('Pas encore signé.'); return; }
  const s = await CONV.dechiffrer(r.sig, x.cle);
  // Partie entreprise et horaires complétés par l'entreprise
  if (s.ent && $('#pe_nom')) lireFormulaire();   // garde ce que l’élève a tapé depuis l’envoi
  if (s.ent) { PROTO.ent = { ...PROTO.ent, ...s.ent }; PROTO.signElec = s.signElec || PROTO.signElec; PROTO.horaires = { ...PROTO.horaires, ...(s.horaires || {}) }; PROTO.jours = { ...PROTO.jours, ...(s.jours || {}) };
    for (const k of ['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a']) PROTO.type[k] = PROTO.horaires['lundi_' + k] || PROTO.type[k];
    await memoriserPartieEntreprise().catch(() => {}); }
  Object.assign(PROTO.sigEnt, { img: s.img, cachet: s.cachet || PROTO.sigEnt.cachet, mode: 'lien', signataire: [s.nom, s.fonction].filter(Boolean).join(', '), signeLe: s.date });
  try { await api('POST', '/api/protosig/supprimer', { id: x.id }); } catch { /* */ }
  memoriserLienTuteur(null); journal('Protocole complété et signé à distance par l’entreprise'); render();
  toast('✅ Le tuteur a signé : tu peux envoyer le protocole à ton professeur');
}
A.protoLienVerifier = () => verifierLienTuteur(false);
setInterval(() => { if (document.getElementById('protoSigAttente') && !document.hidden) verifierLienTuteur(true).catch(() => {}); }, 20000);

/* ---------- Étape finale : convention éditée et signée sur Pronote ----------
 * Le protocole validé sert à éditer la convention sur Pronote. L'élève indique quand elle est signée ;
 * le professeur confirme : la demande passe alors à « Convention signée » (niveau 5), ce qui termine le parcours de recherche. */
function etapesPronote(dem, valide) {
  const pr = (dem && dem.pronote) || {}, signee = !!dem && dem.statut === 'convention', ok = !!dem && (signee || (valide != null ? valide : protocoleValide(dem)));
  const etape = (fait, t, d) => `<li class="${fait ? 'fait' : ''}"><span>${fait ? '✅' : '⬜'}</span><div>${t}${d ? `<br><span class="petit doux">${d}</span>` : ''}</div></li>`;
  return `<ol class="etapes-pronote">${etape(ok, 'Protocole d’accord validé par le professeur référent')}
    ${etape(!!pr.editeeLe || signee, 'Convention éditée sur Pronote', pr.editeeLe ? `le ${fmt(pr.editeeLe)}${pr.editeePar ? ` par ${esc(pr.editeePar)}` : ''}` : '')}
    ${etape(signee, 'Convention signée : élève (et représentant légal), entreprise, chef d’établissement', pr.confirmeLe ? `confirmée par ${esc(pr.confirmePar)} le ${fmt(pr.confirmeLe)}` : pr.declareLe ? `signalée par l’élève le ${fmt(pr.declareLe)}, en attente de confirmation` : '')}</ol>`;
}
function blocPronoteEleve(dem) {
  if (!protocoleSigne(dem)) return '';   // la rubrique convention n'apparaît qu'une fois le protocole signé
  const pr = (dem && dem.pronote) || {}, signee = !!dem && dem.statut === 'convention', ok = !!dem && (protocoleValide(dem) || signee);
  return `<section class="carte pronote"><h2>🏁 Étape finale : la convention de stage sur Pronote</h2>
    <p>Une fois ton protocole validé, ta <b>convention de stage est éditée sur Pronote</b>. Quand elle est signée par tout le monde, ta recherche de stage est terminée.</p>
    ${etapesPronote(dem)}
    ${!dem ? '<p class="doux">Choisis d’abord l’entreprise en haut de la page.</p>'
      : signee ? '<div class="alerte ok">🎉 Ta convention est signée : ton parcours de recherche de stage est terminé ! Prépare maintenant ton stage (journal de bord, portfolio).</div>'
      : !ok ? '<p class="doux petit">Cette étape s’ouvre quand ton professeur référent a validé ton protocole d’accord.</p>'
      : pr.declareLe ? `<p>⏳ Tu as indiqué le ${fmt(pr.declareLe)} que ta convention est signée : ton professeur va le confirmer.</p>`
      : `<p class="petit">Ta convention est signée sur Pronote (par toi, ton représentant légal, l’entreprise et le lycée) ? Préviens ton professeur :</p>
        <div class="actions"><button class="btn" data-a="pronoteDeclarer" data-id="${dem.id}">✅ Ma convention est signée sur Pronote</button></div>`}</section>`;
}
A.pronoteDeclarer = async el => {
  const x = S.el.demandes.liste.find(d => d.id === el.dataset.id); if (!x) return;
  x.pronote = Object.assign(x.pronote || {}, { declareLe: maintenant() }); x.majLe = maintenant();
  await sauver('demandes'); journal(`Convention signée sur Pronote signalée au professeur (${x.nom})`); render(); toast('Ton professeur est prévenu');
};
