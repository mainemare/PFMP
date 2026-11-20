'use strict';
/* ===== CV : 5 modèles à compléter, avec conseils, banques de phrases et correction (orthographe, grammaire) =====
 * - Le contenu du CV (profil, formation, expériences, compétences…) est enregistré dans le dossier de l'élève (cv.redaction).
 * - L'identité et les coordonnées (nom, adresse, téléphone, e-mail) restent sur l'appareil de l'élève : elles ne sont écrites
 *   que dans le PDF.
 * - La correction utilise le service LanguageTool (api.languagetool.org) : seuls les textes du CV lui sont envoyés,
 *   jamais l'identité ni les coordonnées. */
S.cvOnglet = null;
const CV_MODELES = [
  { id: 'classique', nom: 'Classique', desc: 'Sobre, une colonne : convient à tous les métiers.' },
  { id: 'moderne', nom: 'Moderne', desc: 'Colonne de couleur à gauche pour les coordonnées et les compétences.' },
  { id: 'entete', nom: 'Bandeau', desc: 'Grand bandeau de couleur en haut, deux colonnes.' },
  { id: 'compact', nom: 'Compact', desc: 'Petite écriture, titres sur fond de couleur : pour un CV bien rempli.' },
  { id: 'creatif', nom: 'Créatif', desc: 'Initiales dans une pastille, titres en étiquettes de couleur.' },
];
const CV_COULEURS = [['#1d4ed8', 'Bleu'], ['#047857', 'Vert'], ['#9f1239', 'Bordeaux'], ['#334155', 'Anthracite'], ['#c2410c', 'Orange']];

/* ---------- Banques de conseils selon la filière ---------- */
const FILIERES = [
  { re: /MELEC|ELEC|[ée]lectr/i, domaine: 'l’électricité', comp: ['Lire un schéma électrique', 'Câbler un tableau électrique', 'Poser des goulottes, gaines et appareillages', 'Utiliser l’outillage électroportatif', 'Respecter les règles de sécurité électrique', 'Effectuer des mesures (multimètre)'] },
  { re: /MSPC|MEI|maintenance des syst|industri/i, domaine: 'la maintenance industrielle', comp: ['Réaliser une maintenance préventive', 'Diagnostiquer une panne simple', 'Démonter et remonter un ensemble mécanique', 'Lire un plan ou un dossier technique', 'Respecter les consignes de sécurité'] },
  { re: /MV|auto|v[ée]hicule|carross/i, domaine: 'la maintenance automobile', comp: ['Réaliser une vidange et un entretien courant', 'Remplacer des pièces d’usure (freins, pneus)', 'Utiliser un outil de diagnostic', 'Ranger et entretenir l’atelier', 'Respecter les règles de sécurité de l’atelier'] },
  { re: /commerce|vente|MCV|MRC|NDRC|vendeu|accueil/i, domaine: 'le commerce et la vente', comp: ['Accueillir et conseiller la clientèle', 'Mettre en rayon et faire le facing', 'Tenir une caisse et encaisser', 'Réceptionner et contrôler une livraison', 'Participer à l’inventaire'] },
  { re: /cuisine|CSR|h[ôo]tel|restaur|boulang|p[âa]tiss|commercialisation et services/i, domaine: 'la restauration', comp: ['Respecter les règles d’hygiène (HACCP)', 'Réaliser la mise en place', 'Préparer des plats simples', 'Dresser et servir les assiettes', 'Entretenir le poste de travail'] },
  { re: /ASSP|AEPE|accompagn|SAPAT|petite enfance|soin/i, domaine: 'l’accompagnement des personnes', comp: ['Aider une personne dans les gestes du quotidien', 'Respecter les règles d’hygiène', 'Animer une activité', 'Communiquer avec bienveillance', 'Préparer et servir une collation'] },
  { re: /logist|\bOL\b|transport|entrep/i, domaine: 'la logistique', comp: ['Réceptionner et contrôler des marchandises', 'Préparer des commandes', 'Utiliser un scanner et un logiciel de stock', 'Ranger en respectant les règles de stockage', 'Respecter les règles de sécurité (gestes et postures)'] },
  { re: /AGORA|gestion|administr|secr[ée]tar|\bGA\b/i, domaine: 'la gestion administrative', comp: ['Accueillir au téléphone et physiquement', 'Classer et archiver des documents', 'Utiliser le traitement de texte et le tableur', 'Rédiger un courrier ou un mail simple', 'Saisir des données'] },
  { re: /TFCA|chauff|climat|plomb|[ée]nerg|sanitaire/i, domaine: 'les installations énergétiques', comp: ['Lire un plan d’installation', 'Façonner et assembler des tubes', 'Poser des appareils sanitaires', 'Participer à la mise en service', 'Respecter les règles de sécurité du chantier'] },
  { re: /menuis|bois|TMA|agencement/i, domaine: 'la menuiserie', comp: ['Lire un plan', 'Utiliser les machines à bois en sécurité', 'Assembler et poser des éléments', 'Réaliser des finitions', 'Entretenir les outils'] },
];
const COMP_COMMUNES = ['Travailler en équipe', 'Respecter les consignes et les délais', 'Utiliser les outils numériques (traitement de texte, tableur)', 'Communiquer avec les clients ou les collègues'];
const QUALITES = ['Ponctuel(le)', 'Sérieux(se)', 'Motivé(e)', 'Curieux(se)', 'Autonome', 'Esprit d’équipe', 'Soigneux(se)', 'Polyvalent(e)', 'À l’écoute', 'Dynamique', 'Organisé(e)', 'Rigoureux(se)', 'Souriant(e)', 'Patient(e)', 'Respectueux(se)'];
const VERBES = ['Accueillir', 'Conseiller', 'Installer', 'Câbler', 'Préparer', 'Ranger', 'Entretenir', 'Contrôler', 'Réparer', 'Aider à', 'Mettre en rayon', 'Encaisser', 'Nettoyer', 'Participer à', 'Utiliser'];
function filiereEleve() {
  const cl = S.classes.find(c => c.id === S.el.profil.classeId), t = cl ? `${cl.nom} ${cl.diplome || ''}` : '';
  return FILIERES.find(f => f.re.test(t)) || { domaine: 'mon futur métier', comp: [] };
}
function anneeScolaire() { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; }
function periodeTexte() { const dt = datesEleve(S.el); return dt ? `du ${fmt(dt.debut)} au ${fmt(dt.fin)}` : ''; }
function redactionDefaut() {
  const cl = S.classes.find(c => c.id === S.el.profil.classeId), p = periodeTexte();
  return { modele: 'classique', couleur: '#1d4ed8', titre: `${cl ? (cl.diplome || cl.nom) : 'Élève de lycée professionnel'}${p ? ` — Recherche un stage ${p}` : ''}`,
    accroche: '', formations: [{ annee: anneeScolaire(), intitule: cl ? (cl.diplome || cl.nom) : '', lieu: 'Lycée Raymond Queneau, Yvetot' }, { annee: '', intitule: 'Diplôme national du brevet', lieu: '' }],
    experiences: [{ dates: '', poste: '', entreprise: '', missions: '' }], competences: '', qualites: '', langues: 'Anglais : niveau scolaire', permis: '', loisirs: '' };
}
const cleIdentite = () => 'cv_identite_' + (S.user && S.user.id);
function identiteCV() { try { return Object.assign({ prenom: S.el.profil.prenom, nom: '', adresse: '', ville: '', tel: '', email: '', age: '' }, JSON.parse(localStorage.getItem(cleIdentite()) || '{}')); } catch { return { prenom: S.el.profil.prenom, nom: '', adresse: '', ville: '', tel: '', email: '', age: '' }; } }
function memoriserIdentite(id) { try { localStorage.setItem(cleIdentite(), JSON.stringify(id)); } catch { /* stockage indisponible */ } }
const redaction = () => { if (!S.el.cv.redaction) S.el.cv.redaction = redactionDefaut(); return S.el.cv.redaction; };

