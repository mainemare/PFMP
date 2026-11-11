'use strict';
/* ===== Suivi des stages — console professeur ===== */

const PALETTE = ['#3b4cca', '#0d9488', '#c2410c', '#7c3aed', '#be185d', '#0369a1', '#4d7c0f', '#a16207'];
const classeDe = d => S.classes.find(c => c.id === d.profil.classeId);
const urgences = () => S.eleves.filter(e => enUrgence(e.d));
const nomEleve = e => `${e.d.profil.prenom} ${e.d.profil.nom}`.trim() || e.identifiant;
const nomProf = id => { const p = S.profs.find(x => x.id === id); return p ? nomComplet(p) : ''; };
const eleveOuvert = () => S.eleves.find(e => e.id === S.dossier);

async function chargerEleves() {
  S.eleves = (await api('GET', '/api/eleves')).map(e => ({ id: e.id, identifiant: e.identifiant, d: normaliser(e.docs) }))
    .sort((a, b) => (a.d.profil.nom + a.d.profil.prenom).localeCompare(b.d.profil.nom + b.d.profil.prenom, 'fr'));
  if (S.codeEleve === undefined) { try { S.codeEleve = ((await api('GET', '/api/admin/codes')) || {}).codeEleve || ''; } catch { S.codeEleve = ''; } }
}
// Relit la version à jour sur le serveur avant de la modifier (plusieurs professeurs peuvent travailler en même temps).
async function mutProf(id, fn) {
  const k = `eleve/${id}/prof`, frais = Object.assign(DEF.prof(), await getDoc(k) || {});
  fn(frais); await putDoc(k, frais);
  const e = S.eleves.find(x => x.id === id); if (e) e.d.prof = frais;
}
async function mutCommun(nom, fn) {
  const frais = (await getDoc('commun/' + nom)) || { [nom]: [] };
  fn(frais[nom]); await putDoc('commun/' + nom, frais); S[nom] = frais[nom];
}

function vueProf() {
  switch (S.vue) {
    case 'classes': return vueClasses();
    case 'entreprises': return vueBase();
    case 'alertes': return vueAlertes();
    default: return vueTableau();
  }
}

