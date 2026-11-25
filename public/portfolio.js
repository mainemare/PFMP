'use strict';
/* ===== Portfolio : compte rendu d'une activité représentative du stage (sur une page) =====
 * - L'élève remplit des sous-parties guidées ; chaque partie affiche sa grille d'évaluation.
 * - Le logiciel calcule une note sur 20 à partir de critères vérifiables (présence, précision, nombre d'éléments…).
 * - Le professeur vérifie, modifie les points critère par critère, commente et valide : sa note remplace la note automatique.
 * Données : section « portfolio » de l'élève ; évaluation dans la section « prof » (portfolio) ; annexes (images) dans le Drive privé. */

const PF_TYPES_CHANTIER = ['Particulier', 'Commerce', 'Petit tertiaire', 'Grand tertiaire', 'Industrie'];
const PF_DOCS = ['Plan', 'Schéma électrique', 'Documentation technique', 'Consignes verbales'];
const PF_REUSSITE = ['Entièrement réussie', 'Réussie en partie', 'Pas réussie'];
const PF_TYPES_RISQUE = ['Mécanique', 'Physique', 'Chimique', 'Biologique', 'Radiologique', 'Psychologique'];
const PF_EX_RISQUES = [
  ['Physique', 'Électrisation ou électrocution au contact d’un conducteur sous tension', 'Consignation, vérification d’absence de tension (VAT), outils isolés, habilitation'],
  ['Mécanique', 'Chute de hauteur sur un escabeau ou un échafaudage', 'Plateforme individuelle roulante (PIRL), garde-corps, échelle stable'],
  ['Mécanique', 'Coupure avec un outil tranchant (cutter, pince)', 'Gants de protection, outils en bon état'],
  ['Physique', 'Bruit du perforateur ou de la rainureuse', 'Bouchons d’oreilles ou casque antibruit'],
  ['Chimique', 'Poussières de plâtre ou de béton pendant le perçage', 'Masque FFP2, aspiration, lunettes de protection'],
  ['Physique', 'Port de charges lourdes (tourets de câble, appareils)', 'Gestes et postures, chariot, travail à deux'],
  ['Biologique', 'Nuisibles ou déchets dans les combles ou le vide sanitaire', 'Gants, combinaison, lavage des mains'],
  ['Radiologique', 'Exposition au soleil (UV) sur un chantier extérieur', 'Vêtements couvrants, crème solaire, pauses à l’ombre'],
  ['Psychologique', 'Stress lié aux délais ou au travail chez le client', 'Organisation du travail, dialogue avec le tuteur'],
];
const PF_MATERIEL = { elec: ['Câbles R2V', 'Gaines ICTA', 'Boîtes d’encastrement', 'Prises de courant', 'Interrupteurs', 'Disjoncteurs', 'Interrupteur différentiel', 'Tableau électrique', 'Goulottes', 'Bornes de connexion'],
  autre: ['Pièces de rechange', 'Consommables', 'Fixations (vis, chevilles)', 'Produits d’entretien', 'Équipements de protection'] };
const PF_OUTILS = { elec: ['Pince à dénuder', 'Tournevis isolés', 'Perforateur', 'Multimètre', 'VAT (vérificateur d’absence de tension)', 'Niveau à bulle', 'Mètre', 'Scie cloche', 'Tire-fil', 'Rainureuse'],
  autre: ['Mètre', 'Niveau', 'Visseuse', 'Perceuse', 'Clés plates', 'Tournevis', 'Pince', 'Escabeau', 'Ordinateur / logiciel'] };

