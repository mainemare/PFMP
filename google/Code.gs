/**
 * Suivi des stages - API pour Google Apps Script.
 * Les donnees sont rangees dans l'onglet "donnees" du classeur Google Sheets auquel ce script est attache.
 * Mise en place : voir GOOGLE.txt (a la racine du projet).
 *
 * Contenu de l'onglet "donnees" : colonne A = cle du document, B = date de mise a jour,
 * C et suivantes = le document au format JSON (decoupe en morceaux si besoin). Ne pas le modifier a la main.
 */
const FEUILLE = 'donnees';
const MORCEAU = 40000;                       // une cellule Google Sheets contient au plus 50 000 caracteres
const SECTIONS = ['profil', 'cv', 'lettre', 'memento', 'demandes', 'journal', 'etat', 'prof', 'bord', 'portfolio'];
const SESSION_MS = 12 * 3600 * 1000;
const ITERATIONS = 300;

/** A lancer une fois depuis l'editeur apres chaque mise a jour : autorise l'envoi d'e-mails (protocoles d'accord)
 *  et l'enregistrement des conventions chiffrees dans votre Google Drive, puis affiche le code « chef d'etablissement ». */
function autoriser() {
  Logger.log("Envoi d'e-mails autorise. E-mails encore disponibles aujourd'hui : " + MailApp.getRemainingDailyQuota());
  Logger.log('Dossier des conventions (chiffrees) : ' + dossierConventions().getName());
  Logger.log('Dossier des CV et lettres (prive) : ' + dossierFichiers().getName());
  Logger.log("Code « chef d'etablissement » (proviseur, adjoint ou DDFPT) : " + config().codeChef);
  Logger.log("Code d'inscription du DDFPT : " + config().codeDdfpt);
}
function autoriserEnvoiMail() { autoriser(); }   // ancien nom, garde pour compatibilite

/** A lancer une fois depuis l'editeur (bouton Executer) : prepare le classeur et affiche les codes d'inscription. */

function installer() {
  const c = config();
  table();
  Logger.log("Code d'inscription des professeurs : " + c.codeProf);
  Logger.log("Code d'inscription des eleves      : " + c.codeEleve);
  Logger.log("Code d'inscription du DDFPT        : " + c.codeDdfpt);
}

// Pour changer un code : Parametres du projet (roue dentee) > Proprietes du script > CODE_PROF ou CODE_ELEVE.

function doGet() {
  return ContentService.createTextOutput('API Suivi des stages : en service.');
}

function doPost(e) {
  let rep;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    rep = traiter(req);
  } catch (err) {
    if (err && err.http) rep = { s: err.http, d: { erreur: err.message } };
    else { console.error(err && err.stack || err); rep = { s: 500, d: { erreur: 'serveur' } }; }
  }
  return ContentService.createTextOutput(JSON.stringify(rep)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Outils ---------- */
const ok = d => ({ s: 200, d: d });
const ko = (s, erreur) => ({ s: s, d: { erreur: erreur } });
const octets = s => Utilities.newBlob(String(s)).getBytes();
const hasard = n => Utilities.getUuid().replace(/-/g, '').slice(0, n);

function config() {
  const p = PropertiesService.getScriptProperties();
  const val = (cle, defaut) => { let v = p.getProperty(cle); if (!v) { v = defaut(); p.setProperty(cle, v); } return v; };
  return {
    secret: val('SECRET', () => Utilities.getUuid() + Utilities.getUuid()),
    codeProf: val('CODE_PROF', () => 'PROF-' + hasard(6).toUpperCase()),
    codeEleve: val('CODE_ELEVE', () => 'ELEVE-' + hasard(6).toUpperCase()),
    codeChef: val('CODE_CHEF', () => 'CHEF-' + hasard(10).toUpperCase()),
    codeDdfpt: val('CODE_DDFPT', () => 'DDFPT-' + hasard(8).toUpperCase()),
    codeOffres: val('CODE_OFFRES', () => hasard(12)),   // dans le lien donne aux entreprises pour deposer une offre
  };
}

function hacher(motdepasse, sel) {
  const cle = octets(sel);
  let h = Utilities.computeHmacSha256Signature(octets(motdepasse), cle);
  for (let i = 0; i < ITERATIONS; i++) h = Utilities.computeHmacSha256Signature(h, cle);
  return Utilities.base64Encode(h);
}
function signer(corps) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(octets(corps), octets(config().secret))).replace(/=+$/, '');
}
function creerJeton(u) {
  const corps = Utilities.base64EncodeWebSafe(JSON.stringify({ i: u.id, v: u.v || 0, e: Date.now() + SESSION_MS })).replace(/=+$/, '');
  return corps + '.' + signer(corps);
}
function lireJeton(jeton) {
  const parts = String(jeton || '').split('.');
  if (parts.length !== 2 || signer(parts[0]) !== parts[1]) return null;
  try {
    let b = parts[0]; while (b.length % 4) b += '=';
    const o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString());
    if (!(o.e > Date.now())) return null;
    const u = comptes().find(x => x.id === o.i);
    return u && (u.v || 0) === o.v ? u : null;
  } catch (e) { return null; }
}

// Limitation des echecs de connexion (8 par quart d'heure et par identifiant).
function trop(cle, max) { return Number(CacheService.getScriptCache().get(cle) || 0) >= max; }
function compter(cle) { const c = CacheService.getScriptCache(); c.put(cle, String(Number(c.get(cle) || 0) + 1), 900); }

/* ---------- Stockage dans le classeur ---------- */
let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FEUILLE) || ss.insertSheet(FEUILLE);
  const lr = sh.getLastRow(), lc = sh.getLastColumn(), m = new Map();
  if (lr > 0 && lc > 0) {
    sh.getRange(1, 1, lr, lc).getValues().forEach((r, i) => {
      if (r[0]) m.set(String(r[0]), { ligne: i + 1, texte: r.slice(2).map(String).join('') });
    });
  }
  TABLE = { sh: sh, m: m, lr: lr, lc: lc };
  return TABLE;
}
function getDoc(cle) { const x = table().m.get(cle); return x && x.texte ? x.texte : 'null'; }
function setDoc(cle, texte) {
  const t = table(), morceaux = [];
  for (let i = 0; i < texte.length; i += MORCEAU) morceaux.push(texte.slice(i, i + MORCEAU));
  const largeur = Math.max(morceaux.length, t.lc - 2, 1) + 2;
  let ligne;
  if (t.m.has(cle)) ligne = t.m.get(cle).ligne; else { t.lr += 1; ligne = t.lr; }
  const vals = [cle, new Date().toISOString()].concat(morceaux);
  while (vals.length < largeur) vals.push('');
  // Format "texte brut" : sinon Google Sheets transformerait certains morceaux en nombres ou en formules.
  t.sh.getRange(ligne, 1, 1, largeur).setNumberFormat('@').setValues([vals]);
  t.lc = Math.max(t.lc, largeur);
  t.m.set(cle, { ligne: ligne, texte: texte });
}
function supprimerDocs(prefixe) {
  const t = table(), lignes = [];
  t.m.forEach((x, cle) => { if (cle.indexOf(prefixe) === 0) lignes.push(x.ligne); });
  lignes.sort((a, b) => b - a).forEach(l => t.sh.deleteRow(l));
  TABLE = null;
}
const comptes = () => JSON.parse(getDoc('systeme/comptes')) || [];
const sauverComptes = l => setDoc('systeme/comptes', JSON.stringify(l));
// L'adresse e-mail n'existe que pour les professeurs (jamais pour les eleves) et n'est renvoyee qu'au professeur lui-meme.
const userInfo = u => ({ id: u.id, role: u.role, nom: u.nom, prenom: u.prenom, identifiant: u.identifiant, classeId: u.classeId || null,
  email: u.role !== 'eleve' ? (u.email || '') : undefined, chef: u.role === 'prof' || u.role === 'ddfpt' ? !!u.chef : undefined });

