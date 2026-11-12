'use strict';
/* ===== Convention de stage dans l'application (élève et professeur) =====
 * Après un avis favorable du référent sur le protocole, l'élève crée sa convention : son contenu est chiffré
 * dans le navigateur, puis chaque signataire reçoit le lien (avec la clé) et, pour les signataires externes,
 * un code personnel. L'élève peut rouvrir sa convention grâce à une clé dérivée de son mot de passe.
 */
S.convs = []; S.conventions = []; S.etab = { ...CONV.ETAB_DEFAUT };
const etabCourant = () => ({ ...CONV.ETAB_DEFAUT, ...(S.etab || {}) });
async function chargerConventions() {
  try { const l = await api('GET', '/api/conventions'); if (S.user.role === 'prof') S.conventions = l || []; else S.convs = l || []; }
  catch { S.convs = []; S.conventions = []; }   // fonction absente sur ce serveur
}
async function chargerEtab() { try { S.etab = { ...CONV.ETAB_DEFAUT, ...((await getDoc('commun/etablissement')) || {}) }; } catch { S.etab = { ...CONV.ETAB_DEFAUT }; } }

/* ---------- Clé personnelle de l'élève (dérivée de son mot de passe, gardée le temps de la session) ---------- */
const cleSession = () => { try { return sessionStorage.getItem('stages_kek_' + S.user.id) || ''; } catch { return ''; } };
async function memoriserCle(user, motdepasse, identifiant) {
  if (!user || user.role !== 'eleve') return;
  try { sessionStorage.setItem('stages_kek_' + user.id, await CONV.cleDepuisMotDePasse(motdepasse, identifiant)); } catch { /* stockage indisponible */ }
}
let attenteMdp = null;
function demanderMotDePasse() {
  return new Promise((ok, ko) => {
    attenteMdp = { ok, ko };
    modal(`<h2>🔒 Ouvrir ta convention</h2><p>Pour protéger tes données, ta convention est chiffrée. Saisis ton mot de passe pour l’ouvrir.</p>
      <label>Mot de passe<input type="password" id="kek_mdp" autocomplete="current-password"></label><button class="btn" data-a="kekValider">Ouvrir</button>`);
    setTimeout(() => { const i = $('#kek_mdp'); if (i) i.focus(); }, 50);
  });
}
A.kekValider = async () => {
  const mdp = $('#kek_mdp').value; if (!mdp) return;
  const cle = await CONV.cleDepuisMotDePasse(mdp, S.user.identifiant);
  try { sessionStorage.setItem('stages_kek_' + S.user.id, cle); } catch { /* */ }
  modal(''); const a = attenteMdp; attenteMdp = null; if (a) a.ok(cle);
};
async function clePersonnelle() { return cleSession() || demanderMotDePasse(); }
// Ouvre l'enveloppe { k, codes } de la convention avec la clé personnelle (redemande le mot de passe si besoin).
async function ouvrirEnveloppe(cleEleve) {
  let kek = await clePersonnelle();
  try { return await CONV.dechiffrer(cleEleve, kek); }
  catch {
    try { sessionStorage.removeItem('stages_kek_' + S.user.id); } catch { /* */ }
    kek = await demanderMotDePasse();
    try { return await CONV.dechiffrer(cleEleve, kek); }
    catch { throw new Error('Impossible d’ouvrir ta convention avec ce mot de passe. Si ton mot de passe a été réinitialisé, utilise le lien de ta convention (reçu à sa création).'); }
  }
}