/* ---------- Grille d'évaluation (fichier « Evaluation port folio ») ---------- */
const GRILLE_PF = [
  { id: 'entreprise', titre: 'Entreprise', crit: [
    { id: 'raison', l: 'Raison sociale de l’entreprise', max: 0.5, aide: 'Indique le nom officiel de l’entreprise.' },
    { id: 'naf', l: 'Code NAF', max: 0.5, aide: 'Le code NAF a 4 chiffres et une lettre, par exemple 4321A.' },
    { id: 'tuteur', l: 'Nom et fonction du tuteur', max: 0.5, aide: 'Donne le nom ET la fonction de ton tuteur.' },
    { id: 'activites', l: 'Type d’activités de l’entreprise', max: 0.5, aide: 'Décris ce que fait l’entreprise en une ou deux phrases (au moins 8 mots).' }] },
  { id: 'activite', titre: 'Définition de l’activité', crit: [
    { id: 'adresse', l: 'Adresse du chantier', max: 1, aide: 'Adresse complète avec le code postal.' },
    { id: 'typeChantier', l: 'Type de chantier (particulier, commerce, petit tertiaire, grand tertiaire, industrie)', max: 1, aide: 'Choisis le type de chantier.' },
    { id: 'duree', l: 'Durée du chantier', max: 1, aide: 'Une durée chiffrée : « 3 semaines », « 2 jours »…' },
    { id: 'cdc', l: 'Cahier des charges du chantier', max: 1, aide: 'Explique ce que le client demande (au moins 30 mots).' },
    { id: 'organisation', l: 'Organisation du chantier (combien d’employés et quelles fonctions)', max: 1, aide: 'Indique le nombre de personnes et leurs fonctions (chef de chantier, électricien, apprenti…).' },
    { id: 'materiel', l: 'Matériel nécessaire', max: 1, aide: 'Liste au moins 4 éléments de matériel, un par ligne.' },
    { id: 'outils', l: 'Outils principaux nécessaires', max: 1, aide: 'Liste au moins 4 outils, un par ligne.' },
    { id: 'documents', l: 'Documents utilisés (plan, schéma électrique, documentation, consignes verbales)', max: 1, aide: 'Coche au moins 2 documents utilisés.' }] },
  { id: 'risques', titre: 'Analyse des risques professionnels', crit: [
    { id: 'conditions', l: 'Les conditions de travail sont décrites', max: 1, aide: 'Décris les conditions de travail en au moins 20 mots.' },
    { id: 'risquesListes', l: 'Les risques professionnels sont listés et décrits', max: 1, aide: 'Liste au moins 3 risques, chacun décrit avec sa prévention.' },
    { id: 'risquesTypes', l: 'Type de risques : mécaniques, physiques, chimiques, biologiques, radiologiques, psychologiques', max: 1, aide: 'Donne un type à chaque risque, avec au moins 2 types différents.' }] },
  { id: 'bilan', titre: 'Bilan de votre activité', crit: [
    { id: 'difficultes', l: 'Difficultés techniques, physiques, environnementales… décrites', max: 1, aide: 'Décris tes difficultés en au moins 20 mots.' },
    { id: 'autonomie', l: 'Autonomie décrite', max: 1, aide: 'Explique ce que tu as fait seul(e) (au moins 15 mots).' },
    { id: 'reussite', l: 'Niveau de réussite de votre activité décrit', max: 1, aide: 'Choisis ton niveau de réussite et explique-le (au moins 10 mots).' }] },
  { id: 'appris', titre: 'Ce que vous avez appris', crit: [
    { id: 'exigences', l: 'Exigences professionnelles', max: 0.5, aide: 'Au moins 12 mots.' },
    { id: 'decouverteMat', l: 'Découverte de matériel, outillage, appareil', max: 0.5, aide: 'Au moins 12 mots.' },
    { id: 'organisationEnt', l: 'Organisation d’entreprise', max: 0.5, aide: 'Au moins 12 mots.' },
    { id: 'metier', l: 'Découverte de nouveau métier', max: 0.5, aide: 'Au moins 12 mots.' }] },
  { id: 'annexe', titre: 'Annexe', crit: [
    { id: 'quantite', l: 'Quantité de documents fournis', max: 1, aide: 'Ajoute au moins 3 documents (photos, plan, schéma…).' },
    { id: 'qualite', l: 'Qualité des documents fournis', max: 1, aide: 'Donne une légende précise (au moins 3 mots) à chaque document.' }] },
];
const maxPartie = g => g.crit.reduce((s, c) => s + c.max, 0);
const nbMotsPf = s => String(s || '').trim().split(/\s+/).filter(w => w.replace(/[^\p{L}\d]/gu, '').length > 1).length;
const palierPf = (n, a, b, max) => n >= b ? max : n >= a ? max / 2 : 0;
const nbLignesPf = s => lignes(s).length;
function noteAutoPf(p) {
  const n = {}, t = k => String(p[k] || '').trim();
  n.raison = t('raison').length >= 2 ? 0.5 : 0;
  n.naf = /\b\d{2}\.?\d{2}\s?[A-Z]\b/i.test(t('naf')) ? 0.5 : t('naf') ? 0.25 : 0;
  n.tuteur = t('tuteurNom') && t('tuteurFonction') ? 0.5 : t('tuteurNom') || t('tuteurFonction') ? 0.25 : 0;
  n.activites = palierPf(nbMotsPf(p.activites), 3, 8, 0.5);
  n.adresse = /\b\d{5}\b/.test(t('adresse')) && nbMotsPf(p.adresse) >= 3 ? 1 : t('adresse') ? 0.5 : 0;
  n.typeChantier = PF_TYPES_CHANTIER.includes(p.typeChantier) ? 1 : 0;
  n.duree = /\d+\s*(h\b|heure|jour|j\b|semaine|sem|mois|an)/i.test(t('duree')) ? 1 : t('duree') ? 0.5 : 0;
  n.cdc = palierPf(nbMotsPf(p.cdc), 12, 30, 1);
  const fonctions = /(chef|[ée]lectricien|apprenti|ouvrier|technicien|conducteur|plombier|ma[çc]on|peintre|tuteur|compagnon|stagiaire|artisan|patron|g[ée]rant|responsable|monteur|c[âa]bleur|man[œo]e?uvre|aide|chauffagiste|menuisier|plaquiste)/i;
  n.organisation = (/\d|\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/i.test(t('orgEffectif')) ? 0.5 : 0) + (fonctions.test(t('orgFonctions')) && nbMotsPf(p.orgFonctions) >= 4 ? 0.5 : 0);
  n.materiel = nbLignesPf(p.materiel) >= 4 ? 1 : nbLignesPf(p.materiel) >= 2 ? 0.5 : 0;
  n.outils = nbLignesPf(p.outils) >= 4 ? 1 : nbLignesPf(p.outils) >= 2 ? 0.5 : 0;
  const docs = (p.docs || []).length + (t('docsAutre') ? 1 : 0);
  n.documents = docs >= 2 ? 1 : docs === 1 ? 0.5 : 0;
  n.conditions = palierPf(nbMotsPf(p.conditions), 8, 20, 1);
  const rs = (p.risques || []).filter(r => r && String(r.risque || '').trim());
  const decrits = rs.filter(r => nbMotsPf(r.risque) >= 4 && nbMotsPf(r.prevention) >= 2);
  n.risquesListes = rs.length >= 3 && decrits.length >= 3 ? 1 : rs.length ? 0.5 : 0;
  const types = new Set(rs.map(r => r.type).filter(Boolean));
  n.risquesTypes = types.size >= 2 && rs.every(r => r.type) ? 1 : types.size ? 0.5 : 0;
  n.difficultes = palierPf(nbMotsPf(p.difficultes), 8, 20, 1);
  n.autonomie = palierPf(nbMotsPf(p.autonomie), 6, 15, 1);
  n.reussite = PF_REUSSITE.includes(p.reussite) ? (nbMotsPf(p.reussiteExpl) >= 10 ? 1 : 0.5) : 0;
  ['exigences', 'decouverteMat', 'organisationEnt', 'metier'].forEach(k => { n[k] = palierPf(nbMotsPf(p[k]), 5, 12, 0.5); });
  const ann = (p.annexes || []).filter(a => a && a.a);
  n.quantite = ann.length >= 3 ? 1 : ann.length ? 0.5 : 0;
  const leg = ann.filter(a => nbMotsPf(a.legende) >= 3).length;
  n.qualite = ann.length >= 2 && leg === ann.length ? 1 : leg ? 0.5 : 0;
  return n;
}
// Notes retenues : celles du professeur si l'évaluation est validée, sinon le calcul automatique.
function notesPf(p, ev) { const a = noteAutoPf(p); return ev && ev.valide ? Object.assign({}, a, ev.notes || {}) : a; }
const totalPf = n => Math.round(GRILLE_PF.reduce((s, g) => s + g.crit.reduce((x, c) => x + (+n[c.id] || 0), 0), 0) * 100) / 100;
const fmtNote = v => String(Math.round(v * 100) / 100).replace('.', ',');