/* ---------- Conventions : contenu chiffre dans le navigateur, range dans un dossier Google Drive ----------
 * Le classeur ne garde que des informations de suivi (qui a signe, quand). Le contenu (identite de l'eleve,
 * signatures) est chiffre avec une cle qui ne figure que dans le lien de signature : ce script ne peut pas le lire. */
const ROLES_CONVENTION = ['eleve', 'representant', 'entreprise', 'tuteur', 'referent', 'chef'];
const ROLES_EXTERNES = ['representant', 'entreprise', 'tuteur'];   // signent avec un code ; les autres avec leur compte
// Code saisi : majuscules, sans espaces ni tirets, puis remis au format XXXX-XXXX.
const normaliserCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
function dossierConventions() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('DOSSIER_CONVENTIONS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprime : on le recree */ } }
  const f = DriveApp.createFolder('Suivi des stages - conventions (chiffrees, ne pas modifier)');
  p.setProperty('DOSSIER_CONVENTIONS', f.getId());
  return f;
}
const lireFichierConv = id => JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString());
function ecrireFichierConv(id, nom, obj) {
  const t = JSON.stringify(obj);
  if (id) { DriveApp.getFileById(id).setContent(t); return id; }
  return dossierConventions().createFile(nom, t, 'application/json').getId();
}

/* ---------- CV et lettres de motivation (PDF) : dossier prive du Drive, jamais partage ----------
 * L'identifiant du fichier est garde dans le classeur sous eleve/<id>/fichier-cv (cle inaccessible par /api/doc :
 * un eleve ne peut donc pas faire lire un autre fichier du Drive). */
const TYPES_FICHIER = ['cv', 'lettre'];
const MAX_PDF = 4 * 1024 * 1024;
function dossierFichiers() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('DOSSIER_FICHIERS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprime : on le recree */ } }
  const f = DriveApp.createFolder('Suivi des stages - CV et lettres (prive, ne pas partager)');
  p.setProperty('DOSSIER_FICHIERS', f.getId());
  return f;
}
function supprimerFichiersDe(eleveId) {
  TYPES_FICHIER.forEach(t => {
    const m = JSON.parse(getDoc('eleve/' + eleveId + '/fichier-' + t));
    if (m && m.id) { try { DriveApp.getFileById(m.id).setTrashed(true); } catch (e) { /* deja supprime */ } }
  });
  // Photos du journal de bord
  table().m.forEach((x, cle) => {
    if ((cle.indexOf('eleve/' + eleveId + '/photo-') !== 0 && cle.indexOf('eleve/' + eleveId + '/annexe-') !== 0) || !x.texte || x.texte === 'null') return;
    const m = JSON.parse(x.texte); if (m && m.id) { try { DriveApp.getFileById(m.id).setTrashed(true); } catch (e) { /* deja supprime */ } }
  });
}

/* ---------- Journal de bord : une photo par jour de stage, dans le meme dossier prive du Drive ----------
 * Le texte est dans la section « bord » du dossier de l'eleve ; la photo est rangee dans le Drive et son identifiant
 * garde sous eleve/<id>/photo-AAAA-MM-JJ (cle inaccessible par /api/doc). */
// Memes routes pour les annexes du portfolio (b.annexe = 1 a 6 au lieu de b.date) : cle eleve/<id>/annexe-N.
function routesJournal(route, b, user, estProf) {
  const date = String(b.date || ''), annexe = b.annexe != null ? String(b.annexe) : null;
  if (annexe !== null ? !/^[1-6]$/.test(annexe) : !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ko(400, 'invalide');
  const eleveId = user.role === 'eleve' ? user.id : String(b.eleveId || '');
  if (!/^[a-f0-9]{12}$/.test(eleveId) || (!estProf && eleveId !== user.id)) return ko(403, 'interdit');
  const suffixe = annexe !== null ? 'annexe-' + annexe : 'photo-' + date;
  const cle = 'eleve/' + eleveId + '/' + suffixe, meta = JSON.parse(getDoc(cle));
  if (route === 'POST /api/journal/photo/lire') {
    if (!meta || !meta.id) return ko(404, 'introuvable');
    const blob = DriveApp.getFileById(meta.id).getBlob();
    return ok({ img: 'data:' + (meta.type || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()), date: meta.date });
  }
  if (user.role !== 'eleve') return ko(403, 'interdit');
  if (route === 'POST /api/journal/photo') {
    const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.img || ''));
    if (!m || m[2].length > 2000000) return ko(400, 'photo_invalide');
    if (meta && meta.id) { try { DriveApp.getFileById(meta.id).setTrashed(true); } catch (e) { /* deja supprime */ } }
    const f = dossierFichiers().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], eleveId + '-' + suffixe + (m[1] === 'image/png' ? '.png' : '.jpg')));
    setDoc(cle, JSON.stringify({ id: f.getId(), type: m[1], date: new Date().toISOString() }));
    return ok({ ok: true });
  }
  if (route === 'POST /api/journal/photo/supprimer') {
    if (meta && meta.id) { try { DriveApp.getFileById(meta.id).setTrashed(true); } catch (e) { /* deja supprime */ } }
    setDoc(cle, 'null');
    return ok({ ok: true });
  }
  return ko(404, 'introuvable');
}
function routesFichier(route, b, user, estProf) {
  const type = String(b.type || '');
  if (TYPES_FICHIER.indexOf(type) < 0) return ko(400, 'invalide');
  const eleveId = user.role === 'eleve' ? user.id : String(b.eleveId || '');
  if (!/^[a-f0-9]{12}$/.test(eleveId) || (!estProf && eleveId !== user.id)) return ko(403, 'interdit');
  const cleMeta = 'eleve/' + eleveId + '/fichier-' + type, cleDoc = 'eleve/' + eleveId + '/' + type;
  const meta = JSON.parse(getDoc(cleMeta));

  if (route === 'POST /api/fichier/lire') {
    if (!meta || !meta.id) return ko(404, 'introuvable');
    return ok({ pdf: Utilities.base64Encode(DriveApp.getFileById(meta.id).getBlob().getBytes()), date: meta.date });
  }
  if (user.role !== 'eleve') return ko(403, 'interdit');   // seul l'eleve depose ou retire son document
  if (route === 'POST /api/fichier/deposer') {
    const s = String(b.pdf || '');
    if (s.length > MAX_PDF * 1.4) return ko(413, 'trop_gros');
    const o = Utilities.base64Decode(s);
    if (o.length < 5 || o.length > MAX_PDF || String.fromCharCode(o[0], o[1], o[2], o[3], o[4]) !== '%PDF-') return ko(400, 'pas_un_pdf');
    if (meta && meta.id) { try { DriveApp.getFileById(meta.id).setTrashed(true); } catch (e) { /* deja supprime */ } }
    const date = new Date().toISOString();
    const f = dossierFichiers().createFile(Utilities.newBlob(o, 'application/pdf', eleveId + '-' + type + '.pdf'));
    setDoc(cleMeta, JSON.stringify({ id: f.getId(), date: date, taille: o.length }));
    // Nouvelle version : a relire ; les annotations portaient sur l'ancienne version.
    const d = JSON.parse(getDoc(cleDoc)) || {};
    d.deposeLe = date; d.fichierLe = date; d.taille = o.length; d.aRelire = true; d.valide = false; d.annotations = null;
    setDoc(cleDoc, JSON.stringify(d));
    return ok(d);
  }
  if (route === 'POST /api/fichier/supprimer') {
    if (meta && meta.id) { try { DriveApp.getFileById(meta.id).setTrashed(true); } catch (e) { /* deja supprime */ } }
    setDoc(cleMeta, 'null');
    const d = JSON.parse(getDoc(cleDoc)) || {};
    d.deposeLe = null; d.fichierLe = null; d.taille = 0; d.aRelire = false; d.annotations = null;
    setDoc(cleDoc, JSON.stringify(d));
    return ok(d);
  }
  return ko(404, 'introuvable');
}
function metaConv(id) { return /^[a-f0-9]{16}$/.test(id) ? JSON.parse(getDoc('conv/' + id)) : null; }
function supprimerConventionsDe(eleveId) {
  const t = table(), lignes = [];
  t.m.forEach((x, cle) => { if (cle.indexOf('conv/') === 0 && x.texte && JSON.parse(x.texte).eleveId === eleveId) lignes.push(x.ligne); });
  lignes.sort((a, b) => b - a).forEach(l => t.sh.deleteRow(l));
  TABLE = null;
}
const sauverMetaConv = m => setDoc('conv/' + m.id, JSON.stringify(m));
function toutesConventions() {
  const out = []; table().m.forEach((x, cle) => { if (cle.indexOf('conv/') === 0 && x.texte) out.push(JSON.parse(x.texte)); }); return out;
}
// Vue « publique » du suivi (sans codes ni cle de l'eleve).
const resumeConv = m => ({ id: m.id, eleveId: m.eleveId, demandeId: m.demandeId, classeId: m.classeId, creeLe: m.creeLe, majLe: m.majLe,
  roles: m.roles, signatures: m.signatures, statut: m.statut, version: m.version });
