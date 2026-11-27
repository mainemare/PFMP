'use strict';
// Suivi des stages - serveur pour hebergement en ligne (Node.js 18+, aucune dependance).
// Lancement : node server.js
// Variables d'environnement : PORT, DATA_DIR (dossier persistant), CODE_PROF, CODE_ELEVE, CODE_DDFPT.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const PUB = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'donnees');
const DOCS = path.join(DATA, 'docs');
const USERS_FILE = path.join(DATA, 'comptes.json');
const CONFIG_FILE = path.join(DATA, 'config.json');
const SECTIONS = ['profil', 'cv', 'lettre', 'memento', 'demandes', 'journal', 'etat', 'prof', 'bord', 'portfolio', 'attestation'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const SESSION_MS = 12 * 3600 * 1000;

fs.mkdirSync(DOCS, { recursive: true });
const lire = p => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
function ecrire(p, texte) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.tmp', texte);
  fs.renameSync(p + '.tmp', p);
}
const hex = n => crypto.randomBytes(n).toString('hex');
// Meme calcul que la version Windows (serveur.ps1) : les comptes restent compatibles entre les deux.
const hacher = (motdepasse, sel) => crypto.pbkdf2Sync(motdepasse, Buffer.from(sel, 'ascii'), 20000, 32, 'sha1').toString('base64');

// ---------- Configuration ----------
let config = {};
if (fs.existsSync(CONFIG_FILE)) config = JSON.parse(lire(CONFIG_FILE));
let configModifiee = false;
if (!config.codeProf) { config.codeProf = 'PROF-' + hex(3).toUpperCase(); configModifiee = true; }
if (!config.codeEleve) { config.codeEleve = 'ELEVE-' + hex(3).toUpperCase(); configModifiee = true; }
if (!config.codeDdfpt) { config.codeDdfpt = 'DDFPT-' + hex(4).toUpperCase(); configModifiee = true; }
if (!config.secret) { config.secret = hex(32); configModifiee = true; }
if (configModifiee) ecrire(CONFIG_FILE, JSON.stringify(config));
const CODE_PROF = process.env.CODE_PROF || config.codeProf;
const CODE_ELEVE = process.env.CODE_ELEVE || config.codeEleve;
const CODE_DDFPT = process.env.CODE_DDFPT || config.codeDdfpt;

// ---------- Comptes ----------
let users = fs.existsSync(USERS_FILE) ? JSON.parse(lire(USERS_FILE)) : [];
const sauverUsers = () => ecrire(USERS_FILE, JSON.stringify(users));
const userJson = u => JSON.stringify({ id: u.id, role: u.role, nom: u.nom, prenom: u.prenom, identifiant: u.identifiant, classeId: u.classeId || null, email: u.role !== 'eleve' ? (u.email || '') : undefined });

// ---------- Sessions : jetons signes, valables 12 h, qui survivent a un redemarrage ----------
const signer = corps => crypto.createHmac('sha256', config.secret).update(corps).digest('base64url');
function creerJeton(u) {
  const corps = Buffer.from(JSON.stringify({ i: u.id, v: u.v || 0, e: Date.now() + SESSION_MS })).toString('base64url');
  return corps + '.' + signer(corps);
}
function lireJeton(jeton) {
  const [corps, signature] = String(jeton).split('.');
  if (!corps || !signature) return null;
  const attendu = Buffer.from(signer(corps)), recu = Buffer.from(signature);
  if (attendu.length !== recu.length || !crypto.timingSafeEqual(attendu, recu)) return null;
  try {
    const o = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'));
    if (!(o.e > Date.now())) return null;
    const u = users.find(x => x.id === o.i);
    return u && (u.v || 0) === o.v ? u : null;
  } catch { return null; }
}

