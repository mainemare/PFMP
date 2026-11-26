'use strict';
/* ===== Page du tuteur : lire le protocole d'accord et le signer (lien éphémère reçu par SMS) =====
 * Le lien contient l'identifiant et la clé de déchiffrement (après « # », jamais envoyée au serveur).
 * La signature (et le cachet) sont chiffrés avec la même clé avant l'envoi : seul l'élève peut les lire. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = (window.STAGES_API || '').trim();
const P = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map(x => { const i = x.indexOf('='); return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))]; }));
const ERREURS = { lien_expire: 'Ce lien a expiré ou a été annulé. Demandez à l’élève de vous en envoyer un nouveau.', deja_signe: 'Ce protocole a déjà été signé. Merci !',
  trop_essais: 'Trop d’essais : réessayez dans un quart d’heure.', trop_gros: 'Les images sont trop lourdes : reprenez une photo plus petite.', protosig_indisponible: 'La signature à distance n’est pas disponible sur ce serveur.' };
const E = { pdf: null, meta: null, pad: null, img: '', cachet: '', mode: 'pad' };

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
const message = (titre, texte) => { $('#app').innerHTML = `<section class="carte"><h1 style="margin-top:0">${titre}</h1><p>${texte}</p></section>`; };

// Lecteur de PDF (pdf.js) : mêmes versions et empreintes que dans l'application
const PDFJS = { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', sri: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
  worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', workerSri: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2' };
async function chargerPdfJs() {
  await new Promise((ok, ko) => { const s = document.createElement('script'); Object.assign(s, { src: PDFJS.js, integrity: PDFJS.sri, crossOrigin: 'anonymous', onload: ok, onerror: () => ko(new Error('Lecteur de PDF indisponible.')) }); document.head.append(s); });
  const r = await fetch(PDFJS.worker, { integrity: PDFJS.workerSri });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
}
async function afficherPdf(octets) {
  await chargerPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: octets.slice(), isEvalSupported: false }).promise, z = $('#pages');
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(z.clientWidth || 600, 900) * (window.devicePixelRatio || 1) / vp0.width });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.className = 'pdf-page'; c.setAttribute('aria-label', `Page ${i} du protocole`); z.append(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
}

async function init() {
  if (!/^[a-f0-9]{16}$/.test(P.p || '') || !P.k) return message('Lien incomplet', 'Ouvrez le lien complet reçu par SMS.');
  let r;
  try { r = await api('/api/protosig/lire', { id: P.p }); } catch (e) { return message('Lien indisponible', esc(e.message)); }
  let d;
  try { d = await CONV.dechiffrer(r.chiffre, P.k); } catch { return message('Lien incomplet', 'Le lien a été coupé : ouvrez-le en entier, ou demandez à l’élève de vous le renvoyer.'); }
  E.meta = d; E.pdf = Uint8Array.from(atob(d.pdf), c => c.charCodeAt(0));
  const fin = new Date(r.expire).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  $('#app').innerHTML = `<section class="carte"><h1 style="margin-top:0">Protocole d’accord de stage</h1>
      <p><b>${esc(d.eleve)}</b>${d.classe ? ` (${esc(d.classe)})` : ''}, élève du lycée Raymond Queneau, vous demande de signer le protocole d’accord de son stage${d.entreprise ? ` chez <b>${esc(d.entreprise)}</b>` : ''}.</p>
      <p class="doux petit">Relisez le document ci-dessous, puis signez en bas de la page. Ce lien est valable jusqu’au ${esc(fin)} et ne sert qu’une fois.</p>
      <div class="actions"><button class="btn sec" id="telecharger">⬇️ Télécharger le PDF</button></div></section>
    <section class="carte"><div id="pages" class="pdf-pages"><p class="doux">Affichage du protocole…</p></div></section>
    <section class="carte"><h2>✍️ Signature et cachet de l’entreprise</h2>
      <div class="deux"><label>Nom et prénom du signataire<input id="nom" autocomplete="name"></label><label>Fonction<input id="fonction" placeholder="Tuteur, gérant, chef d’équipe…"></label></div>
      <div class="onglets"><button type="button" id="m_pad" class="actif">✍️ Signer sur l’écran</button><button type="button" id="m_photo">📷 Photo de la signature</button></div>
      <div id="zoneSig"></div>
      <h3 class="petit" style="margin:14px 0 4px">Tampon (cachet) de l’entreprise <span class="doux">(photo, facultatif)</span></h3>
      <div id="zoneCachet"><input type="file" accept="image/*" capture="environment" id="cachet" aria-label="Photo du cachet"></div>
      <label class="choix" style="margin-top:12px"><input type="checkbox" id="accord">J’ai lu le protocole d’accord et j’accepte d’accueillir l’élève dans ces conditions.</label>
      <div class="actions"><button class="btn" id="signer">✅ Signer le protocole</button></div>
      <p class="doux petit">🔒 Votre signature est chiffrée sur ce téléphone et transmise seulement à l’élève, qui l’ajoute au protocole remis au lycée.</p></section>`;
  $('#telecharger').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([E.pdf], { type: 'application/pdf' })); a.download = 'Protocole d’accord.pdf'; document.body.append(a); a.click(); a.remove(); };
  $('#m_pad').onclick = () => modeSig('pad'); $('#m_photo').onclick = () => modeSig('photo');
  zoneCachet();
  $('#signer').onclick = signer;
  modeSig('pad');
  afficherPdf(E.pdf).then(() => { const p = $('#pages p'); if (p) p.remove(); }).catch(e => { $('#pages').innerHTML = `<p>${esc(e.message)} Utilisez « Télécharger le PDF ».</p>`; });
}
function zoneCachet() {
  const z = $('#zoneCachet');
  if (E.cachet) {
    z.innerHTML = `<img class="apercu-img" src="${E.cachet}" alt="Cachet de l’entreprise"> <button type="button" class="btn mini sec" id="retirerCachet">Retirer</button>`;
    $('#retirerCachet').onclick = () => { E.cachet = ''; zoneCachet(); };
  } else {
    z.innerHTML = '<input type="file" accept="image/*" capture="environment" id="cachet" aria-label="Photo du cachet">';
    $('#cachet').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; E.cachet = await CONV.photoEnImage(f, 900); zoneCachet(); };
  }
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
  const nom = $('#nom').value.trim(), fonction = $('#fonction').value.trim(), bouton = $('#signer');
  if (!nom) return toast('Indiquez votre nom et prénom.', true);
  if (E.mode === 'pad') { if (!E.pad || E.pad.vide()) return toast('Signez dans le cadre.', true); E.img = E.pad.image(); }
  if (!E.img) return toast('Ajoutez la photo de votre signature.', true);
  if (!$('#accord').checked) return toast('Cochez la case pour confirmer votre accord.', true);
  bouton.disabled = true; bouton.textContent = 'Envoi…';
  try {
    const sig = await CONV.chiffrer({ img: E.img, cachet: E.cachet, nom, fonction, date: new Date().toISOString() }, P.k);
    await api('/api/protosig/signer', { id: P.p, sig });
    message('✅ Merci !', `Votre signature a bien été transmise à ${esc(E.meta.eleve)}. Elle sera ajoutée au protocole envoyé au lycée. Vous pouvez fermer cette page.`);
  } catch (e) { toast(e.message, true); bouton.disabled = false; bouton.textContent = '✅ Signer le protocole'; }
}
init();