function referentDeClasse(classeId) {
  const cl = ((JSON.parse(getDoc('commun/classes')) || {}).classes || []).find(c => c.id === classeId);
  return cl ? (cl.referentId || '') : '';
}
// Qui peut agir sur une convention, pour quel role.
function peutAgir(m, user, role, code) {
  if (ROLES_EXTERNES.indexOf(role) >= 0) {
    const c = m.codes && m.codes[role];
    if (!c) return false;
    const cle = 'code|' + m.id + '|' + role;
    if (trop(cle, 6)) throw Object.assign(new Error('trop_essais'), { http: 429 });
    if (hacher(normaliserCode(code), c.sel) !== c.hash) { compter(cle); return false; }
    return true;
  }
  if (!user) return false;
  if (role === 'eleve') return user.role === 'eleve' && user.id === m.eleveId;
  if (role === 'referent') { const r = referentDeClasse(m.classeId); return user.role === 'prof' && (!r || r === user.id); }
  if (role === 'chef') return (user.role === 'prof' || user.role === 'ddfpt') && !!user.chef;
  return false;
}
function majDemandeEleve(eleveId, demandeId, fn) {
  const k = 'eleve/' + eleveId + '/demandes', d = JSON.parse(getDoc(k)) || { liste: [] };
  const x = (d.liste || []).find(y => y.id === demandeId);
  if (x) { fn(x); setDoc(k, JSON.stringify(d)); }
}

// Routes des conventions. Renvoie null si la route n'est pas une route de convention.
function routesConvention(route, b, user, jeton) {
  if (route === 'POST /api/convention/lire') {
    // Lecture par le lien : l'acces demande un code (signataires externes) ou un compte (eleve, referent, chef).
    const m = metaConv(String(b.id || '')); if (!m || m.statut === 'annulee') return ko(404, 'convention_introuvable');
    const role = String(b.role || '');
    const lecteurCompte = user && (peutAgir(m, user, 'eleve') || peutAgir(m, user, 'referent') || peutAgir(m, user, 'chef'));
    if (!lecteurCompte && !(ROLES_EXTERNES.indexOf(role) >= 0 && peutAgir(m, null, role, b.code))) return ko(403, ROLES_EXTERNES.indexOf(role) >= 0 ? 'code_convention' : 'pas_lecteur');
    const f = lireFichierConv(m.fichier);
    return ok({ meta: resumeConv(m), chiffre: f.chiffre, sig: f.sig || {}, cleEleve: user && user.id === m.eleveId ? m.cleEleve : undefined });
  }
  if (!user && route !== 'POST /api/convention/signer') return null;

  if (route === 'GET /api/conventions') {
    const l = toutesConventions().filter(m => m.statut !== 'annulee');
    if (user.role === 'prof') return ok(l.map(resumeConv));
    return ok(l.filter(m => m.eleveId === user.id).map(m => Object.assign(resumeConv(m), { cleEleve: m.cleEleve })));
  }
  if (route === 'POST /api/convention/creer') {
    if (user.role !== 'eleve') return ko(403, 'interdit');
    const chiffre = String(b.chiffre || ''), roles = (b.roles || []).filter(r => ROLES_CONVENTION.indexOf(r) >= 0);
    if (!chiffre || chiffre.length > 1500000) return ko(400, 'invalide');
    if (['eleve', 'entreprise', 'referent', 'chef'].some(r => roles.indexOf(r) < 0)) return ko(400, 'invalide');
    const profil = JSON.parse(getDoc('eleve/' + user.id + '/profil')) || {};
    const demandeId = String(b.demandeId || '');
    // Une seule convention active par demande : l'ancienne est remplacee si personne ne l'a encore signee.
    const ancienne = toutesConventions().find(m => m.eleveId === user.id && m.demandeId === demandeId && m.statut !== 'annulee');
    if (ancienne && Object.keys(ancienne.signatures || {}).length) return ko(409, 'convention_deja_signee');
    const codes = {};
    for (const r of ROLES_EXTERNES) {
      if (roles.indexOf(r) < 0) continue;
      const code = normaliserCode((b.codes || {})[r]);
      if (code.length < 8) return ko(400, 'invalide');
      const sel = hasard(32); codes[r] = { sel: sel, hash: hacher(code, sel) };
    }
    const id = ancienne ? ancienne.id : hasard(16);
    const fichier = ecrireFichierConv(ancienne ? ancienne.fichier : null, 'convention-' + id + '.json', { chiffre: chiffre, sig: {} });
    const m = { id: id, eleveId: user.id, demandeId: demandeId, classeId: profil.classeId || user.classeId, creeLe: new Date().toISOString(), majLe: new Date().toISOString(),
      version: ancienne ? (ancienne.version || 1) + 1 : 1, roles: roles, codes: codes, signatures: {}, statut: 'en_cours', fichier: fichier, cleEleve: String(b.cleEleve || '').slice(0, 2000) };
    sauverMetaConv(m);
    majDemandeEleve(user.id, demandeId, x => { x.conventionId = id; });
    return ok(resumeConv(m));
  }
  if (route === 'POST /api/convention/signer') {
    const m = metaConv(String(b.id || '')); if (!m || m.statut === 'annulee') return ko(404, 'convention_introuvable');
    const role = String(b.role || '');
    if (m.roles.indexOf(role) < 0) return ko(400, 'invalide');
    if (!peutAgir(m, user, role, b.code)) return ko(403, ROLES_EXTERNES.indexOf(role) >= 0 ? 'code_convention' : 'pas_signataire');
    if (m.signatures[role]) return ko(409, 'deja_signe');
    const sig = String(b.signature || ''); if (!sig || sig.length > 900000) return ko(400, 'invalide');
    const f = lireFichierConv(m.fichier); f.sig = f.sig || {}; f.sig[role] = sig; ecrireFichierConv(m.fichier, null, f);
    m.signatures[role] = { le: new Date().toISOString(), par: user ? user.prenom + ' ' + user.nom : 'code' };
    m.majLe = new Date().toISOString();
    if (m.roles.every(r => m.signatures[r])) {
      m.statut = 'signee';
      majDemandeEleve(m.eleveId, m.demandeId, x => { x.statut = 'convention'; x.conventionSigneeLe = m.majLe; x.majLe = m.majLe; });
    }
    sauverMetaConv(m);
    return ok(resumeConv(m));
  }
  if (route === 'POST /api/convention/supprimer') {
    const m = metaConv(String(b.id || '')); if (!m) return ko(404, 'convention_introuvable');
    const proprio = user.role === 'eleve' && user.id === m.eleveId;
    if (!(proprio && !Object.keys(m.signatures || {}).length) && !peutAgir(m, user, 'referent')) return ko(403, 'interdit');
    try { DriveApp.getFileById(m.fichier).setTrashed(true); } catch (e) { /* deja supprime */ }
    m.statut = 'annulee'; m.majLe = new Date().toISOString(); delete m.cleEleve; m.codes = {}; sauverMetaConv(m);
    majDemandeEleve(m.eleveId, m.demandeId, x => { delete x.conventionId; if (x.statut === 'convention') x.statut = 'protocole'; });
    return ok({ ok: true });
  }
  if (route === 'POST /api/moi/chef') {
    if (user.role !== 'prof' && user.role !== 'ddfpt') return ko(403, 'interdit');
    const l = comptes(), u = l.find(x => x.id === user.id);
    if (b.retirer) u.chef = false;
    else if (String(b.code || '').trim().toUpperCase() !== config().codeChef.toUpperCase()) return ko(403, 'code_chef');
    else u.chef = true;
    sauverComptes(l);
    return ok(userInfo(u));
  }
  return null;
}

