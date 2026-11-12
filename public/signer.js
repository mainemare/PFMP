'use strict';
/* ===== Page de signature de la convention (ouverte par le lien) =====
 * Le lien contient l'identifiant de la convention et la clé de déchiffrement (après « # », jamais envoyée au serveur).
 * Signataires externes (représentant légal, entreprise, tuteur) : code personnel. Élève, référent, chef d'établissement :
 * compte de l'application. La signature se fait à l'écran ou par photo (signature, cachet).
 */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = (window.STAGES_API || '').trim();
const params = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map(p => { const i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));
const E = { id: params.c || '', cle: params.k || '', role: params.r || '', code: '', token: '', user: null, donnees: null, pad: null, img: '', cachet: '' };
try { E.token = localStorage.getItem('stages_token') || ''; } catch { /* */ }
const ERREURS = { code_convention: 'Code incorrect pour ce rôle.', trop_essais: 'Trop d’essais : réessayez dans un quart d’heure.', convention_introuvable: 'Cette convention n’existe plus (elle a peut-être été annulée).',
  pas_signataire: 'Votre compte ne permet pas de signer pour ce rôle.', pas_lecteur: 'Votre compte ne permet pas d’ouvrir cette convention (réservé à l’élève, à son enseignant référent et au chef d’établissement).', deja_signe: 'Cette signature a déjà été faite.', identifiants: 'Identifiant ou mot de passe incorrect.', non_connecte: 'Connectez-vous.' };