/* ---------- Tableau de bord ---------- */
function vueTableau() {
  const u = urgences(), par = NIV.map((_, n) => S.eleves.filter(e => niveau(e.d) === n).length), f = S.f;
  return `${u.length ? `<div class="alerte urgent" role="alert">🚨 <b>Plan d’urgence à déclencher</b> : ${u.length} élève(s) à 10 jours ou moins du stage sans convention signée. <button class="btn mini" data-a="aller" data-v="alertes">Voir les alertes</button></div>` : ''}
  <div class="stats">${NIV.map((v, n) => `<div class="stat" style="--c:${v.c}"><b>${par[n]}</b><span>${n} · ${v.l}</span></div>`).join('')}</div>
  <section class="carte filtres">
    <label>Rechercher un élève<input data-i="filtre" data-k="q" value="${esc(f.q)}" placeholder="Nom ou prénom"></label>
    <label>Classe<select data-c="filtre" data-k="classe"><option value="">Toutes</option>${S.classes.map(c => `<option value="${c.id}" ${f.classe === c.id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></label>
    <label>Niveau<select data-c="filtre" data-k="niveau"><option value="">Tous</option>${NIV.map((v, n) => `<option value="${n}" ${f.niveau === String(n) ? 'selected' : ''}>${n} · ${v.l}</option>`).join('')}</select></label>
    <label style="align-self:center"><input type="checkbox" data-c="filtre" data-k="urg" ${f.urg ? 'checked' : ''}>Urgences seulement</label>
  </section>
  <div id="liste">${listeClasses()}</div>`;
}
function listeClasses() {
  const f = S.f, q = f.q.trim().toLowerCase(), filtre = !!(q || f.niveau !== '' || f.urg);
  const vus = S.eleves.filter(e => (!q || nomEleve(e).toLowerCase().includes(q)) && (f.niveau === '' || niveau(e.d) === +f.niveau) && (!f.urg || enUrgence(e.d)));
  const groupes = S.classes.filter(c => !f.classe || c.id === f.classe).map(c => ({ c, els: vus.filter(e => e.d.profil.classeId === c.id) }));
  const orphelins = vus.filter(e => !classeDe(e.d));
  if (orphelins.length && !f.classe) groupes.push({ c: { nom: 'Sans classe', couleur: '#64748b', periodes: [] }, els: orphelins });
  const html = groupes.filter(g => g.els.length || !filtre).map(g => {
    const p = periodeCourante(g.c), j = p ? jours(p.debut) : null;
    return `<section class="classe" style="--cc:${esc(g.c.couleur)}"><header><h2>${esc(g.c.nom)}</h2><span>${g.els.length} élève(s)</span>
      ${p ? `<span>📅 ${esc(p.label || 'Stage')} : ${fmt(p.debut)} → ${fmt(p.fin)}${j > 0 ? ` · <b>J-${j}</b>` : ''}</span>` : '<span>Dates non fixées</span>'}
      ${g.c.referentId && nomProf(g.c.referentId) ? `<span>Référent : ${esc(nomProf(g.c.referentId))}</span>` : ''}</header>
      <div class="cartes">${g.els.length ? g.els.map(carteEleve).join('') : '<p class="doux">Aucun élève inscrit dans cette classe.</p>'}</div></section>`;
  }).join('');
  return html || `<section class="carte"><p>${S.classes.length ? 'Aucun élève ne correspond à ces critères.' : 'Commencez par créer vos classes et leurs dates de stage dans « Classes et dates ». Les élèves pourront ensuite s’inscrire.'}</p></section>`;
}
function carteEleve(e) {
  const d = e.d, n = niveau(d), dt = datesEleve(d), dern = d.journal.evenements[d.journal.evenements.length - 1];
  const relire = ['cv', 'lettre', 'memento'].filter(t => d[t].aRelire).length;
  return `<article class="eleve" style="--c:${NIV[n].c}" data-a="ouvrir" data-id="${e.id}" tabindex="0" role="button" aria-label="Ouvrir le dossier de ${esc(nomEleve(e))}">
    <h3>${esc(nomEleve(e))}</h3>${barre(n, true)}
    <div class="infos">${d.demandes.liste.length} entreprise(s) suivie(s)<br>${dern ? `Dernière activité : ${fmt(dern.date)}` : 'Aucune activité'}</div>
    <div class="tags">${enUrgence(d) ? `<span class="badge urg">🚨 URGENCE${dt ? ` J${jours(dt.debut) > 0 ? '-' + jours(dt.debut) : ''}` : ''}</span>` : ''}
      ${d.prof.urgence ? `<span class="badge" style="background:#0d9488">Pris en main</span>` : ''}
      ${relire ? `<span class="badge" style="background:#7c3aed">${relire} doc. à relire</span>` : ''}
      ${dt && dt.derog ? '<span class="badge clair">Dates dérogatoires</span>' : ''}
      ${d.prof.niveauForce != null ? '<span class="badge clair">Niveau fixé par le prof</span>' : ''}</div></article>`;
}
function majListe() { const l = $('#liste'); if (l) l.innerHTML = listeClasses(); }
C.filtre = el => { S.f[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; majListe(); };
I.filtre = C.filtre;
A.ouvrir = el => { S.dossier = el.dataset.id; S.onglet = el.dataset.o || 'synthese'; render(); };
A.fermerDossier = () => { S.dossier = null; render(); };
A.onglet = el => { S.onglet = el.dataset.o; render(); };

/* ---------- Dossier d'un élève ---------- */
function vueDossier() {
  const e = eleveOuvert(); if (!e) { S.dossier = null; return ''; }
  const d = e.d, n = niveau(d), dt = datesEleve(d), cl = classeDe(d);
  const onglets = [['synthese', 'Synthèse'], ['suivi', `Demandes (${d.demandes.liste.length})`], ['cv', 'CV'], ['lettre', 'Lettre'], ['memento', 'Memento'], ['conseils', 'Conseils et entreprises'], ['activite', 'Activité']];
  const corps = { synthese: dosSynthese, suivi: dosSuivi, cv: () => dosDoc(e, 'cv'), lettre: () => dosDoc(e, 'lettre'), memento: () => dosDoc(e, 'memento'), conseils: dosConseils, activite: dosActivite }[S.onglet](e);
  return `<div class="overlay" data-a="fond" data-dossier="1"><div class="fenetre large" role="dialog" aria-modal="true"><button class="fermer" data-a="fermerDossier" aria-label="Fermer">✕</button>
    <div class="dossier-tete" style="--c:${NIV[n].c}"><h2>${esc(nomEleve(e))} <span class="badge" style="background:${esc(cl ? cl.couleur : '#64748b')}">${esc(cl ? cl.nom : 'Sans classe')}</span>
      ${enUrgence(d) ? '<span class="badge urg">🚨 PLAN D’URGENCE</span>' : ''}</h2>${barre(n)}
      <p class="petit" style="margin:8px 0 0">${dt ? `📅 Stage du ${fmt(dt.debut)} au ${fmt(dt.fin)}${jours(dt.debut) > 0 ? ` · J-${jours(dt.debut)}` : ''}${dt.derog ? ` · <b>dates dérogatoires</b>${dt.motif ? ` (${esc(dt.motif)})` : ''}` : ''}` : 'Dates de stage non fixées'}</p></div>
    <div class="onglets">${onglets.map(([k, l]) => `<button data-a="onglet" data-o="${k}" class="${S.onglet === k ? 'actif' : ''}">${l}${d[k] && d[k].aRelire ? ' 🟣' : ''}</button>`).join('')}</div>${corps}</div></div>`;
}
function dosSynthese(e) {
  const d = e.d, p = d.profil, o = d.prof.dates || {}, u = d.prof.urgence;
  return `<div class="grille"><div>
    <h3>Profil</h3><p>Identifiant : <b>${esc(e.identifiant)}</b></p>
    <h3>Communes de résidence</h3>${p.residences.length ? p.residences.map(r => `<p>📍 <b>${esc(r.label)}</b> — ${esc(r.adresse)} · rayon ${r.rayon} km</p>`).join('') : '<p class="doux">Non renseignés.</p>'}
    <h3>Dossier</h3><p>${['cv', 'lettre', 'memento'].map(t => `${TITRES[t]} : ${d[t].valide ? '✅ validé' : d[t].aRelire ? '🟣 à relire' : d[t].correction ? 'corrigé' : t === 'memento' ? (d[t].majLe ? 'rédigé' : '⬜ non commencé') : '⬜ non déposé'}`).join('<br>')}</p>
    ${enUrgence(d) ? `<div class="alerte urgent"><b>🚨 Plan d’urgence</b><br>${u ? `Pris en main par ${esc(u.par)} le ${fmtDT(u.date)}${u.note ? `<br>« ${esc(u.note)} »` : ''}` : 'Personne n’a encore pris ce dossier en main.'}
      <label style="margin-top:8px">Note<input id="u_note" value="${esc(u ? u.note : '')}" placeholder="Actions engagées…"></label><button class="btn mini" data-a="prendreEnMain">${u ? 'Mettre à jour' : 'Je prends ce dossier en main'}</button></div>` : ''}
  </div><div>
    <h3>Niveau d’avancement</h3><label>Niveau affiché<select data-c="niveauForce"><option value="">Automatique (actuellement ${niveauAuto(d)})</option>
      ${NIV.map((v, n) => `<option value="${n}" ${d.prof.niveauForce === n ? 'selected' : ''}>Fixer à ${n} · ${v.l}</option>`).join('')}</select></label>
    <h3>Dates de stage dérogatoires</h3><p class="doux petit">À utiliser à la marge : remplace les dates de la classe pour cet élève uniquement.</p>
    <div class="deux"><label>Début<input type="date" id="o_debut" value="${esc(o.debut || '')}"></label><label>Fin<input type="date" id="o_fin" value="${esc(o.fin || '')}"></label></div>
    <label>Motif<input id="o_motif" value="${esc(o.motif || '')}"></label>
    <div class="actions"><button class="btn mini" data-a="derogUn">Appliquer</button>${d.prof.dates ? '<button class="btn mini sec" data-a="derogUnRetirer">Revenir aux dates de la classe</button>' : ''}</div>
    <h3 style="margin-top:18px">Compte de l’élève</h3><div class="ligne"><input id="n_mdp" placeholder="Nouveau mot de passe provisoire" aria-label="Nouveau mot de passe provisoire"><button class="btn mini sec" data-a="resetMdp">Réinitialiser</button></div>
    <div class="actions"><button class="btn mini danger" data-a="supEleve">Supprimer ce compte élève</button></div>
  </div></div>`;
}
C.niveauForce = async el => { await mutProf(S.dossier, p => { p.niveauForce = el.value === '' ? null : +el.value; }); render(); toast('Niveau mis à jour'); };
A.prendreEnMain = async () => { const note = val('u_note'); await mutProf(S.dossier, p => { p.urgence = { par: nomComplet(S.user), parId: S.user.id, date: maintenant(), note }; }); render(); toast('Dossier pris en main'); };
function lireDerog(pd, pf, pm) {
  const d = { debut: val(pd), fin: val(pf), motif: val(pm) };
  if (!d.debut || !d.fin) throw new Error('Indiquez la date de début et la date de fin.');
  if (d.fin < d.debut) throw new Error('La date de fin est avant la date de début.');
  return d;
}
A.derogUn = async () => { const dates = lireDerog('o_debut', 'o_fin', 'o_motif'); await mutProf(S.dossier, p => { p.dates = dates; }); render(); toast('Dates dérogatoires appliquées'); };
A.derogUnRetirer = async () => { await mutProf(S.dossier, p => { p.dates = null; }); render(); };
A.resetMdp = async () => { await api('POST', '/api/admin/motdepasse', { id: S.dossier, motdepasse: $('#n_mdp').value }); $('#n_mdp').value = ''; toast('Mot de passe réinitialisé'); };
A.supEleve = async () => {
  const e = eleveOuvert();
  if (!confirm(`Supprimer définitivement le compte et le dossier de ${nomEleve(e)} ?`)) return;
  await api('POST', '/api/admin/supprimer', { id: e.id }); S.dossier = null; await chargerEleves(); render();
};
const dosSuivi = e => e.d.demandes.liste.length ? [...e.d.demandes.liste].reverse().map(x => carteDemande(x, true)).join('') : '<p class="doux">L’élève n’a encore sélectionné aucune entreprise.</p>';
const dosActivite = e => e.d.journal.evenements.length ? `<ul class="journal">${[...e.d.journal.evenements].reverse().map(v => `<li><time>${fmtDT(v.date)}</time>${esc(v.texte)}</li>`).join('')}</ul>` : '<p class="doux">Aucune activité enregistrée.</p>';
function dosDoc(e, t) {
  const doc = e.d[t], memento = t === 'memento';
  const intro = memento
    ? (doc.majLe ? `Dernière modification par l’élève : ${fmtDT(doc.majLe)}.` : 'L’élève n’a pas encore travaillé son memento.') + ' Vous pouvez corriger directement le texte et laisser un commentaire.'
    : (doc.deposeLe ? `📄 Déposé par l’élève dans son <b>espace documentaire de l’ENT</b> le ${fmtDT(doc.deposeLe)}. Ouvrez-le depuis l’ENT (fichiers partagés avec vous), annotez-le si besoin, puis indiquez ici votre retour.`
      : 'L’élève n’a pas encore signalé de dépôt sur l’ENT.');
  return `<p class="doux">${intro}</p>
    ${blocCorrection(doc)}${memento ? formDoc(t, doc) : ''}
    <label>Commentaire pour l’élève<textarea id="f_commentaire" rows="3">${esc(doc.correction ? doc.correction.commentaire : '')}</textarea></label>
    <label><input type="checkbox" id="f_valide" ${doc.valide ? 'checked' : ''}>Document validé</label>
    <button class="btn" data-a="corriger" data-t="${t}">Enregistrer la correction</button>`;
}
A.corriger = async el => {
  const t = el.dataset.t, e = eleveOuvert(), doc = e.d[t]; if (CHAMPS[t]) lireDoc(t, doc);
  doc.correction = { par: nomComplet(S.user), date: maintenant(), commentaire: val('f_commentaire') };
  doc.valide = $('#f_valide').checked; doc.aRelire = false;
  await putDoc(`eleve/${e.id}/${t}`, doc); render(); toast('Correction enregistrée');
};
function dosConseils(e) {
  const d = e.d, ents = [...S.entreprises].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return `<div class="grille"><div><h3>Conseils donnés</h3>
    ${d.prof.conseils.length ? [...d.prof.conseils].reverse().map(c => `<div class="conseil"><div class="petit doux">${esc(c.profNom)} · ${fmtDT(c.date)} · ${d.etat.conseilsLus.includes(c.id) ? 'lu' : 'non lu'}
      <button class="lien" style="display:inline" data-a="supConseil" data-id="${c.id}">supprimer</button></div>${esc(c.texte)}</div>`).join('') : '<p class="doux">Aucun conseil.</p>'}
    <label>Nouveau conseil<textarea id="k_texte" rows="3" placeholder="Pense à rappeler…, ton accroche est trop longue…"></textarea></label><button class="btn" data-a="conseil">Envoyer le conseil</button>
  </div><div><h3>Entreprises proposées à l’élève</h3>
    ${d.prof.propositions.length ? d.prof.propositions.map(p => { const en = S.entreprises.find(x => x.id === p.entrepriseId); const pris = d.demandes.liste.some(x => x.entrepriseId === p.entrepriseId);
      return `<p>🏢 <b>${esc(en ? en.nom : 'Entreprise supprimée')}</b> <span class="badge clair">${pris ? 'ajoutée à ses appels' : 'pas encore retenue'}</span><br><span class="petit doux">${esc(p.profNom)} · ${fmt(p.date)}${p.message ? ` · « ${esc(p.message)} »` : ''}</span></p>`; }).join('') : '<p class="doux">Aucune proposition.</p>'}
    <label>Proposer une entreprise de la base<select id="k_ent"><option value="">— Choisir —</option>${ents.map(x => `<option value="${x.id}">${esc(x.nom)}${x.secteur ? ` (${esc(x.secteur)})` : ''}</option>`).join('')}</select></label>
    <details style="margin-bottom:12px"><summary>…ou saisir une nouvelle adresse d’entreprise</summary>
      <label style="margin-top:8px">Nom<input id="kn_nom"></label><div style="font-weight:600;font-size:.88rem">Adresse</div>${champGeo('kn', '', null, null)}
      <div class="deux" style="margin-top:10px"><label>Téléphone<input id="kn_tel"></label><label>Contact<input id="kn_contact"></label></div></details>
    <label>Message pour l’élève<input id="k_msg" placeholder="Appelle de ma part, demande M. …"></label><button class="btn" data-a="proposer">Proposer cette entreprise</button>
  </div></div>`;
}
A.conseil = async () => {
  const texte = val('k_texte'); if (!texte) throw new Error('Écrivez votre conseil.');
  await mutProf(S.dossier, p => p.conseils.push({ id: uid(), date: maintenant(), profNom: nomComplet(S.user), texte })); render(); toast('Conseil envoyé');
};
A.supConseil = async el => { await mutProf(S.dossier, p => { p.conseils = p.conseils.filter(c => c.id !== el.dataset.id); }); render(); };
A.proposer = async () => {
  let id = val('k_ent');
  if (val('kn_nom')) {
    const n = { id: uid(), nom: val('kn_nom'), secteur: '', ...lireGeo('kn'), tel: val('kn_tel'), email: '', contact: val('kn_contact'), notes: `Ajoutée par ${nomComplet(S.user)}` };
    await assurerGeo(n); await mutCommun('entreprises', l => l.push(n)); id = n.id;
  }
  if (!id) throw new Error('Choisissez une entreprise ou saisissez-en une nouvelle.');
  const message = val('k_msg');
  await mutProf(S.dossier, p => { if (!p.propositions.some(x => x.entrepriseId === id)) p.propositions.push({ id: uid(), entrepriseId: id, date: maintenant(), profNom: nomComplet(S.user), message }); });
  render(); toast('Entreprise proposée à l’élève');
};

/* ---------- Alertes ---------- */
function vueAlertes() {
  const u = urgences().sort((a, b) => jours(datesEleve(a.d).debut) - jours(datesEleve(b.d).debut));
  const relire = S.eleves.flatMap(e => ['cv', 'lettre', 'memento'].filter(t => e.d[t].aRelire).map(t => ({ e, t })));
  const inactifs = S.eleves.filter(e => { const d = e.d, ev = d.journal.evenements, dt = datesEleve(d);
    return niveau(d) < 5 && dt && dt.fin >= today() && !enUrgence(d) && (!ev.length || jours(ev[ev.length - 1].date.slice(0, 10)) <= -14); });
  const bouton = (e, o) => `<button class="btn mini sec" data-a="ouvrir" data-id="${e.id}" data-o="${o}">Ouvrir le dossier</button>`;
  return `<section class="carte"><h2>🚨 Plan d’urgence (${u.length})</h2><p class="doux">Élèves à 10 jours ou moins du début du stage sans convention signée : le professeur référent prend le dossier en main.</p>
    ${u.length ? `<div class="table-scroll"><table><tr><th>Élève</th><th>Échéance</th><th>Avancement</th><th>Référent</th><th>Prise en main</th><th></th></tr>${u.map(e => { const d = e.d, cl = classeDe(d), j = jours(datesEleve(d).debut), moi = cl && cl.referentId === S.user.id;
      return `<tr><td><b>${esc(nomEleve(e))}</b><br><span class="petit doux">${esc(cl ? cl.nom : '')}</span></td><td><b style="color:#dc2626">${j > 0 ? 'J-' + j : 'Stage commencé'}</b><br><span class="petit doux">${fmt(datesEleve(d).debut)}</span></td>
        <td style="min-width:170px">${barre(niveau(d), true)}</td><td>${moi ? '<span class="badge" style="background:#dc2626">Vous</span>' : esc(cl && nomProf(cl.referentId) || 'Non désigné')}</td>
        <td>${d.prof.urgence ? `✅ ${esc(d.prof.urgence.par)}<br><span class="petit doux">${fmt(d.prof.urgence.date)}</span>` : '<b>À prendre en main</b>'}</td><td>${bouton(e, 'synthese')}</td></tr>`; }).join('')}</table></div>` : '<p>✅ Aucun élève en situation d’urgence.</p>'}</section>
  <section class="carte"><h2>🟣 Documents à relire (${relire.length})</h2>
    ${relire.length ? relire.map(({ e, t }) => `<p><b>${esc(nomEleve(e))}</b> — ${TITRES[t]} ${e.d[t].deposeLe ? 'déposé sur l’ENT' : 'modifié'} le ${fmt(e.d[t].deposeLe || e.d[t].majLe)} ${bouton(e, t)}</p>`).join('') : '<p class="doux">Rien à relire.</p>'}</section>
  <section class="carte"><h2>😴 Sans activité depuis 14 jours (${inactifs.length})</h2>
    ${inactifs.length ? inactifs.map(e => `<p><b>${esc(nomEleve(e))}</b> <span class="petit doux">${esc((classeDe(e.d) || {}).nom || '')} · niveau ${niveau(e.d)}</span> ${bouton(e, 'conseils')}</p>`).join('') : '<p class="doux">Tous les élèves concernés sont actifs.</p>'}</section>`;
}

/* ---------- Classes et dates ---------- */
function vueClasses() {
  return `<section class="carte"><h2>Classes et dates de stage</h2><p class="doux">Chaque classe a une couleur, un professeur référent et une ou plusieurs périodes de stage. Les alertes des élèves et le plan d’urgence (J-10) se calculent sur la prochaine période.</p>
    ${S.codeEleve ? `<div class="alerte info">🔑 Code d’inscription à communiquer aux élèves : <b>${esc(S.codeEleve)}</b></div>` : ''}
    <button class="btn" data-a="nouvelleClasse">➕ Nouvelle classe</button></section>${S.classes.map(carteClasse).join('')}`;
}
function carteClasse(cl) {
  const els = S.eleves.filter(e => e.d.profil.classeId === cl.id);
  return `<section class="classe" style="--cc:${esc(cl.couleur)}" data-cl="${cl.id}"><header><h2>${esc(cl.nom || 'Nouvelle classe')}</h2><span>${els.length} élève(s)</span>${cl.neuf ? '<span>non enregistrée</span>' : ''}</header><div style="padding:16px">
    <div class="deux"><label>Nom de la classe<input class="c_nom" value="${esc(cl.nom)}" placeholder="ex. 3e B"></label><label>Couleur<input type="color" class="c_couleur" value="${esc(cl.couleur)}"></label>
      <label>Professeur référent<select class="c_ref"><option value="">— Non désigné —</option>${S.profs.map(p => `<option value="${p.id}" ${p.id === cl.referentId ? 'selected' : ''}>${esc(nomComplet(p))}</option>`).join('')}</select></label></div>
    <h3>Périodes de stage</h3>
    <div class="table-scroll"><table><tr><th>Intitulé</th><th>Début</th><th>Fin</th><th></th></tr>${cl.periodes.map(p => `<tr data-p="${p.id}"><td><input class="p_label" value="${esc(p.label)}" aria-label="Intitulé"></td><td><input type="date" class="p_debut" value="${esc(p.debut)}" aria-label="Début"></td>
      <td><input type="date" class="p_fin" value="${esc(p.fin)}" aria-label="Fin"></td><td><button class="btn mini danger" data-a="supPeriode" data-p="${p.id}">Retirer</button></td></tr>`).join('')}</table></div>
    <div class="actions"><button class="btn sec mini" data-a="ajouterPeriode">➕ Ajouter une période</button><button class="btn" data-a="sauverClasse">Enregistrer la classe</button><button class="btn danger mini" data-a="supClasse">Supprimer la classe</button></div>
    ${els.length ? `<details style="margin-top:14px"><summary><b>Modifier les dates pour un ou plusieurs élèves</b> (dérogation, à la marge)</summary>
      <div class="liste-coche" style="margin-top:8px">${els.map(e => { const o = e.d.prof.dates; return `<label><input type="checkbox" class="d_sel" value="${e.id}">${esc(nomEleve(e))}${o ? ` <span class="badge clair">${fmt(o.debut)} → ${fmt(o.fin)}</span>` : ''}</label>`; }).join('')}</div>
      <div class="deux" style="margin-top:10px"><label>Début<input type="date" id="g_debut_${cl.id}"></label><label>Fin<input type="date" id="g_fin_${cl.id}"></label><label>Motif<input id="g_motif_${cl.id}"></label></div>
      <div class="actions"><button class="btn mini" data-a="derogGroupe">Appliquer aux élèves cochés</button><button class="btn mini sec" data-a="derogGroupeRetirer">Remettre les dates de la classe</button></div></details>` : ''}
  </div></section>`;
}
function lireClasse(el) {
  const sec = el.closest('[data-cl]'), cl = S.classes.find(c => c.id === sec.dataset.cl);
  cl.nom = $('.c_nom', sec).value.trim(); cl.couleur = $('.c_couleur', sec).value; cl.referentId = $('.c_ref', sec).value;
  for (const tr of $$('tr[data-p]', sec)) { const p = cl.periodes.find(x => x.id === tr.dataset.p); Object.assign(p, { label: $('.p_label', tr).value.trim(), debut: $('.p_debut', tr).value, fin: $('.p_fin', tr).value }); }
  return { cl, sec };
}
A.nouvelleClasse = () => { S.classes.push({ id: uid(), nom: '', couleur: PALETTE[S.classes.length % PALETTE.length], referentId: S.user.id, periodes: [{ id: uid(), label: 'Stage', debut: '', fin: '' }], neuf: true }); render(); window.scrollTo(0, document.body.scrollHeight); };
A.ajouterPeriode = el => { lireClasse(el).cl.periodes.push({ id: uid(), label: 'Stage', debut: '', fin: '' }); render(); };
A.supPeriode = el => { const { cl } = lireClasse(el); cl.periodes = cl.periodes.filter(p => p.id !== el.dataset.p); render(); };
A.sauverClasse = async el => {
  const { cl } = lireClasse(el);
  if (!cl.nom) throw new Error('Donnez un nom à la classe.');
  for (const p of cl.periodes) { if (!p.debut || !p.fin) throw new Error('Chaque période doit avoir une date de début et de fin.'); if (p.fin < p.debut) throw new Error('Une période se termine avant son début.'); }
  const propre = { ...cl }; delete propre.neuf;
  await mutCommun('classes', l => { const i = l.findIndex(c => c.id === cl.id); if (i >= 0) l[i] = propre; else l.push(propre); });
  render(); toast('Classe enregistrée');
};
A.supClasse = async el => {
  const { cl } = lireClasse(el);
  if (!confirm(`Supprimer la classe « ${cl.nom} » ? Les élèves inscrits se retrouveront « sans classe ».`)) return;
  if (cl.neuf) S.classes = S.classes.filter(c => c.id !== cl.id); else await mutCommun('classes', l => { const i = l.findIndex(c => c.id === cl.id); if (i >= 0) l.splice(i, 1); });
  render();
};
async function derogGroupe(el, retirer) {
  const sec = el.closest('[data-cl]'), id = sec.dataset.cl, ids = $$('.d_sel:checked', sec).map(c => c.value);
  if (!ids.length) throw new Error('Cochez au moins un élève.');
  const dates = retirer ? null : lireDerog('g_debut_' + id, 'g_fin_' + id, 'g_motif_' + id);
  for (const i of ids) await mutProf(i, p => { p.dates = dates; });
  render(); toast(`Dates mises à jour pour ${ids.length} élève(s)`);
}
A.derogGroupe = el => derogGroupe(el, false);
A.derogGroupeRetirer = el => derogGroupe(el, true);

/* ---------- Base d'entreprises ---------- */
function vueBase() {
  const sansGeo = S.entreprises.filter(e => e.lat == null).length;
  return `<section class="carte"><h2>Base d’entreprises (${S.entreprises.length})</h2>
    <p class="doux">Les élèves reçoivent 5 à 10 propositions parmi les entreprises localisées situées dans leur rayon de déplacement.</p>
    <div class="actions"><button class="btn" data-a="editEnt">➕ Ajouter une entreprise</button><button class="btn sec" data-a="importEnt">📥 Importer une liste</button>
      <button class="btn sec" data-a="choisirFichierEnt">📂 Importer un fichier préparé (.json)</button><input type="file" id="fichierEnt" accept=".json,application/json" hidden data-c="fichierEnt">
      ${sansGeo ? `<button class="btn sec" data-a="geoManquantes">📍 Localiser les ${sansGeo} adresse(s) non localisée(s)</button>` : ''}
      ${S.entreprises.length ? '' : '<button class="btn sec" data-a="demo">🧪 Charger des données de démonstration</button>'}</div>
    <label style="margin-top:12px">Rechercher<input data-i="qEnt" value="${esc(S.qEnt)}" placeholder="Nom, secteur, ville…"></label>
    <div class="table-scroll" id="tableEnt">${tableEnt()}</div></section>`;
}
function tableEnt() {
  const q = S.qEnt.trim().toLowerCase();
  const tous = S.entreprises.filter(e => !q || `${e.nom} ${e.secteur} ${e.activite || ''} ${e.adresse} ${e.contact}`.toLowerCase().includes(q)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  if (!tous.length) return '<p class="doux">Aucune entreprise.</p>';
  const MAX = 200, l = tous.slice(0, MAX);   // au-delà, le tableau devient trop lourd à afficher
  return `${tous.length > MAX ? `<p class="doux petit">${tous.length} résultats : seuls les ${MAX} premiers sont affichés. Affinez la recherche (nom, ville, secteur…).</p>` : ''}
    <table><tr><th>Entreprise</th><th>Adresse</th><th>Contact</th><th></th></tr>${l.map(e => `<tr><td><b>${esc(e.nom)}</b>${e.secteur ? `<br><span class="badge clair">${esc(e.secteur)}</span>` : ''}</td>
    <td>${esc(e.adresse)}${e.lat == null ? '<br><span class="badge" style="background:#b45309">non localisée</span>' : ''}</td><td>${esc(e.tel)}${e.contact ? `<br>${esc(e.contact)}` : ''}${e.email ? `<br>${esc(e.email)}` : ''}</td>
    <td style="white-space:nowrap"><button class="btn mini sec" data-a="editEnt" data-id="${e.id}">Modifier</button> <button class="btn mini danger" data-a="supEnt" data-id="${e.id}">Supprimer</button></td></tr>`).join('')}</table>`;
}
I.qEnt = el => { S.qEnt = el.value; $('#tableEnt').innerHTML = tableEnt(); };
// Import d'un fichier préparé (liste déjà localisée) : ajoute les entreprises absentes de la base.
A.choisirFichierEnt = () => $('#fichierEnt').click();
C.fichierEnt = async el => {
  const f = el.files && el.files[0]; el.value = '';
  if (!f) return;
  let doc;
  try { doc = JSON.parse(await f.text()); } catch { throw new Error('Ce fichier n’est pas un fichier d’import valide (.json).'); }
  const liste = Array.isArray(doc) ? doc : doc && doc.entreprises;
  if (!Array.isArray(liste) || !liste.length || !liste.every(e => e && typeof e.nom === 'string' && e.nom.trim())) throw new Error('Fichier non reconnu : il doit contenir une liste d’entreprises.');
  const champs = ['id', 'nom', 'secteur', 'activite', 'adresse', 'ville', 'lat', 'lon', 'precision', 'tel', 'email', 'web', 'contact', 'notes'];
  const propre = e => { const o = {}; for (const k of champs) if (e[k] !== undefined && e[k] !== '') o[k] = k === 'lat' || k === 'lon' ? (e[k] == null ? null : +e[k]) : String(e[k]).slice(0, 300); o.id = o.id || uid(); if (o.lat === undefined) { o.lat = null; o.lon = null; } return o; };
  const cle = e => `${e.nom}|${e.adresse || ''}`.toLowerCase().replace(/\s+/g, ' ');
  if (!confirm(`Importer ${liste.length} entreprise(s) depuis « ${f.name} » ? Celles déjà présentes dans la base seront ignorées.`)) return;
  let ajoutees = 0;
  await mutCommun('entreprises', l => {
    const ids = new Set(l.map(e => e.id)), cles = new Set(l.map(cle));
    for (const e of liste.map(propre)) { if (ids.has(e.id) || cles.has(cle(e))) continue; l.push(e); ids.add(e.id); cles.add(cle(e)); ajoutees++; }
  });
  render(); toast(`${ajoutees} entreprise(s) ajoutée(s), ${liste.length - ajoutees} déjà présente(s)`);
};
A.editEnt = el => {
  const e = S.entreprises.find(x => x.id === el.dataset.id) || { id: '', nom: '', secteur: '', adresse: '', lat: null, lon: null, tel: '', email: '', contact: '', notes: '' };
  modal(`<h2>${e.id ? 'Modifier' : 'Ajouter'} une entreprise</h2><div class="deux"><label>Nom<input id="e_nom" value="${esc(e.nom)}"></label><label>Secteur d’activité<input id="e_secteur" value="${esc(e.secteur)}"></label></div>
    <div style="font-weight:600;font-size:.88rem">Adresse</div>${champGeo('e', e.adresse, e.lat, e.lon)}
    <div class="deux" style="margin-top:12px"><label>Téléphone<input id="e_tel" value="${esc(e.tel)}"></label><label>E-mail<input id="e_email" value="${esc(e.email)}"></label><label>Personne à contacter<input id="e_contact" value="${esc(e.contact)}"></label></div>
    <label>Notes<textarea id="e_notes" rows="2">${esc(e.notes)}</textarea></label><button class="btn" data-a="sauverEnt" data-id="${e.id}">Enregistrer</button>`);
};
A.sauverEnt = async el => {
  const ancien = S.entreprises.find(x => x.id === el.dataset.id) || {};   // garde les champs non affichés (activité, site web…)
  const n = { ...ancien, id: el.dataset.id || uid(), nom: val('e_nom'), secteur: val('e_secteur'), ...lireGeo('e'), tel: val('e_tel'), email: val('e_email'), contact: val('e_contact'), notes: val('e_notes') };
  if (ancien.adresse !== n.adresse || ancien.lat !== n.lat) n.precision = n.lat != null ? 'adresse' : '';
  if (!n.nom) throw new Error('Indiquez le nom de l’entreprise.');
  await assurerGeo(n);
  await mutCommun('entreprises', l => { const i = l.findIndex(x => x.id === n.id); if (i >= 0) l[i] = n; else l.push(n); });
  modal(''); render(); toast(n.lat == null ? 'Enregistrée, mais adresse non localisée' : 'Entreprise enregistrée', n.lat == null);
};
A.supEnt = async el => {
  const e = S.entreprises.find(x => x.id === el.dataset.id);
  if (!e || !confirm(`Supprimer « ${e.nom} » de la base ?`)) return;
  await mutCommun('entreprises', l => { const i = l.findIndex(x => x.id === e.id); if (i >= 0) l.splice(i, 1); }); render();
};
A.importEnt = () => modal(`<h2>Importer une liste d’entreprises</h2><p class="doux">Une entreprise par ligne, champs séparés par un point-virgule (copier-coller depuis un tableur accepté) :<br><code>Nom ; Secteur ; Adresse complète ; Téléphone ; E-mail ; Contact</code></p>
  <textarea id="i_txt" rows="10" placeholder="Boulangerie Martin ; Alimentation ; 12 rue de la Paix 69002 Lyon ; 04 00 00 00 00 ; ; Mme Martin"></textarea>
  <p id="i_etat" class="doux"></p><button class="btn" data-a="importer">Importer et localiser</button>`);
A.importer = async () => {
  const lignes = $('#i_txt').value.split('\n').map(l => l.split(/;|\t/).map(c => c.trim())).filter(c => c[0]);
  if (!lignes.length) throw new Error('Collez au moins une ligne.');
  const nouv = lignes.map(c => ({ id: uid(), nom: c[0], secteur: c[1] || '', adresse: c[2] || '', lat: null, lon: null, tel: c[3] || '', email: c[4] || '', contact: c[5] || '', notes: '' }));
  for (let i = 0; i < nouv.length; i++) { $('#i_etat').textContent = `Localisation ${i + 1}/${nouv.length}…`; await assurerGeo(nouv[i]); }
  await mutCommun('entreprises', l => l.push(...nouv));
  modal(''); render(); toast(`${nouv.length} entreprise(s) importée(s), dont ${nouv.filter(e => e.lat == null).length} non localisée(s)`);
};
A.geoManquantes = async el => {
  el.disabled = true; el.textContent = 'Localisation en cours…';
  const trouves = {};
  for (const e of S.entreprises.filter(x => x.lat == null)) { const c = { ...e }; await assurerGeo(c); if (c.lat != null) trouves[e.id] = c; }
  await mutCommun('entreprises', l => { for (const x of l) if (trouves[x.id]) { x.lat = trouves[x.id].lat; x.lon = trouves[x.id].lon; } });
  render(); toast(`${Object.keys(trouves).length} adresse(s) localisée(s)`);
};
A.demo = async () => {
  const D = [['Boulangerie des Terreaux', 'Alimentation', '4 place des Terreaux, 69001 Lyon', 45.7676, 4.8344], ['Garage Bellecour Auto', 'Mécanique', '18 rue de la Charité, 69002 Lyon', 45.7553, 4.8336],
    ['Pharmacie Part-Dieu', 'Santé', '25 rue Servient, 69003 Lyon', 45.7602, 4.8540], ['Imprimerie Croix-Rousse', 'Imprimerie', '12 grande rue de la Croix-Rousse, 69004 Lyon', 45.7767, 4.8318],
    ['Cabinet vétérinaire Gratte-Ciel', 'Santé animale', '30 avenue Henri Barbusse, 69100 Villeurbanne', 45.7690, 4.8795], ['Menuiserie Charpennes', 'Artisanat', '9 rue Gabriel Péri, 69100 Villeurbanne', 45.7712, 4.8650],
    ['Informatique Service Bron', 'Informatique', '120 avenue Franklin Roosevelt, 69500 Bron', 45.7394, 4.9100], ['Fleuriste des Essarts', 'Commerce', '50 avenue Camille Rousset, 69500 Bron', 45.7340, 4.9200],
    ['Médiathèque de Vénissieux', 'Culture', '2 avenue Marcel Houël, 69200 Vénissieux', 45.6977, 4.8867], ['Carrosserie du Moulin', 'Mécanique', '15 avenue de la République, 69200 Vénissieux', 45.7030, 4.8810],
    ['Cabinet d’architecture Carré de Soie', 'Architecture', '5 avenue des Canuts, 69120 Vaulx-en-Velin', 45.7650, 4.9210], ['Restaurant Le Caluire', 'Restauration', '60 rue Jean Moulin, 69300 Caluire-et-Cuire', 45.7953, 4.8424],
    ['Clinique vétérinaire d’Oullins', 'Santé animale', '80 grande rue, 69600 Oullins', 45.7146, 4.8078], ['Agence immobilière de Décines', 'Immobilier', '210 avenue Jean Jaurès, 69150 Décines-Charpieu', 45.7689, 4.9594],
    ['Électricité Saint-Priest', 'Bâtiment', '14 grande rue, 69800 Saint-Priest', 45.6969, 4.9439], ['École maternelle d’Écully', 'Enseignement', '3 chemin du Randin, 69130 Écully', 45.7747, 4.7775]];
  await mutCommun('entreprises', l => D.forEach(([nom, secteur, adresse, lat, lon], i) => l.push({ id: uid() + i, nom, secteur, adresse, lat, lon, tel: `04 00 00 00 ${String(i + 10)}`, email: '', contact: '', notes: 'Entreprise fictive (démonstration)' })));
  if (!S.classes.length) {
    const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    await mutCommun('classes', l => l.push({ id: uid() + 'a', nom: '3e A (démo)', couleur: PALETTE[0], referentId: S.user.id, periodes: [{ id: uid(), label: 'Stage d’observation', debut: plus(45), fin: plus(49) }] },
      { id: uid() + 'b', nom: '2de Pro (démo)', couleur: PALETTE[1], referentId: S.user.id, periodes: [{ id: uid(), label: 'PFMP 1', debut: plus(8), fin: plus(29) }] }));
  }
  render(); toast('Données de démonstration chargées (région lyonnaise)');
};