/* ---------- Page CV : modèle ou dépôt d'un CV déjà fait ---------- */
function vueCV(doc) {
  const onglet = S.cvOnglet || (doc.fichierLe && !doc.redaction ? 'depot' : 'modele');
  const tete = `<div class="onglets" style="margin-bottom:12px"><button class="${onglet === 'modele' ? 'actif' : ''}" data-a="cvOnglet" data-o="modele">✍️ Créer mon CV avec un modèle</button>
    <button class="${onglet === 'depot' ? 'actif' : ''}" data-a="cvOnglet" data-o="depot">📤 Déposer un CV déjà fait${doc.fichierLe ? ' · voir les annotations' : ''}</button></div>`;
  return tete + (onglet === 'depot' ? vueDepot('cv', doc) : vueModeleCV(doc));
}
A.cvOnglet = el => { if ($('#cv_form')) lireCV(); S.cvOnglet = el.dataset.o; render(); };

function aide(titre, contenu) { return `<details class="aide"><summary>💡 ${titre}</summary><div class="petit">${contenu}</div></details>`; }
const puces = (liste, action, champ) => `<div class="puces">${liste.map(v => `<button type="button" class="puce" data-a="${action}" data-champ="${champ}" data-v="${esc(v)}">+ ${esc(v)}</button>`).join('')}</div>`;
function vueModeleCV(doc) {
  const r = redaction(), id = identiteCV(), fil = filiereEleve(), p = periodeTexte(), nb = nbAnnotations(doc);
  const champ = (k, label, v, ph, extra = '') => `<label>${label}<input id="cvi_${k}" value="${esc(v)}" placeholder="${esc(ph)}" ${extra}></label>`;
  const accroches = [
    `Élève en ${S.classes.find(c => c.id === S.el.profil.classeId)?.nom || '…'} au lycée Raymond Queneau, je recherche un stage${p ? ' ' + p : ''} pour découvrir ${fil.domaine} et mettre en pratique ce que j’apprends.`,
    'Sérieux(se) et motivé(e), j’aime le travail bien fait et le contact avec les autres. Je souhaite apprendre au sein de votre entreprise pendant ma période de formation en milieu professionnel.',
    `Passionné(e) par ${fil.domaine}, je veux progresser au contact de professionnels et montrer ma motivation pour mon futur métier.`,
  ];
  return `${doc.fichierLe ? `<div class="alerte info petit">📄 CV déposé le ${fmtDT(doc.fichierLe)}${nb ? ` · ✏️ <b>${nb} annotation${nb > 1 ? 's' : ''}</b> de ton professeur` : ''}. <button class="lien" style="display:inline" data-a="voirFichier" data-t="cv">Voir</button></div>` : ''}
  ${blocCorrection(doc)}
  <div class="cv-zone" id="cv_form">
   <div class="cv-saisie">
    <section class="carte"><h2>1. Choisis un modèle</h2>
      <div class="cv-modeles">${CV_MODELES.map(m => `<button type="button" class="cv-modele ${r.modele === m.id ? 'actif' : ''}" data-a="cvModele" data-m="${m.id}" aria-pressed="${r.modele === m.id}"><b>${m.nom}</b><span>${m.desc}</span></button>`).join('')}</div>
      <div class="cv-couleurs" role="radiogroup" aria-label="Couleur">${CV_COULEURS.map(([c, n]) => `<button type="button" class="cv-couleur ${r.couleur === c ? 'actif' : ''}" style="background:${c}" data-a="cvCouleur" data-c="${c}" aria-label="${n}" aria-pressed="${r.couleur === c}"></button>`).join('')}</div></section>

    <section class="carte"><h2>2. Qui je suis</h2>
      <p class="doux petit">🔒 Ces informations restent sur cet appareil : elles ne sont pas enregistrées dans l’application, seulement imprimées sur ton CV.</p>
      <div class="deux">${champ('prenom', 'Prénom', id.prenom, '')}${champ('nom', 'Nom', id.nom, 'DUPONT', 'style="text-transform:uppercase"')}${champ('age', 'Âge', id.age, '16 ans')}</div>
      <div class="deux">${champ('adresse', 'Adresse', id.adresse, '12 rue des Lilas')}${champ('ville', 'Code postal et commune', id.ville, '76190 Yvetot')}</div>
      <div class="deux">${champ('tel', 'Téléphone', id.tel, '06 12 34 56 78', 'type="tel"')}${champ('email', 'E-mail', id.email, 'prenom.nom@…', 'type="email"')}</div>
      ${aide('Une adresse mail sérieuse', 'Utilise une adresse du type <b>prenom.nom@…</b>. Évite les pseudos (« bg76@… », « lol… ») : le recruteur la lit en premier.')}</section>

    <section class="carte"><h2>3. Titre et profil</h2>
      <label>Titre du CV<input id="cv_titre" value="${esc(r.titre)}" spellcheck="true" lang="fr"></label>
      ${aide('Le titre', 'Il dit en une ligne qui tu es et ce que tu cherches : <i>« Élève en 1re bac pro MELEC — Recherche un stage du 23/11 au 12/12 »</i>.')}
      <label>Mon profil (2 ou 3 phrases)<textarea id="cv_accroche" rows="3" spellcheck="true" lang="fr" data-i="cvCompte" data-max="350">${esc(r.accroche)}</textarea></label>
      <div class="petit doux" id="cv_accroche_n">${r.accroche.length}/350 caractères</div>
      ${aide('Écrire mon profil', `Présente-toi en 2 ou 3 phrases : ta formation, ce que tu cherches, une ou deux qualités. Clique sur un exemple pour l’utiliser, puis <b>personnalise-le</b> :
        ${accroches.map((a, i) => `<button type="button" class="exemple" data-a="cvAccroche" data-i="${i}">« ${esc(a)} »</button>`).join('')}`)}</section>

    <section class="carte"><h2>4. Formation</h2>
      ${(r.formations || []).map((f, i) => `<div class="cv-ligne" data-l="formations" data-i="${i}"><div class="deux"><label>Année(s)<input class="f-annee" value="${esc(f.annee)}" placeholder="${anneeScolaire()}"></label>
        <label>Diplôme ou classe<input class="f-intitule" value="${esc(f.intitule)}" spellcheck="true" lang="fr"></label><label>Établissement, ville<input class="f-lieu" value="${esc(f.lieu)}" spellcheck="true" lang="fr"></label></div>
        <button type="button" class="lien petit" data-a="cvRetirer" data-l="formations" data-i="${i}">Retirer</button></div>`).join('')}
      <button type="button" class="btn mini sec" data-a="cvAjouterLigne" data-l="formations">+ Ajouter une formation</button>
      ${aide('La formation', 'Du plus récent au plus ancien : ta classe actuelle, puis le brevet (obtenu ou en cours), les certificats (PSC1, SST, BSR, habilitation électrique…).')}</section>

    <section class="carte"><h2>5. Expériences</h2>
      ${(r.experiences || []).map((x, i) => `<div class="cv-ligne" data-l="experiences" data-i="${i}"><div class="deux"><label>Dates<input class="x-dates" value="${esc(x.dates)}" placeholder="Juin 2026 (2 semaines)"></label>
        <label>Poste ou activité<input class="x-poste" value="${esc(x.poste)}" placeholder="Stage d’observation, job d’été…" spellcheck="true" lang="fr"></label><label>Entreprise, ville<input class="x-entreprise" value="${esc(x.entreprise)}" spellcheck="true" lang="fr"></label></div>
        <label>Ce que j’ai fait <span class="doux petit">(une action par ligne)</span><textarea class="x-missions" rows="3" spellcheck="true" lang="fr" data-i="cvFocus">${esc(x.missions)}</textarea></label>
        <button type="button" class="lien petit" data-a="cvRetirer" data-l="experiences" data-i="${i}">Retirer</button></div>`).join('')}
      <button type="button" class="btn mini sec" data-a="cvAjouterLigne" data-l="experiences">+ Ajouter une expérience</button>
      ${aide('Pas encore d’expérience ?', `Tout compte : stage de 3e ou de seconde, PFMP précédente, job d’été, baby-sitting, aide dans l’entreprise familiale, bénévolat, club de sport, délégué de classe…
        Commence chaque ligne par un <b>verbe d’action</b> (clique pour l’ajouter dans la dernière expérience sur laquelle tu as écrit) :`)}
      ${puces(VERBES, 'cvVerbe', 'missions')}</section>

    <section class="carte"><h2>6. Compétences et qualités</h2>
      <label>Mes compétences <span class="doux petit">(une par ligne, 4 à 6)</span><textarea id="cv_competences" rows="4" spellcheck="true" lang="fr">${esc(r.competences)}</textarea></label>
      ${aide(`Idées de compétences (${esc(fil.domaine)})`, 'Choisis seulement ce que tu sais vraiment faire : le tuteur peut te poser la question.')}
      ${puces([...fil.comp, ...COMP_COMMUNES], 'cvPuce', 'competences')}
      <label style="margin-top:12px">Mes qualités <span class="doux petit">(une par ligne, 3 à 5)</span><textarea id="cv_qualites" rows="3" spellcheck="true" lang="fr">${esc(r.qualites)}</textarea></label>
      ${puces(QUALITES, 'cvPuce', 'qualites')}
      <p class="doux petit">Accorde les qualités selon toi : « sérieux » ou « sérieuse ».</p></section>

    <section class="carte"><h2>7. Langues, permis, centres d’intérêt</h2>
      <div class="deux"><label>Langues<input id="cv_langues" value="${esc(r.langues)}" spellcheck="true" lang="fr"></label><label>Permis, BSR, certificats<input id="cv_permis" value="${esc(r.permis)}" placeholder="BSR, PSC1…" spellcheck="true" lang="fr"></label></div>
      <label>Centres d’intérêt <span class="doux petit">(une ligne chacun, sois précis)</span><textarea id="cv_loisirs" rows="3" spellcheck="true" lang="fr">${esc(r.loisirs)}</textarea></label>
      ${aide('Des centres d’intérêt qui parlent', 'Sois précis : « Football en club depuis 5 ans (capitaine) » vaut mieux que « Sport ». « Réparer des vélos », « Cuisine pour ma famille » montrent des qualités utiles en stage.')}</section>
   </div>
   <aside class="cv-apercu-col">
    <section class="carte cv-collant"><h2>Aperçu</h2>
      <canvas id="cv_apercu" class="cv-apercu" aria-label="Aperçu du CV"></canvas>
      <div class="actions"><button class="btn sec" data-a="cvApercu">🔄 Actualiser</button><button class="btn sec" data-a="cvVerifier">✔️ Vérifier l’orthographe</button></div>
      <div id="cv_fautes"></div>
      <div id="cv_conseils">${conseilsCV(r, id)}</div>
      <div class="actions"><button class="btn" data-a="cvEnregistrer">💾 Enregistrer</button><button class="btn sec" data-a="cvTelecharger">⬇️ Télécharger le PDF</button></div>
      <div class="actions"><button class="btn" data-a="cvDeposer">📤 Déposer ce CV pour mon professeur</button></div>
      <p class="doux petit">La vérification envoie seulement les textes du CV (pas ton nom ni tes coordonnées) au service de correction LanguageTool.</p></section>
   </aside>
  </div>`;
}