/* ---------- Exemples à personnaliser (comme la lettre de motivation) ---------- */
function exemplesPf() {
  const fil = filiereEleve();
  return {
    activites: [`L’entreprise réalise des installations électriques pour des particuliers et des professionnels : [neuf, rénovation, dépannage, mise aux normes…].`, `L’entreprise est spécialisée dans ${fil.domaine} ; elle intervient surtout [dans la région d’Yvetot / chez les particuliers / dans l’industrie].`],
    cdc: ['Le client souhaite [rénover l’installation électrique de sa cuisine]. Il demande [6 prises, 2 circuits d’éclairage et une ligne pour la plaque de cuisson]. L’installation doit respecter la norme NF C 15-100 et être terminée [avant le …].'],
    orgFonctions: ['Sur le chantier, nous étions [3] : [le chef de chantier qui organisait le travail], [un électricien qui réalisait le câblage] et moi, stagiaire, qui [préparais le matériel et posais les boîtes].'],
    conditions: ['Le chantier se trouvait dans [une maison habitée / un bâtiment en travaux]. Nous travaillions [en hauteur / dans la poussière / au froid], de [8 h à 17 h]. Je portais [des chaussures de sécurité, des gants et des lunettes].'],
    difficultes: ['La principale difficulté a été [de lire le schéma / de passer les câbles dans les gaines déjà posées]. Physiquement, [le travail en hauteur / le port des tourets] était fatigant. Pour y arriver, [mon tuteur m’a montré … / j’ai …].'],
    autonomie: ['J’ai réalisé seul(e) [la pose des boîtes d’encastrement et le tirage des câbles] après les explications de mon tuteur. Il a seulement vérifié [le raccordement du tableau].'],
    reussiteExpl: ['L’activité est [réussie en partie] : [l’installation fonctionne et les tests sont bons], mais [j’ai dû refaire un raccordement / j’ai manqué de temps pour …].'],
    exigences: ['J’ai compris l’importance de [la ponctualité, la sécurité (consignation, VAT), le travail soigné et le respect du client et de son logement].'],
    decouverteMat: ['J’ai découvert [un nouveau matériel ou appareil] : il sert à […] et s’utilise […].'],
    organisationEnt: ['Dans l’entreprise, [le gérant prépare les devis et les commandes], [le chef de chantier répartit le travail] et [les électriciens …]. Les journées commencent par […].'],
    metier: ['J’ai découvert le métier de [chargé d’affaires / technicien de maintenance / plaquiste…] : il […]. Ce métier [m’intéresse / ne m’attire pas] parce que […].'],
  };
}

/* ---------- Données ---------- */
const PF_VIDE = () => ({ titre: '', raison: '', naf: '', tuteurNom: '', tuteurFonction: '', activites: '', adresse: '', typeChantier: '', duree: '', cdc: '', orgEffectif: '', orgFonctions: '',
  materiel: '', outils: '', docs: [], docsAutre: '', conditions: '', risques: [{ type: '', risque: '', prevention: '' }], difficultes: '', autonomie: '', reussite: '', reussiteExpl: '',
  exigences: '', decouverteMat: '', organisationEnt: '', metier: '', annexes: [] });
const TYPE_JOURNAL_VERS_PF = { 'Logement individuel (maison)': 'Particulier', 'Logement collectif (immeuble)': 'Particulier', 'Bureaux / tertiaire': 'Petit tertiaire', 'Commerce': 'Commerce', 'Industriel': 'Industrie', 'Établissement public (école, mairie, hôpital…)': 'Grand tertiaire' };
function pfDonnees() {
  if (S.el.portfolio && S.el.portfolio.raison !== undefined) return S.el.portfolio;
  const p = PF_VIDE(), ent = entrepriseStage(S.el), dem = S.el.demandes.liste.find(x => x.statut === 'convention') || S.el.demandes.liste.find(x => x.statut === 'protocole');
  if (ent) p.raison = ent.nom;
  if (dem && (dem.interlocuteur || dem.contact)) p.tuteurNom = dem.interlocuteur || dem.contact;
  const j = Object.entries((S.el.bord && S.el.bord.jours) || {}).filter(([, x]) => x.lieu).sort().pop();
  if (j) { p.adresse = j[1].lieu; p.typeChantier = TYPE_JOURNAL_VERS_PF[j[1].type] || ''; p.duree = j[1].duree || ''; }
  S.el.portfolio = Object.assign(p, S.el.portfolio || {});
  return S.el.portfolio;
}

