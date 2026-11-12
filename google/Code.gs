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
const SECTIONS = ['profil', 'cv', 'lettre', 'memento', 'demandes', 'journal', 'etat', 'prof'];
const SESSION_MS = 12 * 3600 * 1000;
const ITERATIONS = 300;

/** A lancer une fois depuis l'editeur apres chaque mise a jour : autorise l'envoi d'e-mails (protocoles d'accord)
 *  et l'enregistrement des conventions chiffrees dans votre Google Drive, puis affiche le code « chef d'etablissement ». */
function autoriser() {
  Logger.log("Envoi d'e-mails autorise. E-mails encore disponibles aujourd'hui : " + MailApp.getRemainingDailyQuota());
  Logger.log('Dossier des conventions (chiffrees) : ' + dossierConventions().getName());
  Logger.log("Code « chef d'etablissement » (proviseur, adjoint ou DDFPT) : " + config().codeChef);
}
function autoriserEnvoiMail() { autoriser(); }   // ancien nom, garde pour compatibilite

/** A lancer une fois depuis l'editeur (bouton Executer) : prepare le classeur et affiche les codes d'inscription. */

function installer() {
  const c = config();
  table();
  Logger.log("Code d'inscription des professeurs : " + c.codeProf);
  Logger.log("Code d'inscription des eleves      : " + c.codeEleve);
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
  email: u.role === 'prof' ? (u.email || '') : undefined, chef: u.role === 'prof' ? !!u.chef : undefined });

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
  if (role === 'chef') return user.role === 'prof' && !!user.chef;
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
    if (user.role !== 'prof') return ko(403, 'interdit');
    const l = comptes(), u = l.find(x => x.id === user.id);
    if (b.retirer) u.chef = false;
    else if (String(b.code || '').trim().toUpperCase() !== config().codeChef.toUpperCase()) return ko(403, 'code_chef');
    else u.chef = true;
    sauverComptes(l);
    return ok(userInfo(u));
  }
  return null;
}

/* ---------- Routes (memes chemins que server.js) ---------- */
function traiter(req) {
  const m = String(req.m || 'GET'), chemin = String(req.p || ''), b = req.b || {}, route = m + ' ' + chemin;
  const ecriture = m !== 'GET' && ['POST /api/connexion', 'POST /api/protocole/envoyer', 'POST /api/convention/lire'].indexOf(route) < 0;
  let verrou = null;
  if (ecriture) { verrou = LockService.getScriptLock(); verrou.waitLock(20000); }
  try { return router(m, chemin, route, b, req.t); }
  finally { if (verrou) { SpreadsheetApp.flush(); verrou.releaseLock(); } }
}

function router(m, chemin, route, b, jeton) {
  const c = config();
  if (route === 'GET /api/public/classes') return ok(JSON.parse(getDoc('commun/classes')));
  if (route === 'GET /api/public/info') return ok({ codeEleveRequis: true });

  if (route === 'POST /api/inscription') {
    const role = b.role, prenom = String(b.prenom || '').trim(), ident = String(b.identifiant || '').trim().toLowerCase();
    let nom = String(b.nom || '').trim();
    const mdp = String(b.motdepasse || '');
    if (role !== 'eleve' && role !== 'prof') return ko(400, 'invalide');
    if (!prenom || prenom.length > 40 || !nom || nom.length > 60) return ko(400, 'nom_requis');
    if (!/^[a-z0-9._-]{3,40}$/.test(ident)) return ko(400, 'identifiant_invalide');
    if (mdp.length < 6 || mdp.length > 200) return ko(400, 'motdepasse_court');
    let classeId = null;
    if (role === 'prof') {
      if (String(b.codeProf || '').trim() !== c.codeProf) return ko(403, 'code_prof');
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
  if (chemin.indexOf('/api/convention') === 0 || route === 'POST /api/moi/chef') {
    const r = routesConvention(route, b, jeton ? lireJeton(jeton) : null, jeton);
    if (r) return r;
  }

  const user = lireJeton(jeton);
  if (!user) return ko(401, 'non_connecte');
  const estProf = user.role === 'prof';

  if (route === 'GET /api/moi') return ok(userInfo(user));

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

  if (route === 'GET /api/admin/codes') return estProf ? ok({ codeEleve: c.codeEleve }) : ko(403, 'interdit');
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
      supprimerDocs('eleve/' + cible.id + '/');
      for (const cv of toutesConventions().filter(x => x.eleveId === cible.id)) { try { DriveApp.getFileById(cv.fichier).setTrashed(true); } catch (e) { /* deja supprime */ } }
      supprimerConventionsDe(cible.id);
    }
    return ok({ ok: true });
  }

  if (chemin.indexOf('/api/doc/') === 0) {
    const cle = chemin.slice(9), me = /^eleve\/([a-f0-9]{12})\/([a-z]+)$/.exec(cle);
    let droitEcriture;
    if (/^commun\/(classes|entreprises|etablissement)$/.test(cle)) droitEcriture = estProf;
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
