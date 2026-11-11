'use strict';
/* ===== Suivi des stages — partie commune + espace élève ===== */

const S = {
  token: localStorage.getItem('stages_token') || '', user: null, vue: '', auth: 'connexion', pubClasses: [],
  classes: [], entreprises: [], profs: [],
  el: null, offset: 0,                                   // élève
  eleves: [], dossier: null, onglet: 'synthese', qEnt: '', f: { classe: '', niveau: '', q: '', urg: false }, // prof
};
const A = {}, C = {}, I = {};   // actions (clic), changements, saisies

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const maintenant = () => new Date().toISOString();
const fmt = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '…';
const fmtDT = s => { const d = new Date(s); return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const jours = s => s ? Math.round((new Date(s + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null;
const nomComplet = u => `${u.prenom} ${u.nom}`.trim();
const initiales = s => String(s || '').trim().toUpperCase().replace(/[^A-ZÀ-ÖØ-Þ]/g, '').slice(0, 2);

const ERR = {
  identifiants: 'Identifiant ou mot de passe incorrect.', identifiant_pris: 'Cet identifiant est déjà utilisé.',
  identifiant_invalide: 'Identifiant : 3 à 40 caractères (lettres sans accent, chiffres, point, tiret).',
  motdepasse_court: 'Le mot de passe doit contenir au moins 6 caractères.', code_prof: 'Code professeur incorrect.',
  classe_requise: 'Choisis ta classe.', nom_requis: 'Nom et prénom sont obligatoires.', interdit: 'Action non autorisée.',
  code_eleve: 'Code d’inscription élève incorrect : demande-le à ton professeur.', nom_initiales: 'Pour le nom, indique seulement les 2 premières lettres.', trop_essais: 'Trop de tentatives. Réessaie dans quelques minutes.',
  non_connecte: 'Session expirée, reconnecte-toi.', introuvable: 'Élément introuvable.',
};
const NIV = [
  { l: 'Pas de recherche', c: '#dc2626' }, { l: 'Un peu de recherche', c: '#ea580c' }, { l: 'Recherche active', c: '#ca8a04' },
  { l: 'Rendez-vous obtenu', c: '#2563eb' }, { l: 'Protocole signé', c: '#0d9488' }, { l: 'Convention signée', c: '#16a34a' },
];
const STATUTS = {
  a_appeler: ['À appeler', '#64748b'], sans_reponse: ['Appelé – pas de réponse', '#b45309'], a_rappeler: ['À rappeler / relancer', '#b45309'],
  attente: ['En attente de leur réponse', '#2563eb'], refus: ['Refus', '#b91c1c'], rdv: ['Rendez-vous obtenu', '#7c3aed'],
  protocole: ['Accord – protocole signé', '#0d9488'], convention: ['Convention signée', '#15803d'],
};
const DEF = {
  // Données minimales : prénom + 2 premières lettres du nom, pas d'e-mail ni de téléphone.
  profil: () => ({ nom: '', prenom: '', classeId: '', residences: [], nbSuggestions: 8 }),
  // CV et lettre : les PDF sont dans l'espace documentaire de l'ENT ; ici, seulement leur suivi.
  cv: () => ({ deposeLe: null, aRelire: false, valide: false, correction: null }),
  lettre: () => ({ deposeLe: null, aRelire: false, valide: false, correction: null }),
  memento: () => ({ accroche: '', perso: '', pro: '', motsCles: '', aRelire: false, valide: false, correction: null }),
  demandes: () => ({ liste: [] }),
  journal: () => ({ evenements: [] }),
  etat: () => ({ conseilsLus: [] }),
  prof: () => ({ conseils: [], propositions: [], niveauForce: null, dates: null, urgence: null }),
};
const normaliser = docs => { const o = {}; for (const k in DEF) o[k] = Object.assign(DEF[k](), (docs && docs[k]) || {}); return o; };
const CHAMPS = {
  memento: [['accroche', 'Ma phrase d’accroche au téléphone', 'Bonjour, je m’appelle (prénom)… Je suis élève en … Je vous appelle car je recherche un stage du … au …', 3],
    ['perso', 'Me présenter personnellement', 'Qui je suis, mes qualités, ce que j’aime faire…', 4],
    ['pro', 'Me présenter professionnellement', 'Ma formation, mon projet, ce que je sais faire, pourquoi cette entreprise m’intéresse…', 4],
    ['motsCles', 'Mes mots-clés à ne pas oublier', 'dates du stage · durée · convention · à qui envoyer mon CV · merci · au revoir', 3]],
};
const TITRES = { cv: 'CV', lettre: 'Lettre de motivation', memento: 'Memento d’appel' };

/* ---------- Serveur ---------- */
// Deux modes : API Google Apps Script (STAGES_API renseignée dans config.js, pages sur GitHub Pages)
// ou serveur classique (server.js / serveur.ps1) qui sert aussi les pages.
const API_GOOGLE = (window.STAGES_API || '').trim();
let requetesEnCours = 0;   // barre de chargement en haut de l'écran tant qu'une requête est en cours
function chargement(delta) { requetesEnCours += delta; document.body.classList.toggle('charge', requetesEnCours > 0); }
async function api(method, url, body) {
  chargement(1);
  try { return await appelApi(method, url, body); } finally { chargement(-1); }
}
async function appelApi(method, url, body) {
  let statut, j = null;
  try {
    if (API_GOOGLE) {
      // Requête « simple » (text/plain) : seule forme acceptée par Apps Script depuis un autre site.
      const r = await fetch(API_GOOGLE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ m: method, p: url, t: S.token, b: body }) });
      const rep = await r.json(); statut = rep.s; j = rep.d;
    } else {
      const headers = { 'Content-Type': 'application/json' };
      if (S.token) headers.Authorization = 'Bearer ' + S.token;
      const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const t = await r.text(); statut = r.status;
      try { j = t ? JSON.parse(t) : null; } catch { /* réponse non JSON */ }
    }
  } catch { throw Object.assign(new Error('Serveur injoignable. Vérifie ta connexion Internet.'), { reseau: true }); }
  if (statut < 200 || statut >= 300) {
    if (statut === 401 && S.user) { sessionFermee(); render(); }
    throw Object.assign(new Error(ERR[j && j.erreur] || 'Erreur du serveur.'), { statut });
  }
  return j;
}
const getDoc = k => api('GET', '/api/doc/' + k);
const putDoc = (k, v) => api('PUT', '/api/doc/' + k, v);
const sauver = section => putDoc(`eleve/${S.user.id}/${section}`, S.el[section]);
function journal(texte) {
  const j = S.el.journal; j.evenements.push({ date: maintenant(), texte });
  j.evenements = j.evenements.slice(-150);
  sauver('journal').catch(() => {});
}
function sessionFermee() { S.auth = 'connexion'; S.token = ''; S.user = null; S.vue = ''; S.el = null; S.eleves = []; S.dossier = null; localStorage.removeItem('stages_token'); modal(''); }

/* ---------- Calculs ---------- */
function dist(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function niveauAuto(d) {
  const l = d.demandes.liste, a = s => l.some(x => x.statut === s);
  if (a('convention')) return 5; if (a('protocole')) return 4; if (a('rdv')) return 3;
  if (l.filter(x => x.statut !== 'a_appeler').length >= 3) return 2;
  return l.length ? 1 : 0;
}
const niveau = d => d.prof.niveauForce != null ? d.prof.niveauForce : niveauAuto(d);
function periodeCourante(cl) {
  if (!cl || !cl.periodes) return null;
  const p = cl.periodes.filter(x => x.debut).sort((a, b) => a.debut.localeCompare(b.debut));
  return p.find(x => (x.fin || x.debut) >= today()) || p[p.length - 1] || null;
}
function datesEleve(d) {
  const p = periodeCourante(S.classes.find(c => c.id === d.profil.classeId)), o = d.prof.dates;
  if (o && o.debut) return { debut: o.debut, fin: o.fin || o.debut, derog: true, motif: o.motif || '', label: p ? p.label : '' };
  return p ? { debut: p.debut, fin: p.fin || p.debut, derog: false, label: p.label } : null;
}
function enUrgence(d) {
  const dt = datesEleve(d);
  return !!dt && jours(dt.debut) <= 10 && dt.fin >= today() && niveau(d) < 5;
}
function barre(n, compact) {
  const c = NIV[n].c;
  return `<div class="barre${compact ? ' compact' : ''}" role="img" aria-label="Niveau ${n} sur 5 : ${NIV[n].l}"><div class="segs">${[1, 2, 3, 4, 5].map(i => `<i style="${i <= n ? `background:${c}` : ''}"></i>`).join('')}</div><span style="color:${c}"><b>${n}</b> · ${NIV[n].l}</span></div>`;
}

/* ---------- Localisation des adresses (Base Adresse Nationale) ---------- */
// commune = true : ne cherche que des communes (pour les élèves, on n'enregistre jamais d'adresse précise).
async function geocoder(q, commune) {
  for (const u of ['https://data.geopf.fr/geocodage/search?limit=5', 'https://api-adresse.data.gouv.fr/search/?limit=5']) {
    try {
      const r = await fetch(u + (commune ? '&type=municipality' : '') + '&q=' + encodeURIComponent(q)); if (!r.ok) continue;
      const j = await r.json();
      return (j.features || []).filter(f => !commune || f.properties.type === 'municipality')
        .map(f => ({ label: commune ? `${f.properties.city || f.properties.label} (${f.properties.postcode || ''})` : f.properties.label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
    } catch { /* essai suivant */ }
  }
  throw new Error('Service de localisation injoignable (connexion Internet nécessaire).');
}
async function assurerGeo(o) {
  if (o.lat != null || !o.adresse) return;
  try { const r = await geocoder(o.adresse); if (r.length) { o.lat = r[0].lat; o.lon = r[0].lon; } } catch { /* restera non localisée */ }
}
function champGeo(p, adresse, lat, lon, commune) {
  const ok = lat != null && lat !== '', quoi = commune ? 'Commune' : 'Adresse ou commune';
  return `<div class="geo"><div class="ligne"><input id="${p}_adr" class="geo-adr" data-p="${p}" value="${esc(adresse)}" placeholder="${commune ? 'Nom de la commune (pas d’adresse)' : quoi}" aria-label="${quoi}">
    <button type="button" class="btn sec" data-a="geo" data-p="${p}" ${commune ? 'data-commune="1"' : ''}>📍&nbsp;Localiser</button></div>
    <input type="hidden" id="${p}_lat" value="${ok ? lat : ''}"><input type="hidden" id="${p}_lon" value="${ok ? lon : ''}">
    <div class="geo-etat" id="${p}_etat">${ok ? '✔ Localisée' : `Saisis ${commune ? 'le nom de la commune' : 'l’adresse'} puis clique sur « Localiser ».`}</div></div>`;
}
const lireGeo = p => ({ adresse: val(p + '_adr'), lat: val(p + '_lat') === '' ? null : +val(p + '_lat'), lon: val(p + '_lon') === '' ? null : +val(p + '_lon') });
A.geo = async el => {
  const p = el.dataset.p, q = val(p + '_adr'), etat = $('#' + p + '_etat');
  if (q.length < 3) { etat.textContent = 'Saisis au moins 3 caractères.'; return; }
  etat.textContent = 'Recherche…';
  try {
    const res = await geocoder(q, !!el.dataset.commune);
    etat.innerHTML = res.length ? 'Choisis dans la liste :' + res.map(r => `<button type="button" class="lien" data-a="geoChoix" data-p="${p}" data-lat="${r.lat}" data-lon="${r.lon}" data-label="${esc(r.label)}">${esc(r.label)}</button>`).join('') : (el.dataset.commune ? 'Aucune commune trouvée : saisis seulement le nom de la commune.' : 'Aucune adresse trouvée.');
  } catch (e) { etat.textContent = e.message; }
};
A.geoChoix = el => {
  const p = el.dataset.p;
  $('#' + p + '_adr').value = el.dataset.label; $('#' + p + '_lat').value = el.dataset.lat; $('#' + p + '_lon').value = el.dataset.lon;
  $('#' + p + '_etat').textContent = '✔ Localisée';
};

/* ---------- Interface générale ---------- */
function toast(msg, err) {
  const t = $('#toast'); t.innerHTML = `<div class="${err ? 'err' : ''}" role="status">${esc(msg)}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, err ? 5000 : 2500);
}
function modal(html, large) {
  $('#modal').innerHTML = html ? `<div class="overlay" data-a="fond"><div class="fenetre${large ? ' large' : ''}" role="dialog" aria-modal="true"><button class="fermer" data-a="fermerModal" aria-label="Fermer">✕</button>${html}</div></div>` : '';
}
A.fermerModal = () => modal('');
A.fond = (el, ev) => { if (ev.target === el) { if (el.dataset.dossier) { S.dossier = null; render(); } else modal(''); } };
A.aller = el => { S.vue = el.dataset.v; S.offset = 0; S.dossier = null; modal(''); render(); window.scrollTo(0, 0); };
A.deconnexion = async () => { try { await api('POST', '/api/deconnexion'); } catch { /* déjà fermée */ } sessionFermee(); await chargerPublic(); render(); };

function render() {
  const app = $('#app');
  if (!S.user) { app.innerHTML = vueAuth(); return; }
  const prof = S.user.role === 'prof';
  if (carte) { carte.remove(); carte = null; }
  app.innerHTML = entete(prof) + `<main>${prof ? vueProf() : vueEleve()}</main>` + (prof && S.dossier ? vueDossier() : '');
  if (!prof && S.vue === 'entreprises') afficherCarte();
}
function entete(prof) {
  let nav;
  if (prof) {
    const nu = urgences().filter(e => !e.d.prof.urgence).length;
    nav = [['tableau', '📊 Tableau de bord'], ['alertes', '🔔 Alertes', nu], ['classes', '📅 Classes et dates'], ['entreprises', '🏢 Entreprises']];
  } else {
    const d = S.el, nl = d.prof.conseils.filter(c => !d.etat.conseilsLus.includes(c.id)).length;
    nav = [['accueil', '🏠 Accueil', nl], ['profil', '👤 Mon profil'], ['entreprises', '🏢 Entreprises'], ['suivi', '📞 Mes appels', relancesDues(d).length],
      ['memento', '📝 Memento'], ['cv', '📄 CV'], ['lettre', '✉️ Lettre']];
  }
  return `<header class="top"><div class="logo">🎓 Suivi des stages${prof ? ' · Console professeur' : ''}</div>
    <nav>${nav.map(([v, l, n]) => `<button data-a="aller" data-v="${v}" class="${S.vue === v ? 'actif' : ''}">${l}${n ? `<span class="pastille">${n}</span>` : ''}</button>`).join('')}</nav>
    <div class="qui"><span>${esc(nomComplet(S.user))}</span><button data-a="deconnexion">Déconnexion</button></div></header>`;
}

/* ---------- Connexion / inscription ---------- */
function vueAuth() {
  const t = S.auth, tab = (k, l) => `<button data-a="auth" data-t="${k}" class="${t === k ? 'actif' : ''}">${l}</button>`;
  let corps;
  if (t === 'connexion') corps = `<label>Identifiant<input id="a_id" autocomplete="username"></label><label>Mot de passe<input id="a_pw" type="password" autocomplete="current-password"></label>
    <button class="btn" data-a="connexion">Se connecter</button>`;
  else corps = `<div class="deux"><label>Prénom<input id="a_prenom" maxlength="40"></label>
    ${t === 'eleve' ? `<label>Nom <span class="doux petit">(2 premières lettres seulement)</span><input id="a_nom" maxlength="2" style="text-transform:uppercase" placeholder="ex. MA"></label>` : '<label>Nom<input id="a_nom"></label>'}</div>
    ${t === 'eleve' && S.codeEleveRequis ? `<label>Code d’inscription élève <span class="doux petit">(donné par ton professeur)</span><input id="a_codeEleve" autocomplete="off"></label>` : ''}
    ${t === 'eleve' ? (S.pubClasses.length ? `<label>Classe<select id="a_classe"><option value="">— Choisir —</option>${S.pubClasses.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}</select></label>`
      : `<div class="alerte attention">Aucune classe n’a encore été créée. Demande à ton professeur de créer ta classe avant de t’inscrire.</div>`)
      : `<label>Code professeur <span class="doux petit">${API_GOOGLE ? '(dans Google Apps Script : Paramètres du projet › Propriétés du script › CODE_PROF)' : '(affiché au démarrage du serveur)'}</span><input id="a_code" autocomplete="off"></label>`}
    <label>Identifiant de connexion <span class="doux petit">(ex. prenom.nom)</span><input id="a_id" autocomplete="username"></label>
    <label>Mot de passe <span class="doux petit">(6 caractères minimum)</span><input id="a_pw" type="password" autocomplete="new-password"></label>
    <button class="btn" data-a="inscription">Créer mon compte</button>`;
  return `<div class="auth"><h1 style="text-align:center">🎓 Suivi des stages</h1><p class="doux" style="text-align:center">Trouver son stage, étape par étape.</p>
    <div class="carte"><div class="tabs">${tab('connexion', 'Connexion')}${tab('eleve', 'Inscription élève')}${tab('prof', 'Inscription professeur')}</div>${corps}</div><div class="zone-installer" style="text-align:center">${blocInstaller()}</div></div>`;
}
A.auth = el => { S.auth = el.dataset.t; render(); };
A.connexion = async () => ouvrirSession(await api('POST', '/api/connexion', { identifiant: val('a_id'), motdepasse: $('#a_pw').value }));
A.inscription = async () => ouvrirSession(await api('POST', '/api/inscription', {
  role: S.auth, prenom: val('a_prenom'), nom: S.auth === 'eleve' ? initiales(val('a_nom')) : val('a_nom'), identifiant: val('a_id'), motdepasse: $('#a_pw').value, classeId: val('a_classe'), codeProf: val('a_code'), codeEleve: val('a_codeEleve'),
}));
async function ouvrirSession(r) {
  S.token = r.token; localStorage.setItem('stages_token', r.token); S.user = r.user; S.vue = '';
  await charger(); render(); rappelQuotidien();
}
async function chargerPublic() {
  // Le code élève n'existe que sur la version hébergée (server.js) ; la version Windows répond 404.
  try { S.codeEleveRequis = !!((await api('GET', '/api/public/info')) || {}).codeEleveRequis; } catch { S.codeEleveRequis = false; }
  try { S.pubClasses = ((await api('GET', '/api/public/classes')) || {}).classes || []; } catch { S.pubClasses = []; }
}
async function chargerCommun() {
  const [cl, en, pr] = await Promise.all([getDoc('commun/classes'), getDoc('commun/entreprises'), api('GET', '/api/profs')]);
  S.classes = (cl && cl.classes) || []; S.entreprises = (en && en.entreprises) || []; S.profs = pr || [];
}
async function charger() {
  await chargerCommun();
  if (S.user.role === 'prof') { await chargerEleves(); S.vue = S.vue || 'tableau'; return; }
  const docs = {};
  await Promise.all(Object.keys(DEF).map(async k => { docs[k] = await getDoc(`eleve/${S.user.id}/${k}`); }));
  S.el = normaliser(docs);
  S.vue = S.vue || (S.el.profil.residences.some(r => r.lat != null) ? 'accueil' : 'profil');
}

/* ====================== ESPACE ÉLÈVE ====================== */
function vueEleve() {
  switch (S.vue) {
    case 'profil': return vueProfil();
    case 'entreprises': return vueEntreprises();
    case 'suivi': return vueSuivi();
    case 'memento': case 'cv': case 'lettre': return vueDoc(S.vue);
    default: return vueAccueil();
  }
}
const relancesDues = d => d.demandes.liste.filter(x => x.dateRelance && x.dateRelance <= today() && !['refus', 'convention'].includes(x.statut));

function alerteEleve(d) {
  const dt = datesEleve(d), n = niveau(d);
  if (!dt) return { c: 'info', h: '📅 Les dates de stage de ta classe ne sont pas encore fixées.' };
  const j = jours(dt.debut), per = `du <b>${fmt(dt.debut)}</b> au <b>${fmt(dt.fin)}</b>`;
  if (dt.fin < today()) return { c: 'info', h: `La période de stage (${per}) est terminée.` };
  if (n === 5) return { c: 'ok', h: `🎉 Bravo, ta convention est signée ! Stage ${per}.` };
  const quand = j > 0 ? `<b class="j">J-${j}</b> avant le début du stage (${per}).` : `<b class="j">Le stage a commencé</b> (${per}).`;
  if (j <= 10) return { c: 'urgent', h: `🚨 ${quand}<br>Tu n’as pas encore de convention signée : le plan d’urgence est déclenché. Va voir ton professeur référent dès aujourd’hui.` };
  if (j <= 30) return { c: 'alerte2', h: `⏰ ${quand}<br>Il reste moins d’un mois : appelle plusieurs entreprises cette semaine et relance celles qui n’ont pas répondu.` };
  if (j <= 60) return { c: 'attention', h: `📣 ${quand}<br>C’est le moment d’intensifier ta recherche.` };
  return { c: 'info', h: `📅 ${quand}<br>Commence ta recherche dès maintenant : les bonnes places partent vite.` };
}
function rappelQuotidien() {
  if (!S.user) return;
  const cle = 'stages_rappel_' + S.user.id;
  if (localStorage.getItem(cle) === today()) return;
  let html = '';
  if (S.user.role === 'eleve') {
    const al = alerteEleve(S.el);
    if (['attention', 'alerte2', 'urgent'].includes(al.c)) html = `<h2>Rappel : ton stage approche</h2><div class="alerte ${al.c}">${al.h}</div>${barre(niveau(S.el))}`;
  } else {
    const u = urgences();
    if (u.length) {
      const miens = u.filter(e => (S.classes.find(c => c.id === e.d.profil.classeId) || {}).referentId === S.user.id);
      html = `<h2>🚨 Plan d’urgence à déclencher</h2><p><b>${u.length} élève(s)</b> sont à 10 jours ou moins du début du stage sans convention signée${miens.length ? `, dont <b>${miens.length}</b> dans une classe dont vous êtes référent` : ''}.</p>
        <button class="btn" data-a="aller" data-v="alertes">Voir les alertes</button>`;
    }
  }
  if (html) { modal(html); localStorage.setItem(cle, today()); }
}

function vueAccueil() {
  const d = S.el, n = niveau(d), al = alerteEleve(d);
  const nonLus = d.prof.conseils.filter(c => !d.etat.conseilsLus.includes(c.id)), rel = relancesDues(d);
  const todo = [[d.profil.residences.some(r => r.lat != null), 'Compléter mon profil et mes communes de résidence', 'profil'], [!!d.memento.accroche.trim(), 'Préparer mon memento d’appel', 'memento'],
    [!!d.cv.deposeLe, 'Déposer mon CV sur l’ENT', 'cv'], [!!d.lettre.deposeLe, 'Déposer ma lettre de motivation sur l’ENT', 'lettre'], [d.demandes.liste.length > 0, 'Sélectionner des entreprises à appeler', 'entreprises']];
  return `<div class="alerte ${al.c}" role="alert">${al.h}</div>
  <section class="carte"><h2>Où j’en suis</h2>${barre(n)}
    <div class="etapes">${NIV.map((v, i) => `<div class="${i <= n ? 'fait' : ''}" style="${i <= n ? `background:${NIV[n].c}` : ''}"><b>${i}</b>${v.l}</div>`).join('')}</div>
    <p class="doux petit" style="margin-top:10px">Le niveau avance tout seul : 1 dès qu’une entreprise est sélectionnée, 2 à partir de 3 entreprises contactées, puis selon le statut de tes demandes (rendez-vous, protocole, convention).</p></section>
  <div class="grille">
    <section class="carte"><h2>Mes prochaines actions</h2>
      ${rel.length ? `<p>📞 <b>${rel.length} relance(s) à faire :</b> ${rel.map(x => esc(x.nom)).join(', ')} <button class="btn mini" data-a="aller" data-v="suivi">Voir</button></p>` : ''}
      ${todo.map(([ok, l, v]) => `<p>${ok ? '✅' : '⬜'} ${ok ? `<span class="doux">${l}</span>` : `<button class="lien" style="display:inline" data-a="aller" data-v="${v}">${l}</button>`}</p>`).join('')}</section>
    <section class="carte"><h2>Conseils de mes professeurs</h2>
      ${d.prof.conseils.length ? [...d.prof.conseils].reverse().map(c => `<div class="conseil ${nonLus.includes(c) ? 'nonlu' : ''}"><div class="petit doux">${esc(c.profNom)} · ${fmtDT(c.date)}${nonLus.includes(c) ? ' · <b>nouveau</b>' : ''}</div>${esc(c.texte)}</div>`).join('') : '<p class="doux">Aucun conseil pour le moment.</p>'}
      ${nonLus.length ? '<button class="btn mini" data-a="conseilsLus">J’ai lu</button>' : ''}</section>
  </div>`;
}
A.conseilsLus = async () => { S.el.etat.conseilsLus = S.el.prof.conseils.map(c => c.id); await sauver('etat'); render(); };

function vueProfil() {
  const p = S.el.profil, res = [0, 1, 2].map(i => p.residences[i] || { label: '', adresse: '', lat: null, lon: null, rayon: 10 });
  return `<section class="carte"><h2>Mon profil</h2><div class="deux">
      <label>Prénom<input id="p_prenom" value="${esc(p.prenom)}" maxlength="40"></label>
      <label>Nom <span class="doux petit">(2 premières lettres)</span><input id="p_nom" value="${esc(p.nom)}" maxlength="2" style="text-transform:uppercase"></label>
      <label>Classe<select id="p_classe">${S.classes.map(c => `<option value="${c.id}" ${c.id === p.classeId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></label></div>
    <p class="doux petit">🔒 Pour protéger tes données, l’application ne garde que ton prénom et les 2 premières lettres de ton nom : ni e-mail, ni téléphone, ni adresse.</p></section>
  <section class="carte"><h2>Mes communes de résidence possibles</h2>
    <p class="doux">Indique 2 ou 3 communes d’où tu peux partir en stage (chez tes parents, un grand-parent, un internat…) et, pour chacune, la distance que tu peux parcourir.
      <b>Seul le nom de la commune est enregistré, jamais ton adresse.</b> Les distances sont calculées depuis le centre de la commune.</p>
    <div class="grille">${res.map((r, i) => `<div class="carte" style="margin:0"><h3>Lieu ${i + 1}${i === 2 ? ' <span class="doux">(facultatif)</span>' : ''}</h3>
      <label>Nom du lieu<input id="r${i}_label" value="${esc(r.label)}" placeholder="ex. Chez mes parents"></label>
      <div style="font-weight:600;font-size:.88rem">Commune</div>${champGeo('r' + i, r.adresse, r.lat, r.lon, true)}
      <label style="margin-top:12px">Distance de déplacement possible : <b id="r${i}_km">${r.rayon}</b> km
        <input type="range" min="1" max="50" value="${r.rayon}" id="r${i}_rayon" data-i="rayon" data-k="r${i}_km"></label></div>`).join('')}</div>
    <div class="actions"><button class="btn" data-a="sauverProfil">Enregistrer mon profil</button></div></section>`;
}
I.rayon = el => { $('#' + el.dataset.k).textContent = el.value; };
A.sauverProfil = async () => {
  const p = S.el.profil, res = [];
  for (let i = 0; i < 3; i++) {
    const g = lireGeo('r' + i); if (!g.adresse) continue;
    if (g.lat == null) throw new Error(`Lieu ${i + 1} : clique sur « Localiser » et choisis la commune dans la liste.`);
    res.push({ label: val(`r${i}_label`) || `Lieu ${i + 1}`, ...g, rayon: +val(`r${i}_rayon`) });
  }
  const nom = initiales(val('p_nom'));
  if (!nom || !val('p_prenom')) throw new Error('Prénom et 2 premières lettres du nom sont obligatoires.');
  if (!res.length) throw new Error('Indique au moins une commune de résidence (2 ou 3 de préférence).');
  Object.assign(p, { prenom: val('p_prenom'), nom, classeId: val('p_classe') || p.classeId, residences: res });
  delete p.tel; delete p.email;
  await sauver('profil'); journal('Profil mis à jour'); toast('Profil enregistré'); render();
};

/* --- Entreprises proposées --- */
function plusProche(d, e) {
  let best = null;
  for (const r of d.profil.residences) { if (r.lat == null || e.lat == null) continue; const km = dist(r, e); if (!best || km < best.km) best = { km, res: r.label, dans: km <= r.rayon }; }
  return best;
}
function suggestions(d) {
  const pris = new Set(d.demandes.liste.map(x => x.entrepriseId)), out = [];
  for (const e of S.entreprises) {
    if (pris.has(e.id) || e.lat == null || (S.secteur && e.secteur !== S.secteur)) continue;
    let best = null;
    for (const r of d.profil.residences) { if (r.lat == null) continue; const km = dist(r, e); if (km <= r.rayon && (!best || km < best.km)) best = { km, res: r.label }; }
    if (best) out.push({ e, ...best });
  }
  // Adresse précise d'abord (par distance), puis les entreprises situées seulement « au centre de la commune ».
  const approx = x => x.e.precision === 'commune' ? 1 : 0;
  return out.sort((a, b) => approx(a) - approx(b) || a.km - b.km);
}
// Lien vers la fiche Google Maps de l'entreprise (aucune clé d'API nécessaire).
const lienMaps = e => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${e.nom} ${e.adresse || ''}`.trim());
const lienWeb = u => /^https?:\/\//i.test(u) ? u : 'https://' + u;
function ligneEnt(e, pos, p, num) {
  return `<div class="ent ${p ? 'prof' : ''}" data-ent="${e.id}"><input type="checkbox" class="sel" value="${e.id}" data-km="${pos ? pos.km.toFixed(1) : ''}" aria-label="Sélectionner ${esc(e.nom)}">
    ${num ? `<span class="num ${p ? 'prof' : ''}">${num}</span>` : ''}
    <div class="corps"><b>${esc(e.nom)}</b> ${e.secteur ? `<span class="badge clair">${esc(e.secteur)}</span>` : ''}
      ${e.activite ? `<div class="petit">${esc(e.activite)}</div>` : ''}
      <div class="petit doux">${esc(e.adresse)}${e.precision === 'commune' ? ' <span title="Position approximative : centre de la commune">(position approximative)</span>' : ''}</div>
      <div class="petit">☎ ${esc(e.tel || 'non renseigné')}${e.contact ? ` · Contact : ${esc(e.contact)}` : ''}${e.email ? ` · ${esc(e.email)}` : ''}</div>
      <div class="petit liens-ent">${e.lat != null ? `<button type="button" class="lien" data-a="voirSurCarte" data-id="${e.id}">🗺️ Voir sur la carte</button>` : ''}
        <a href="${esc(lienMaps(e))}" target="_blank" rel="noopener">📍 Google Maps</a>${e.web ? ` <a href="${esc(lienWeb(e.web))}" target="_blank" rel="noopener">🌐 Site web</a>` : ''}</div>
      ${p ? `<div class="petit">💡 Proposée par ${esc(p.profNom)}${p.message ? ` : « ${esc(p.message)} »` : ''}</div>` : ''}</div>
    ${pos ? `<div class="km">${e.precision === 'commune' ? (pos.km < 1 ? 'Dans la commune' : `≈ ${pos.km.toFixed(0)} km`) : `${pos.km.toFixed(1)} km`}<div class="petit doux" style="font-weight:400">de « ${esc(pos.res)} »</div></div>` : ''}</div>`;
}
function vueEntreprises() {
  const d = S.el, loc = d.profil.residences.filter(r => r.lat != null);
  if (!loc.length) return `<section class="carte"><h2>Entreprises proches de chez moi</h2><p>Indique d’abord tes communes de résidence pour recevoir des propositions.</p><button class="btn" data-a="aller" data-v="profil">Compléter mon profil</button></section>`;
  const tout = suggestions(d), nb = d.profil.nbSuggestions || 8;
  if (S.offset >= tout.length) S.offset = 0;
  const page = tout.slice(S.offset, S.offset + nb), pris = new Set(d.demandes.liste.map(x => x.entrepriseId));
  const props = d.prof.propositions.filter(p => !pris.has(p.entrepriseId)).map(p => ({ p, e: S.entreprises.find(e => e.id === p.entrepriseId) })).filter(x => x.e);
  const secteurs = [...new Set(S.entreprises.map(e => e.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  // Points affichés sur la carte : mêmes numéros que dans la liste ; « P1, P2… » pour les propositions des professeurs.
  S.pointsCarte = [...props.map((x, i) => ({ e: x.e, num: 'P' + (i + 1), type: 'prof' })), ...page.map((x, i) => ({ e: x.e, num: String(i + 1), type: 'sugg' })),
    ...d.demandes.liste.map(x => ({ e: S.entreprises.find(e => e.id === x.entrepriseId), statut: x.statut, type: 'demande' })).filter(x => x.e && x.e.lat != null)];
  return `${props.length ? `<section class="carte"><h2>💡 Proposées par mes professeurs</h2>${props.map((x, i) => ligneEnt(x.e, plusProche(d, x.e), x.p, 'P' + (i + 1))).join('')}</section>` : ''}
  <section class="carte"><h2>🗺️ Carte</h2>
    <div id="carte" class="carte-map" role="region" aria-label="Carte de mes communes et des entreprises proposées"><p class="doux" style="padding:12px">Chargement de la carte…</p></div>
    <div class="legende petit"><span><i class="pt maison"></i>Mes communes (cercle = distance possible)</span><span><i class="pt sugg"></i>Entreprises proposées</span>
      ${props.length ? '<span><i class="pt prof"></i>Proposées par un professeur</span>' : ''}${d.demandes.liste.length ? '<span><i class="pt demande"></i>Déjà dans mes appels</span>' : ''}</div></section>
  <section class="carte"><h2>Entreprises proches de chez moi</h2>
    <p class="doux">Autour de ${loc.map(r => `« ${esc(r.label)} » (${r.rayon} km)`).join(', ')} — ${tout.length} entreprise(s) disponible(s), distances à vol d’oiseau.
      <button class="lien" style="display:inline" data-a="aller" data-v="profil">Modifier mes distances</button></p>
    <div class="deux">${secteurs.length ? `<label>Secteur d’activité<select data-c="secteur"><option value="">Tous les secteurs</option>${secteurs.map(s => `<option ${s === S.secteur ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      <label>Nombre de propositions affichées<select data-c="nbSugg">${[5, 6, 7, 8, 9, 10].map(n => `<option ${n === nb ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    ${page.length ? page.map((x, i) => ligneEnt(x.e, x, null, String(i + 1))).join('') : `<p>Aucune entreprise${S.secteur ? ' de ce secteur' : ''} de la base ne se trouve dans tes zones. ${S.secteur ? 'Choisis un autre secteur, ou ' : ''}augmente ta distance de déplacement ou demande conseil à ton professeur.</p>`}
    <div class="actions">${page.length || props.length ? '<button class="btn" data-a="ajouterSelection">📞 Ajouter la sélection à mes appels</button>' : ''}
      ${tout.length > nb ? '<button class="btn sec" data-a="autres">🔄 Voir d’autres propositions</button>' : ''}
      <button class="btn sec" data-a="ajoutManuel">➕ J’ai trouvé une entreprise moi-même</button></div></section>`;
}
C.nbSugg = async el => { S.el.profil.nbSuggestions = +el.value; S.offset = 0; await sauver('profil'); render(); };
C.secteur = el => { S.secteur = el.value; S.offset = 0; render(); };

/* --- Carte (Leaflet + OpenStreetMap : gratuit, sans clé ; chargée seulement sur cette page) --- */
const LEAFLET = { js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  jsSri: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=', cssSri: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=' };
let promesseLeaflet = null;
function chargerLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!promesseLeaflet) promesseLeaflet = new Promise((ok, ko) => {
    const css = document.createElement('link'); Object.assign(css, { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri, crossOrigin: '' });
    const js = document.createElement('script'); Object.assign(js, { src: LEAFLET.js, integrity: LEAFLET.jsSri, crossOrigin: '' });
    js.onload = () => ok(window.L); js.onerror = () => { promesseLeaflet = null; ko(new Error('Carte indisponible (connexion Internet ?)')); };
    document.head.append(css, js);
  });
  return promesseLeaflet;
}
let carte = null, marqueurs = {};
async function afficherCarte() {
  const zone = $('#carte'); if (!zone) return;
  let L;
  try { L = await chargerLeaflet(); } catch (e) { zone.innerHTML = `<p class="doux" style="padding:12px">${esc(e.message)}</p>`; return; }
  if (!document.body.contains(zone)) return;   // la page a changé entre-temps
  if (carte) { carte.remove(); carte = null; }
  zone.innerHTML = '';
  carte = L.map(zone, { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(carte);
  const zoneVue = [];
  for (const r of S.el.profil.residences.filter(r => r.lat != null)) {
    L.circle([r.lat, r.lon], { radius: r.rayon * 1000, color: '#2563eb', weight: 2, fillOpacity: .06 }).addTo(carte);
    L.marker([r.lat, r.lon], { icon: L.divIcon({ className: '', html: '<span class="pin maison">🏠</span>', iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: -500 })
      .bindPopup(`<b>${esc(r.label)}</b><br>${esc(r.adresse)}<br>Distance possible : ${r.rayon} km`).addTo(carte);
    const dLat = r.rayon / 111, dLon = r.rayon / (111 * Math.cos(r.lat * Math.PI / 180));
    zoneVue.push([r.lat - dLat, r.lon - dLon], [r.lat + dLat, r.lon + dLon]);
  }
  marqueurs = {};
  // Plusieurs entreprises au même point (souvent « centre de la commune ») : on les écarte en spirale pour qu'elles restent visibles.
  const occupes = { };
  for (const r of S.el.profil.residences) if (r.lat != null) occupes[r.lat.toFixed(3) + ',' + r.lon.toFixed(3)] = 1;
  const placer = e => {
    const k = e.lat.toFixed(3) + ',' + e.lon.toFixed(3), n = occupes[k] = (occupes[k] || 0) + 1;
    if (n === 1) return [e.lat, e.lon];
    const a = n * 2.4, d = 0.006 * Math.sqrt(n);   // environ 650 m × √n : visible au zoom de la commune
    return [e.lat + d * Math.sin(a), e.lon + d * Math.cos(a) / Math.cos(e.lat * Math.PI / 180)];
  };
  for (const p of S.pointsCarte || []) {
    const e = p.e, pos = plusProche(S.el, e);
    const couleur = p.type === 'demande' ? (STATUTS[p.statut] || STATUTS.a_appeler)[1] : null;
    const html = p.type === 'demande' ? `<span class="pin demande" style="background:${couleur}">✓</span>` : `<span class="pin ${p.type}${e.precision === 'commune' ? ' approx' : ''}">${esc(p.num)}</span>`;
    marqueurs[e.id] = L.marker(placer(e), { icon: L.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] }), zIndexOffset: p.type === 'demande' ? 0 : 500 })
      .bindPopup(`<b>${esc(e.nom)}</b>${e.secteur ? `<br><i>${esc(e.secteur)}</i>` : ''}<br>${esc(e.adresse)}${e.precision === 'commune' ? '<br><i>Position approximative (centre de la commune)</i>' : ''}${pos ? `<br>${e.precision === 'commune' ? '≈ ' : ''}${pos.km.toFixed(1)} km de « ${esc(pos.res)} »` : ''}
        ${e.tel ? `<br>☎ <a href="tel:${esc(e.tel.replace(/[^\d+]/g, ''))}">${esc(e.tel)}</a>` : ''}${p.type === 'demande' ? `<br>Dans mes appels : ${(STATUTS[p.statut] || STATUTS.a_appeler)[0]}` : ''}
        <br><a href="${esc(lienMaps(e))}" target="_blank" rel="noopener">📍 Ouvrir dans Google Maps</a>`).addTo(carte);
  }
  if (zoneVue.length) carte.fitBounds(zoneVue, { padding: [10, 10] }); else carte.setView([49.6175, 0.7536], 11);
}
A.voirSurCarte = el => {
  const m = marqueurs[el.dataset.id]; if (!carte || !m) return;
  $('#carte').scrollIntoView({ behavior: 'smooth', block: 'center' });
  carte.setView(m.getLatLng(), Math.max(carte.getZoom(), 14)); m.openPopup();
};
A.autres = () => { S.offset += S.el.profil.nbSuggestions || 8; render(); };
const nouvelleDemande = (e, km) => ({
  id: uid(), entrepriseId: e.id || null, nom: e.nom, secteur: e.secteur || '', adresse: e.adresse || '', tel: e.tel || '', email: e.email || '', contact: e.contact || '',
  km: km === '' || km == null ? null : +km, statut: 'a_appeler', interlocuteur: '', reponse: '', suite: '', dateRelance: '', appels: [], creeLe: maintenant(), majLe: maintenant(),
});
A.ajouterSelection = async () => {
  const sel = $$('.sel:checked'); if (!sel.length) throw new Error('Coche au moins une entreprise.');
  for (const c of sel) { const e = S.entreprises.find(x => x.id === c.value); if (e && !S.el.demandes.liste.some(x => x.entrepriseId === e.id)) S.el.demandes.liste.push(nouvelleDemande(e, c.dataset.km)); }
  await sauver('demandes'); journal(`${sel.length} entreprise(s) ajoutée(s) à la liste d’appels`);
  S.vue = 'suivi'; render(); toast('Entreprises ajoutées à tes appels');
};
A.ajoutManuel = () => modal(`<h2>Ajouter une entreprise trouvée par moi-même</h2><label>Nom de l’entreprise<input id="m_nom"></label><label>Adresse<input id="m_adresse"></label>
  <div class="deux"><label>Téléphone<input id="m_tel"></label><label>Personne à contacter<input id="m_contact"></label></div><button class="btn" data-a="sauverManuel">Ajouter à mes appels</button>`);
A.sauverManuel = async () => {
  if (!val('m_nom')) throw new Error('Indique le nom de l’entreprise.');
  S.el.demandes.liste.push(nouvelleDemande({ nom: val('m_nom'), adresse: val('m_adresse'), tel: val('m_tel'), contact: val('m_contact') }));
  await sauver('demandes'); journal(`Entreprise ajoutée par l’élève : ${val('m_nom')}`); modal(''); S.vue = 'suivi'; render();
};

/* --- Suivi des appels --- */
function carteDemande(x, lecture) {
  const [l, c] = STATUTS[x.statut] || STATUTS.a_appeler, li = (t, v) => v ? `<dt>${t}</dt><dd>${esc(v)}</dd>` : '';
  const retard = x.dateRelance && x.dateRelance <= today() && !['refus', 'convention'].includes(x.statut);
  return `<div class="demande" style="--c:${c}"><div class="tete"><div><b>${esc(x.nom)}</b>${x.secteur ? ` <span class="badge clair">${esc(x.secteur)}</span>` : ''}${x.km != null ? ` <span class="petit doux">· ${(+x.km).toFixed(1)} km</span>` : ''}</div>
      <span class="badge" style="background:${c}">${l}</span></div>
    <dl>${li('Téléphone', x.tel)}${li('Adresse', x.adresse)}${li('Qui j’ai eu', x.interlocuteur)}${li('Réponse', x.reponse)}${li('Suite à donner', x.suite)}
      ${x.dateRelance ? `<dt>Relance prévue</dt><dd>${fmt(x.dateRelance)}${retard ? ' <span class="badge" style="background:#dc2626">à faire</span>' : ''}</dd>` : ''}</dl>
    ${x.appels.length ? `<details class="petit"><summary>Historique (${x.appels.length} appel(s))</summary>${x.appels.map(a => `<div>• ${fmtDT(a.date)} — ${(STATUTS[a.statut] || [''])[0]}${a.interlocuteur ? ` — ${esc(a.interlocuteur)}` : ''}${a.reponse ? ` : ${esc(a.reponse)}` : ''}</div>`).join('')}</details>` : ''}
    ${lecture ? '' : `<div class="actions"><button class="btn mini" data-a="fiche" data-id="${x.id}">📞 Fiche d’appel</button><button class="btn mini danger" data-a="supDemande" data-id="${x.id}">Retirer</button></div>`}</div>`;
}
function vueSuivi() {
  const l = S.el.demandes.liste;
  return `<section class="carte"><h2>Ma console d’appels</h2>${barre(niveau(S.el))}
    <p class="doux" style="margin-top:8px">Ouvre la « fiche d’appel » avant de téléphoner : ton memento s’affiche à côté, et tu notes qui tu as eu, la réponse et la suite à donner.</p>
    <div class="actions"><button class="btn sec" data-a="aller" data-v="entreprises">🏢 Choisir d’autres entreprises</button><button class="btn sec" data-a="ajoutManuel">➕ Ajouter une entreprise</button></div></section>
  ${l.length ? [...l].reverse().map(x => carteDemande(x)).join('') : '<section class="carte"><p>Tu n’as encore sélectionné aucune entreprise.</p></section>'}`;
}
function blocMemento(m) {
  const vide = !CHAMPS.memento.some(([k]) => (m[k] || '').trim());
  return `<div class="memo"><b>📝 Mon memento</b>${vide ? '<p class="doux">Ton memento est vide : prépare-le avant d’appeler.</p>' : CHAMPS.memento.map(([k, l]) => m[k] ? `<h4>${l}</h4><p>${esc(m[k])}</p>` : '').join('')}</div>`;
}
A.fiche = el => {
  const x = S.el.demandes.liste.find(d => d.id === el.dataset.id); if (!x) return;
  modal(`<h2>📞 ${esc(x.nom)}</h2><div class="grille"><div>${blocMemento(S.el.memento)}</div><div>
    <p>${x.tel ? `<a class="tel" href="tel:${esc(x.tel.replace(/[^\d+]/g, ''))}">☎ ${esc(x.tel)}</a>` : '<span class="doux">Téléphone non renseigné</span>'}<br><span class="petit doux">${esc(x.adresse)}${x.contact ? ` · Demander : ${esc(x.contact)}` : ''}</span></p>
    <label>Où en est cette demande ?<select id="d_statut">${Object.entries(STATUTS).map(([k, [l]]) => `<option value="${k}" ${k === x.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Qui ai-je eu au téléphone ?<input id="d_interlocuteur" value="${esc(x.interlocuteur)}" placeholder="Nom et fonction"></label>
    <label>Quelle réponse ai-je eue ?<textarea id="d_reponse" rows="3">${esc(x.reponse)}</textarea></label>
    <label>Quelle suite dois-je donner ?<textarea id="d_suite" rows="2" placeholder="Envoyer mon CV, rappeler jeudi, me présenter le…">${esc(x.suite)}</textarea></label>
    <label>Date de relance ou de rendez-vous<input type="date" id="d_relance" value="${esc(x.dateRelance)}"></label>
    <button class="btn" data-a="sauverFiche" data-id="${x.id}">Enregistrer</button></div></div>`, true);
};
A.sauverFiche = async el => {
  const x = S.el.demandes.liste.find(d => d.id === el.dataset.id), avant = niveau(S.el);
  Object.assign(x, { statut: val('d_statut'), interlocuteur: val('d_interlocuteur'), reponse: val('d_reponse'), suite: val('d_suite'), dateRelance: val('d_relance'), majLe: maintenant() });
  if (x.statut !== 'a_appeler') x.appels.push({ date: maintenant(), statut: x.statut, interlocuteur: x.interlocuteur, reponse: x.reponse });
  await sauver('demandes');
  const apres = niveau(S.el);
  journal(`${x.nom} : ${STATUTS[x.statut][0]}${x.interlocuteur ? ` (contact : ${x.interlocuteur})` : ''}${apres !== avant ? ` — niveau ${avant} → ${apres}` : ''}`);
  modal(''); render(); toast(apres > avant ? `Bravo ! Tu passes au niveau ${apres} : ${NIV[apres].l}` : 'Fiche enregistrée');
};
A.supDemande = async el => {
  const l = S.el.demandes.liste, x = l.find(d => d.id === el.dataset.id);
  if (!x || !confirm(`Retirer « ${x.nom} » de tes appels ?`)) return;
  l.splice(l.indexOf(x), 1); await sauver('demandes'); journal(`Entreprise retirée : ${x.nom}`); render();
};

/* --- CV, lettre, memento --- */
function blocCorrection(doc) {
  const c = doc.correction; if (!c && !doc.valide) return '';
  return `<div class="correction ${doc.valide ? 'valide' : ''}"><b>${doc.valide ? '✅ Document validé' : '💬 Corrigé'}${c ? ` par ${esc(c.par)} le ${fmtDT(c.date)}` : ''}</b>${c && c.commentaire ? `\n${esc(c.commentaire)}` : ''}</div>`;
}
function formDoc(type, doc) {
  return CHAMPS[type].map(([k, l, ph, rows]) => `<label>${l}${rows === 1 ? `<input id="f_${k}" value="${esc(doc[k])}" placeholder="${esc(ph)}">` : `<textarea id="f_${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(doc[k])}</textarea>`}</label>`).join('');
}
function lireDoc(type, doc) { for (const [k] of CHAMPS[type]) doc[k] = $('#f_' + k).value; }
function vueDoc(type) {
  const doc = S.el[type];
  if (type !== 'memento') return vueDepot(type, doc);
  return `<section class="carte"><h2>${TITRES[type]}</h2><p class="doux">Ton aide-mémoire pour téléphoner : quelques mots ou un texte pour te présenter personnellement et professionnellement. Il s’affiche dans chaque fiche d’appel.</p>
    <div class="alerte info petit">🔒 N’écris ici ni ton nom de famille, ni ton adresse, ni ton numéro de téléphone.</div>
    ${blocCorrection(doc)}${formDoc(type, doc)}
    <div class="actions"><button class="btn" data-a="sauverDoc" data-t="${type}">Enregistrer</button></div></section>`;
}
// CV et lettre : rédigés par l'élève, déposés en PDF dans l'espace documentaire de L'Educ de Normandie.
function vueDepot(type, doc) {
  const quoi = type === 'cv' ? 'ton CV' : 'ta lettre de motivation', fichier = type === 'cv' ? 'CV' : 'Lettre-motivation';
  return `<section class="carte"><h2>${TITRES[type]}</h2>${blocCorrection(doc)}
    <p>${doc.deposeLe ? `✅ Déposé${doc.aRelire ? ' et signalé à ton professeur' : ''} le <b>${fmtDT(doc.deposeLe)}</b>.` : '⬜ Pas encore déposé.'}</p>
    <ol>
      <li>Rédige ${quoi} (traitement de texte, modèle conseillé par ton professeur…) et enregistre-le <b>en PDF</b>, par exemple <code>${fichier}.pdf</code>.</li>
      <li>Ouvre <b>L’Educ de Normandie</b> (ENT) › <b>Espace documentaire</b>, et dépose le PDF dans un dossier <b>Stage</b>.</li>
      <li>Partage le fichier avec ton professeur (bouton <b>Partager</b>) pour qu’il puisse le lire et l’annoter.</li>
      <li>Reviens ici et clique sur le bouton ci-dessous pour le prévenir.</li>
    </ol>
    <p class="doux petit">🔒 Ton CV et ta lettre restent dans l’ENT : cette application n’en garde aucune copie.</p>
    <div class="actions"><button class="btn" data-a="deposer" data-t="${type}">📤 ${doc.deposeLe ? 'J’ai mis à jour' : 'J’ai déposé'} ${quoi} sur l’ENT</button></div></section>`;
}
A.deposer = async el => {
  const t = el.dataset.t, ancien = S.el[t];
  // On réécrit un document propre (seulement le suivi), sans aucun texte de CV ou de lettre.
  S.el[t] = { deposeLe: maintenant(), aRelire: true, valide: false, correction: ancien.correction || null };
  await sauver(t); journal(`${TITRES[t]} déposé sur l’ENT`); toast('Ton professeur est prévenu'); render();
};
A.sauverDoc = async el => {
  const t = el.dataset.t, doc = S.el[t]; lireDoc(t, doc);
  doc.aRelire = true; doc.valide = false; doc.majLe = maintenant();
  await sauver(t); journal(`${TITRES[t]} mis à jour`); toast('Enregistré — ton professeur pourra le relire'); render();
};

/* ---------- Événements ---------- */
// Retour visuel : le bouton cliqué affiche un indicateur d'attente et ne peut pas être recliqué
// tant que l'action (souvent 1 à 2 s avec Google) n'est pas terminée.
function lancer(f, el, ev) {
  const bouton = el && el.tagName === 'BUTTON' ? el : null;
  if (bouton && bouton.classList.contains('occupe')) return;
  let minuteur = null;
  if (bouton) minuteur = setTimeout(() => { bouton.classList.add('occupe'); bouton.setAttribute('aria-busy', 'true'); }, 120);
  (async () => f(el, ev))().catch(e => toast(e.message || 'Erreur', true)).finally(() => {
    clearTimeout(minuteur);
    if (bouton) { bouton.classList.remove('occupe'); bouton.removeAttribute('aria-busy'); }
  });
}
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el || !A[el.dataset.a]) return;
  if (el.tagName === 'BUTTON' || el.tagName === 'A') ev.preventDefault();
  lancer(A[el.dataset.a], el, ev);
});
document.addEventListener('change', ev => { const f = C[ev.target.dataset.c]; if (f) lancer(f, ev.target, ev); });
document.addEventListener('input', ev => {
  const t = ev.target, f = I[t.dataset.i]; if (f) lancer(f, t, ev);
  if (t.classList.contains('geo-adr')) { const p = t.dataset.p; $('#' + p + '_lat').value = ''; $('#' + p + '_lon').value = ''; $('#' + p + '_etat').textContent = 'Saisie modifiée : clique sur « Localiser ».'; }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && $('#modal').innerHTML) modal('');
  if (ev.key !== 'Enter') return;
  if (ev.target.matches('.auth input')) { const b = $('.auth .btn'); if (b) b.click(); }
  else if (ev.target.matches('.geo-adr')) { ev.preventDefault(); ev.target.parentElement.querySelector('button').click(); }
  else if (ev.target.matches('.eleve')) ev.target.click();
});

// Rafraîchissement périodique (conseils reçus côté élève, activité des élèves côté professeur)
setInterval(async () => {
  if (!S.user || $('#modal').innerHTML || S.dossier || document.hidden) return;
  try {
    if (S.user.role === 'prof') { if (S.vue === 'tableau') { await chargerEleves(); majListe(); } }
    else if (S.vue === 'accueil') {
      await chargerCommun(); S.el.prof = Object.assign(DEF.prof(), await getDoc(`eleve/${S.user.id}/prof`) || {});
      if (S.vue === 'accueil' && !$('#modal').innerHTML) render();
    }
  } catch { /* prochain essai */ }
}, 60000);

window.addEventListener('DOMContentLoaded', async () => {
  if (S.token) {
    try { S.user = await api('GET', '/api/moi'); await charger(); }
    catch (e) {
      S.user = null;
      if (e.reseau) horsLigne = true;   // coupure réseau : on garde la session pour la prochaine ouverture
      else { S.token = ''; localStorage.removeItem('stages_token'); }
    }
  }
  if (horsLigne) { $('#app').innerHTML = `<div class="auth"><div class="carte" style="text-align:center"><h1>🎓 Suivi des stages</h1><p>📡 Pas de connexion au serveur.</p><p class="doux">Vérifie ta connexion Internet puis réessaie.</p><button class="btn" data-a="recharger">Réessayer</button></div></div>`; return; }
  if (!S.user) await chargerPublic();
  render(); rappelQuotidien();
});
let horsLigne = false;
A.recharger = () => location.reload();

/* ---------- Application installable (PWA) ---------- */
let invite = null;   // proposition d'installation du navigateur (Chrome, Edge, Android)
const installee = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const surIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function blocInstaller() {
  if (installee()) return '';
  if (invite) return `<div class="installer"><button class="btn sec" data-a="installer">📲 Installer l’application</button></div>`;
  if (surIOS()) return `<div class="installer petit doux">📲 Pour installer l’application : bouton <b>Partager</b> de Safari, puis « Sur l’écran d’accueil ».</div>`;
  return '';
}
function majInstaller() { for (const z of $$('.zone-installer')) z.innerHTML = blocInstaller(); }
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); invite = ev; majInstaller(); });
window.addEventListener('appinstalled', () => { invite = null; majInstaller(); toast('Application installée'); });
A.installer = async () => { if (!invite) return; invite.prompt(); await invite.userChoice; invite = null; majInstaller(); };
if ('serviceWorker' in navigator && window.isSecureContext) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