// ---------- Limitation des tentatives (connexion, inscription) ----------
const essais = new Map();
function trop(cle, max, ms) { const e = essais.get(cle); return !!e && Date.now() - e.t <= ms && e.n >= max; }
function compter(cle, ms) { const e = essais.get(cle); if (!e || Date.now() - e.t > ms) essais.set(cle, { n: 1, t: Date.now() }); else e.n++; }
setInterval(() => { for (const [k, e] of essais) if (Date.now() - e.t > 3600e3) essais.delete(k); }, 600e3).unref();
const ipDe = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// ---------- Documents JSON ----------
const cache = new Map();
const cheminDoc = cle => path.join(DOCS, ...cle.split('/')) + '.json';
function getDoc(cle) {
  if (cache.has(cle)) return cache.get(cle);
  const p = cheminDoc(cle);
  let t = fs.existsSync(p) ? lire(p) : 'null';
  if (!t.trim()) t = 'null';
  cache.set(cle, t);
  return t;
}
function setDoc(cle, texte) { ecrire(cheminDoc(cle), texte); cache.set(cle, texte); }

// ---------- Reponses ----------
function envoyer(req, res, code, corps, type) {
  const b = Buffer.isBuffer(corps) ? corps : Buffer.from(String(corps), 'utf8');
  const h = {
    'Content-Type': type || 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self' https://data.geopf.fr https://api-adresse.data.gouv.fr; frame-ancestors 'none'",
  };
  if (req.headers['x-forwarded-proto'] === 'https') h['Strict-Transport-Security'] = 'max-age=31536000';
  res.writeHead(code, h);
  res.end(req.method === 'HEAD' ? undefined : b);
}
const erreur = (req, res, code, nom) => envoyer(req, res, code, JSON.stringify({ erreur: nom }));
function lireCorps(req) {
  return new Promise((resolve, reject) => {
    const morceaux = []; let taille = 0;
    req.on('data', c => { taille += c.length; if (taille > 3e6) { reject(Object.assign(new Error('trop_gros'), { http: 413 })); req.destroy(); } else morceaux.push(c); });
    req.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
    req.on('error', reject);
  });
}
async function lireJson(req) {
  try { const o = JSON.parse(await lireCorps(req)); if (o && typeof o === 'object') return o; } catch (e) { if (e.http) throw e; }
  throw Object.assign(new Error('invalide'), { http: 400 });
}
function fichier(req, res, chemin) {
  let rel;
  try { rel = decodeURIComponent(chemin === '/' ? '/index.html' : chemin); } catch { rel = ''; }
  const complet = path.normalize(path.join(PUB, rel));
  if (!rel || !complet.startsWith(PUB + path.sep) || !fs.existsSync(complet) || !fs.statSync(complet).isFile()) return envoyer(req, res, 404, 'Introuvable', 'text/plain; charset=utf-8');
  envoyer(req, res, 200, fs.readFileSync(complet), MIME[path.extname(complet).toLowerCase()] || 'application/octet-stream');
}