/* ---------- Vue élève ---------- */
function grillePartie(g, p, ev) {
  const auto = noteAutoPf(p), valide = ev && ev.valide, n = notesPf(p, ev), tot = g.crit.reduce((s, c) => s + (+n[c.id] || 0), 0);
  return `<div class="pf-grille" id="pfg_${g.id}"><div class="pf-grille-tete">📊 Grille : <b>${fmtNote(tot)} / ${fmtNote(maxPartie(g))}</b>${valide ? ' <span class="badge" style="background:#16a34a">note du professeur</span>' : ' <span class="petit doux">(calcul automatique, vérifié ensuite par ton professeur)</span>'}</div>
    <table>${g.crit.map(c => { const v = +n[c.id] || 0, plein = v >= c.max;
      return `<tr><td>${plein ? '✅' : v > 0 ? '🟡' : '⬜'} ${esc(c.l)}${!plein && !valide ? `<div class="petit doux">➜ ${esc(c.aide)}</div>` : ''}</td><td class="pf-pts">${fmtNote(v)} / ${fmtNote(c.max)}</td></tr>`; }).join('')}</table>
    ${valide && ev.commentaires && ev.commentaires[g.id] ? `<div class="correction" style="margin-top:6px">💬 ${esc(ev.commentaires[g.id])}</div>` : ''}</div>`;
}
function vuePortfolio() {
  const p = pfDonnees(), ev = S.el.prof.portfolio, ex = exemplesPf(), n = notesPf(p, ev), elec = /lectric/.test(filiereEleve().domaine);
  const champ = (k, label, ph = '', type = 'text') => `<label>${label}<input id="pf_${k}" value="${esc(p[k])}" placeholder="${esc(ph)}" type="${type}" data-i="pfMaj" spellcheck="true" lang="fr"></label>`;
  const zone = (k, label, ph = '', rows = 3) => `<label>${label}<textarea id="pf_${k}" rows="${rows}" placeholder="${esc(ph)}" data-i="pfMaj" spellcheck="true" lang="fr" class="pf-zone">${esc(p[k])}</textarea></label>
    ${ex[k] ? aide('Exemple à personnaliser', ex[k].map((t, i) => `<button type="button" class="exemple" data-a="pfExemple" data-k="${k}" data-i="${i}">« ${esc(t)} »</button>`).join('') + '<p>Remplace les passages entre [crochets] par tes propres mots.</p>') : ''}`;
  const partie = (g, num, corps) => `<section class="carte pf-partie"><h2>${num}. ${esc(g.titre)} <span class="pf-bareme">/ ${fmtNote(maxPartie(g))}</span></h2>${corps}${grillePartie(g, p, ev)}</section>`;
  const G = Object.fromEntries(GRILLE_PF.map(g => [g.id, g]));
  return `<section class="carte"><h2>🗂️ Portfolio : compte rendu d’activité</h2>
    <p>Choisis <b>une activité représentative</b> de ton stage et détaille-la partie par partie. Le compte rendu tient sur <b>une page</b>, suivi des annexes.
      Sous chaque partie, la <b>grille d’évaluation</b> te montre les points obtenus et ce qu’il faut ajouter.</p>
    <div class="pf-total">${ev && ev.valide ? `✅ Note de ton professeur : <b>${fmtNote(totalPf(n))} / 20</b> <span class="petit doux">(${esc(ev.par)}, ${fmtDT(ev.date)})</span>` : `Note indicative : <b id="pf_total">${fmtNote(totalPf(n))}</b> / 20 <span class="petit doux">— calculée automatiquement, ton professeur la vérifiera</span>`}</div>
    ${ev && ev.valide && ev.general ? `<div class="correction">💬 ${esc(ev.general)}</div>` : ''}
    ${champ('titre', 'Titre de l’activité choisie', 'Installation électrique d’une cuisine en rénovation')}
    ${aide('Comment choisir l’activité ?', 'Choisis une activité que tu as faite toi-même du début à la fin (ou presque), qui montre ton métier : une installation, une intervention de maintenance, une mise en service… Tu peux t’aider de ton journal de bord.')}
  </section>
  ${partie(G.entreprise, 1, `<div class="deux">${champ('raison', 'Raison sociale', 'SARL Électricité Martin')}${champ('naf', 'Code NAF', '4321A')}</div>
    ${aide('Où trouver le code NAF ?', 'Sur un document de l’entreprise (facture, Kbis), en le demandant à ton tuteur, ou sur <a href="https://annuaire-entreprises.data.gouv.fr/" target="_blank" rel="noopener">annuaire-entreprises.data.gouv.fr</a> (cherche le nom de l’entreprise : « Activité principale »).')}
    <div class="deux">${champ('tuteurNom', 'Nom du tuteur', 'M. Martin')}${champ('tuteurFonction', 'Fonction du tuteur', 'Chef de chantier')}</div>
    ${zone('activites', 'Activités de l’entreprise', 'Installations électriques neuves et rénovation chez les particuliers…', 2)}`)}
  ${partie(G.activite, 2, `<div class="deux">${champ('adresse', 'Adresse du chantier', '12 rue des Lilas 76190 Yvetot')}
      <label>Type de chantier<select id="pf_typeChantier" data-c="pfMajC"><option value="">— Choisir —</option>${PF_TYPES_CHANTIER.map(x => `<option ${x === p.typeChantier ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      ${champ('duree', 'Durée du chantier', '3 semaines')}</div>
    ${zone('cdc', 'Cahier des charges : que demande le client ?', '', 4)}
    <div class="deux">${champ('orgEffectif', 'Nombre de personnes sur le chantier', '3')}</div>
    ${zone('orgFonctions', 'Qui fait quoi ? (fonctions)', '', 3)}
    <label>Matériel nécessaire <span class="doux petit">(un par ligne)</span><textarea id="pf_materiel" rows="4" data-i="pfMaj" spellcheck="true" lang="fr">${esc(p.materiel)}</textarea></label>
    ${puces(elec ? PF_MATERIEL.elec : PF_MATERIEL.autre, 'pfPuce', 'materiel')}
    <label>Outils principaux <span class="doux petit">(un par ligne)</span><textarea id="pf_outils" rows="4" data-i="pfMaj" spellcheck="true" lang="fr">${esc(p.outils)}</textarea></label>
    ${puces(elec ? PF_OUTILS.elec : PF_OUTILS.autre, 'pfPuce', 'outils')}
    <fieldset class="choix-groupe"><legend>Documents utilisés</legend>${PF_DOCS.map(x => `<label class="choix"><input type="checkbox" class="pf-doc" value="${x}" data-c="pfMajC" ${(p.docs || []).includes(x) ? 'checked' : ''}>${x}</label>`).join('')}
      <label style="flex:1">Autre(s)<input id="pf_docsAutre" value="${esc(p.docsAutre)}" data-i="pfMaj" placeholder="Notice du fabricant, devis…"></label></fieldset>`)}
  ${partie(G.risques, 3, `${zone('conditions', 'Conditions de travail', '', 3)}
    <h3>Risques professionnels</h3>
    ${(p.risques || []).map((r, i) => `<div class="cv-ligne pf-risque" data-i="${i}"><div class="deux"><label>Type<select class="r-type" data-c="pfMajC"><option value="">— Type —</option>${PF_TYPES_RISQUE.map(x => `<option ${x === r.type ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Risque (décris-le)<input class="r-risque" value="${esc(r.risque)}" data-i="pfMaj" spellcheck="true" lang="fr"></label><label>Prévention / EPI<input class="r-prev" value="${esc(r.prevention)}" data-i="pfMaj" spellcheck="true" lang="fr"></label></div>
      <button type="button" class="lien petit" data-a="pfRetirerRisque" data-i="${i}">Retirer</button></div>`).join('')}
    <button type="button" class="btn mini sec" data-a="pfAjouterRisque">+ Ajouter un risque</button>
    ${aide('Exemples de risques (clique pour ajouter)', 'Types : <b>mécanique</b> (chute, coupure, écrasement), <b>physique</b> (électricité, bruit, chaleur, port de charges), <b>chimique</b> (poussières, solvants), <b>biologique</b> (nuisibles, déchets), <b>radiologique</b> (UV, rayonnements), <b>psychologique</b> (stress).'
      + PF_EX_RISQUES.map((x, i) => `<button type="button" class="exemple" data-a="pfRisqueEx" data-i="${i}"><b>${x[0]}</b> — ${esc(x[1])} → ${esc(x[2])}</button>`).join(''))}`)}
  ${partie(G.bilan, 4, `${zone('difficultes', 'Difficultés rencontrées (techniques, physiques, liées à l’environnement…)', '', 3)}
    ${zone('autonomie', 'Ce que j’ai fait en autonomie', '', 3)}
    <label>Niveau de réussite<select id="pf_reussite" data-c="pfMajC"><option value="">— Choisir —</option>${PF_REUSSITE.map(x => `<option ${x === p.reussite ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    ${zone('reussiteExpl', 'Pourquoi ?', '', 2)}`)}
  ${partie(G.appris, 5, `${zone('exigences', 'Exigences professionnelles', '', 2)}${zone('decouverteMat', 'Matériel, outillage ou appareil découvert', '', 2)}
    ${zone('organisationEnt', 'Organisation de l’entreprise', '', 2)}${zone('metier', 'Métier découvert', '', 2)}
    <p class="doux petit">Mots de liaison à ajouter dans le dernier texte où tu as écrit :</p>${puces(CONNECTEURS, 'pfConnecteur', '')}`)}
  ${partie(G.annexe, 6, `<p class="doux petit">Photos de ton travail, plan, schéma, fiche technique… (6 au plus). Donne à chacune une légende précise. Demande l’accord de ton tuteur et ne photographie personne sans son accord.</p>
    ${[1, 2, 3, 4, 5, 6].map(k => { const a = (p.annexes || [])[k - 1] || {};
      return `<div class="cv-ligne pf-annexe" data-k="${k}"><b>Annexe ${k}</b>
        ${a.a ? `<button type="button" class="btn mini sec" data-a="pfVoirAnnexe" data-k="${k}">👁️ Voir</button> <button type="button" class="lien petit" style="display:inline" data-a="pfRetirerAnnexe" data-k="${k}">Retirer</button><div id="pf_ann_${k}"></div>`
          : `<label class="btn mini sec depot-fichier">📷 Ajouter une image<input type="file" accept="image/*" data-c="pfAnnexe" data-k="${k}"></label>`}
        <label>Légende<input class="a-leg" value="${esc(a.legende || '')}" data-i="pfMaj" placeholder="Schéma du tableau électrique réalisé" spellcheck="true" lang="fr"></label></div>`; }).join('')}`)}
  <section class="carte"><h2>Vérifier et enregistrer</h2>
    <div id="pf_fautes"></div>
    <div class="actions"><button class="btn" data-a="pfEnregistrer">💾 Enregistrer</button><button class="btn sec" data-a="pfVerifier">✔️ Vérifier l’orthographe</button><button class="btn sec" data-a="pfPdf">⬇️ Télécharger le PDF</button></div>
    <p class="doux petit">La vérification envoie seulement les textes du portfolio au service de correction LanguageTool.</p></section>`;
}

/* ---------- Lecture, mise à jour de la grille en direct, actions ---------- */
function lirePortfolio() {
  if (!$('#pf_titre')) return pfDonnees();
  const p = pfDonnees(), v = k => ($('#pf_' + k) || {}).value || '';
  ['titre', 'raison', 'naf', 'tuteurNom', 'tuteurFonction', 'activites', 'adresse', 'typeChantier', 'duree', 'cdc', 'orgEffectif', 'orgFonctions', 'materiel', 'outils', 'docsAutre',
    'conditions', 'difficultes', 'autonomie', 'reussite', 'reussiteExpl', 'exigences', 'decouverteMat', 'organisationEnt', 'metier'].forEach(k => { p[k] = v(k); });
  p.docs = $$('.pf-doc:checked').map(x => x.value);
  p.risques = $$('.pf-risque').map(d => ({ type: $('.r-type', d).value, risque: $('.r-risque', d).value, prevention: $('.r-prev', d).value }));
  p.annexes = $$('.pf-annexe').map(d => ({ a: !!((p.annexes || [])[+d.dataset.k - 1] || {}).a, legende: $('.a-leg', d).value }));
  return p;
}
let pfMinuteur = null;
function majGrillesPf() {
  const p = lirePortfolio(), ev = S.el.prof.portfolio;
  GRILLE_PF.forEach(g => { const z = $('#pfg_' + g.id); if (z) z.outerHTML = grillePartie(g, p, ev); });
  const t = $('#pf_total'); if (t) t.textContent = fmtNote(totalPf(notesPf(p, ev)));
}
I.pfMaj = () => { clearTimeout(pfMinuteur); pfMinuteur = setTimeout(majGrillesPf, 500); };
C.pfMajC = () => majGrillesPf();
let dernierePfZone = null;
document.addEventListener('focusin', ev => { if (ev.target.classList && ev.target.classList.contains('pf-zone')) dernierePfZone = ev.target; });
A.pfExemple = el => {
  const t = $('#pf_' + el.dataset.k), ex = exemplesPf()[el.dataset.k][+el.dataset.i];
  if (t.value.trim() && !confirm('Remplacer ton texte par cet exemple ?')) return;
  t.value = ex; t.focus(); const i = ex.indexOf('['); if (i >= 0) t.setSelectionRange(i, ex.indexOf(']', i) + 1);
  majGrillesPf(); toast('Remplace les passages entre [crochets] par tes mots');
};
A.pfPuce = el => { const t = $('#pf_' + el.dataset.champ); if (lignes(t.value).includes(el.dataset.v)) return toast('Déjà dans ta liste'); t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + el.dataset.v; el.classList.add('pris'); majGrillesPf(); };
A.pfConnecteur = el => {
  const t = (dernierePfZone && document.body.contains(dernierePfZone)) ? dernierePfZone : $('#pf_difficultes'), pos = t.selectionStart != null ? t.selectionStart : t.value.length;
  const ins = (t.value.slice(0, pos) && !/\s$/.test(t.value.slice(0, pos)) ? ' ' : '') + el.dataset.v + ' ';
  t.value = t.value.slice(0, pos) + ins + t.value.slice(pos); t.focus(); t.setSelectionRange(pos + ins.length, pos + ins.length);
};
A.pfAjouterRisque = () => { const p = lirePortfolio(); p.risques.push({ type: '', risque: '', prevention: '' }); render(); };
A.pfRetirerRisque = el => { const p = lirePortfolio(); p.risques.splice(+el.dataset.i, 1); render(); };
A.pfRisqueEx = el => {
  const p = lirePortfolio(), [type, risque, prevention] = PF_EX_RISQUES[+el.dataset.i];
  if (p.risques.some(r => r.risque === risque)) return toast('Déjà dans ta liste');
  const vide = p.risques.findIndex(r => !r.risque.trim()); const r = { type, risque, prevention };
  if (vide >= 0) p.risques[vide] = r; else p.risques.push(r);
  render(); toast('Risque ajouté : adapte-le à ton chantier');
};
async function sauverPortfolio() { const p = lirePortfolio(); p.majLe = maintenant(); await sauver('portfolio'); return p; }
A.pfEnregistrer = async () => { const p = await sauverPortfolio(); journal('Portfolio enregistré'); toast(`Portfolio enregistré · note indicative ${fmtNote(totalPf(notesPf(p, S.el.prof.portfolio)))}/20`); };
C.pfAnnexe = async el => {
  const f = el.files[0], k = +el.dataset.k; if (!f) return;
  const p = lirePortfolio(); toast('Envoi de l’image…');
  await api('POST', '/api/journal/photo', { annexe: k, img: await CONV.photoEnImage(f, 1600) });
  while (p.annexes.length < k) p.annexes.push({ a: false, legende: '' });
  p.annexes[k - 1].a = true; await sauverPortfolio(); render(); toast('Annexe ajoutée : pense à la légende');
};
A.pfRetirerAnnexe = async el => {
  const k = +el.dataset.k; if (!confirm('Retirer cette annexe ?')) return;
  const p = lirePortfolio(); await api('POST', '/api/journal/photo/supprimer', { annexe: k });
  if (p.annexes[k - 1]) p.annexes[k - 1].a = false; await sauverPortfolio(); render();
};
async function imageAnnexe(k, eleveId) {
  const r = await api('POST', '/api/journal/photo/lire', { annexe: k, eleveId });
  if (!/^data:image\/(jpeg|png);base64,/.test(r.img)) throw new Error('Image illisible.');
  return r.img;
}
A.pfVoirAnnexe = async el => {
  const z = $('#pf_ann_' + el.dataset.k); if (!z) return;
  if (z.innerHTML) { z.innerHTML = ''; return; }
  z.innerHTML = `<img class="bord-photo" src="${await imageAnnexe(+el.dataset.k, el.dataset.e || undefined)}" alt="Annexe ${el.dataset.k}">`;
};
A.pfVerifier = () => {
  const champs = [['titre', 'Titre'], ['activites', 'Activités'], ['cdc', 'Cahier des charges'], ['orgFonctions', 'Organisation'], ['materiel', 'Matériel'], ['outils', 'Outils'], ['conditions', 'Conditions de travail'],
    ['difficultes', 'Difficultés'], ['autonomie', 'Autonomie'], ['reussiteExpl', 'Réussite'], ['exigences', 'Exigences'], ['decouverteMat', 'Découverte'], ['organisationEnt', 'Organisation de l’entreprise'], ['metier', 'Métier']]
    .map(([k, nom]) => ({ el: $('#pf_' + k), nom }));
  $$('.pf-risque').forEach((d, i) => ['.r-risque', '.r-prev'].forEach(c => champs.push({ el: $(c, d), nom: `Risque ${i + 1}` })));
  $$('.pf-annexe').forEach(d => champs.push({ el: $('.a-leg', d), nom: `Annexe ${d.dataset.k}` }));
  return verifierTextes(champs.filter(x => x.el && x.el.value.trim()), 'pf_fautes');
};
A.pfPdf = async () => { const p = lirePortfolio(); ouvrirPdf(await pdfPortfolio(p, S.el.prof.portfolio, `${S.el.profil.prenom} ${identiteCV().nom || S.el.profil.nom}`, S.user.id), `Portfolio ${S.el.profil.prenom}.pdf`); };

/* ---------- Professeur : onglet « Portfolio » du dossier ---------- */
function dosPortfolio(e) {
  const p = e.d.portfolio || {}, ev = e.d.prof.portfolio || {}, auto = noteAutoPf(p), vide = !p.raison && !p.titre && !p.cdc;
  if (vide) return '<p class="doux">L’élève n’a pas encore commencé son portfolio.</p>';
  const modifie = ev.valide && p.majLe && String(p.majLe) > String(ev.date);
  const ligne = (l, v) => v && String(v).trim() ? `<div class="pf-champ"><span class="doux petit">${esc(l)}</span><div class="bord-texte">${esc(v)}</div></div>` : `<div class="pf-champ"><span class="doux petit">${esc(l)}</span> <span class="petit" style="color:#b45309">non renseigné</span></div>`;
  const contenu = {
    entreprise: ligne('Raison sociale', p.raison) + ligne('Code NAF', p.naf) + ligne('Tuteur', [p.tuteurNom, p.tuteurFonction].filter(Boolean).join(' — ')) + ligne('Activités', p.activites),
    activite: ligne('Adresse du chantier', p.adresse) + ligne('Type de chantier', p.typeChantier) + ligne('Durée', p.duree) + ligne('Cahier des charges', p.cdc) + ligne('Organisation', [p.orgEffectif && p.orgEffectif + ' personne(s)', p.orgFonctions].filter(Boolean).join(' — '))
      + ligne('Matériel', lignes(p.materiel).join(', ')) + ligne('Outils', lignes(p.outils).join(', ')) + ligne('Documents', [...(p.docs || []), p.docsAutre].filter(Boolean).join(', ')),
    risques: ligne('Conditions de travail', p.conditions) + ligne('Risques', (p.risques || []).filter(r => r.risque).map(r => `[${r.type || 'type ?'}] ${r.risque} → ${r.prevention || 'prévention ?'}`).join('\n')),
    bilan: ligne('Difficultés', p.difficultes) + ligne('Autonomie', p.autonomie) + ligne('Réussite', [p.reussite, p.reussiteExpl].filter(Boolean).join(' — ')),
    appris: ligne('Exigences professionnelles', p.exigences) + ligne('Matériel découvert', p.decouverteMat) + ligne('Organisation d’entreprise', p.organisationEnt) + ligne('Métier découvert', p.metier),
    annexe: (p.annexes || []).map((a, i) => a && a.a ? `<div class="pf-champ"><button type="button" class="btn mini sec" data-a="pfVoirAnnexe" data-k="${i + 1}" data-e="${e.id}">👁️ Annexe ${i + 1}</button> ${esc(a.legende || 'sans légende')}<div id="pf_ann_${i + 1}"></div></div>` : '').join('') || '<p class="petit" style="color:#b45309">Aucune annexe.</p>',
  };
  const notes = Object.assign({}, auto, ev.notes || {});
  return `<div class="pf-total">${p.titre ? `<b>${esc(p.titre)}</b><br>` : ''}Note automatique : <b>${fmtNote(totalPf(auto))}/20</b> · Note retenue : <b id="pfp_total">${fmtNote(totalPf(notes))}</b>/20
      ${ev.valide ? ` <span class="badge" style="background:#16a34a">validée par ${esc(ev.par)} le ${fmt(ev.date)}</span>` : ' <span class="badge" style="background:#b45309">à valider</span>'}${modifie ? ' <span class="badge" style="background:#7c3aed">modifié par l’élève depuis</span>' : ''}</div>
    <p class="doux petit">Les points proposés viennent du calcul automatique (présence, précision, nombre d’éléments). Modifiez-les si besoin, commentez, puis validez : l’élève voit alors votre note et vos commentaires.</p>
    ${GRILLE_PF.map(g => `<div class="pf-partie-prof"><h3>${esc(g.titre)} <span class="pf-bareme">/ ${fmtNote(maxPartie(g))}</span></h3>${contenu[g.id]}
      <table class="pf-table">${g.crit.map(c => `<tr><td>${esc(c.l)}</td><td class="pf-pts petit doux">auto ${fmtNote(auto[c.id])}</td>
        <td class="pf-pts"><input type="number" class="pf-note" id="pfn_${c.id}" min="0" max="${c.max}" step="0.25" value="${notes[c.id]}" data-max="${c.max}" data-auto="${auto[c.id]}" data-i="pfNoteProf" aria-label="${esc(c.l)}"> / ${fmtNote(c.max)}</td></tr>`).join('')}</table>
      <label>Commentaire sur cette partie<textarea id="pfc_${g.id}" rows="2">${esc((ev.commentaires || {})[g.id] || '')}</textarea></label></div>`).join('')}
    <label>Appréciation générale<textarea id="pf_general" rows="3">${esc(ev.general || '')}</textarea></label>
    <div class="actions"><button class="btn" data-a="pfValider">✅ Valider l’évaluation</button><button class="btn sec" data-a="pfAuto">↺ Reprendre les points automatiques</button><button class="btn sec" data-a="pfPdfProf">⬇️ PDF avec la grille</button></div>`;
}
I.pfNoteProf = () => { const n = {}; $$('.pf-note').forEach(x => { n[x.id.slice(4)] = Math.min(+x.dataset.max, Math.max(0, +x.value || 0)); }); const t = $('#pfp_total'); if (t) t.textContent = fmtNote(totalPf(n)); };
A.pfAuto = () => { $$('.pf-note').forEach(x => { x.value = x.dataset.auto; }); I.pfNoteProf(); toast('Points automatiques repris (pas encore enregistrés)'); };
A.pfValider = async () => {
  const e = eleveOuvert(), notes = {}, commentaires = {};
  $$('.pf-note').forEach(x => { notes[x.id.slice(4)] = Math.min(+x.dataset.max, Math.max(0, Math.round((+x.value || 0) * 4) / 4)); });
  GRILLE_PF.forEach(g => { const v = val('pfc_' + g.id); if (v) commentaires[g.id] = v; });
  await mutProf(e.id, p => { p.portfolio = { notes, commentaires, general: val('pf_general'), valide: true, par: nomComplet(S.user), date: maintenant(), total: totalPf(notes) }; });
  render(); toast(`Évaluation validée : ${fmtNote(totalPf(notes))}/20`);
};
A.pfPdfProf = async () => { const e = eleveOuvert(); ouvrirPdf(await pdfPortfolio(e.d.portfolio || {}, e.d.prof.portfolio, nomEleve(e), e.id), `Portfolio ${nomEleve(e)}.pdf`); };

/* ---------- PDF : compte rendu sur une page, annexes, grille d'évaluation ---------- */
async function pdfPortfolio(p, ev, nom, eleveId) {
  let o = null;
  for (const s of [1, 0.93, 0.86, 0.8, 0.74, 0.68, 0.62]) { o = await outilsPdf(false); if (pagePortfolio(o, p, nom, s) <= o.H - 30 || s === 0.62) break; }
  const { f, L, W, H } = o, acc = L.rgb(0.11, 0.3, 0.85), gris = L.rgb(0.4, 0.42, 0.48);
  // Annexes : deux par page
  const ann = (p.annexes || []).map((a, i) => ({ ...a, k: i + 1 })).filter(a => a.a);
  for (let i = 0; i < ann.length; i++) {
    if (i % 2 === 0) { o.nouvellePage(); o.txt('Annexes', 50, 50, 14, f.b, acc); }
    const a = ann[i], y0 = i % 2 === 0 ? 70 : 440;
    try {
      const img = await o.image(await imageAnnexe(a.k, eleveId)), sc = Math.min((W - 100) / img.width, 330 / img.height);
      o.page.drawImage(img, { x: (W - img.width * sc) / 2, y: H - y0 - img.height * sc, width: img.width * sc, height: img.height * sc });
      o.couper(`Annexe ${a.k} : ${a.legende || ''}`, 10, W - 100, f.i).forEach((l, j) => o.txt(l, 50, y0 + img.height * sc + 16 + j * 13, 10, f.i, gris));
    } catch { o.txt(`Annexe ${a.k} : image indisponible`, 50, y0 + 20, 10, f.i, gris); }
  }
  // Grille d'évaluation
  o.nouvellePage(); const n = notesPf(p, ev), valide = ev && ev.valide;
  o.txt('Grille d’évaluation du portfolio', 50, 50, 14, f.b, acc);
  o.txt(`${nom} — ${valide ? `évaluation validée par ${ev.par} le ${fmt(ev.date)}` : 'note indicative calculée automatiquement'}`, 50, 68, 9, f.n, gris);
  let y = 88;
  GRILLE_PF.forEach(g => {
    const tot = g.crit.reduce((s, c) => s + (+n[c.id] || 0), 0);
    o.rect(50, y, W - 100, 16, { bord: 0, fond: L.rgb(0.9, 0.92, 0.98) }); o.txt(g.titre, 54, y + 11.5, 9.5, f.b); o.droite(`${fmtNote(tot)} / ${fmtNote(maxPartie(g))}`, W - 54, y + 11.5, 9.5, f.b); y += 18;
    g.crit.forEach(c => { const ls = o.couper(c.l, 8.5, W - 190); ls.forEach((l, i) => o.txt(l, 62, y + 10 + i * 11, 8.5)); o.droite(`${fmtNote(+n[c.id] || 0)} / ${fmtNote(c.max)}`, W - 54, y + 10, 8.5); y += ls.length * 11 + 3; });
    if (valide && ev.commentaires && ev.commentaires[g.id]) { o.couper('Commentaire : ' + ev.commentaires[g.id], 8.5, W - 120, f.i).forEach(l => { o.txt(l, 62, y + 10, 8.5, f.i, gris); y += 11; }); }
    y += 6;
  });
  o.rect(50, y, W - 100, 20, { bord: 1 }); o.txt('Note finale', 54, y + 14, 11, f.b); o.droite(`${fmtNote(totalPf(n))} / 20`, W - 54, y + 14, 11, f.b); y += 32;
  if (valide && ev.general) o.couper('Appréciation : ' + ev.general, 9.5, W - 100, f.i).forEach(l => { o.txt(l, 50, y, 9.5, f.i); y += 13; });
  o.doc.setTitle('Portfolio - ' + nom);
  return o.doc.save();
}
function pagePortfolio(o, p, nom, s) {
  const { f, L, W } = o, acc = L.rgb(0.11, 0.3, 0.85), gris = L.rgb(0.35, 0.38, 0.45), T = 9.5 * s, X = 44, LW = W - 88;
  o.nouvellePage();
  let y = 36;
  const txt = (t, font = f.n, coul, taille = T, retrait = 0) => { for (const l of o.couper(t, taille, LW - retrait, font)) { o.txt(l, X + retrait, y + taille, taille, font, coul); y += taille * 1.3; } };
  const titre = t => { y += 5 * s; o.rect(X, y, LW, T * 1.6, { bord: 0, fond: acc }); o.txt(t.toUpperCase(), X + 5, y + T * 1.18, T, f.b, L.rgb(1, 1, 1)); y += T * 1.6 + 3 * s; };
  const champ = (l, v) => { if (!v || !String(v).trim()) return; const lab = l + ' : '; o.txt(lab, X, y + T, T, f.b); const w = o.large(lab, T, f.b);
    const ls = o.couper(String(v).replace(/\n+/g, ' '), T, LW - w); ls.forEach((x, i) => { o.txt(x, X + (i ? 0 : w), y + T, T); y += T * 1.3; if (i === 0 && ls.length > 1) { /* lignes suivantes sous le libellé */ } }); };
  o.txt('Portfolio — compte rendu d’activité', X, y + 15 * s, 15 * s, f.b, acc); y += 21 * s;
  txt(`${nom}${p.titre ? ' — ' + p.titre : ''}`, f.b, gris, 10.5 * s);
  titre('1. Entreprise'); champ('Raison sociale', p.raison); champ('Code NAF', p.naf); champ('Tuteur', [p.tuteurNom, p.tuteurFonction].filter(Boolean).join(', ')); champ('Activités', p.activites);
  titre('2. Définition de l’activité'); champ('Adresse du chantier', p.adresse); champ('Type de chantier', p.typeChantier); champ('Durée', p.duree); champ('Cahier des charges', p.cdc);
  champ('Organisation', [p.orgEffectif && p.orgEffectif + ' personne(s)', p.orgFonctions].filter(Boolean).join(' — ')); champ('Matériel', lignes(p.materiel).join(', ')); champ('Outils', lignes(p.outils).join(', '));
  champ('Documents utilisés', [...(p.docs || []), p.docsAutre].filter(Boolean).join(', '));
  titre('3. Analyse des risques professionnels'); champ('Conditions de travail', p.conditions);
  (p.risques || []).filter(r => r.risque).forEach(r => txt(`• ${r.type ? r.type + ' : ' : ''}${r.risque}${r.prevention ? ' → ' + r.prevention : ''}`, f.n, undefined, T, 6));
  titre('4. Bilan de mon activité'); champ('Difficultés', p.difficultes); champ('Autonomie', p.autonomie); champ('Réussite', [p.reussite, p.reussiteExpl].filter(Boolean).join(' — '));
  titre('5. Ce que j’ai appris'); champ('Exigences professionnelles', p.exigences); champ('Matériel découvert', p.decouverteMat); champ('Organisation de l’entreprise', p.organisationEnt); champ('Métier découvert', p.metier);
  const nbAnn = (p.annexes || []).filter(a => a && a.a).length;
  if (nbAnn) { titre('6. Annexes'); txt(`${nbAnn} document(s) en annexe.`, f.i, gris); }
  return y;
}