/* ---------- Ordres de mission (visites de stage) : prepares par le professeur, signes par le chef d'etablissement ---------- */
function missions() { const l = []; table().m.forEach((x, cle) => { if (cle.indexOf('mission/') === 0 && x.texte && x.texte !== 'null') l.push(JSON.parse(x.texte)); }); return l; }
/* ---------- Import des offres France Travail (API Offres d'emploi v2) ----------
 * Identifiants de l'application (francetravail.io) : Proprietes du script FT_CLIENT_ID et FT_CLIENT_SECRET (jamais dans l'application).
 * Reglages (departements, mots-cles, alternance) : document commun/francetravail, modifiable dans la console.
 * Les offres trouvees vont dans les offres « a verifier » ; une offre deja vue (publiee ou refusee) n'est pas reproposee. */
const FT_JETON = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_RECHERCHE = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const FT_DEFAUT = () => ({ departements: ['76'], motsCles: ['stage', 'stagiaire'], alternance: true, vus: [], dernier: null });
function jetonFranceTravail() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('FT_CLIENT_ID'), secret = p.getProperty('FT_CLIENT_SECRET');
  if (!id || !secret) throw { http: 400, message: 'ft_non_configure' };
  const corps = { grant_type: 'client_credentials', client_id: id.trim(), client_secret: secret.trim(), scope: (p.getProperty('FT_SCOPE') || 'api_offresdemploiv2 o2dsoffre').trim() };
  const r = UrlFetchApp.fetch(FT_JETON, { method: 'post', muteHttpExceptions: true, followRedirects: false, contentType: 'application/x-www-form-urlencoded',
    headers: { Accept: 'application/json' }, payload: Object.keys(corps).map(k => k + '=' + encodeURIComponent(corps[k])).join('&') });
  const j = lireJsonFT(r, 'jeton');
  if (r.getResponseCode() !== 200 || !j || !j.access_token) { journalFT('jeton', r); throw { http: 502, message: 'ft_identifiants' }; }
  return j.access_token;
}
// Reponse de France Travail : JSON attendu ; sinon on note l'etape, le code HTTP et le debut de la reponse (journal d'execution).
function lireJsonFT(r, etape) {
  try { return JSON.parse(r.getContentText()); } catch (e) { journalFT(etape, r); return null; }
}
function journalFT(etape, r) {
  const t = String(r.getContentText() || '').replace(/\s+/g, ' ').slice(0, 300), h = r.getHeaders ? r.getHeaders() : {};
  Logger.log('France Travail, etape « ' + etape + ' » : HTTP ' + r.getResponseCode() + (h.Location || h.location ? ' -> ' + (h.Location || h.location) : '') + ' : ' + t);
}
/** Diagnostic a lancer depuis l'editeur : affiche dans le journal la reponse de France Travail a chaque etape. */
function testerFranceTravail() {
  const jeton = jetonFranceTravail();
  Logger.log('Jeton obtenu (' + jeton.length + ' caracteres).');
  const r = UrlFetchApp.fetch(FT_RECHERCHE + '?departement=76&motsCles=stage&range=0-4', { headers: { Authorization: 'Bearer ' + jeton, Accept: 'application/json' }, muteHttpExceptions: true });
  journalFT('recherche', r);
}
function niveauxOffreFT(o) {
  const t = [o.intitule, o.description, (o.formations || []).map(f => (f.niveauLibelle || '') + ' ' + (f.domaineLibelle || '')).join(' ')].join(' ').toLowerCase();
  const n = [];
  if (/\bcap\b/.test(t)) n.push('CAP');
  if (/bac ?pro|baccalaur[ée]at professionnel|\bbac\b(?! ?\+)/.test(t)) n.push('Bac pro');
  if (/\bbts\b|bac ?\+ ?2/.test(t) || o.alternance) n.push('BTS');
  return n.length ? n : ['CAP', 'Bac pro', 'BTS'];
}
function versOffre(o) {
  const lieu = o.lieuTravail || {}, c = o.contact || {}, ent = o.entreprise || {};
  const fin = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);   // les offres France Travail n'ont pas de fin de stage : 45 jours de visibilite
  const lien = (o.origineOffre && o.origineOffre.urlOrigine) || ('https://candidat.francetravail.fr/offres/recherche/detail/' + o.id);
  return { id: 'ft-' + o.id, source: 'france_travail', entreprise: String(ent.nom || 'Entreprise (voir l’offre)').slice(0, 120), adresse: String(lieu.libelle || '').slice(0, 200),
    lat: lieu.latitude != null ? +lieu.latitude : null, lon: lieu.longitude != null ? +lieu.longitude : null, secteur: String(o.secteurActiviteLibelle || '').slice(0, 80),
    intitule: String(o.intitule || '').slice(0, 120), description: String(o.description || '').slice(0, 1500), niveaux: niveauxOffreFT(o), debut: '', fin: '', expireLe: fin, places: +o.nombrePostes || 1,
    contact: String(c.nom || '').slice(0, 120), tel: String(c.telephone || '').slice(0, 40), email: String(c.courriel || '').slice(0, 120), lien: /^https:\/\//.test(lien) ? lien : '',
    typeContrat: String(o.typeContratLibelle || o.typeContrat || '') + (o.alternance ? ' · alternance' : ''), deposeLe: o.dateCreation || new Date().toISOString() };
}
function chercherFranceTravail(cfg, vus, trouvees) {
  const jeton = jetonFranceTravail(), recherches = [];
  cfg.departements.forEach(d => {
    cfg.motsCles.forEach(m => recherches.push('departement=' + encodeURIComponent(d) + '&motsCles=' + encodeURIComponent(m)));
    if (cfg.alternance) recherches.push('departement=' + encodeURIComponent(d) + '&natureContrat=E2');   // contrats d'apprentissage (BTS en alternance)
  });
  recherches.slice(0, 20).forEach(q => {
    const r = UrlFetchApp.fetch(FT_RECHERCHE + '?' + q + '&range=0-149', { headers: { Authorization: 'Bearer ' + jeton, Accept: 'application/json' }, muteHttpExceptions: true });
    const code = r.getResponseCode();
    if (code === 204) return;
    const j = lireJsonFT(r, 'recherche ' + q);
    if ((code !== 200 && code !== 206) || !j) { if (j) journalFT('recherche ' + q, r); throw { http: 502, message: 'ft_recherche' }; }
    (j.resultats || []).forEach(o => { if (o && o.id && !vus.has('ft-' + o.id)) trouvees.set('ft-' + o.id, versOffre(o)); });
  });
}