/* ---------- Élève : bloc dans la page Protocole ---------- */
const convDe = dem => (S.convs || []).find(c => c.demandeId === dem.id);
function protocoleValide(dem) {
  const v = dem && validationDe(S.el, dem.id);
  return !!(v && v.avis === 'favorable' && dem.protocole && !(dem.protocole.soumisLe > v.date));
}
function etatSignatures(meta) {
  return meta.roles.map(r => `<li>${meta.signatures[r] ? '✅' : '⬜'} ${esc(CONV.ROLES[r].court)}${meta.signatures[r] ? ` <span class="doux">— signé le ${fmtDT(meta.signatures[r].le)}</span>` : ''}</li>`).join('');
}
function blocConventionEleve(dem) {
  if (!dem || !protocoleValide(dem)) return '';
  const m = convDe(dem);
  if (!m) return `<div class="carte conv"><h3>📜 Convention de stage</h3><p>Ton protocole est validé : tu peux créer ta convention de stage. Chaque signataire recevra un lien pour la lire et la signer (sur écran ou par photo).</p>
    <button class="btn" data-a="convFormulaire" data-id="${dem.id}">📜 Créer ma convention de stage</button></div>`;
  const nb = Object.keys(m.signatures).length;
  return `<div class="carte conv ${m.statut === 'signee' ? 'ok' : ''}"><h3>📜 Convention de stage ${m.statut === 'signee' ? '— <span style="color:#15803d">entièrement signée ✅</span>' : `— ${nb}/${m.roles.length} signature(s)`}</h3>
    <ul class="liste-sig">${etatSignatures(m)}</ul>
    <div class="actions"><button class="btn" data-a="convPdf" data-id="${m.id}">📄 Voir / imprimer la convention (PDF)</button>
      ${m.statut !== 'signee' ? `<button class="btn sec" data-a="convLiens" data-id="${m.id}">🔗 Liens et codes de signature</button>
      ${m.signatures.eleve ? '' : `<button class="btn sec" data-a="convSignerMoi" data-id="${m.id}">✍️ Signer moi-même</button>`}` : ''}
      ${nb ? '' : `<button class="btn mini danger" data-a="convFormulaire" data-id="${dem.id}">✏️ Corriger et recréer</button>`}</div></div>`;
}

