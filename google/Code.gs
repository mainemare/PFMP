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

/** A lancer une fois depuis l'editeur (bouton Executer) : prepare le classeur et affiche les codes d'inscription. */
/** A lancer une fois depuis l'editeur apres la mise a jour : autorise le script a envoyer des e-mails (protocoles d'accord). */
function autoriserEnvoiMail() {
  Logger.log("Envoi d'e-mails autorise. E-mails encore disponibles aujourd'hui : " + MailApp.getRemainingDailyQuota());
}

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
const userInfo = u => ({ id: u.id, role: u.role, nom: u.nom, prenom: u.prenom, identifiant: u.identifiant, classeId: u.classeId || null, email: u.role === 'prof' ? (u.email || '') : undefined });

/* ---------- Routes (memes chemins que server.js) ---------- */
function traiter(req) {
  const m = String(req.m || 'GET'), chemin = String(req.p || ''), b = req.b || {}, route = m + ' ' + chemin;
  const ecriture = m !== 'GET' && route !== 'POST /api/connexion' && route !== 'POST /api/protocole/envoyer';
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
    }
    return ok({ ok: true });
  }

  if (chemin.indexOf('/api/doc/') === 0) {
    const cle = chemin.slice(9), me = /^eleve\/([a-f0-9]{12})\/([a-z]+)$/.exec(cle);
    let droitEcriture;
    if (/^commun\/(classes|entreprises)$/.test(cle)) droitEcriture = estProf;
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