/* ---------- Lecture du formulaire ---------- */
function lireCV() {
  if (!$('#cv_form')) return redaction();
  const r = redaction(), v = id => ($('#' + id) || {}).value || '';
  const id = { prenom: v('cvi_prenom').trim(), nom: v('cvi_nom').trim().toUpperCase(), age: v('cvi_age').trim(), adresse: v('cvi_adresse').trim(), ville: v('cvi_ville').trim(), tel: v('cvi_tel').trim(), email: v('cvi_email').trim() };
  memoriserIdentite(id);
  Object.assign(r, { titre: v('cv_titre').trim(), accroche: v('cv_accroche').trim(), competences: v('cv_competences'), qualites: v('cv_qualites'), langues: v('cv_langues').trim(), permis: v('cv_permis').trim(), loisirs: v('cv_loisirs') });
  r.formations = $$('.cv-ligne[data-l="formations"]').map(d => ({ annee: $('.f-annee', d).value.trim(), intitule: $('.f-intitule', d).value.trim(), lieu: $('.f-lieu', d).value.trim() }));
  r.experiences = $$('.cv-ligne[data-l="experiences"]').map(d => ({ dates: $('.x-dates', d).value.trim(), poste: $('.x-poste', d).value.trim(), entreprise: $('.x-entreprise', d).value.trim(), missions: $('.x-missions', d).value }));
  return r;
}
const lignes = s => String(s || '').split('\n').map(x => x.replace(/^[\s•\-–*]+/, '').trim()).filter(Boolean);
const majCV = () => { lireCV(); render(); };
A.cvModele = el => { lireCV(); redaction().modele = el.dataset.m; render(); };
A.cvCouleur = el => { lireCV(); redaction().couleur = el.dataset.c; render(); };
A.cvAjouterLigne = el => { lireCV(); const r = redaction(), l = el.dataset.l; r[l] = r[l] || []; r[l].push(l === 'formations' ? { annee: '', intitule: '', lieu: '' } : { dates: '', poste: '', entreprise: '', missions: '' }); render(); };
A.cvRetirer = el => { lireCV(); const r = redaction(); r[el.dataset.l].splice(+el.dataset.i, 1); majCV(); };
A.cvAccroche = el => {
  const t = $('#cv_accroche'), ex = $$('.exemple')[+el.dataset.i];
  if (t.value.trim() && !confirm('Remplacer ton texte par cet exemple ?')) return;
  t.value = ex.textContent.replace(/^« | »$/g, ''); t.focus(); I.cvCompte(t); toast('Personnalise l’exemple avec tes mots !');
};
A.cvPuce = el => {
  const t = $('#cv_' + el.dataset.champ), v = el.dataset.v;
  if (lignes(t.value).includes(v)) return toast('Déjà dans ta liste');
  t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + v; el.classList.add('pris');
};
let derniereMission = null;
I.cvFocus = el => { derniereMission = el; };
document.addEventListener('focusin', ev => { if (ev.target.classList && ev.target.classList.contains('x-missions')) derniereMission = ev.target; });
A.cvVerbe = el => {
  const t = (derniereMission && document.body.contains(derniereMission)) ? derniereMission : $$('.x-missions').pop();
  if (!t) return toast('Ajoute d’abord une expérience', true);
  t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + el.dataset.v + ' '; t.focus(); t.setSelectionRange(t.value.length, t.value.length);
};
I.cvCompte = el => { const n = $('#cv_accroche_n'); if (n) { n.textContent = `${el.value.length}/350 caractères`; n.style.color = el.value.length > 350 ? '#b91c1c' : ''; } };