async function api(method, p, b) {
  let statut, j = null;
  try {
    if (API) {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ m: method, p, t: E.token, b }) });
      const rep = await r.json(); statut = rep.s; j = rep.d;
    } else {
      const headers = { 'Content-Type': 'application/json' }; if (E.token) headers.Authorization = 'Bearer ' + E.token;
      const r = await fetch(p, { method, headers, body: b === undefined ? undefined : JSON.stringify(b) }); statut = r.status; try { j = await r.json(); } catch { /* */ }
    }
  } catch { throw new Error('Serveur injoignable : vérifiez votre connexion Internet.'); }
  if (statut < 200 || statut >= 300) throw new Error(ERREURS[j && j.erreur] || 'Erreur du serveur.');
  return j;
}
function toast(m, err) { const t = $('#toast'); t.innerHTML = `<div class="${err ? 'err' : ''}" role="status">${esc(m)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, err ? 5000 : 2500); }
const vue = html => { $('#app').innerHTML = html; window.scrollTo(0, 0); };
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/* ---------- Étape 1 : qui signe ? ---------- */
function choixRole() {
  if (!E.id || !E.cle) return vue('<section class="carte"><h2>Lien incomplet</h2><p>Ce lien de signature est incomplet. Copiez-le en entier depuis le message reçu.</p></section>');
  vue(`<section class="carte"><h2>📜 Convention de stage</h2>
    <p>Vous avez reçu ce lien pour consulter et signer une convention de stage. Indiquez qui vous êtes :</p>
    <div class="choix-roles">${CONV.ORDRE_ROLES.map(r => `<button class="btn ${CONV.ROLES[r].externe ? '' : 'sec'}" data-role="${r}">${esc(CONV.ROLES[r].court)}</button>`).join('')}</div>
    <p class="petit doux">Entreprise, tuteur et représentant légal : munissez-vous du code personnel reçu avec le lien. Élève, enseignant référent et chef d’établissement : connectez-vous avec votre compte.</p></section>`);
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { E.role = b.dataset.role; identification(); });
  if (E.role && CONV.ROLES[E.role]) identification();
}
/* ---------- Étape 2 : code ou compte ---------- */
async function identification() {
  const R = CONV.ROLES[E.role];
  if (R.externe) {
    vue(`<section class="carte"><h2>${esc(R.court)}</h2><label>Votre code personnel<input id="code" placeholder="XXXX-XXXX" autocomplete="one-time-code" maxlength="12"></label>
      <div class="actions"><button class="btn" id="ok">Ouvrir la convention</button><button class="btn sec" id="retour">← Retour</button></div></section>`);
    $('#code').focus();
    $('#ok').onclick = () => { E.code = CONV.normaliserCode($('#code').value); ouvrir().catch(e => toast(e.message, true)); };
    $('#code').onkeydown = ev => { if (ev.key === 'Enter') $('#ok').click(); };
  } else {
    if (E.token) { try { E.user = await api('GET', '/api/moi'); } catch { E.user = null; E.token = ''; } }
    if (E.user) return ouvrir().catch(e => toast(e.message, true));
    vue(`<section class="carte"><h2>${esc(R.court)}</h2><p class="doux">Connectez-vous avec votre compte de l’application « Suivi des stages ».</p>
      <label>Identifiant<input id="ident" autocomplete="username"></label><label>Mot de passe<input id="mdp" type="password" autocomplete="current-password"></label>
      <div class="actions"><button class="btn" id="ok">Se connecter</button><button class="btn sec" id="retour">← Retour</button></div></section>`);
    $('#ok').onclick = async () => {
      try {
        const r = await api('POST', '/api/connexion', { identifiant: $('#ident').value.trim(), motdepasse: $('#mdp').value });
        E.token = r.token; E.user = r.user; try { localStorage.setItem('stages_token', r.token); } catch { /* */ }
        await ouvrir();
      } catch (e) { toast(e.message, true); }
    };
    $('#mdp').onkeydown = ev => { if (ev.key === 'Enter') $('#ok').click(); };
  }
  const r = $('#retour'); if (r) r.onclick = () => { E.role = ''; choixRole(); };
}
/* ---------- Étape 3 : lecture et signature ---------- */
async function ouvrir() {
  const R = CONV.ROLES[E.role];
  const rep = await api('POST', '/api/convention/lire', { id: E.id, role: E.role, code: R.externe ? E.code : undefined });
  const D = await CONV.dechiffrer(rep.chiffre, E.cle), sigs = {};
  for (const [role, c] of Object.entries(rep.sig || {})) { sigs[role] = await CONV.dechiffrer(c, E.cle); if (rep.meta.signatures[role]) sigs[role].signeLe = rep.meta.signatures[role].le; }
  E.donnees = { D, sigs, meta: rep.meta };
  afficher();
}
function afficher() {
  const { D, meta } = E.donnees, R = CONV.ROLES[E.role], dejaSigne = !!meta.signatures[E.role];
  // Avec un compte, on ne propose la signature que si ce compte correspond au rôle choisi (le serveur vérifie aussi).
  const compteOk = R.externe || (E.user && (E.role === 'eleve' ? E.user.role === 'eleve' : E.role === 'chef' ? E.user.role === 'prof' && E.user.chef : E.user.role === 'prof'));
  const concerne = meta.roles.includes(E.role) && compteOk;
  const ligne = (l, v) => v ? `<dt>${l}</dt><dd>${esc(v)}</dd>` : '';
  vue(`<section class="carte"><h2>📜 Convention de stage</h2>
      ${meta.statut === 'signee' ? '<div class="alerte ok">✅ La convention est entièrement signée.</div>' : ''}
      <dl class="resume-conv">${ligne('Élève', `${D.eleve.prenom} ${D.eleve.nom.toUpperCase()} — ${D.eleve.classe}`)}${ligne('Entreprise', `${D.entreprise.nom}, ${D.entreprise.adresse}`)}
        ${ligne('Représentée par', [D.entreprise.representant, D.entreprise.fonction].filter(Boolean).join(', '))}${ligne('Tuteur', D.tuteur.memeQueRepresentant ? D.entreprise.representant : [D.tuteur.nom, D.tuteur.fonction].filter(Boolean).join(', '))}
        ${ligne('Période', `du ${CONV.dateFr(D.stage.du)} au ${CONV.dateFr(D.stage.au)}`)}${ligne('Enseignant référent', D.referent.nom)}</dl>
      <button class="btn sec" id="voir">📄 Lire la convention complète (PDF)</button>
      <h3 style="margin-top:16px">Signatures</h3><ul class="liste-sig">${meta.roles.map(r => `<li>${meta.signatures[r] ? '✅' : '⬜'} ${esc(CONV.ROLES[r].court)}${meta.signatures[r] ? ` <span class="doux">— le ${CONV.dateFr(meta.signatures[r].le)}</span>` : ''}</li>`).join('')}</ul></section>
    ${!compteOk ? `<section class="carte"><p>Votre compte (${esc(E.user ? `${E.user.prenom} ${E.user.nom}` : '')}) ne permet pas de signer en tant que « ${esc(R.court)} ». Vous pouvez lire la convention ci-dessus.</p><button class="btn sec" id="autreRole">← Choisir un autre rôle</button></section>`
      : !concerne ? `<section class="carte"><p>Votre signature n’est pas demandée pour cette convention (${esc(R.court)}).</p></section>`
      : dejaSigne ? `<section class="carte"><p>✅ Vous avez signé cette convention le ${CONV.dateFr(meta.signatures[E.role].le)}.</p></section>` : formulaireSignature()}`);
  $('#voir').onclick = () => voirPdf().catch(e => toast(e.message, true));
  const autre = $('#autreRole'); if (autre) autre.onclick = () => { E.role = ''; choixRole(); };
  if (concerne && !dejaSigne) brancherSignature();
}
function formulaireSignature() {
  const { D } = E.donnees, R = CONV.ROLES[E.role];
  return `<section class="carte"><h2>✍️ Ma signature — ${esc(R.court)}</h2>
    <div class="deux"><label>Nom et prénom${E.role === 'chef' ? ' <span class="doux petit">(précisez « par délégation » si besoin)</span>' : ''}<input id="s_nom" value="${esc(
      E.role === 'chef' && E.user ? `${E.user.prenom} ${E.user.nom}${D.etab.chef && !D.etab.chef.toLowerCase().includes(String(E.user.nom).toLowerCase()) ? ' (par délégation)' : ''}`
        : ['referent', 'eleve'].includes(E.role) && E.user && E.role === 'referent' ? `${E.user.prenom} ${E.user.nom}` : CONV.nomSignataire(D, E.role))}"></label>
      <label>Fait à<input id="s_lieu" value="${esc(['referent', 'chef'].includes(E.role) ? D.etab.ville : '')}" placeholder="Ville"></label>
      <label>Le<input id="s_date" type="date" value="${today()}" readonly></label></div>
    <div class="onglets"><button class="actif" data-mode="pad">✍️ Signer à l’écran</button><button data-mode="photo">📷 Photo de ma signature</button></div>
    <div id="mode_pad"><p class="petit doux">Signez dans le cadre avec le doigt, un stylet ou la souris.</p><canvas id="pad" class="pad-signature" aria-label="Zone de signature"></canvas>
      <button class="btn mini sec" id="effacer">Effacer</button></div>
    <div id="mode_photo" hidden><p class="petit doux">Signez sur une feuille blanche, puis prenez-la en photo (bien cadrée, bien éclairée).</p>
      <input type="file" id="photo_sig" accept="image/*" capture="environment"><img id="apercu_sig" class="apercu-img" alt="" hidden></div>
    ${R.cachet ? `<h3 style="margin-top:14px">Cachet ${E.role === 'chef' ? 'de l’établissement' : 'de l’entreprise'} <span class="doux petit">(facultatif)</span></h3>
      <input type="file" id="photo_cachet" accept="image/*" capture="environment"><img id="apercu_cachet" class="apercu-img" alt="" hidden>` : ''}
    <label style="margin-top:14px"><input type="checkbox" id="accord">J’ai lu la convention et ses annexes et je l’accepte.</label>
    <button class="btn" id="signer">✅ Signer la convention</button></section>`;
}
function brancherSignature() {
  E.pad = CONV.padSignature($('#pad')); E.img = ''; E.cachet = ''; let mode = 'pad';
  $('#effacer').onclick = () => E.pad.effacer();
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('actif', x === b));
    $('#mode_pad').hidden = mode !== 'pad'; $('#mode_photo').hidden = mode !== 'photo'; if (mode === 'pad') E.pad.effacer();
  });
  const photo = (inp, ap, cle) => { const i = $(inp); if (!i) return; i.onchange = async () => {
    try { E[cle] = await CONV.photoEnImage(i.files[0]); const a = $(ap); a.src = E[cle]; a.hidden = false; } catch (e) { toast(e.message, true); } }; };
  photo('#photo_sig', '#apercu_sig', 'img'); photo('#photo_cachet', '#apercu_cachet', 'cachet');
  $('#signer').onclick = async () => {
    const b = $('#signer');
    try {
      const nom = $('#s_nom').value.trim(), lieu = $('#s_lieu').value.trim();
      if (!nom) throw new Error('Indiquez votre nom.'); if (!lieu) throw new Error('Indiquez le lieu (« Fait à »).');
      const img = mode === 'pad' ? (E.pad.vide() ? '' : E.pad.image()) : E.img;
      if (!img) throw new Error(mode === 'pad' ? 'Signez dans le cadre.' : 'Ajoutez la photo de votre signature.');
      if (!$('#accord').checked) throw new Error('Cochez la case pour confirmer que vous acceptez la convention.');
      b.disabled = true; b.textContent = 'Signature en cours…';
      const sig = { nom, lieu, date: today(), img, cachet: E.cachet || '', signeLe: new Date().toISOString(), role: E.role };
      await api('POST', '/api/convention/signer', { id: E.id, role: E.role, code: CONV.ROLES[E.role].externe ? E.code : undefined, signature: await CONV.chiffrer(sig, E.cle) });
      toast('Merci, votre signature est enregistrée');
      await ouvrir();
    } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = '✅ Signer la convention'; }
  };
}
async function voirPdf() {
  const { D, sigs } = E.donnees, octets = await CONV.pdf(D, sigs);
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
  const nom = `Convention_${D.eleve.nom}_${D.eleve.prenom}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_') + '.pdf';
  $('#modal').innerHTML = `<div class="overlay" id="fond"><div class="fenetre large" role="dialog" aria-modal="true"><button class="fermer" id="fermer" aria-label="Fermer">✕</button>
    <h2>📄 Convention de stage</h2><iframe class="apercu-pdf" src="${url}" title="Convention de stage"></iframe>
    <div class="actions"><a class="btn" href="${url}" download="${esc(nom)}">⬇️ Télécharger le PDF</a><a class="btn sec" href="${url}" target="_blank" rel="noopener">↗️ Ouvrir dans un nouvel onglet</a></div>
    <p class="doux petit">Sur téléphone, si l’aperçu ne s’affiche pas, utilisez « Télécharger » ou « Ouvrir dans un nouvel onglet ».</p></div></div>`;
  $('#fermer').onclick = () => { $('#modal').innerHTML = ''; };
  $('#fond').onclick = ev => { if (ev.target.id === 'fond') $('#modal').innerHTML = ''; };
}
choixRole();