/* ---------- Élève : formulaire de création ---------- */
function brouillonConvention(dem) {
  const d = S.el, p = dem.protocole || {}, n = p.ent || {}, cl = S.classes.find(c => c.id === d.profil.classeId) || {};
  const ref = cl.referentId ? S.profs.find(x => x.id === cl.referentId) : null, dt = datesEleve(d), pe = (typeof PROTO !== 'undefined' && PROTO && PROTO.eleve) || {};
  return {
    eleve: { nom: pe.nom || '', prenom: d.profil.prenom || '', naissance: pe.naissance || '', classe: cl.nom || pe.classe || '', groupe: '', adresse: pe.adresse || '', tel: pe.telEleve || '', email: '' },
    representant: { nom: '', tel: pe.telRepresentants || '', email: '' },
    entreprise: { nom: n.entreprise || dem.nom, adresse: n.adresse || dem.adresse || '', domaine: n.domaine || '', tel: n.tel || dem.tel || '', portable: '', siret: n.siret || '',
      representant: n.signataire || '', fonction: n.fonctionSignataire || '', email: n.mailSignataire || n.mail || '', lieu: n.lieu || '' },
    tuteur: { nom: n.tuteur || '', fonction: n.fonctionTuteur || '', email: n.mailTuteur || '', tel: n.telTuteur || '', memeQueRepresentant: false },
    referent: { nom: ref ? nomComplet(ref) : (pe.referent || ''), tel: '', email: '' },
    stage: { du: pe.du || (dt ? dt.debut : ''), au: pe.au || (dt ? dt.fin : '') },
    assurance: { assureur: n.assureur || '', contrat: n.contrat || '' },
    horaires: { ...(p.horaires || {}) }, diplome: cl.diplome || '',
  };
}
const CHAMPS_CONV = [
  ['L’élève', [['eleve.nom', 'Nom'], ['eleve.prenom', 'Prénom'], ['eleve.naissance', 'Date de naissance', 'date'], ['eleve.classe', 'Classe'], ['eleve.groupe', 'Groupe (facultatif)'],
    ['eleve.adresse', 'Adresse personnelle'], ['eleve.tel', 'Téléphone'], ['eleve.email', 'E-mail (facultatif)', 'email']]],
  ['Représentant légal (si tu es mineur)', [['representant.nom', 'Nom et prénom'], ['representant.tel', 'Téléphone'], ['representant.email', 'E-mail (pour lui envoyer le lien)', 'email']]],
  ['L’entreprise', [['entreprise.nom', 'Nom de l’entreprise'], ['entreprise.adresse', 'Adresse'], ['entreprise.domaine', 'Domaine d’activités'], ['entreprise.tel', 'Téléphone'],
    ['entreprise.portable', 'Portable (facultatif)'], ['entreprise.siret', 'N° d’immatriculation (SIRET)'], ['entreprise.representant', 'Représentée par (nom)'],
    ['entreprise.fonction', 'Fonction du représentant'], ['entreprise.email', 'E-mail du représentant', 'email'], ['entreprise.lieu', 'Lieu de formation si différent'],
    ['assurance.assureur', 'Assureur de l’entreprise'], ['assurance.contrat', 'N° de contrat d’assurance']]],
  ['Le tuteur', [['tuteur.nom', 'Nom et prénom du tuteur'], ['tuteur.fonction', 'Fonction'], ['tuteur.email', 'E-mail', 'email'], ['tuteur.tel', 'Téléphone']]],
  ['Le stage', [['stage.du', 'Du', 'date'], ['stage.au', 'Au', 'date'], ['referent.nom', 'Enseignant référent'], ['diplome', 'Diplôme préparé']]],
];
const lireChemin = (o, c) => c.split('.').reduce((x, k) => (x || {})[k], o);
const ecrireChemin = (o, c, v) => { const k = c.split('.'), d = k.pop(); k.reduce((x, y) => (x[y] = x[y] || {}), o)[d] = v; };
A.convFormulaire = el => {
  const dem = S.el.demandes.liste.find(x => x.id === el.dataset.id); if (!dem) return;
  const B = brouillonConvention(dem), h = B.horaires;
  const resume = CONV.JOURS_SEMAINE.filter(([j]) => CONV.dureeJour(h, j) > 0).map(([j, l]) => `${l} ${[h[j + '_matin_de'] && `${h[j + '_matin_de']}–${h[j + '_matin_a']}`, h[j + '_apresmidi_de'] && `${h[j + '_apresmidi_de']}–${h[j + '_apresmidi_a']}`].filter(Boolean).join(' / ')}`).join(' · ');
  modal(`<h2>📜 Créer ma convention de stage</h2>
    <div class="alerte info petit">🔒 Ces informations sont <b>chiffrées sur ton appareil</b> : seules les personnes qui ont le lien (et leur code) pourront les lire. Vérifie-les bien : après la première signature, la convention ne peut plus être modifiée.</div>
    ${CHAMPS_CONV.map(([titre, champs]) => `<h3>${titre}</h3><div class="deux">${champs.map(([c, l, type]) => `<label>${l}<input data-conv="${c}" ${type ? `type="${type}"` : ''} value="${esc(lireChemin(B, c) || '')}"></label>`).join('')}</div>
      ${titre === 'Le tuteur' ? '<label><input type="checkbox" id="conv_meme">Le tuteur est aussi le représentant de l’entreprise (une seule signature)</label>' : ''}`).join('')}
    <p class="petit"><b>Horaires</b> (repris du protocole) : ${esc(resume || 'non renseignés — complète-les dans la page Protocole')}</p>
    <div class="actions"><button class="btn" data-a="convCreer" data-id="${dem.id}">🔐 Créer la convention et obtenir les liens</button></div>`, true);
};
A.convCreer = async el => {
  const dem = S.el.demandes.liste.find(x => x.id === el.dataset.id), D = brouillonConvention(dem);
  for (const i of $$('[data-conv]')) ecrireChemin(D, i.dataset.conv, i.value.trim());
  D.tuteur.memeQueRepresentant = !!($('#conv_meme') && $('#conv_meme').checked);
  if (D.tuteur.memeQueRepresentant) { D.tuteur.nom = D.tuteur.nom || D.entreprise.representant; }
  const manque = [['eleve.nom', 'ton nom'], ['eleve.prenom', 'ton prénom'], ['eleve.naissance', 'ta date de naissance'], ['eleve.adresse', 'ton adresse'],
    ['entreprise.nom', 'le nom de l’entreprise'], ['entreprise.representant', 'le représentant de l’entreprise'], ['stage.du', 'la date de début'], ['stage.au', 'la date de fin']]
    .filter(([c]) => !lireChemin(D, c)).map(([, l]) => l);
  if (!D.tuteur.memeQueRepresentant && !D.tuteur.nom) manque.push('le nom du tuteur');
  const ageDebut = CONV.age(D.eleve.naissance, D.stage.du); D.mineur = ageDebut != null && ageDebut < 18;
  if (D.mineur && !D.representant.nom) manque.push('le nom de ton représentant légal (tu es mineur)');
  if (manque.length) throw new Error('À compléter : ' + manque.join(', ') + '.');
  if (D.stage.au < D.stage.du) throw new Error('La date de fin est avant la date de début.');
  D.v = 1; D.creeLe = maintenant(); D.etab = etabCourant();
  const roles = CONV.rolesRequis(D), cle = CONV.nouvelleCle(), codes = {};
  for (const r of roles) if (CONV.ROLES[r].externe) codes[r] = CONV.nouveauCode();
  const kek = await clePersonnelle();
  const chiffre = await CONV.chiffrer(D, cle), cleEleve = await CONV.chiffrer({ k: cle, codes }, kek);
  const m = await api('POST', '/api/convention/creer', { demandeId: dem.id, chiffre, roles, codes, cleEleve });
  dem.conventionId = m.id; await chargerConventions();
  journal(`Convention de stage créée (${D.entreprise.nom})`);
  modal(''); render(); afficherLiens(m.id, cle, codes, D);
};
function afficherLiens(id, cle, codes, D) {
  const lien = CONV.lien(id, cle), m = (S.convs || []).find(c => c.id === id) || { roles: CONV.rolesRequis(D), signatures: {} };
  const qui = { representant: D.representant, entreprise: { nom: D.entreprise.representant, email: D.entreprise.email }, tuteur: D.tuteur, referent: D.referent, chef: { nom: D.etab.chef }, eleve: { nom: `${D.eleve.prenom} ${D.eleve.nom}` } };
  const sujet = `Convention de stage de ${D.eleve.prenom} ${D.eleve.nom} - ${D.entreprise.nom}`;
  const corps = r => `Bonjour,\n\nVoici le lien pour lire et signer la convention de stage de ${D.eleve.prenom} ${D.eleve.nom} (${D.eleve.classe}) chez ${D.entreprise.nom}, du ${fmt(D.stage.du)} au ${fmt(D.stage.au)} :\n${lien}\n\n` +
    (codes[r] ? `Votre code personnel de signature : ${codes[r]}\n` : 'Connectez-vous avec votre compte de l’application « Suivi des stages » pour signer.\n') +
    '\nVous pourrez signer à l’écran (doigt, stylet ou souris) ou envoyer la photo de votre signature' + (CONV.ROLES[r].cachet ? ' et du cachet' : '') + '.\n\nMerci.';
  const lignes = m.roles.filter(r => r !== 'eleve').map(r => {
    const p = qui[r] || {}, mail = `mailto:${encodeURIComponent(p.email || '')}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps(r))}`;
    return `<tr><td><b>${esc(CONV.ROLES[r].court)}</b><br><span class="petit doux">${esc(p.nom || '')}</span></td>
      <td>${codes[r] ? `<code class="code-sig">${esc(codes[r])}</code>` : '<span class="petit doux">Se connecte avec son compte</span>'}</td>
      <td>${m.signatures[r] ? '✅ Signé' : `<a class="btn mini" href="${esc(mail)}">✉️ Préparer l’e-mail</a>`}</td></tr>`;
  }).join('');
  modal(`<h2>🔗 Liens de signature</h2>
    <p>Le même lien sert à tout le monde. Les signataires de l’entreprise et ton représentant légal ont en plus un <b>code personnel</b> : sans lui, le lien ne suffit pas.</p>
    <label>Lien de la convention<div class="ligne"><input id="conv_lien" readonly value="${esc(lien)}"><button class="btn sec" data-a="copierLien">📋 Copier</button></div></label>
    <div class="alerte attention petit">⚠️ Garde ce lien précieusement (par exemple dans un e-mail envoyé à toi-même) : il contient la clé qui permet de lire ta convention.
      Conseil : donne le code à chaque personne <b>séparément</b> du lien (par SMS ou de vive voix) quand c’est possible.</div>
    <div class="table-scroll"><table><tr><th>Signataire</th><th>Code</th><th></th></tr>${lignes}</table></div>
    <p class="petit doux">« Préparer l’e-mail » ouvre ta messagerie avec le lien et le code déjà écrits : il ne reste qu’à vérifier l’adresse et envoyer.</p>`, true);
}
A.copierLien = async () => { const i = $('#conv_lien'); i.select(); try { await navigator.clipboard.writeText(i.value); toast('Lien copié'); } catch { document.execCommand('copy'); toast('Lien copié'); } };
async function ouvrirConvention(id) {
  const r = await api('POST', '/api/convention/lire', { id });
  const env = await ouvrirEnveloppe(r.cleEleve);
  const D = await CONV.dechiffrer(r.chiffre, env.k), sigs = {};
  for (const [role, c] of Object.entries(r.sig || {})) { sigs[role] = await CONV.dechiffrer(c, env.k); if (r.meta.signatures[role]) sigs[role].signeLe = r.meta.signatures[role].le; }
  return { r, env, D, sigs };
}
A.convLiens = async el => { const { env, D } = await ouvrirConvention(el.dataset.id); afficherLiens(el.dataset.id, env.k, env.codes || {}, D); };
A.convSignerMoi = async el => { const { env } = await ouvrirConvention(el.dataset.id); window.open(CONV.lien(el.dataset.id, env.k) + '&r=eleve', '_blank', 'noopener'); };
A.convPdf = async el => {
  const { D, sigs } = await ouvrirConvention(el.dataset.id);
  const url = URL.createObjectURL(new Blob([await CONV.pdf(D, sigs)], { type: 'application/pdf' }));
  const nom = `Convention_${D.eleve.nom}_${D.eleve.prenom}_${D.entreprise.nom}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 80) + '.pdf';
  modal(`<h2>📄 Convention de stage</h2><iframe id="apercuPdf" class="apercu-pdf" src="${url}" title="Convention de stage"></iframe>
    <div class="actions"><button class="btn" data-a="protoImprimer">🖨️ Imprimer</button><a class="btn sec" href="${url}" download="${esc(nom)}">⬇️ Télécharger</a>
    <a class="btn sec" href="${url}" target="_blank" rel="noopener">↗️ Ouvrir dans un nouvel onglet</a></div>`, true);
};

/* ---------- Professeur : suivi des conventions ---------- */
const convsDe = e => (S.conventions || []).filter(c => c.eleveId === e.id);
function badgeConvention(e) {
  const l = convsDe(e); if (!l.length) return '';
  const m = l.find(c => c.statut === 'signee') || l[0], nb = Object.keys(m.signatures).length;
  return m.statut === 'signee' ? '<span class="badge" style="background:#15803d">📜 convention signée</span>' : `<span class="badge" style="background:#0369a1">📜 convention ${nb}/${m.roles.length}</span>`;
}
function blocConventionProf(e, x) {
  const m = convsDe(e).find(c => c.demandeId === x.id); if (!m) return '';
  return `<div class="demande" style="--c:${m.statut === 'signee' ? '#15803d' : '#0369a1'}"><div class="tete"><b>📜 Convention — ${esc(x.nom)}</b>
      <span class="badge" style="background:${m.statut === 'signee' ? '#15803d' : '#0369a1'}">${m.statut === 'signee' ? 'Signée' : `${Object.keys(m.signatures).length}/${m.roles.length} signatures`}</span></div>
    <ul class="liste-sig petit">${etatSignatures(m)}</ul>
    <p class="petit doux">Pour lire ou signer la convention, utilisez le lien transmis par l’élève (le contenu est chiffré : il n’est pas lisible depuis la console).</p>
    ${estReferentDe(e) ? `<div class="actions"><button class="btn mini danger" data-a="convAnnuler" data-id="${m.id}">Annuler cette convention</button></div>` : ''}</div>`;
}
A.convAnnuler = async el => {
  if (!confirm('Annuler cette convention ? Les signatures déjà recueillies seront perdues et l’élève devra en créer une nouvelle.')) return;
  await api('POST', '/api/convention/supprimer', { id: el.dataset.id }); await chargerEleves(); render(); toast('Convention annulée');
};
function sectionConventionsAlertes() {
  const enCours = (S.conventions || []).filter(c => c.statut === 'en_cours');
  const el = id => S.eleves.find(e => e.id === id), manque = m => m.roles.filter(r => !m.signatures[r]);
  const pourMoi = enCours.filter(m => S.user.chef && !m.signatures.chef);
  return `<section class="carte"><h2>📜 Conventions en attente de signatures (${enCours.length})</h2>
    ${S.user.chef ? `<p class="petit">Vous signez pour le chef d’établissement : <b>${pourMoi.length}</b> convention(s) attendent votre signature (lien transmis par l’élève ou le référent).</p>` : ''}
    ${enCours.length ? enCours.map(m => { const e = el(m.eleveId); return e ? `<p><b>${esc(nomEleve(e))}</b> <span class="petit doux">${esc((classeDe(e.d) || {}).nom || '')}</span> — manque : ${manque(m).map(r => esc(CONV.ROLES[r].court)).join(', ')}
      <button class="btn mini sec" data-a="ouvrir" data-id="${e.id}" data-o="suivi">Ouvrir le dossier</button></p>` : ''; }).join('') : '<p class="doux">Aucune convention en cours.</p>'}</section>`;
}

/* ---------- Professeur : paramètres de l'établissement et délégation de signature ---------- */
const CHAMPS_ETAB = [['nom', 'Nom de l’établissement'], ['adresse', 'Adresse'], ['adressePostale', 'Adresse postale (courrier, sur 2 lignes)'], ['tel', 'Téléphone'],
  ['mail', 'E-mail de l’établissement'], ['chef', 'Chef d’établissement (ex. Monsieur LE TORTOREC)'], ['qualiteChef', 'En qualité de'], ['ville', 'Ville (« Fait à »)'],
  ['signataireCourrier', 'Signataire du courrier (ex. Le DDFPT)'], ['adresseRetour', 'Adresse de retour des conventions'], ['dateCA', 'Date de la délibération du CA (convention-type)'],
  ['assureur', 'Assureur de l’établissement'], ['contrat', 'N° de contrat d’assurance de l’établissement']];
function carteEtablissement() {
  const e = etabCourant();
  return `<details class="carte" style="margin:0 0 14px"><summary><b>🏫 Paramètres de l’établissement (conventions)</b></summary>
    <p class="doux petit">Ces informations figurent sur chaque convention créée par les élèves (les conventions déjà créées ne changent pas).</p>
    <div class="deux">${CHAMPS_ETAB.map(([k, l]) => k === 'adressePostale' ? `<label>${l}<textarea id="et_${k}" rows="2">${esc(e[k])}</textarea></label>` : `<label>${l}<input id="et_${k}" value="${esc(e[k])}"></label>`).join('')}</div>
    <button class="btn" data-a="sauverEtab">Enregistrer</button></details>
  <div class="carte" style="margin:0 0 14px"><h3>✍️ Signature pour le chef d’établissement</h3>
    ${S.user.chef ? `<p>✅ Vous pouvez signer les conventions pour le chef d’établissement (ou par délégation).</p><button class="btn mini sec" data-a="chefRetirer">Retirer ce droit</button>`
      : `<p class="doux petit">Réservé au chef d’établissement, à son adjoint ou au DDFPT. Saisissez le code « chef d’établissement » (fourni par le gestionnaire du script Google).</p>
      <div class="ligne"><input id="chef_code" placeholder="CHEF-…" aria-label="Code chef d’établissement"><button class="btn" data-a="chefActiver">Activer</button></div>`}</div>`;
}
A.sauverEtab = async () => {
  const e = {}; for (const [k] of CHAMPS_ETAB) e[k] = val('et_' + k);
  await putDoc('commun/etablissement', e); S.etab = { ...CONV.ETAB_DEFAUT, ...e }; render(); toast('Paramètres enregistrés');
};
A.chefActiver = async () => { S.user = { ...S.user, ...(await api('POST', '/api/moi/chef', { code: val('chef_code') })) }; render(); toast('Droit de signature activé'); };
A.chefRetirer = async () => { S.user = { ...S.user, ...(await api('POST', '/api/moi/chef', { retirer: true })) }; render(); };