/* ---------- Conseils avant dépôt ---------- */
function conseilsCV(r, id) {
  const c = [];
  if (!id.nom) c.push('Indique ton nom de famille.');
  if (!id.tel && !id.email) c.push('Ajoute un téléphone ou un e-mail pour qu’on puisse te répondre.');
  if (id.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(id.email)) c.push('L’adresse e-mail semble incomplète.');
  if (!r.accroche) c.push('Écris ton profil en 2 ou 3 phrases (des exemples sont proposés).');
  else if (r.accroche.length > 350) c.push('Ton profil est un peu long : vise 2 ou 3 phrases.');
  if (!(r.experiences || []).some(x => x.poste || x.entreprise)) c.push('Ajoute au moins une expérience (stage de 3e, job, bénévolat, club…).');
  if (lignes(r.competences).length < 3) c.push('Ajoute 3 à 6 compétences.');
  if (lignes(r.qualites).length > 6) c.push('Garde tes 5 meilleures qualités.');
  return c.length ? `<div class="alerte attention petit"><b>Pour améliorer ton CV :</b><ul style="margin:4px 0 0;padding-left:18px">${c.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '<div class="alerte info petit">✅ Ton CV est complet. Fais vérifier l’orthographe, puis dépose-le.</div>';
}

/* ---------- PDF : 5 modèles ---------- */
const hexRgb = (L, h) => L.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
async function pdfCV(id, r) {
  for (const s of [1, 0.93, 0.86, 0.8, 0.74, 0.68]) {
    const o = await outilsPdf(false), fin = dessinerCV(o, id, r, s);
    if (fin <= o.H - 28 || s === 0.68) { o.doc.setTitle(`CV ${id.prenom} ${id.nom}`.trim()); return o.doc.save(); }
  }
}
function dessinerCV(o, id, r, s) {
  const { f, L, W, H } = o, acc = hexRgb(L, r.couleur || '#1d4ed8'), blanc = L.rgb(1, 1, 1), gris = L.rgb(0.35, 0.38, 0.45), noir = L.rgb(0.08, 0.1, 0.15);
  o.nouvellePage();
  const T = 10 * s, inter = 1.32;
  const nom = `${id.prenom} ${id.nom}`.trim() || 'Prénom NOM';
  const contact = [[id.adresse, id.ville].filter(Boolean).join(', '), id.tel, id.email, id.age, r.permis].filter(Boolean);
  const forms = (r.formations || []).filter(x => x.intitule || x.annee), exps = (r.experiences || []).filter(x => x.poste || x.entreprise || x.missions);
  // Colonne d'écriture
  const col = (x, w, y, coul = noir) => {
    const c = { x, w, y, coul };
    c.texte = (s2, t = T, font = f.n, cc = c.coul, retrait = 0) => { for (const l of o.couper(s2, t, w - retrait, font)) { o.txt(l, x + retrait, c.y + t, t, font, cc); c.y += t * inter; } };
    c.puces = (items, t = T, cc = c.coul, puceCoul = acc) => items.forEach(it => { o.txt('•', x, c.y + t, t, f.b, puceCoul); c.texte(it, t, f.n, cc, 9 * s); });
    c.esp = n => { c.y += n * s; };
    c.formation = (fo, cc = c.coul, cg = gris) => { c.texte(fo.intitule, T, f.b, cc); if (fo.annee || fo.lieu) c.texte([fo.annee, fo.lieu].filter(Boolean).join(' · '), T * 0.92, f.n, cg); c.esp(5); };
    c.experience = (xp, cc = c.coul, cg = gris) => {
      c.texte([xp.poste, xp.entreprise].filter(Boolean).join(' — '), T, f.b, cc);
      if (xp.dates) c.texte(xp.dates, T * 0.92, f.i, cg);
      c.puces(lignes(xp.missions), T * 0.95, cc); c.esp(5);
    };
    return c;
  };
  // Titres de section selon le modèle
  const titre = (c, t, style) => {
    c.esp(8); const tt = T * 1.12;
    if (style === 'souligne') { o.txt(t.toUpperCase(), c.x, c.y + tt, tt, f.b, acc); c.y += tt * 1.45; o.ligne(c.x, c.y - 2 * s, c.x + c.w, c.y - 2 * s, 0.8, acc); c.esp(5); }
    else if (style === 'blanc') { o.txt(t.toUpperCase(), c.x, c.y + tt, tt, f.b, blanc); c.y += tt * 1.45; o.ligne(c.x, c.y - 2 * s, c.x + c.w, c.y - 2 * s, 0.6, blanc); c.esp(5); }
    else if (style === 'bande') { o.page.drawRectangle({ x: c.x, y: H - c.y - tt * 1.7, width: c.w, height: tt * 1.7, color: acc }); o.txt(t.toUpperCase(), c.x + 6 * s, c.y + tt * 1.22, tt, f.b, blanc); c.y += tt * 1.7; c.esp(6); }
    else if (style === 'etiquette') { const w = o.large(t.toUpperCase(), tt, f.b) + 14 * s; o.page.drawRectangle({ x: c.x, y: H - c.y - tt * 1.7, width: w, height: tt * 1.7, color: acc }); o.txt(t.toUpperCase(), c.x + 7 * s, c.y + tt * 1.22, tt, f.b, blanc); c.y += tt * 1.7; c.esp(6); }
    else { o.page.drawRectangle({ x: c.x, y: H - c.y - tt * 1.2, width: 3 * s, height: tt * 1.2, color: acc }); o.txt(t, c.x + 8 * s, c.y + tt, tt, f.b, acc); c.y += tt * 1.5; c.esp(3); }
  };
  const sections = {
    profil: (c, st, cc) => { if (r.accroche) { titre(c, 'Profil', st); c.texte(r.accroche, T, f.n, cc); } },
    formation: (c, st, cc, cg) => { if (forms.length) { titre(c, 'Formation', st); forms.forEach(x => c.formation(x, cc, cg)); } },
    experiences: (c, st, cc, cg) => { if (exps.length) { titre(c, 'Expériences', st); exps.forEach(x => c.experience(x, cc, cg)); } },
    competences: (c, st, cc, pc) => { const l = lignes(r.competences); if (l.length) { titre(c, 'Compétences', st); c.puces(l, T, cc, pc); } },
    qualites: (c, st, cc, pc) => { const l = lignes(r.qualites); if (l.length) { titre(c, 'Qualités', st); c.puces(l, T, cc, pc); } },
    langues: (c, st, cc) => { if (r.langues) { titre(c, 'Langues', st); c.texte(r.langues, T, f.n, cc); } },
    loisirs: (c, st, cc, pc) => { const l = lignes(r.loisirs); if (l.length) { titre(c, 'Centres d’intérêt', st); c.puces(l, T, cc, pc); } },
  };
  const m = r.modele || 'classique';
  if (m === 'classique') {
    const c = col(46, W - 92, 40);
    o.centre(nom, W / 2, c.y + 22 * s, 22 * s, f.b, noir); c.y += 30 * s;
    if (r.titre) { o.couper(r.titre, 11.5 * s, W - 120, f.b).forEach(l => { o.centre(l, W / 2, c.y + 11.5 * s, 11.5 * s, f.b, acc); c.y += 15 * s; }); }
    o.couper(contact.join('  ·  '), 9 * s, W - 120).forEach(l => { o.centre(l, W / 2, c.y + 9 * s, 9 * s, f.n, gris); c.y += 12 * s; });
    c.esp(4); o.ligne(46, c.y, W - 46, c.y, 1.2, acc);
    ['profil', 'experiences', 'formation', 'competences', 'qualites', 'langues', 'loisirs'].forEach(k => sections[k](c, 'souligne', noir, gris));
    return c.y;
  }
  if (m === 'moderne') {
    const sw = 185; o.page.drawRectangle({ x: 0, y: 0, width: sw, height: H, color: acc });
    const g = col(18, sw - 34, 40, blanc), d = col(sw + 24, W - sw - 52, 40);
    const ini = (id.prenom[0] || '') + (id.nom[0] || '');
    o.page.drawCircle({ x: sw / 2, y: H - 40 - 38 * s, size: 36 * s, color: blanc }); o.centre(ini.toUpperCase(), sw / 2, 40 + 38 * s + 9 * s, 24 * s, f.b, acc); g.y += 90 * s;
    titre(g, 'Contact', 'blanc'); contact.forEach(x => g.texte(x, T * 0.92, f.n, blanc));
    sections.competences(g, 'blanc', blanc, blanc); sections.qualites(g, 'blanc', blanc, blanc); sections.langues(g, 'blanc', blanc); sections.loisirs(g, 'blanc', blanc, blanc);
    d.texte(nom, 24 * s, f.b, noir); if (r.titre) d.texte(r.titre, 11.5 * s, f.b, acc); d.esp(4);
    ['profil', 'experiences', 'formation'].forEach(k => sections[k](d, 'barre', noir, gris));
    return Math.max(g.y, d.y);
  }
  if (m === 'entete') {
    const c0 = col(40, W - 80, 30, blanc);
    const hauteur = (() => { let h = 30 + 26 * s; if (r.titre) h += o.couper(r.titre, 12 * s, W - 80, f.b).length * 16 * s; h += o.couper(contact.join('  ·  '), 9 * s, W - 80).length * 12 * s; return h + 20; })();
    o.page.drawRectangle({ x: 0, y: H - hauteur, width: W, height: hauteur, color: acc });
    c0.texte(nom, 24 * s, f.b, blanc); if (r.titre) c0.texte(r.titre, 12 * s, f.b, blanc); c0.texte(contact.join('  ·  '), 9 * s, f.n, blanc);
    const yb = hauteur + 14, dw = 175, g = col(40, W - 80 - dw - 24, yb), d = col(W - 40 - dw, dw, yb);
    o.page.drawRectangle({ x: W - 52 - dw, y: 0, width: dw + 52, height: H - hauteur, color: acc, opacity: 0.07 });
    ['profil', 'experiences', 'formation'].forEach(k => sections[k](g, 'souligne', noir, gris));
    ['competences', 'qualites', 'langues', 'loisirs'].forEach(k => sections[k](d, 'souligne', noir, acc));
    return Math.max(g.y, d.y);
  }
  if (m === 'compact') {
    const c = col(40, W - 80, 34);
    c.texte(nom, 20 * s, f.b, noir); if (r.titre) c.texte(r.titre, 11 * s, f.b, acc); c.texte(contact.join('  ·  '), 8.8 * s, f.n, gris);
    sections.profil(c, 'bande', noir); sections.experiences(c, 'bande', noir, gris); sections.formation(c, 'bande', noir, gris);
    const l = lignes(r.competences); if (l.length) { titre(c, 'Compétences', 'bande'); c.texte(l.join('  ·  '), T, f.n, noir); }
    const q = lignes(r.qualites); if (q.length) { titre(c, 'Qualités', 'bande'); c.texte(q.join('  ·  '), T, f.n, noir); }
    const autres = [r.langues && 'Langues : ' + r.langues, lignes(r.loisirs).length && 'Centres d’intérêt : ' + lignes(r.loisirs).join(', ')].filter(Boolean);
    if (autres.length) { titre(c, 'Langues et centres d’intérêt', 'bande'); autres.forEach(a => c.texte(a, T, f.n, noir)); }
    return c.y;
  }
  // créatif
  const ini = ((id.prenom[0] || '') + (id.nom[0] || '')).toUpperCase();
  o.page.drawCircle({ x: 40 + 34 * s, y: H - 36 - 34 * s, size: 34 * s, color: acc }); o.centre(ini, 40 + 34 * s, 36 + 34 * s + 8 * s, 22 * s, f.b, blanc);
  const h = col(40 + 80 * s, W - 80 - 80 * s, 38);
  h.texte(nom, 24 * s, f.b, acc); if (r.titre) h.texte(r.titre, 11.5 * s, f.b, noir); h.texte(contact.join('  ·  '), 9 * s, f.n, gris);
  const yb = Math.max(h.y, 36 + 70 * s) + 12, lw = (W - 80 - 24) * 0.58, g = col(40, lw, yb), d = col(40 + lw + 24, W - 80 - lw - 24, yb);
  o.ligne(40 + lw + 12, yb + 6, 40 + lw + 12, H - 40, 0.5, acc);
  ['profil', 'experiences'].forEach(k => sections[k](g, 'etiquette', noir, gris));
  ['formation', 'competences', 'qualites', 'langues', 'loisirs'].forEach(k => sections[k](d, 'etiquette', noir, gris));
  return Math.max(g.y, d.y);
}

/* ---------- Aperçu, enregistrement, téléchargement, dépôt ---------- */
let apercuEnCours = null;
async function majApercuCV() {
  const cv = $('#cv_apercu'); if (!cv) return;
  const r = lireCV(), id = identiteCV();
  const octets = await pdfCV(id, r); await chargerPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: octets, isEvalSupported: false }).promise, page = await pdf.getPage(1);
  const largeur = Math.max(280, cv.clientWidth || 320), vp = page.getViewport({ scale: largeur * (window.devicePixelRatio || 1) / page.getViewport({ scale: 1 }).width });
  cv.width = vp.width; cv.height = vp.height;
  if (apercuEnCours) try { apercuEnCours.cancel(); } catch { /* */ }
  apercuEnCours = page.render({ canvasContext: cv.getContext('2d'), viewport: vp });
  try { await apercuEnCours.promise; } catch { /* aperçu remplacé */ }
  const cs = $('#cv_conseils'); if (cs) cs.innerHTML = conseilsCV(r, id);
}
A.cvApercu = () => majApercuCV();
async function sauverRedaction() {
  const r = lireCV(), k = `eleve/${S.user.id}/cv`, d = (await getDoc(k)) || {};
  d.redaction = r; d.redigeLe = maintenant(); await putDoc(k, d); S.el.cv = Object.assign(DEF.cv(), d);
}
A.cvEnregistrer = async () => { await sauverRedaction(); journal('CV (modèle) enregistré'); toast('CV enregistré'); };
const nomFichierCV = id => `CV ${id.prenom} ${id.nom}`.trim().replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
A.cvTelecharger = async () => { const r = lireCV(), id = identiteCV(); ouvrirPdf(await pdfCV(id, r), nomFichierCV(id)); };
A.cvDeposer = async () => {
  const r = lireCV(), id = identiteCV();
  if (!id.nom || (!id.tel && !id.email)) throw new Error('Complète ton nom et un moyen de te contacter (téléphone ou e-mail) avant de déposer ton CV.');
  if (S.el.cv.fichierLe && !confirm('Remplacer le CV déjà déposé (et les annotations de ton professeur) par celui-ci ?')) return;
  await sauverRedaction();
  const d = await api('POST', '/api/fichier/deposer', { type: 'cv', pdf: enBase64(new Uint8Array(await pdfCV(id, r))) });
  S.el.cv = Object.assign(DEF.cv(), S.el.cv, d); journal('CV déposé (créé avec un modèle)'); render(); toast('CV déposé : ton professeur est prévenu');
};

/* ---------- Correction : orthographe et grammaire (LanguageTool) ---------- */
let fautesCV = [];
function champsTexte() {
  const l = [['#cv_titre', 'Titre'], ['#cv_accroche', 'Profil'], ['#cv_competences', 'Compétences'], ['#cv_qualites', 'Qualités'], ['#cv_langues', 'Langues'], ['#cv_permis', 'Permis'], ['#cv_loisirs', 'Centres d’intérêt']]
    .map(([sel, nom]) => ({ el: $(sel), nom }));
  $$('.cv-ligne[data-l="formations"]').forEach((d, i) => ['.f-intitule', '.f-lieu'].forEach(c => l.push({ el: $(c, d), nom: `Formation ${i + 1}` })));
  $$('.cv-ligne[data-l="experiences"]').forEach((d, i) => ['.x-poste', '.x-entreprise', '.x-missions'].forEach(c => l.push({ el: $(c, d), nom: `Expérience ${i + 1}` })));
  return l.filter(x => x.el && x.el.value.trim());
}
// Utilisée aussi pour la lettre de motivation : champs = [{ el, nom }], zone = id de l'encadré des résultats.
let zoneFautes = 'cv_fautes';
A.cvVerifier = () => verifierTextes(champsTexte(), 'cv_fautes');
async function verifierTextes(champs, zone) {
  zoneFautes = zone; if (!champs.length) return toast('Écris d’abord ton texte.', true);
  let texte = ''; const segs = [];
  // Chaque ligne d'un champ (liste, missions) est envoyée comme un paragraphe à part : pas de fausse « phrase » sur plusieurs lignes.
  for (const c of champs) {
    let pos = 0;
    for (const ligne of c.el.value.split('\n')) {
      if (ligne.trim()) { segs.push({ c, debut: texte.length, fin: texte.length + ligne.length, decalage: pos }); texte += ligne + '\n\n'; }
      pos += ligne.length + 1;
    }
  }
  let j;
  try {
    const r = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: texte.slice(0, 19000), language: 'fr', level: 'default' }) });
    if (r.status === 429) throw new Error('Trop de vérifications : attends une minute puis réessaie.');
    if (!r.ok) throw new Error('Service de correction indisponible : réessaie plus tard.');
    j = await r.json();
  } catch (e) { throw new Error(e.message.includes('Trop') || e.message.includes('indisponible') ? e.message : 'Service de correction injoignable (connexion Internet ?)'); }
  fautesCV = (j.matches || []).map(m => {
    const s2 = segs.find(x => m.offset >= x.debut && m.offset < x.fin); if (!s2) return null;
    const mot = texte.slice(m.offset, m.offset + m.length), type = m.rule && m.rule.issueType;
    // Faux positifs fréquents sur un CV : sigles (MELEC, BSR, PSC1), écriture inclusive « Motivé(e) », lignes de liste sans point.
    if (type === 'misspelling' && (/^[A-ZÀ-Ý0-9]{2,}$/.test(mot) || /\d/.test(mot))) return null;
    if (/\(\w{0,4}\)/.test(texte.slice(Math.max(0, m.offset - 2), m.offset + m.length + 6))) return null;
    if (m.rule && /UPPERCASE_SENTENCE_START|PUNCTUATION_PARAGRAPH_END|FRENCH_WHITESPACE|ORDINAL/.test(m.rule.id)) return null;
    // Propositions avec des caractères que le PDF ne sait pas écrire (ex. « 3ᵉ ») : écartées.
    if ((m.replacements || []).some(x => /[^\u0000-ɏ‘-„…€]/.test(x.value))) return null;
    return { el: s2.c.el, nom: s2.c.nom, pos: m.offset - s2.debut + s2.decalage, long: m.length, message: m.message, propositions: (m.replacements || []).slice(0, 3).map(x => x.value), type };
  }).filter(Boolean);
  afficherFautes();
}
function afficherFautes() {
  const z = $('#' + zoneFautes); if (!z) return;
  if (!fautesCV.length) { z.innerHTML = '<div class="alerte info petit">✅ Aucune faute trouvée. Relis quand même ton CV à voix haute !</div>'; return; }
  z.innerHTML = `<div class="fautes"><b>${fautesCV.length} point${fautesCV.length > 1 ? 's' : ''} à vérifier</b>${fautesCV.map((x, i) => {
    const v = x.el.value, avant = v.slice(Math.max(0, x.pos - 25), x.pos), mot = v.slice(x.pos, x.pos + x.long), apres = v.slice(x.pos + x.long, x.pos + x.long + 25);
    return `<div class="faute"><div class="petit doux">${esc(x.nom)} · ${x.type === 'misspelling' ? 'orthographe' : x.type === 'typographical' ? 'typographie' : 'grammaire'}</div>
      <div>…${esc(avant)}<mark>${esc(mot)}</mark>${esc(apres)}…</div><div class="petit">${esc(x.message)}</div>
      <div>${x.propositions.map((p, k) => `<button type="button" class="puce" data-a="cvCorriger" data-f="${i}" data-k="${k}">${esc(p) || '(supprimer)'}</button>`).join('')}<button type="button" class="lien petit" style="display:inline" data-a="cvIgnorer" data-f="${i}">ignorer</button></div></div>`;
  }).join('')}</div>`;
}
A.cvCorriger = el => {
  const x = fautesCV[+el.dataset.f]; if (!x) return;
  const p = x.propositions[+el.dataset.k], v = x.el.value, delta = p.length - x.long;
  x.el.value = v.slice(0, x.pos) + p + v.slice(x.pos + x.long);
  fautesCV.splice(+el.dataset.f, 1);
  fautesCV.forEach(y => { if (y.el === x.el && y.pos > x.pos) y.pos += delta; });
  afficherFautes(); toast('Corrigé');
};
A.cvIgnorer = el => { fautesCV.splice(+el.dataset.f, 1); afficherFautes(); };