/* ---------- Offres en apprentissage : API de l'Etat (La bonne alternance), api.apprentissage.beta.gouv.fr ----------
 * Cle d'API gratuite (compte sur le site) : Propriete du script LBA_API_KEY. */
const LBA_RECHERCHE = 'https://api.apprentissage.beta.gouv.fr/api/job/v1/search';
const NIVEAU_EUROPEEN = { '3': 'CAP', '4': 'Bac pro', '5': 'BTS' };
function versOffreLba(j) {
  const w = j.workplace || {}, loc = w.location || {}, of = j.offer || {}, ap = j.apply || {}, ct = j.contract || {}, pt = (loc.geopoint && loc.geopoint.coordinates) || [];
  const niv = of.target_diploma && NIVEAU_EUROPEEN[of.target_diploma.european];
  const exp = of.publication && of.publication.expiration ? String(of.publication.expiration).slice(0, 10) : new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  return { id: 'lba-' + j.identifier.id, source: 'apprentissage', entreprise: String(w.name || w.brand || w.legal_name || 'Entreprise (voir l’offre)').slice(0, 120),
    adresse: String(loc.address || '').slice(0, 200), lat: pt.length === 2 ? +pt[1] : null, lon: pt.length === 2 ? +pt[0] : null,
    secteur: String((w.domain && w.domain.naf && w.domain.naf.label) || '').slice(0, 80), intitule: String(of.title || '').slice(0, 120), description: String(of.description || '').slice(0, 1500),
    niveaux: niv ? [niv] : ['CAP', 'Bac pro', 'BTS'], debut: ct.start ? String(ct.start).slice(0, 10) : '', fin: '', expireLe: exp, places: +of.opening_count || 1,
    contact: '', tel: String(ap.phone || '').slice(0, 40), email: '', lien: /^https:\/\//.test(ap.url || '') ? ap.url : '',
    typeContrat: 'Apprentissage' + (of.target_diploma && of.target_diploma.label ? ' · ' + of.target_diploma.label : '') + (ct.duration ? ' · ' + ct.duration + ' mois' : ''),
    deposeLe: (of.publication && of.publication.creation) || new Date().toISOString() };
}
function chercherApprentissage(cfg, vus, trouvees) {
  const cle = PropertiesService.getScriptProperties().getProperty('LBA_API_KEY');
  if (!cle) throw { http: 400, message: 'lba_non_configure' };
  cfg.departements.forEach(d => {
    const r = UrlFetchApp.fetch(LBA_RECHERCHE + '?departements=' + encodeURIComponent(d), { headers: { Authorization: 'Bearer ' + cle.trim(), Accept: 'application/json' }, muteHttpExceptions: true });
    const j = lireJsonFT(r, 'apprentissage ' + d);
    if (r.getResponseCode() !== 200 || !j) { if (j) journalFT('apprentissage ' + d, r); throw { http: 502, message: r.getResponseCode() === 401 || r.getResponseCode() === 403 ? 'lba_cle' : 'lba_recherche' }; }
    (j.jobs || []).forEach(o => { if (o && o.identifier && o.identifier.id && !vus.has('lba-' + o.identifier.id)) trouvees.set('lba-' + o.identifier.id, versOffreLba(o)); });
  });
}

function importerFranceTravail() {
  const cfg = Object.assign(FT_DEFAUT(), JSON.parse(getDoc('commun/francetravail')) || {});
  const p = PropertiesService.getScriptProperties(), vus = new Set(cfg.vus || []), trouvees = new Map(), erreurs = [];
  // Chaque source est independante : une panne de l'une n'empeche pas l'import de l'autre.
  if (p.getProperty('FT_CLIENT_ID')) { try { chercherFranceTravail(cfg, vus, trouvees); } catch (e) { erreurs.push('France Travail : ' + (e && e.message || e)); } }
  if (cfg.apprentissage !== false && p.getProperty('LBA_API_KEY')) { try { chercherApprentissage(cfg, vus, trouvees); } catch (e) { erreurs.push('Apprentissage : ' + (e && e.message || e)); } }
  if (!p.getProperty('FT_CLIENT_ID') && !p.getProperty('LBA_API_KEY')) throw { http: 400, message: 'ft_non_configure' };
  const d = JSON.parse(getDoc('commun/offres_proposees')) || { liste: [] };
  const deja = new Set(d.liste.map(o => o.id)), nouvelles = Array.from(trouvees.values()).filter(o => !deja.has(o.id)).slice(0, Math.max(0, 300 - d.liste.length));
  d.liste = d.liste.concat(nouvelles);
  setDoc('commun/offres_proposees', JSON.stringify(d));
  nouvelles.forEach(o => vus.add(o.id));
  cfg.vus = Array.from(vus).slice(-3000);
  cfg.dernier = { date: new Date().toISOString(), nouvelles: nouvelles.length, trouvees: trouvees.size, erreurs: erreurs };
  setDoc('commun/francetravail', JSON.stringify(cfg));
  if (erreurs.length) Logger.log('Import : ' + erreurs.join(' ; '));
  return cfg.dernier;
}
/** Diagnostic a lancer depuis l'editeur : interroge l'API apprentissage pour le premier departement. */
function testerApprentissage() {
  const cle = PropertiesService.getScriptProperties().getProperty('LBA_API_KEY');
  if (!cle) { Logger.log('Ajoutez d’abord la propriete du script LBA_API_KEY.'); return; }
  const r = UrlFetchApp.fetch(LBA_RECHERCHE + '?departements=76', { headers: { Authorization: 'Bearer ' + cle.trim(), Accept: 'application/json' }, muteHttpExceptions: true });
  const j = lireJsonFT(r, 'apprentissage');
  Logger.log(j && j.jobs ? 'API apprentissage : ' + j.jobs.length + ' offre(s) dans le 76.' : 'Reponse inattendue (voir ci-dessus).');
  if (!j || !j.jobs) journalFT('apprentissage', r);
}
/** A lancer une fois depuis l'editeur, apres avoir renseigne FT_CLIENT_ID et FT_CLIENT_SECRET et/ou LBA_API_KEY :
 *  autorise l'acces a Internet, fait un premier import et programme un import chaque matin. */
