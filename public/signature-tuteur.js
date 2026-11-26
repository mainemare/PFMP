'use strict';
/* ===== Page de l'entreprise : compléter la partie entreprise du protocole d'accord, le relire et le signer =====
 * Lien éphémère reçu par SMS : identifiant et clé de déchiffrement après « # » (la clé n'est jamais envoyée au serveur).
 * L'entreprise complète ses coordonnées et les horaires (pré-remplis par l'élève et la base d'entreprises du lycée),
 * voit le protocole complété, puis signe ou envoie la photo de sa signature et de son tampon.
 * Ses réponses et sa signature sont chiffrées avec la même clé : seul l'élève peut les lire. Les coordonnées de
 * l'entreprise (sans rien sur l'élève) sont aussi gardées dans la base du lycée pour les prochains protocoles. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = (window.STAGES_API || '').trim();
const P = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map(x => { const i = x.indexOf('='); return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))]; }));
const ERREURS = { lien_expire: 'Ce lien a expiré ou a été annulé. Demandez à l’élève de vous en envoyer un nouveau.', deja_signe: 'Ce protocole a déjà été signé. Merci !',
  trop_essais: 'Trop d’essais : réessayez dans un quart d’heure.', trop_gros: 'Les images sont trop lourdes : reprenez une photo plus petite.', protosig_indisponible: 'La signature à distance n’est pas disponible sur ce serveur.' };
const E = { d: null, proto: null, pad: null, img: '', cachet: '', mode: 'pad' };
const TRANCHES = ['matin_de', 'matin_a', 'apresmidi_de', 'apresmidi_a'];

async function api(p, b) {
  let statut, j = null;
  try {
    if (API) { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ m: 'POST', p, b }) }); const rep = await r.json(); statut = rep.s; j = rep.d; }
    else { const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); statut = r.status; try { j = await r.json(); } catch { /* */ } }
  } catch { throw new Error('Serveur injoignable : vérifiez votre connexion Internet.'); }
  if (statut < 200 || statut >= 300) throw new Error(ERREURS[j && j.erreur] || 'Erreur du serveur, réessayez plus tard.');
  return j;
}
function toast(m, err) { const t = $('#toast'); t.innerHTML = `<div class="${err ? 'err' : ''}" role="status">${esc(m)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, err ? 6000 : 3000); }
const message = (titre, texte) => { $('#app').innerHTML = `<section class="carte"><h1 style="margin-top:0">${titre}</h1><p>${texte}</p></section>`; window.scrollTo(0, 0); };

// Lecteur de PDF (pdf.js) : mêmes versions et empreintes que dans l'application
const PDFJS = { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', sri: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
  worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', workerSri: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2' };
let pdfjsPret = null;
function chargerPdfJs() {
  if (!pdfjsPret) pdfjsPret = (async () => {
    await new Promise((ok, ko) => { const s = document.createElement('script'); Object.assign(s, { src: PDFJS.js, integrity: PDFJS.sri, crossOrigin: 'anonymous', onload: ok, onerror: () => ko(new Error('Lecteur de PDF indisponible.')) }); document.head.append(s); });
    const r = await fetch(PDFJS.worker, { integrity: PDFJS.workerSri });
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
  })().catch(e => { pdfjsPret = null; throw e; });
  return pdfjsPret;
}
async function afficherPdf(octets) {
  await chargerPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: octets.slice(), isEvalSupported: false }).promise, z = $('#pages');
  z.innerHTML = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(z.clientWidth || 600, 900) * (window.devicePixelRatio || 1) / vp0.width });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.className = 'pdf-page'; c.setAttribute('aria-label', `Page ${i} du protocole`); z.append(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
}
function telecharger(octets) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' })); a.download = 'Protocole d’accord.pdf'; document.body.append(a); a.click(); a.remove(); }

/* ---------- Ouverture du lien ---------- */
async function init() {
  if (!/^[a-f0-9]{16}$/.test(P.p || '') || !P.k) return message('Lien incomplet', 'Ouvrez le lien complet reçu par SMS.');
  let r;
  try { r = await api('/api/protosig/lire', { id: P.p }); } catch (e) { return message('Lien indisponible', esc(e.message)); }
  try { E.d = await CONV.dechiffrer(r.chiffre, P.k); } catch { return message('Lien incomplet', 'Le lien a été coupé : ouvrez-le en entier, ou demandez à l’élève de vous le renvoyer.'); }
  const fin = new Date(r.expire).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  if (!E.d.proto) return afficherAncienLien(fin);   // lien créé par une version précédente : PDF déjà rempli
  E.proto = E.d.proto;
  const ent = E.proto.ent || {}, h = E.proto.horaires || {}, jours = E.proto.jours || { lundi: true, mardi: true, mercredi: true, jeudi: true, vendredi: true };
  const champ = ([k, l, , , , type]) => `<label>${esc(l)}<input id="pn_${k}" ${type === 'email' ? 'type="email"' : ''} value="${esc(ent[k] || '')}"></label>`;
  const heure = (id, v) => `<input type="time" id="${id}" value="${esc(v || '')}" aria-label="${id}">`;
  $('#app').innerHTML = `<section class="carte"><h1 style="margin-top:0">Protocole d’accord de stage</h1>
      <p><b>${esc(E.d.eleve)}</b>${E.d.classe ? ` (${esc(E.d.classe)})` : ''}, élève du lycée Raymond Queneau, vous demande de compléter et de signer le protocole d’accord de son stage${E.d.entreprise ? ` chez <b>${esc(E.d.entreprise)}</b>` : ''}.</p>
      <ol class="petit"><li>Vérifiez et complétez la partie « entreprise » et les horaires.</li><li>Relisez le protocole complété.</li><li>Signez (et ajoutez le tampon de l’entreprise).</li></ol>
      <p class="doux petit">Lien valable jusqu’au ${esc(fin)}, utilisable une seule fois. Certaines informations sont déjà remplies par l’élève ou d’après le fichier des entreprises du lycée : corrigez-les si besoin.</p></section>
    <section class="carte"><h2>1. Partie à compléter par l’entreprise</h2>
      <div class="deux">${CHAMPS_ENTREPRISE.map(champ).join('')}</div>
      <fieldset class="choix-groupe"><legend>Acceptez-vous la signature électronique de la convention ?</legend>
        <label class="choix"><input type="radio" name="pn_signElec" value="oui" ${E.proto.signElec === 'oui' ? 'checked' : ''}>Oui</label>
        <label class="choix"><input type="radio" name="pn_signElec" value="non" ${E.proto.signElec === 'non' ? 'checked' : ''}>Non</label></fieldset>
      <h3>Horaires du stagiaire</h3>
      <p class="doux petit">Saisissez une journée type, cochez les jours concernés, puis « Répercuter ». Vous pouvez ensuite modifier un jour.</p>
      <div class="table-scroll"><table class="horaires"><tr><th></th><th class="petit">Jours<br>travaillés</th><th>Matin de</th><th>à</th><th>Après-midi de</th><th>à</th><th class="petit">Total</th></tr>
        <tr class="type"><th>Journée type</th><td></td>${TRANCHES.map(k => `<td>${heure('pt_' + k, h['lundi_' + k])}</td>`).join('')}<td></td></tr>
        <tr class="type"><td colspan="7"><button type="button" class="btn mini" id="repercuter">⬇️ Répercuter sur les jours cochés</button></td></tr>
        ${JOURS.map(([j, l]) => `<tr><th>${l}</th><td class="centre"><input type="checkbox" class="pj" value="${j}" ${jours[j] ? 'checked' : ''} aria-label="${l} travaillé"></td>
          ${TRANCHES.map(k => `<td>${heure(`ph_${j}_${k}`, h[`${j}_${k}`])}</td>`).join('')}<td class="total" id="ptot_${j}"></td></tr>`).join('')}</table></div>
      <div id="totalSemaine" class="total-semaine" role="status" aria-live="polite"></div>
      <p class="doux petit">Rappel : 15 ans et plus, 8 h par jour et 35 h par semaine au maximum (moins de 15 ans : 7 h et 30 h) ; élève mineur : 2 jours de repos consécutifs.</p></section>
    <section class="carte"><h2>2. Relire le protocole complété</h2>
      <div class="actions"><button class="btn" id="apercu">👁️ Afficher le protocole complété</button><button class="btn sec" id="telecharger">⬇️ Télécharger le PDF</button></div>
      <div id="pages" class="pdf-pages"></div></section>
    <section class="carte"><h2>3. Signature et cachet de l’entreprise</h2>
      <div class="deux"><label>Nom et prénom du signataire<input id="nom" autocomplete="name" value="${esc(ent.signataire || ent.tuteur || '')}"></label><label>Fonction<input id="fonction" value="${esc(ent.fonctionSignataire || ent.fonctionTuteur || '')}" placeholder="Tuteur, gérant, chef d’équipe…"></label></div>
      <div class="onglets"><button type="button" id="m_pad" class="actif">✍️ Signer sur l’écran</button><button type="button" id="m_photo">📷 Photo de la signature</button></div>
      <div id="zoneSig"></div>
      <h3 class="petit" style="margin:14px 0 4px">Tampon (cachet) de l’entreprise <span class="doux">(photo, facultatif)</span></h3>
      <div id="zoneCachet"></div>
      <label class="choix" style="margin-top:12px"><input type="checkbox" id="accord">J’ai vérifié le protocole d’accord et j’accepte d’accueillir l’élève dans ces conditions.</label>
      <div class="actions"><button class="btn" id="signer">✅ Valider et signer le protocole</button></div>
      <p class="doux petit">🔒 Vos réponses et votre signature sont chiffrées sur cet appareil et transmises à l’élève, qui les ajoute au protocole remis au lycée. Les coordonnées de l’entreprise sont aussi gardées dans le fichier des entreprises du lycée pour les prochains stagiaires.</p></section>`;
  $('#repercuter').onclick = repercuter;
  $('#apercu').onclick = () => apercu().catch(e => toast(e.message, true));
  $('#telecharger').onclick = async () => { try { telecharger(await fabriquer()); } catch (e) { toast(e.message, true); } };
  $('#m_pad').onclick = () => modeSig('pad'); $('#m_photo').onclick = () => modeSig('photo');
  $('#signer').onclick = signer;
  document.addEventListener('input', ev => { if (ev.target.type === 'time') totaux(); });
  modeSig('pad'); zoneCachet(); totaux();
}

/* ---------- Horaires ---------- */
const minutes = v => { if (!v) return null; const [a, b] = v.split(':').map(Number); return a * 60 + (b || 0); };
const fmtH = m => `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
function dureeJour(j) { return ['matin', 'apresmidi'].reduce((t, p) => { const a = minutes(($(`#ph_${j}_${p}_de`) || {}).value), b = minutes(($(`#ph_${j}_${p}_a`) || {}).value); return t + (a != null && b != null && b > a ? b - a : 0); }, 0); }
function totaux() {
  let s = 0;
  for (const [j] of JOURS) { const m = dureeJour(j); s += m; const c = $('#ptot_' + j); if (c) { c.textContent = m ? fmtH(m) : ''; c.classList.toggle('depasse', m > 8 * 60); } }
  const z = $('#totalSemaine'); if (z) { z.textContent = s ? `Total : ${fmtH(s)} par semaine` : ''; z.classList.toggle('depasse', s > 35 * 60); }
}
function repercuter() {
  const type = TRANCHES.map(k => $('#pt_' + k).value);
  if (!type.some(Boolean)) return toast('Saisissez d’abord la journée type.', true);
  for (const c of $$('.pj')) { const j = c.value; TRANCHES.forEach((k, i) => { $(`#ph_${j}_${k}`).value = c.checked ? type[i] : ''; }); }
  totaux(); toast('Horaires répercutés');
}
function lireReponses() {
  const ent = {}; for (const [k] of CHAMPS_ENTREPRISE) ent[k] = ($('#pn_' + k).value || '').trim();
  const horaires = {}; for (const [j] of JOURS) for (const k of TRANCHES) horaires[`${j}_${k}`] = $(`#ph_${j}_${k}`).value;
  const jours = Object.fromEntries($$('.pj').map(c => [c.value, c.checked]));
  return { ent, signElec: ($('input[name="pn_signElec"]:checked') || {}).value || '', horaires, jours };
}
const fabriquer = (sigEnt) => fabriquerPdfProtocole(Object.assign({}, E.proto, lireReponses(), { sigEnt: sigEnt || { img: '', cachet: '' } }));
async function apercu() {
  $('#pages').innerHTML = '<p class="doux">Préparation du protocole…</p>';
  await afficherPdf(new Uint8Array(await fabriquer()));
  $('#pages').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- Signature ---------- */
function zoneCachet() {
  const z = $('#zoneCachet');
  if (E.cachet) { z.innerHTML = `<img class="apercu-img" src="${E.cachet}" alt="Cachet de l’entreprise"> <button type="button" class="btn mini sec" id="retirerCachet">Retirer</button>`; $('#retirerCachet').onclick = () => { E.cachet = ''; zoneCachet(); }; }
  else { z.innerHTML = '<input type="file" accept="image/*" capture="environment" id="cachet" aria-label="Photo du cachet">'; $('#cachet').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; E.cachet = await CONV.photoEnImage(f, 900); zoneCachet(); }; }
}
function modeSig(m) {
  E.mode = m; E.img = '';
  $('#m_pad').classList.toggle('actif', m === 'pad'); $('#m_photo').classList.toggle('actif', m === 'photo');
  if (m === 'pad') {
    $('#zoneSig').innerHTML = '<canvas id="pad" class="pad-signature" aria-label="Zone de signature"></canvas><button type="button" class="btn mini sec" id="effacer">Effacer</button>';
    E.pad = CONV.padSignature($('#pad')); $('#effacer').onclick = () => E.pad.effacer();
  } else {
    E.pad = null;
    $('#zoneSig').innerHTML = '<input type="file" accept="image/*" capture="environment" id="photoSig" aria-label="Photo de la signature"><div id="apercuSig"></div>';
    $('#photoSig').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; E.img = await CONV.photoEnImage(f, 900); $('#apercuSig').innerHTML = `<img class="apercu-img" src="${E.img}" alt="Signature">`; };
  }
}
async function signer() {
  const r = E.proto ? lireReponses() : null, nom = $('#nom').value.trim(), fonction = $('#fonction').value.trim(), bouton = $('#signer');
  if (r) {
    const manque = [['entreprise', 'le nom de l’entreprise'], ['adresse', 'l’adresse'], ['tuteur', 'le nom du tuteur']].filter(([k]) => !r.ent[k]).map(([, l]) => l);
    if (!r.ent.tel && !r.ent.mail) manque.push('un téléphone ou un e-mail');
    if (!JOURS.some(([j]) => dureeJour(j) > 0)) manque.push('les horaires');
    if (manque.length) return toast('À compléter : ' + manque.join(', ') + '.', true);
  }
  if (!nom) return toast('Indiquez le nom du signataire.', true);
  if (E.mode === 'pad') { if (!E.pad || E.pad.vide()) return toast('Signez dans le cadre.', true); E.img = E.pad.image(); }
  if (!E.img) return toast('Ajoutez la photo de votre signature.', true);
  if (!$('#accord').checked) return toast('Cochez la case pour confirmer votre accord.', true);
  bouton.disabled = true; bouton.textContent = 'Envoi…';
  try {
    const sig = await CONV.chiffrer(Object.assign({ img: E.img, cachet: E.cachet, nom, fonction, date: new Date().toISOString() }, r || {}), P.k);
    // Coordonnées de l'entreprise seulement (rien sur l'élève) pour le fichier des entreprises du lycée.
    await api('/api/protosig/signer', { id: P.p, sig, infos: r ? r.ent : undefined });
    message('✅ Merci !', `Le protocole complété et signé a bien été transmis à ${esc(E.d.eleve)}. L’élève l’envoie ensuite au lycée. Vous pouvez fermer cette page.`);
  } catch (e) { toast(e.message, true); bouton.disabled = false; bouton.textContent = '✅ Valider et signer le protocole'; }
}