// ---------- Routes ----------
async function traiter(req, res) {
  const chemin = new URL(req.url, 'http://x').pathname, m = req.method;
  // Derriere un hebergeur : on force le HTTPS.
  if (req.headers['x-forwarded-proto'] === 'http' && req.headers.host) { res.writeHead(301, { Location: 'https://' + req.headers.host + req.url }); return res.end(); }
  if (!chemin.startsWith('/api/')) return (m === 'GET' || m === 'HEAD') ? fichier(req, res, chemin) : erreur(req, res, 405, 'invalide');
  const route = m + ' ' + chemin, ip = ipDe(req);

  if (route === 'GET /api/public/classes') return envoyer(req, res, 200, getDoc('commun/classes'));
  // Depot d'offres par les entreprises : seulement avec la version Google (google/Code.gs).
  if (route === 'POST /api/public/offre' || route === 'GET /api/public/secteurs') return erreur(req, res, 501, 'offre_indisponible');
  if (route === 'GET /api/public/info') return envoyer(req, res, 200, JSON.stringify({ codeEleveRequis: true }));

  if (route === 'POST /api/inscription') {
    if (trop('insc|' + ip, 30, 3600e3)) return erreur(req, res, 429, 'trop_essais');
    compter('insc|' + ip, 3600e3);
    const b = await lireJson(req);
    const nom = String(b.nom || '').trim(), prenom = String(b.prenom || '').trim(), ident = String(b.identifiant || '').trim().toLowerCase();
    const mdp = String(b.motdepasse || ''), role = b.role;
    if (!['eleve', 'prof', 'ddfpt'].includes(role)) return erreur(req, res, 400, 'invalide');
    if (!nom || !prenom || nom.length > 60 || prenom.length > 60) return erreur(req, res, 400, 'nom_requis');
    if (!/^[a-z0-9._-]{3,40}$/.test(ident)) return erreur(req, res, 400, 'identifiant_invalide');
    if (mdp.length < 6 || mdp.length > 200) return erreur(req, res, 400, 'motdepasse_court');
    let classeId = null;
    if (role === 'prof') {
      if (String(b.codeProf || '').trim() !== CODE_PROF) return erreur(req, res, 403, 'code_prof');
    } else if (role === 'ddfpt') {
      if (String(b.codeDdfpt || '').trim().toUpperCase() !== CODE_DDFPT.toUpperCase()) return erreur(req, res, 403, 'code_ddfpt');
    } else {
      if (String(b.codeEleve || '').trim().toUpperCase() !== CODE_ELEVE.toUpperCase()) return erreur(req, res, 403, 'code_eleve');
      classeId = String(b.classeId || '');
      if (!/^[a-z0-9]{1,30}$/.test(classeId)) return erreur(req, res, 400, 'classe_requise');
    }
    if (users.some(u => u.identifiant === ident)) return erreur(req, res, 409, 'identifiant_pris');
    const sel = hex(16), u = { id: hex(6), role, nom, prenom, identifiant: ident, classeId, sel, hash: hacher(mdp, sel) };
    users.push(u); sauverUsers();
    if (role === 'eleve') setDoc(`eleve/${u.id}/profil`, JSON.stringify({ nom, prenom, classeId }));
    return envoyer(req, res, 200, `{"token":"${creerJeton(u)}","user":${userJson(u)}}`);
  }

  if (route === 'POST /api/connexion') {
    const b = await lireJson(req), ident = String(b.identifiant || '').trim().toLowerCase(), cle = 'conn|' + ip + '|' + ident;
    if (trop(cle, 8, 900e3) || trop('conn|' + ip, 60, 900e3)) return erreur(req, res, 429, 'trop_essais');
    const u = users.find(x => x.identifiant === ident);
    if (!u || hacher(String(b.motdepasse || ''), u.sel) !== u.hash) { compter(cle, 900e3); compter('conn|' + ip, 900e3); return erreur(req, res, 401, 'identifiants'); }
    return envoyer(req, res, 200, `{"token":"${creerJeton(u)}","user":${userJson(u)}}`);
  }

  const auth = req.headers.authorization || '';
  const user = auth.startsWith('Bearer ') ? lireJeton(auth.slice(7)) : null;
  if (!user) return erreur(req, res, 401, 'non_connecte');
  const estProf = user.role === 'prof' || user.role === 'ddfpt';   // personnel : professeurs et DDFPT
  // Un professeur ne voit que les eleves des classes dont il est referent (ou d'une classe sans referent) ; le DDFPT voit tout.
  const referentsDe = cl => !cl ? [] : cl.referentIds && cl.referentIds.length ? cl.referentIds : cl.referentId ? [cl.referentId] : [];
  const lesClasses = () => (JSON.parse(getDoc('commun/classes')) || {}).classes || [];
  const voitEleve = (id, cls = lesClasses()) => {
    if (user.role === 'ddfpt') return true;
    if (user.role !== 'prof') return user.id === id;
    const p = JSON.parse(getDoc(`eleve/${id}/profil`)) || {}, cl = cls.find(c => c.id === (p.classeId || (users.find(u => u.id === id) || {}).classeId)), r = referentsDe(cl);
    return !cl || !r.length || r.includes(user.id);
  };

  // Eleve : entreprise trouvee par lui-meme, proposee pour la base (validation par un prof ou le DDFPT).
  if (route === 'POST /api/entreprises/proposer') {
    if (user.role !== 'eleve') return erreur(req, res, 403, 'interdit');
    const b = await lireJson(req), champ = (k, n) => String(b[k] || '').trim().slice(0, n);
    const e = { id: hex(6), nom: champ('nom', 120), adresse: champ('adresse', 200), tel: champ('tel', 40), contact: champ('contact', 120), secteur: champ('secteur', 80),
      demandeId: champ('demandeId', 40), eleveId: user.id, eleve: `${user.prenom} ${user.nom}`, classeId: user.classeId || '', date: new Date().toISOString() };
    if (!e.nom) return erreur(req, res, 400, 'invalide');
    const d = JSON.parse(getDoc('commun/entreprises_proposees')) || { liste: [] };
    d.liste.push(e); setDoc('commun/entreprises_proposees', JSON.stringify(d));
    return envoyer(req, res, 200, JSON.stringify({ id: e.id }));
  }

  if (route === 'GET /api/moi') return envoyer(req, res, 200, userJson(user));
  if (route === 'POST /api/moi/email') {
    if (!estProf) return erreur(req, res, 403, 'interdit');
    const email = String((await lireJson(req)).email || '').trim().toLowerCase();
    if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return erreur(req, res, 400, 'email_invalide');
    user.email = email; sauverUsers();
    return envoyer(req, res, 200, userJson(user));
  }
  // L'envoi d'e-mails n'existe que dans la version Google (google/Code.gs) : l'eleve telecharge alors son PDF.
  if (route === 'POST /api/protocole/envoyer') return erreur(req, res, 501, 'envoi_indisponible');
  // Conventions chiffrees et signatures : uniquement dans la version Google (google/Code.gs).
  if (chemin.startsWith('/api/convention') || route === 'POST /api/moi/chef') return erreur(req, res, 501, 'convention_indisponible');
  // CV et lettres en PDF : seulement avec la version Google (rangement dans le Drive).
  if (chemin.startsWith('/api/fichier/')) return erreur(req, res, 501, 'fichier_indisponible');
  if (chemin.startsWith('/api/journal/')) return erreur(req, res, 501, 'photo_indisponible');
  if (chemin.startsWith('/api/protosig/')) return erreur(req, res, 501, 'protosig_indisponible');
  if (chemin.startsWith('/api/mission')) return erreur(req, res, 501, 'mission_indisponible');
  if (chemin.startsWith('/api/francetravail/')) return erreur(req, res, 501, 'ft_indisponible');
  if (route === 'POST /api/deconnexion') return envoyer(req, res, 200, '{"ok":true}');
  if (route === 'GET /api/profs') return envoyer(req, res, 200, JSON.stringify(users.filter(u => u.role === 'prof').map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom }))));

  if (route === 'GET /api/admin/codes') {
    if (!estProf) return erreur(req, res, 403, 'interdit');
    return envoyer(req, res, 200, JSON.stringify({ codeEleve: CODE_ELEVE }));
  }
  if (route === 'GET /api/eleves') {
    if (!estProf) return erreur(req, res, 403, 'interdit');
    const cls = lesClasses();
    const parts = users.filter(u => u.role === 'eleve' && voitEleve(u.id, cls)).map(u =>
      `{"id":"${u.id}","identifiant":${JSON.stringify(u.identifiant)},"docs":{${SECTIONS.map(s => `"${s}":${getDoc(`eleve/${u.id}/${s}`)}`).join(',')}}}`);
    return envoyer(req, res, 200, '[' + parts.join(',') + ']');
  }
  if (route === 'POST /api/admin/motdepasse' || route === 'POST /api/admin/supprimer') {
    if (!estProf) return erreur(req, res, 403, 'interdit');
    const b = await lireJson(req), cible = users.find(u => u.id === String(b.id));
    if (!cible || cible.role !== 'eleve') return erreur(req, res, 404, 'introuvable');
    if (!voitEleve(cible.id)) return erreur(req, res, 403, 'interdit');
    if (route.endsWith('motdepasse')) {
      const mdp = String(b.motdepasse || '');
      if (mdp.length < 6 || mdp.length > 200) return erreur(req, res, 400, 'motdepasse_court');
      cible.sel = hex(16); cible.hash = hacher(mdp, cible.sel); cible.v = (cible.v || 0) + 1;   // ferme ses sessions ouvertes
      sauverUsers();
    } else {
      users = users.filter(u => u !== cible); sauverUsers();
      for (const s of SECTIONS) cache.delete(`eleve/${cible.id}/${s}`);
      fs.rmSync(path.join(DOCS, 'eleve', cible.id), { recursive: true, force: true });
    }
    return envoyer(req, res, 200, '{"ok":true}');
  }

  if (chemin.startsWith('/api/doc/')) {
    const cle = chemin.slice(9);
    let ecriture;
    const me = /^eleve\/([a-f0-9]{12})\/([a-z]+)$/.exec(cle);
    const mp = /^perso\/([a-f0-9]{12})$/.exec(cle);   // espace prive du professeur
    if (/^commun\/(classes|entreprises|etablissement|offres)$/.test(cle)) ecriture = estProf;
    else if (cle === 'commun/offres_proposees') { if (!estProf) return erreur(req, res, 403, 'interdit'); ecriture = true; }
    else if (mp) { if (!estProf || mp[1] !== user.id) return erreur(req, res, 403, 'interdit'); ecriture = true; }
    else if (cle === 'commun/entreprises_proposees') { if (!estProf) return erreur(req, res, 403, 'interdit'); ecriture = true; }
    else if (me && SECTIONS.includes(me[2])) {
      if (!estProf && user.id !== me[1]) return erreur(req, res, 403, 'interdit');
      if (!users.some(u => u.id === me[1])) return erreur(req, res, 404, 'introuvable');
      if (estProf && !voitEleve(me[1])) return erreur(req, res, 403, 'interdit');
      ecriture = estProf || me[2] !== 'prof';
    } else return erreur(req, res, 404, 'introuvable');

    if (m === 'GET') return envoyer(req, res, 200, getDoc(cle));
    if (m === 'PUT') {
      if (!ecriture) return erreur(req, res, 403, 'interdit');
      const corps = await lireCorps(req);
      let nouveau; try { nouveau = JSON.parse(corps); } catch { return erreur(req, res, 400, 'invalide'); }
      if (cle === 'commun/classes' && user.role === 'prof') {
        const apres = (nouveau && nouveau.classes) || [];
        for (const oc of lesClasses()) {
          const r = referentsDe(oc); if (!r.length || r.includes(user.id)) continue;
          const nc = apres.find(c => c.id === oc.id);
          if (!nc || JSON.stringify(nc) !== JSON.stringify(oc)) return erreur(req, res, 403, 'classe_autre_referent');
        }
      }
      setDoc(cle, corps);
      return envoyer(req, res, 200, '{"ok":true}');
    }
  }
  return erreur(req, res, 404, 'introuvable');
}

http.createServer((req, res) => {
  traiter(req, res).catch(e => {
    if (!e.http) console.error('Erreur :', e);
    if (!res.headersSent) erreur(req, res, e.http || 500, e.http ? e.message : 'serveur'); else res.destroy();
  });
}).listen(PORT, () => {
  console.log(`Suivi des stages - serveur demarre sur le port ${PORT}`);
  console.log(`Donnees : ${DATA}`);
  console.log(`Code d'inscription des professeurs : ${CODE_PROF}`);
  console.log(`Code d'inscription des eleves      : ${CODE_ELEVE}`);
  console.log(`Code d'inscription du DDFPT        : ${CODE_DDFPT}`);
});