function activerImportFranceTravail() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'importQuotidienFranceTravail').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importQuotidienFranceTravail').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Import programme chaque jour vers 6 h. Premier import : ' + JSON.stringify(importQuotidienFranceTravail()));
}
function importQuotidienFranceTravail() {
  const verrou = LockService.getScriptLock(); verrou.waitLock(30000);
  try { TABLE = null; return importerFranceTravail(); }
  catch (e) { Logger.log('Import France Travail impossible : ' + (e && e.message || e)); return { erreur: String(e && e.message || e) }; }
  finally { SpreadsheetApp.flush(); verrou.releaseLock(); }
}

/* ---------- Signature du protocole d'accord par le tuteur, a distance (lien ephemere envoye par SMS) ----------
 * L'eleve chiffre le PDF du protocole dans son navigateur ; la cle n'est que dans le lien (apres « # »).
 * Le fichier chiffre est range dans le dossier des conventions et supprime a l'expiration ou quand l'eleve
 * a recupere la signature. Le tuteur n'a pas besoin de compte. */
const PROTOSIG_ROUTES_PUBLIQUES = ['POST /api/protosig/lire', 'POST /api/protosig/signer'];
function purgerProtosig() {
  const maintenant = Date.now(), aSupprimer = [];
  table().m.forEach((x, cle) => {
    if (cle.indexOf('protosig/') !== 0 || !x.texte || x.texte === 'null') return;
    const m = JSON.parse(x.texte);
    if (m.expire < maintenant) { try { DriveApp.getFileById(m.fichier).setTrashed(true); } catch (e) { /* deja supprime */ } aSupprimer.push(cle); }
  });
  aSupprimer.forEach(cle => supprimerDocs(cle));
}
function routesProtosig(route, b, user) {
  const id = String(b.id || ''), cle = 'protosig/' + id;
  if (route === 'POST /api/protosig/creer') {
    if (!user || user.role !== 'eleve') return ko(403, 'interdit');
    const chiffre = String(b.chiffre || ''), heures = [24, 48, 72].indexOf(+b.heures) >= 0 ? +b.heures : 48;
    if (!chiffre || chiffre.length > 3500000) return ko(413, 'trop_gros');
    purgerProtosig();
    const nouvel = hasard(16), fichier = ecrireFichierConv(null, 'protocole-signature-' + nouvel + '.json', { chiffre: chiffre, sig: null });
    const m = { eleveId: user.id, cree: Date.now(), expire: Date.now() + heures * 3600 * 1000, fichier: fichier, signe: null };
    setDoc('protosig/' + nouvel, JSON.stringify(m));
    return ok({ id: nouvel, expire: new Date(m.expire).toISOString() });
  }
  const m = /^[a-f0-9]{16}$/.test(id) ? JSON.parse(getDoc(cle)) : null;
  if (!m || m.expire < Date.now()) return ko(410, 'lien_expire');
  if (route === 'POST /api/protosig/lire') {
    if (m.signe) return ko(409, 'deja_signe');
    return ok({ chiffre: lireFichierConv(m.fichier).chiffre, expire: new Date(m.expire).toISOString() });
  }
  if (route === 'POST /api/protosig/signer') {
    if (m.signe) return ko(409, 'deja_signe');
    if (trop('protosig|' + id, 10)) return ko(429, 'trop_essais');
    compter('protosig|' + id);
    const sig = String(b.sig || '');
    if (!sig || sig.length > 1500000) return ko(413, 'trop_gros');
    const f = lireFichierConv(m.fichier); f.sig = sig; f.chiffre = null; ecrireFichierConv(m.fichier, null, f);   // le protocole n'est plus utile
    m.signe = new Date().toISOString(); setDoc(cle, JSON.stringify(m));
    return ok({ ok: true });
  }
  if (!user || user.role !== 'eleve' || user.id !== m.eleveId) return ko(403, 'interdit');
  if (route === 'POST /api/protosig/etat') {
    return ok({ signe: m.signe, expire: new Date(m.expire).toISOString(), sig: m.signe ? lireFichierConv(m.fichier).sig : null });
  }
  if (route === 'POST /api/protosig/supprimer') {
    try { DriveApp.getFileById(m.fichier).setTrashed(true); } catch (e) { /* deja supprime */ }
    supprimerDocs(cle);
    return ok({ ok: true });
  }
  return ko(404, 'introuvable');
}

function routesMission(route, b, user) {
  const chef = !!user.chef, id = String(b.id || '');
  if (route === 'GET /api/missions') return ok(missions().filter(m => m.profId === user.id || chef).sort((a, c) => String(c.creeLe).localeCompare(String(a.creeLe))));
  if (route === 'POST /api/mission/enregistrer') {
    const texte = JSON.stringify(b.contenu || null);
    if (!b.contenu || texte.length > 200000) return ko(400, 'invalide');
    let m = /^[a-f0-9]{16}$/.test(id) ? JSON.parse(getDoc('mission/' + id)) : null;
    if (m && m.profId !== user.id) return ko(403, 'interdit');
    // Toute modification annule la signature : le chef d'etablissement doit signer la nouvelle version.
    m = { id: m ? m.id : hasard(16), profId: user.id, profNom: user.prenom + ' ' + user.nom, creeLe: m ? m.creeLe : new Date().toISOString(),
      majLe: new Date().toISOString(), titre: String(b.titre || '').slice(0, 120), contenu: b.contenu, signature: null };
    setDoc('mission/' + m.id, JSON.stringify(m));
    return ok(m);
  }
  const m = /^[a-f0-9]{16}$/.test(id) ? JSON.parse(getDoc('mission/' + id)) : null;
  if (!m) return ko(404, 'introuvable');
  if (route === 'POST /api/mission/signer') {
    if (!chef) return ko(403, 'interdit');
    const img = String(b.img || '');
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(img) || img.length > 400000) return ko(400, 'invalide');
    m.signature = { img: img, par: user.prenom + ' ' + user.nom, date: new Date().toISOString() };
    setDoc('mission/' + m.id, JSON.stringify(m));
    return ok(m);
  }
  if (route === 'POST /api/mission/supprimer') {
    if (m.profId !== user.id && !chef) return ko(403, 'interdit');
    supprimerDocs('mission/' + m.id);
    return ok({ ok: true });
  }
  return ko(404, 'introuvable');
}

/* ---------- Routes (memes chemins que server.js) ---------- */
function traiter(req) {
  const m = String(req.m || 'GET'), chemin = String(req.p || ''), b = req.b || {}, route = m + ' ' + chemin;
  const ecriture = m !== 'GET' && ['POST /api/connexion', 'POST /api/protocole/envoyer', 'POST /api/convention/lire', 'POST /api/fichier/lire', 'POST /api/journal/photo/lire', 'POST /api/protosig/etat', 'POST /api/protosig/lire'].indexOf(route) < 0;
  let verrou = null;
  if (ecriture) { verrou = LockService.getScriptLock(); verrou.waitLock(20000); }
  try { return router(m, chemin, route, b, req.t); }
  finally { if (verrou) { SpreadsheetApp.flush(); verrou.releaseLock(); } }
}