/* ---------- Lien d'une version précédente : PDF déjà rempli, signature seule ---------- */
function afficherAncienLien(fin) {
  const pdf = Uint8Array.from(atob(E.d.pdf), c => c.charCodeAt(0));
  $('#app').innerHTML = `<section class="carte"><h1 style="margin-top:0">Protocole d’accord de stage</h1>
      <p><b>${esc(E.d.eleve)}</b>, élève du lycée Raymond Queneau, vous demande de signer le protocole d’accord de son stage. Lien valable jusqu’au ${esc(fin)}.</p>
      <div class="actions"><button class="btn sec" id="telecharger">⬇️ Télécharger le PDF</button></div></section>
    <section class="carte"><div id="pages" class="pdf-pages"></div></section>
    <section class="carte"><h2>✍️ Signature et cachet de l’entreprise</h2>
      <div class="deux"><label>Nom et prénom du signataire<input id="nom"></label><label>Fonction<input id="fonction"></label></div>
      <div class="onglets"><button type="button" id="m_pad" class="actif">✍️ Signer sur l’écran</button><button type="button" id="m_photo">📷 Photo de la signature</button></div>
      <div id="zoneSig"></div><h3 class="petit" style="margin:14px 0 4px">Tampon de l’entreprise (facultatif)</h3><div id="zoneCachet"></div>
      <label class="choix" style="margin-top:12px"><input type="checkbox" id="accord">J’ai lu le protocole d’accord et j’accepte d’accueillir l’élève dans ces conditions.</label>
      <div class="actions"><button class="btn" id="signer">✅ Valider et signer le protocole</button></div></section>`;
  $('#telecharger').onclick = () => telecharger(pdf);
  $('#m_pad').onclick = () => modeSig('pad'); $('#m_photo').onclick = () => modeSig('photo'); $('#signer').onclick = signer;
  modeSig('pad'); zoneCachet();
  afficherPdf(pdf).catch(e => { $('#pages').innerHTML = `<p>${esc(e.message)}</p>`; });
}
init();