function router(m, chemin, route, b, jeton) {
  const c = config();
  if (route === 'GET /api/public/classes') return ok(JSON.parse(getDoc('commun/classes')));
  if (route === 'GET /api/public/info') return ok({ codeEleveRequis: true });

  // Offres de stage deposees par les entreprises (lien public avec code) : elles attendent la validation d'un professeur ou du DDFPT.
  if (route === 'GET /api/public/secteurs') {
    const l = (JSON.parse(getDoc('commun/entreprises')) || {}).entreprises || [];
    return ok(Array.from(new Set(l.map(e => e.secteur).filter(Boolean))).sort());
  }
  if (route === 'POST /api/public/offre') {
    if (String(b.k || '') !== c.codeOffres) return ko(403, 'lien_offre');
    if (trop('offres_publiques', 40)) return ko(429, 'trop_essais');
    compter('offres_publiques');
    const champ = (k, n) => String(b[k] || '').trim().slice(0, n), date = k => /^\d{4}-\d{2}-\d{2}$/.test(String(b[k] || '')) ? b[k] : '';
    const niveaux = (Array.isArray(b.niveaux) ? b.niveaux : []).filter(n => ['CAP', 'Bac pro', 'BTS'].indexOf(n) >= 0);
    const o = { id: hasard(12), entreprise: champ('entreprise', 120), adresse: champ('adresse', 200), secteur: champ('secteur', 80), intitule: champ('intitule', 120),
      description: champ('description', 1500), niveaux: niveaux, debut: date('debut'), fin: date('fin'), places: Math.max(1, Math.min(50, parseInt(b.places, 10) || 1)),
      contact: champ('contact', 120), tel: champ('tel', 40), email: champ('email', 120), source: 'entreprise', deposeLe: new Date().toISOString() };
    if (!o.entreprise || !o.adresse || !o.intitule || !niveaux.length || (!o.tel && !o.email)) return ko(400, 'offre_incomplete');
    const d = JSON.parse(getDoc('commun/offres_proposees')) || { liste: [] };
    if (d.liste.length >= 300) return ko(409, 'trop_de_propositions');
    d.liste.push(o); setDoc('commun/offres_proposees', JSON.stringify(d));
    return ok({ ok: true });
  }

  if (route === 'POST /api/inscription') {
    const role = b.role, prenom = String(b.prenom || '').trim(), ident = String(b.identifiant || '').trim().toLowerCase();
    let nom = String(b.nom || '').trim();
    const mdp = String(b.motdepasse || '');
    if (['eleve', 'prof', 'ddfpt'].indexOf(role) < 0) return ko(400, 'invalide');
    if (!prenom || prenom.length > 40 || !nom || nom.length > 60) return ko(400, 'nom_requis');
    if (!/^[a-z0-9._-]{3,40}$/.test(ident)) return ko(400, 'identifiant_invalide');
    if (mdp.length < 6 || mdp.length > 200) return ko(400, 'motdepasse_court');
    let classeId = null;
    if (role === 'prof') {
      if (String(b.codeProf || '').trim() !== c.codeProf) return ko(403, 'code_prof');
    } else if (role === 'ddfpt') {
      if (String(b.codeDdfpt || '').trim().toUpperCase() !== c.codeDdfpt.toUpperCase()) return ko(403, 'code_ddfpt');
    } else {
      // Donnees minimales : seulement les 2 premieres lettres du nom de famille.
      nom = nom.toUpperCase();
      if (!/^[A-ZÀ-ÖØ-Þ]{1,2}$/.test(nom)) return ko(400, 'nom_initiales');
      if (String(b.codeEleve || '').trim().toUpperCase() !== c.codeEleve.toUpperCase()) return ko(403, 'code_eleve');
      classeId = String(b.classeId || '');
      if (!/^[a-z0-9]{1,30}$/.test(classeId)) return ko(400, 'classe_requise');
    }
    const l = comptes();
    if (l.some(u => u.identifiant === ident)) return ko(409, 'identifiant_pris');
    const sel = hasard(32), u = { id: hasard(12), role: role, nom: nom, prenom: prenom, identifiant: ident, classeId: classeId, sel: sel, hash: hacher(mdp, sel) };
    l.push(u); sauverComptes(l);
    if (role === 'eleve') setDoc('eleve/' + u.id + '/profil', JSON.stringify({ nom: nom, prenom: prenom, classeId: classeId }));
    return ok({ token: creerJeton(u), user: userInfo(u) });
  }

  if (route === 'POST /api/connexion') {
    const ident = String(b.identifiant || '').trim().toLowerCase(), cle = 'conn|' + ident;
    if (trop(cle, 8)) return ko(429, 'trop_essais');
    const u = comptes().find(x => x.identifiant === ident);
    if (!u || hacher(String(b.motdepasse || ''), u.sel) !== u.hash) { compter(cle); return ko(401, 'identifiants'); }
    return ok({ token: creerJeton(u), user: userInfo(u) });
  }

  // Conventions : certaines routes sont ouvertes aux signataires externes (lien + code, sans compte).
  // Signature du protocole par le tuteur : routes ouvertes par le lien (sans compte), les autres reservees a l'eleve.
  if (chemin.indexOf('/api/protosig/') === 0) return routesProtosig(route, b, jeton ? lireJeton(jeton) : null);
  if (chemin.indexOf('/api/convention') === 0 || route === 'POST /api/moi/chef') {
    const r = routesConvention(route, b, jeton ? lireJeton(jeton) : null, jeton);
    if (r) return r;
  }

  const user = lireJeton(jeton);
  if (!user) return ko(401, 'non_connecte');
  // Personnel : professeurs et DDFPT (memes droits sur les classes, les eleves et la base d'entreprises).
  const estProf = user.role === 'prof' || user.role === 'ddfpt';

  if (route === 'GET /api/moi') return ok(userInfo(user));

  if (chemin.indexOf('/api/fichier/') === 0) return routesFichier(route, b, user, estProf);
  if (chemin.indexOf('/api/journal/') === 0) return routesJournal(route, b, user, estProf);
  if (chemin.indexOf('/api/mission') === 0) { if (!estProf) return ko(403, 'interdit'); return routesMission(route, b, user); }
  if (route === 'GET /api/francetravail/etat') {
    if (!estProf) return ko(403, 'interdit');
    const p = PropertiesService.getScriptProperties(), cfg = Object.assign(FT_DEFAUT(), JSON.parse(getDoc('commun/francetravail')) || {});
    return ok({ configure: !!(p.getProperty('FT_CLIENT_ID') && p.getProperty('FT_CLIENT_SECRET')), lbaConfigure: !!p.getProperty('LBA_API_KEY'), apprentissage: cfg.apprentissage !== false,
      departements: cfg.departements, motsCles: cfg.motsCles, alternance: cfg.alternance, dernier: cfg.dernier });
  }
  if (route === 'POST /api/francetravail/reglages') {
    if (!estProf) return ko(403, 'interdit');
    const cfg = Object.assign(FT_DEFAUT(), JSON.parse(getDoc('commun/francetravail')) || {});
    cfg.departements = (Array.isArray(b.departements) ? b.departements : []).map(String).filter(x => /^(\d{2,3}|2[AB])$/.test(x)).slice(0, 5);
    cfg.motsCles = (Array.isArray(b.motsCles) ? b.motsCles : []).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 8);
    cfg.alternance = !!b.alternance; cfg.apprentissage = b.apprentissage !== false;
    if (!cfg.departements.length) return ko(400, 'invalide');
    setDoc('commun/francetravail', JSON.stringify(cfg));
    return ok({ ok: true });
  }
  if (route === 'POST /api/francetravail/importer') { if (!estProf) return ko(403, 'interdit'); return ok(importerFranceTravail()); }

  // Eleve : entreprise trouvee par lui-meme, proposee pour la base ; elle n'y entre qu'apres validation (prof ou DDFPT).
  if (route === 'POST /api/entreprises/proposer') {
    if (user.role !== 'eleve') return ko(403, 'interdit');
    const champ = (k, n) => String(b[k] || '').trim().slice(0, n);
    const e = { id: hasard(12), nom: champ('nom', 120), adresse: champ('adresse', 200), tel: champ('tel', 40), contact: champ('contact', 120), secteur: champ('secteur', 80),
      demandeId: champ('demandeId', 40), eleveId: user.id, eleve: user.prenom + ' ' + user.nom, classeId: user.classeId || '', date: new Date().toISOString() };
    if (!e.nom) return ko(400, 'invalide');
    const d = JSON.parse(getDoc('commun/entreprises_proposees')) || { liste: [] };
    if (d.liste.length >= 500) return ko(409, 'trop_de_propositions');
    d.liste.push(e); setDoc('commun/entreprises_proposees', JSON.stringify(d));
    return ok({ id: e.id });
  }

  // Professeur : adresse e-mail ou il recoit les protocoles d'accord de ses classes (en tant que referent).
  if (route === 'POST /api/moi/email') {
    if (!estProf) return ko(403, 'interdit');
    const email = String(b.email || '').trim().toLowerCase();
    if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return ko(400, 'email_invalide');
    const l = comptes(), u = l.find(x => x.id === user.id); u.email = email; sauverComptes(l);
    return ok(userInfo(u));
  }

  // Eleve : envoi du protocole d'accord (PDF fabrique dans le navigateur) au professeur referent de sa classe.
  // Le PDF contient des donnees personnelles : il n'est ni enregistre ni journalise ici, seulement transmis par e-mail.
  if (route === 'POST /api/protocole/envoyer') {
    if (user.role !== 'eleve') return ko(403, 'interdit');
    const pdf = String(b.pdf || '');
    if (!pdf || pdf.length > 4000000 || !/^[A-Za-z0-9+/=]+$/.test(pdf)) return ko(400, 'invalide');
    const classes = (JSON.parse(getDoc('commun/classes')) || {}).classes || [];
    const profil = JSON.parse(getDoc('eleve/' + user.id + '/profil')) || {};
    const cl = classes.find(c => c.id === (profil.classeId || user.classeId));
    const referent = cl && cl.referentId && comptes().find(u => u.id === cl.referentId && u.role === 'prof');
    if (!referent) return ko(409, 'pas_de_referent');
    if (!referent.email) return ko(409, 'referent_sans_email');
    const fichier = String(b.fichier || 'Protocole.pdf').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 90);
    const entreprise = String(b.entreprise || '').slice(0, 120);
    const eleve = (profil.prenom || user.prenom) + ' ' + (profil.nom || user.nom);
    try {
      MailApp.sendEmail({
        to: referent.email, name: 'Suivi des stages',
        subject: "Protocole d'accord - " + eleve + (cl ? ' (' + cl.nom + ')' : '') + (entreprise ? ' - ' + entreprise : ''),
        body: 'Bonjour,\n\n' + eleve + (cl ? ', eleve de ' + cl.nom + ',' : '') + " vous transmet son protocole d'accord" +
          (entreprise ? ' pour l\'entreprise ' + entreprise : '') + ' (piece jointe).\n\nMessage envoye automatiquement par l\'application Suivi des stages.',
        attachments: [Utilities.newBlob(Utilities.base64Decode(pdf), 'application/pdf', fichier)],
      });
    } catch (err) { console.error('Envoi du protocole impossible : ' + (err && err.message)); return ko(502, 'envoi_impossible'); }
    return ok({ ok: true, destinataire: referent.prenom + ' ' + referent.nom });
  }
  if (route === 'POST /api/deconnexion') return ok({ ok: true });
  if (route === 'GET /api/profs') return ok(comptes().filter(u => u.role === 'prof').map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom })));

  if (route === 'GET /api/admin/codes') return estProf ? ok({ codeEleve: c.codeEleve, codeOffres: c.codeOffres }) : ko(403, 'interdit');
  if (route === 'GET /api/eleves') {
    if (!estProf) return ko(403, 'interdit');
    return ok(comptes().filter(u => u.role === 'eleve').map(u => {
      const docs = {};
      SECTIONS.forEach(s => { docs[s] = JSON.parse(getDoc('eleve/' + u.id + '/' + s)); });
      return { id: u.id, identifiant: u.identifiant, docs: docs };
    }));
  }
  if (route === 'POST /api/admin/motdepasse' || route === 'POST /api/admin/supprimer') {
    if (!estProf) return ko(403, 'interdit');
    const l = comptes(), cible = l.find(u => u.id === String(b.id));
    if (!cible || cible.role !== 'eleve') return ko(404, 'introuvable');
    if (route === 'POST /api/admin/motdepasse') {
      const mdp = String(b.motdepasse || '');
      if (mdp.length < 6 || mdp.length > 200) return ko(400, 'motdepasse_court');
      cible.sel = hasard(32); cible.hash = hacher(mdp, cible.sel); cible.v = (cible.v || 0) + 1;   // ferme ses sessions
      sauverComptes(l);
    } else {
      sauverComptes(l.filter(u => u !== cible));
      supprimerFichiersDe(cible.id);
      supprimerDocs('eleve/' + cible.id + '/');
      for (const cv of toutesConventions().filter(x => x.eleveId === cible.id)) { try { DriveApp.getFileById(cv.fichier).setTrashed(true); } catch (e) { /* deja supprime */ } }
      supprimerConventionsDe(cible.id);
    }
    return ok({ ok: true });
  }

  if (chemin.indexOf('/api/doc/') === 0) {
    const cle = chemin.slice(9), me = /^eleve\/([a-f0-9]{12})\/([a-z]+)$/.exec(cle);
    let droitEcriture;
    // Espace prive du professeur : adresse personnelle, noms complets des eleves suivis, horaires des deplacements.
    const mp = /^perso\/([a-f0-9]{12})$/.exec(cle);
    if (/^commun\/(classes|entreprises|etablissement|offres)$/.test(cle)) droitEcriture = estProf;
    else if (cle === 'commun/offres_proposees' || cle === 'commun/francetravail') { if (!estProf) return ko(403, 'interdit'); droitEcriture = true; }
    else if (mp) { if (!estProf || mp[1] !== user.id) return ko(403, 'interdit'); droitEcriture = true; }
    else if (cle === 'commun/entreprises_proposees') { if (!estProf) return ko(403, 'interdit'); droitEcriture = true; }
    else if (me && SECTIONS.indexOf(me[2]) >= 0) {
      if (!estProf && user.id !== me[1]) return ko(403, 'interdit');
      if (!comptes().some(u => u.id === me[1])) return ko(404, 'introuvable');
      droitEcriture = estProf || me[2] !== 'prof';
    } else return ko(404, 'introuvable');

    if (m === 'GET') return ok(JSON.parse(getDoc(cle)));
    if (m === 'PUT') {
      if (!droitEcriture) return ko(403, 'interdit');
      const texte = JSON.stringify(b === undefined ? null : b);
      if (texte.length > 2000000) return ko(413, 'trop_gros');
      setDoc(cle, texte);
      return ok({ ok: true });
    }
  }
  return ko(404, 'introuvable');
}
