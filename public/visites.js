'use strict';
/* ===== Visites de stage : agenda du professeur, ordre de mission (signé par le chef d'établissement), état de frais =====
 * - Les visites sont rangées dans le dossier de l'élève (eleve/<id>/prof → visites) : l'élève voit la date et le lieu.
 * - Les informations personnelles du professeur (adresse, puissance fiscale, noms complets des élèves suivis,
 *   horaires des déplacements) sont dans son espace privé perso/<id>, que lui seul peut lire.
 * - Les ordres de mission sont enregistrés (mission/<id>) pour être signés par le chef d'établissement. */

S.perso = null; S.missions = []; S.agMois = today().slice(0, 7);
const PERSO_DEF = () => ({ civilite: 'M.', nom: (S.user && S.user.nom || '').toUpperCase(), prenom: S.user ? S.user.prenom : '', adresse1: '', adresse2: '', puissance: '', nomsComplets: {}, frais: {} });
async function chargerVisites() {
  try { S.perso = Object.assign(PERSO_DEF(), (await getDoc('perso/' + S.user.id)) || {}); } catch { S.perso = PERSO_DEF(); }
  try { S.missions = await api('GET', '/api/missions'); } catch { S.missions = []; }
}
async function mutPerso(fn) {
  const p = Object.assign(PERSO_DEF(), (await getDoc('perso/' + S.user.id)) || {});
  fn(p); await putDoc('perso/' + S.user.id, p); S.perso = p;
}
const missionsASigner = () => S.user.chef ? S.missions.filter(m => !m.signature) : [];

/* ---------- Outils ---------- */
const jjmmaa = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '';
const jourLong = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const communeDe = adr => { const m = /\b\d{5}\s+(.+)$/.exec(String(adr || '').replace(/\n/g, ' ').trim()); return m ? m[1].trim() : String(adr || '').split(/[,\n]/).pop().trim(); };
const lienSur = u => /^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : '';
function toutesVisites() {
  const l = [];
  for (const e of S.eleves) for (const v of e.d.prof.visites || []) l.push({ e, v });
  return l.sort((a, b) => (a.v.date + a.v.heure).localeCompare(b.v.date + b.v.heure));
}
const mesVisites = () => toutesVisites().filter(x => x.v.profId === S.user.id);
function mesEleves() {
  const mes = S.classes.filter(c => referentsDe(c).includes(S.user.id)).map(c => c.id);
  return S.eleves.filter(e => mes.includes(e.d.profil.classeId) || (e.d.prof.visites || []).some(v => v.profId === S.user.id));
}
// Entreprise du stage : convention signée, sinon protocole, sinon rendez-vous.
function entrepriseStage(d) {
  for (const s of ['convention', 'protocole', 'rdv']) {
    const x = d.demandes.liste.find(y => y.statut === s); if (!x) continue;
    const e = S.entreprises.find(z => z.id === x.entrepriseId) || {};
    return { nom: x.nom || e.nom || '', adresse: x.adresse || e.adresse || '', tel: x.tel || e.tel || '' };
  }
  return null;
}
const nomFamille = e => (S.perso && S.perso.nomsComplets[e.id]) || e.d.profil.nom;
const lieuVisite = (e, v) => v.mode === 'visio' ? 'En visio' : v.lieu === 'autre' ? v.adresse : ((entrepriseStage(e.d) || v.entreprise || {}).adresse || '');
const itineraire = (dest) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + (S.perso && S.perso.adresse1 ? '&origin=' + encodeURIComponent(`${S.perso.adresse1} ${S.perso.adresse2}`) : '');

/* ---------- Vue principale ---------- */
function vueVisites() {
  const p = S.perso || PERSO_DEF(), incomplet = !p.adresse1 || !p.puissance;
  return `${blocMissionsASigner()}
    ${agenda()}
    ${elevesASuivre()}
    <div class="grille">
      <section class="carte"><h2>📄 Ordres de mission</h2>
        <p class="doux petit">Préparés à partir de vos visites, puis envoyés au chef d’établissement qui les signe dans l’application. Vous téléchargez ensuite le PDF signé (avec la fiche des tampons d’entreprise).</p>
        ${listeMissions()}
        <div class="actions"><button class="btn" data-a="omNouveau">➕ Préparer un ordre de mission</button></div></section>
      <section class="carte"><h2>🚗 État de frais de déplacement</h2>
        <p class="doux petit">Reprend vos visites sur le terrain du mois choisi, avec les heures de départ et d’arrivée. Les kilomètres sont calculés par l’administration.</p>
        <label>Mois<input type="month" id="fr_mois" value="${S.agMois}"></label>
        <div class="actions"><button class="btn" data-a="frOuvrir">Préparer l’état de frais</button></div></section>
    </div>
    <section class="carte"><details ${incomplet ? 'open' : ''}><summary><b>👤 Mes informations pour l’ordre de mission et l’état de frais</b>${incomplet ? ' <span class="badge" style="background:#b45309">à compléter</span>' : ''}</summary>
      <p class="doux petit">Visibles par vous seul ; elles sont imprimées sur vos documents.</p>
      <div class="deux"><label>Civilité<select id="pp_civ"><option ${p.civilite === 'M.' ? 'selected' : ''}>M.</option><option ${p.civilite === 'Mme' ? 'selected' : ''}>Mme</option></select></label>
        <label>NOM<input id="pp_nom" value="${esc(p.nom)}" style="text-transform:uppercase"></label><label>Prénom<input id="pp_prenom" value="${esc(p.prenom)}"></label></div>
      <div class="deux"><label>Résidence personnelle (rue)<input id="pp_adr1" value="${esc(p.adresse1)}" placeholder="167 rue de la Prairie"></label>
        <label>Code postal et commune<input id="pp_adr2" value="${esc(p.adresse2)}" placeholder="76230 ISNEAUVILLE"></label>
        <label>Puissance fiscale du véhicule<input id="pp_cv" value="${esc(p.puissance)}" placeholder="7 CV"></label></div>
      <div class="actions"><button class="btn" data-a="ppSauver">Enregistrer</button></div></details></section>`;
}
A.ppSauver = async () => {
  await mutPerso(p => Object.assign(p, { civilite: val('pp_civ'), nom: val('pp_nom').toUpperCase(), prenom: val('pp_prenom'), adresse1: val('pp_adr1'), adresse2: val('pp_adr2'), puissance: val('pp_cv') }));
  render(); toast('Informations enregistrées');
};

/* ---------- Agenda (mois) ---------- */
function agenda() {
  const [y, m] = S.agMois.split('-').map(Number), decal = (new Date(y, m - 1, 1).getDay() + 6) % 7, nbj = new Date(y, m, 0).getDate();
  const vis = mesVisites().filter(x => x.v.date.startsWith(S.agMois)), auj = today();
  const cases = [];
  for (let i = 0; i < decal; i++) cases.push('<div class="ag-case vide" aria-hidden="true"></div>');
  for (let j = 1; j <= nbj; j++) {
    const iso = `${S.agMois}-${String(j).padStart(2, '0')}`, du = vis.filter(x => x.v.date === iso), we = (decal + j - 1) % 7 >= 5;
    cases.push(`<div class="ag-case${iso === auj ? ' auj' : ''}${we ? ' we' : ''}"><button type="button" class="ag-jour" data-a="agNouvelle" data-date="${iso}" aria-label="Planifier une visite le ${jourLong(iso)}">${j}</button>
      ${du.map(({ e, v }) => `<button type="button" class="ag-visite ${v.mode} ${v.statut}" data-a="agOuvrir" data-id="${v.id}" title="${esc(`${v.heure} ${nomEleve(e)} – ${lieuVisite(e, v)}`)}">${v.mode === 'visio' ? '💻' : '🚗'} ${esc(v.heure)} ${esc(e.d.profil.prenom)}</button>`).join('')}</div>`);
  }
  const prochaines = mesVisites().filter(x => x.v.date >= auj && x.v.statut === 'prevue').slice(0, 8);
  return `<section class="carte"><div class="ag-tete"><button type="button" class="btn mini sec" data-a="agMois" data-d="-1" aria-label="Mois précédent">◀</button>
      <h2>🗓️ ${MOIS[m - 1]} ${y}</h2><button type="button" class="btn mini sec" data-a="agMois" data-d="1" aria-label="Mois suivant">▶</button>
      <button type="button" class="btn mini sec" data-a="agMois" data-d="0">Aujourd’hui</button><span style="flex:1"></span>
      <button type="button" class="btn mini" data-a="agNouvelle">➕ Nouvelle visite</button></div>
    <div class="ag-grille" role="grid"><div class="ag-nom">lun.</div><div class="ag-nom">mar.</div><div class="ag-nom">mer.</div><div class="ag-nom">jeu.</div><div class="ag-nom">ven.</div><div class="ag-nom">sam.</div><div class="ag-nom">dim.</div>${cases.join('')}</div>
    <p class="petit doux">🚗 sur le terrain · 💻 en visio · touchez un jour pour planifier une visite.</p>
    <h3>Prochaines visites</h3>
    ${prochaines.length ? `<ul class="ag-liste">${prochaines.map(({ e, v }) => `<li><button type="button" class="lien" data-a="agOuvrir" data-id="${v.id}"><b>${esc(jourLong(v.date))} à ${esc(v.heure)}</b> — ${esc(nomEleve(e))} · ${v.mode === 'visio' ? '💻 visio' : '🚗 ' + esc(communeDe(lieuVisite(e, v)) || 'lieu à préciser')}</button></li>`).join('')}</ul>` : '<p class="doux">Aucune visite prévue.</p>'}</section>`;
}
A.agMois = el => {
  const d = +el.dataset.d;
  if (!d) S.agMois = today().slice(0, 7);
  else { const [y, m] = S.agMois.split('-').map(Number), n = new Date(y, m - 1 + d, 1); S.agMois = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
  render();
};

/* ---------- Élèves à suivre ---------- */
// Élèves et entreprises de stage, regroupés par classe (repliables) et dans l'ordre chronologique :
// date de la visite si elle est planifiée, sinon date de début du stage.
const cleRepliVis = () => 'stages_visRepli_' + S.user.id;
function classesRepliees() { try { return JSON.parse(localStorage.getItem(cleRepliVis()) || '[]'); } catch { return []; } }
function memoriserRepli(l) { try { localStorage.setItem(cleRepliVis(), JSON.stringify(l)); } catch { /* stockage indisponible */ } }
function elevesASuivre() {
  const l = mesEleves();
  if (!l.length) return `<section class="carte"><h2>👥 Mes élèves en stage</h2><p class="doux">Vous n’êtes professeur référent d’aucune classe : choisissez l’élève dans « Nouvelle visite ».</p></section>`;
  const infos = l.map(e => {
    const dt = datesEleve(e.d), vs = (e.d.prof.visites || []).filter(v => v.profId === S.user.id && v.statut !== 'annulee').sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
    const prochaine = vs.find(v => v.statut === 'prevue' && v.date >= today()) || vs[vs.length - 1];
    return { e, dt, vs, ent: entrepriseStage(e.d), cle: (prochaine ? prochaine.date + ' ' + prochaine.heure : '') || (dt ? dt.debut : '') || '9999' };
  });
  const ordre = [...classesVisibles(), { id: '', nom: 'Autres élèves', couleur: '#94a3b8' }];
  const groupes = ordre.map(c => ({ c, l: infos.filter(x => (c.id ? x.e.d.profil.classeId === c.id : !ordre.some(o => o.id && o.id === x.e.d.profil.classeId)))
    .sort((a, b) => a.cle.localeCompare(b.cle) || nomEleve(a.e).localeCompare(nomEleve(b.e), 'fr')) })).filter(g => g.l.length)
    .sort((a, b) => (!a.c.id) - (!b.c.id) || a.l[0].cle.localeCompare(b.l[0].cle));   // classes aussi dans l'ordre chronologique
  const replies = classesRepliees();
  return `<section class="carte"><div class="ag-tete"><h2>👥 Mes élèves en stage (${l.length})</h2><span style="flex:1"></span>
      ${groupes.length > 1 ? '<button type="button" class="btn mini sec" data-a="visToutes" data-o="1">Tout déplier</button><button type="button" class="btn mini sec" data-a="visToutes" data-o="0">Tout replier</button>' : ''}</div>
    <p class="petit doux">Par classe, dans l’ordre chronologique (date de la visite, sinon début du stage). Cliquez sur le nom d’une classe pour réduire ou afficher son détail.</p>
    ${groupes.map(({ c, l: g }) => {
      const aPlanifier = g.filter(x => !x.vs.length).length, faites = g.filter(x => x.vs.some(v => v.statut === 'faite')).length, p = c.id ? periodeCourante(c) : null;
      return `<details class="vis-classe" style="--cc:${esc(c.couleur || '#94a3b8')}" ${replies.includes(c.id || '_') ? '' : 'open'}>
        <summary data-a="visRepli" data-cl="${esc(c.id || '_')}"><b>${esc(c.nom)}</b><span class="petit">${g.length} élève(s)${p ? ` · ${esc(p.label || 'Stage')} : ${fmt(p.debut)} → ${fmt(p.fin)}` : ''}</span>
          ${aPlanifier ? `<span class="badge" style="background:#b45309">${aPlanifier} à planifier</span>` : ''}${faites ? `<span class="badge" style="background:#15803d">${faites} faite(s)</span>` : ''}</summary>
        <div class="table-scroll"><table><tr><th>Date</th><th>Entreprise</th><th>Élève</th><th>Visite</th><th></th></tr>
        ${g.map(({ e, dt, vs, ent }) => `<tr><td class="petit" style="white-space:nowrap">${dt ? `du ${fmt(dt.debut)}<br>au ${fmt(dt.fin)}` : '<span class="doux">non fixé</span>'}</td>
          <td class="petit">${ent ? `<b>${esc(ent.nom)}</b><br>${esc(ent.adresse)}` : '<span class="doux">pas encore d’entreprise</span>'}</td>
          <td><b>${esc(nomEleve(e))}</b></td>
          <td class="petit">${vs.length ? vs.map(v => `<button type="button" class="lien" data-a="agOuvrir" data-id="${v.id}">${v.statut === 'faite' ? '✅' : v.mode === 'visio' ? '💻' : '🚗'} ${fmt(v.date)} ${esc(v.heure)}</button>`).join('') : '<span class="badge" style="background:#b45309">à planifier</span>'}</td>
          <td><button type="button" class="btn mini sec" data-a="agNouvelle" data-eleve="${e.id}" data-date="${dt && dt.debut > today() ? dt.debut : ''}">Planifier</button></td></tr>`).join('')}</table></div></details>`;
    }).join('')}</section>`;
}
// Le clic sur le titre replie / déplie (comportement normal de <details>) : on retient l'état pour la prochaine fois.
A.visRepli = el => {
  const id = el.dataset.cl, ouvert = el.parentElement.open, l = classesRepliees().filter(x => x !== id);
  if (ouvert) l.push(id);   // il était ouvert : il va se replier
  memoriserRepli(l);
};
A.visToutes = el => {
  const ouvrir = el.dataset.o === '1';
  memoriserRepli(ouvrir ? [] : [...document.querySelectorAll('.vis-classe > summary')].map(s => s.dataset.cl));
  document.querySelectorAll('.vis-classe').forEach(d => { d.open = ouvrir; });
};

/* ---------- Fiche d'une visite ---------- */
function trouverVisite(id) { for (const e of S.eleves) { const v = (e.d.prof.visites || []).find(x => x.id === id); if (v) return { e, v }; } return null; }
function optionsEleves(choisi) {
  const mes = new Set(mesEleves().map(e => e.id)), autres = S.eleves.filter(e => !mes.has(e.id));
  const opt = e => { const cl = classeDe(e.d); return `<option value="${e.id}" ${e.id === choisi ? 'selected' : ''}>${esc(nomEleve(e))}${cl ? ' — ' + esc(cl.nom) : ''}</option>`; };
  return `<option value="">— Choisir —</option>${mes.size ? `<optgroup label="Mes élèves">${mesEleves().map(opt).join('')}</optgroup>` : ''}${autres.length ? `<optgroup label="Autres élèves">${autres.map(opt).join('')}</optgroup>` : ''}`;
}
function infoEntreprise(eid) {
  const e = S.eleves.find(x => x.id === eid); if (!e) return '';
  const ent = entrepriseStage(e.d), dt = datesEleve(e.d);
  return `${dt ? `📅 Stage du ${fmt(dt.debut)} au ${fmt(dt.fin)}<br>` : ''}${ent ? `🏢 <b>${esc(ent.nom)}</b> — ${esc(ent.adresse || 'adresse non renseignée')}${ent.tel ? ` · ☎ ${esc(ent.tel)}` : ''}` : '🏢 Pas encore d’entreprise (protocole ou convention) pour cet élève.'}`;
}
A.agNouvelle = el => modalVisite(null, el.dataset.date || '', el.dataset.eleve || '');
A.agOuvrir = el => modalVisite(el.dataset.id);
function modalVisite(id, date, eleveId) {
  const t = id && trouverVisite(id);
  const v = t ? t.v : { id: '', date: date || '', heure: '10:00', mode: 'terrain', lieu: 'entreprise', adresse: '', lien: '', message: '', statut: 'prevue' };
  const eid = t ? t.e.id : eleveId, fr = (S.perso.frais || {})[v.id] || {};
  const radio = (nom, valeur, actuel, libelle) => `<label class="choix"><input type="radio" name="${nom}" value="${valeur}" data-c="agBascule" ${actuel === valeur ? 'checked' : ''}>${libelle}</label>`;
  modal(`<h2>${t ? '🗓️ Visite de stage' : '🗓️ Nouvelle visite'}</h2>
    <label>Élève<select id="v_eleve" data-c="agEleve">${optionsEleves(eid)}</select></label>
    <p class="petit doux" id="v_info">${infoEntreprise(eid)}</p>
    <div class="deux"><label>Date<input type="date" id="v_date" value="${esc(v.date)}"></label><label>Heure<input type="time" id="v_heure" value="${esc(v.heure)}"></label>
      <label>État<select id="v_statut"><option value="prevue" ${v.statut === 'prevue' ? 'selected' : ''}>Prévue</option><option value="faite" ${v.statut === 'faite' ? 'selected' : ''}>Effectuée</option><option value="annulee" ${v.statut === 'annulee' ? 'selected' : ''}>Annulée</option></select></label></div>
    <fieldset class="choix-groupe"><legend>Type de visite</legend>${radio('v_mode', 'terrain', v.mode, '🚗 Sur le terrain')}${radio('v_mode', 'visio', v.mode, '💻 En visio')}</fieldset>
    <div id="v_terrain" ${v.mode === 'visio' ? 'hidden' : ''}>
      <fieldset class="choix-groupe"><legend>Lieu</legend>${radio('v_lieu', 'entreprise', v.lieu, 'Dans l’entreprise')}${radio('v_lieu', 'autre', v.lieu, 'À une autre adresse')}</fieldset>
      <label id="v_adr_l" ${v.lieu === 'autre' ? '' : 'hidden'}>Adresse de la visite (chantier, autre site…)<input id="v_adresse" value="${esc(v.adresse)}" placeholder="12 rue …, 76190 Yvetot"></label>
      <details ${fr.depart ? 'open' : ''}><summary>Horaires pour l’état de frais</summary>
        <div class="deux"><label>Départ résidence<input type="time" id="v_h1" value="${esc(fr.depart || '')}"></label><label>Arrivée lieu de stage<input type="time" id="v_h2" value="${esc(fr.arrivee || '')}"></label>
          <label>Départ lieu de stage<input type="time" id="v_h3" value="${esc(fr.departLieu || '')}"></label><label>Arrivée résidence<input type="time" id="v_h4" value="${esc(fr.retour || '')}"></label>
          <label>Péage / parking (€)<input type="number" min="0" step="0.01" id="v_peage" value="${esc(fr.peage || '')}"></label></div></details>
    </div>
    <label id="v_lien_l" ${v.mode === 'visio' ? '' : 'hidden'}>Lien de la visio<input id="v_lien" value="${esc(v.lien)}" placeholder="https://…"></label>
    <label>Message pour l’élève <span class="doux petit">(facultatif, visible par l’élève)</span><input id="v_message" value="${esc(v.message || '')}" placeholder="Prévenir ton tuteur, apporter ton carnet de suivi…"></label>
    <div class="actions"><button class="btn" data-a="agSauver" data-id="${esc(v.id)}">Enregistrer</button>
      ${t ? `<a class="btn sec" href="${esc(itineraire(lieuVisite(t.e, v)))}" target="_blank" rel="noopener" ${v.mode === 'visio' ? 'hidden' : ''}>🧭 Itinéraire</a><button class="btn danger" data-a="agSupprimer" data-id="${v.id}">Supprimer</button>` : ''}</div>
    <p class="doux petit">L’élève voit la date, l’heure, le lieu (ou le lien de la visio) et votre message.</p>`);
}
C.agEleve = el => { $('#v_info').innerHTML = infoEntreprise(el.value); };
C.agBascule = () => {
  const mode = ($('input[name="v_mode"]:checked') || {}).value, lieu = ($('input[name="v_lieu"]:checked') || {}).value;
  $('#v_terrain').hidden = mode === 'visio'; $('#v_lien_l').hidden = mode !== 'visio'; $('#v_adr_l').hidden = lieu !== 'autre';
};
A.agSauver = async el => {
  const eid = val('v_eleve'), date = val('v_date'), mode = $('input[name="v_mode"]:checked').value, lieu = $('input[name="v_lieu"]:checked').value;
  if (!eid) throw new Error('Choisissez l’élève.');
  if (!date) throw new Error('Indiquez la date de la visite.');
  const e = S.eleves.find(x => x.id === eid), ent = entrepriseStage(e.d);
  const v = { id: el.dataset.id || uid(), profId: S.user.id, profNom: `${(S.perso.civilite || '')} ${nomComplet(S.user)}`.trim(), date, heure: val('v_heure'), mode,
    lieu: mode === 'terrain' ? lieu : '', adresse: mode === 'terrain' && lieu === 'autre' ? val('v_adresse') : '', lien: mode === 'visio' ? val('v_lien') : '',
    message: val('v_message'), statut: val('v_statut'), entreprise: ent ? { nom: ent.nom, adresse: ent.adresse } : null, majLe: maintenant() };
  if (v.lien && !lienSur(v.lien)) throw new Error('Le lien de la visio doit commencer par https://');
  if (mode === 'terrain' && lieu === 'autre' && !v.adresse) throw new Error('Indiquez l’adresse de la visite.');
  const ancien = el.dataset.id && trouverVisite(el.dataset.id);
  if (ancien && ancien.e.id !== eid) await mutProf(ancien.e.id, p => { p.visites = (p.visites || []).filter(x => x.id !== v.id); });
  await mutProf(eid, p => { p.visites = (p.visites || []).filter(x => x.id !== v.id); p.visites.push(v); });
  if (mode === 'terrain') {
    const fr = { depart: val('v_h1'), arrivee: val('v_h2'), departLieu: val('v_h3'), retour: val('v_h4'), peage: val('v_peage') };
    const avant = JSON.stringify(S.perso.frais[v.id] || {});
    if (Object.values(fr).some(Boolean) || avant !== '{}') if (JSON.stringify(fr) !== avant) await mutPerso(p => { p.frais[v.id] = fr; });
  }
  S.agMois = date.slice(0, 7); modal(''); render(); toast('Visite enregistrée : l’élève la voit sur son accueil');
};
A.agSupprimer = async el => {
  const t = trouverVisite(el.dataset.id); if (!t || !confirm('Supprimer cette visite ?')) return;
  await mutProf(t.e.id, p => { p.visites = (p.visites || []).filter(x => x.id !== t.v.id); });
  if (S.perso.frais[t.v.id]) await mutPerso(p => { delete p.frais[t.v.id]; });
  modal(''); render(); toast('Visite supprimée');
};

/* ---------- Élève : sa prochaine visite ---------- */
function blocVisiteEleve(d) {
  const l = (d.prof.visites || []).filter(v => v.statut === 'prevue' && v.date >= today()).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
  if (!l.length) return '';
  return `<section class="carte visite-eleve"><h2>🗓️ Visite de ton professeur</h2>${l.map(v => {
    const lien = lienSur(v.lien);
    return `<p><b>${esc(jourLong(v.date))}${v.heure ? ' à ' + esc(v.heure.replace(':', ' h ')) : ''}</b> avec ${esc(v.profNom)}<br>
      ${v.mode === 'visio' ? `💻 En visio${lien ? ` : <a href="${esc(lien)}" target="_blank" rel="noopener">rejoindre la visio</a>` : ' (le lien te sera donné)'}`
        : v.lieu === 'autre' ? `📍 À cette adresse : ${esc(v.adresse)}` : `🏢 Sur ton lieu de stage${v.entreprise ? ` (${esc(v.entreprise.nom)})` : ''}`}
      ${v.message ? `<br>💬 ${esc(v.message)}` : ''}</p>`;
  }).join('')}<p class="doux petit">Préviens ton tuteur de la date de la visite.</p></section>`;
}

/* ---------- Ordres de mission ---------- */
function etatMission(m) {
  return m.signature ? `<span class="badge" style="background:#16a34a">✅ signé par ${esc(m.signature.par)} le ${fmt(m.signature.date)}</span>`
    : '<span class="badge" style="background:#b45309">✍️ en attente de signature</span>';
}
function listeMissions() {
  const l = S.missions.filter(m => m.profId === S.user.id);
  if (!l.length) return '<p class="doux">Aucun ordre de mission pour le moment.</p>';
  return `<ul class="ag-liste">${l.map(m => `<li><b>${esc(m.titre)}</b> · ${m.contenu.eleves.length} élève(s) · ${etatMission(m)}<br>
    <button type="button" class="btn mini${m.signature ? '' : ' sec'}" data-a="omPdf" data-id="${m.id}">⬇️ PDF${m.signature ? ' signé' : ''}</button>
    <button type="button" class="btn mini sec" data-a="omModifier" data-id="${m.id}">✏️ Modifier</button>
    <button type="button" class="btn mini danger" data-a="omSupprimer" data-id="${m.id}">Supprimer</button></li>`).join('')}</ul>`;
}
function blocMissionsASigner() {
  const l = missionsASigner(); if (!l.length) return '';
  return `<section class="carte propositions"><h2>✍️ Ordres de mission à signer (${l.length})</h2>
    <p class="doux petit">Vous signez pour le chef d’établissement. Lisez le PDF puis signez.</p>
    <ul class="ag-liste">${l.map(m => `<li><b>${esc(m.profNom)}</b> — ${esc(m.titre)} · ${m.contenu.eleves.length} élève(s) · envoyé le ${fmt(m.majLe)}<br>
      <button type="button" class="btn mini sec" data-a="omPdf" data-id="${m.id}">👁️ Lire le PDF</button>
      <button type="button" class="btn mini" data-a="omSigner" data-id="${m.id}">✍️ Signer</button></li>`).join('')}</ul></section>`;
}
function lignesProposees() {
  const p = S.perso, ids = new Set();
  const l = [];
  const ajouter = (e, v) => {
    if (ids.has(e.id)) return; ids.add(e.id);
    const dt = datesEleve(e.d), ent = entrepriseStage(e.d) || (v && v.entreprise) || { nom: '', adresse: '' };
    l.push({ eleveId: e.id, coche: !!v || (dt && dt.fin >= today()), prenom: e.d.profil.prenom, nom: p.nomsComplets[e.id] || e.d.profil.nom,
      stage: dt ? `du ${jjmmaa(dt.debut)} au ${jjmmaa(dt.fin)}` : '', entreprise: ent.nom, adresse: v && v.lieu === 'autre' ? `${ent.adresse}\nLieu de la visite : ${v.adresse}`.trim() : ent.adresse,
      dateVisite: v && v.mode === 'terrain' ? jjmmaa(v.date) : '' });
  };
  mesVisites().filter(x => x.v.statut !== 'annulee' && x.v.date >= today().slice(0, 7) + '-01' || false).forEach(x => ajouter(x.e, x.v.mode === 'terrain' ? x.v : null));
  mesEleves().forEach(e => ajouter(e, null));
  return l;
}
A.omNouveau = () => modalMission(null);
A.omModifier = el => modalMission(el.dataset.id);
function modalMission(id) {
  const m = id && S.missions.find(x => x.id === id), p = S.perso;
  const c = m ? m.contenu : { eleves: lignesProposees(), transport: { vehicule: true, commun: false, autre: '' } };
  const lignes = m ? c.eleves.map(x => Object.assign({ coche: true }, x)) : c.eleves;
  if (!p.adresse1) toast('Pensez à compléter vos informations (résidence, puissance fiscale) pour l’état de frais.');
  modal(`<h2>📄 ${m ? 'Modifier l’ordre de mission' : 'Préparer un ordre de mission'}</h2>
    <p class="doux petit">Cochez les élèves à visiter et complétez les noms de famille (mémorisés pour vous seul). Les adresses viennent de l’entreprise du stage ou de l’adresse choisie pour la visite. ${m && m.signature ? '<b>Une modification annule la signature du chef d’établissement.</b>' : ''}</p>
    <label>Titre<input id="om_titre" value="${esc(m ? m.titre : `PFMP ${MOIS[new Date().getMonth()]} ${new Date().getFullYear()}`)}"></label>
    <div class="table-scroll"><table class="om-table"><tr><th></th><th>Prénom</th><th>NOM</th><th>Stage</th><th>Entreprise</th><th>Adresse</th><th>Date de visite</th></tr>
      ${lignes.map((x, i) => `<tr data-ligne="${i}" data-eleve="${esc(x.eleveId || '')}"><td><input type="checkbox" class="om-c" ${x.coche ? 'checked' : ''} aria-label="Inclure ${esc(x.prenom)}"></td>
        <td><input class="om-prenom" value="${esc(x.prenom)}" size="9"></td><td><input class="om-nom" value="${esc(x.nom)}" size="10" style="text-transform:uppercase"></td>
        <td><input class="om-stage" value="${esc(x.stage)}" size="20"></td><td><input class="om-ent" value="${esc(x.entreprise)}" size="16"></td>
        <td><textarea class="om-adr" rows="2" cols="22">${esc(x.adresse)}</textarea></td><td><input class="om-date" value="${esc(x.dateVisite)}" size="8" placeholder="jj/mm/aa"></td></tr>`).join('')}</table></div>
    ${lignes.length ? '' : '<p class="doux">Aucun élève : planifiez d’abord des visites ou devenez référent d’une classe.</p>'}
    <fieldset class="choix-groupe"><legend>Transport autorisé</legend>
      <label class="choix"><input type="checkbox" id="om_veh" ${c.transport.vehicule ? 'checked' : ''}>Véhicule personnel</label>
      <label class="choix"><input type="checkbox" id="om_tc" ${c.transport.commun ? 'checked' : ''}>Transport en commun</label>
      <label style="flex:1">Autre(s), à préciser<input id="om_autre" value="${esc(c.transport.autre || '')}"></label></fieldset>
    <div class="actions"><button class="btn sec" data-a="omApercu">👁️ Aperçu du PDF</button><button class="btn" data-a="omEnvoyer" data-id="${esc(id || '')}">✍️ Enregistrer et envoyer au chef d’établissement</button></div>`, true);
}
function lireMission() {
  const p = S.perso, eleves = $$('.om-table tr[data-ligne]').filter(tr => $('.om-c', tr).checked).map(tr => ({
    eleveId: tr.dataset.eleve, prenom: $('.om-prenom', tr).value.trim(), nom: $('.om-nom', tr).value.trim().toUpperCase(), stage: $('.om-stage', tr).value.trim(),
    entreprise: $('.om-ent', tr).value.trim(), adresse: $('.om-adr', tr).value.trim(), dateVisite: $('.om-date', tr).value.trim() }));
  if (!eleves.length) throw new Error('Cochez au moins un élève.');
  return { titre: val('om_titre') || 'Ordre de mission', contenu: { eleves, transport: { vehicule: $('#om_veh').checked, commun: $('#om_tc').checked, autre: val('om_autre') },
    prof: { civilite: p.civilite, nom: p.nom, prenom: p.prenom }, etab: etabCourant() } };
}
A.omApercu = async () => { const x = lireMission(); ouvrirPdf(await pdfMission({ contenu: x.contenu, signature: null }), 'Ordre de mission (aperçu).pdf'); };
A.omEnvoyer = async el => {
  const x = lireMission();
  await mutPerso(p => { x.contenu.eleves.forEach(l => { if (l.eleveId && l.nom) p.nomsComplets[l.eleveId] = l.nom; }); });
  const m = await api('POST', '/api/mission/enregistrer', { id: el.dataset.id || undefined, titre: x.titre, contenu: x.contenu });
  S.missions = [m, ...S.missions.filter(y => y.id !== m.id)];
  modal(''); render(); toast('Ordre de mission envoyé au chef d’établissement');
};
A.omSupprimer = async el => {
  const m = S.missions.find(x => x.id === el.dataset.id); if (!m || !confirm(`Supprimer l’ordre de mission « ${m.titre} » ?`)) return;
  await api('POST', '/api/mission/supprimer', { id: m.id }); S.missions = S.missions.filter(x => x.id !== m.id); render(); toast('Ordre de mission supprimé');
};
A.omPdf = async el => { const m = S.missions.find(x => x.id === el.dataset.id); ouvrirPdf(await pdfMission(m), `Ordre de mission - ${m.contenu.prof.nom} - ${m.titre}${m.signature ? ' (signe)' : ''}.pdf`); };

let padMission = null;
A.omSigner = el => {
  const m = S.missions.find(x => x.id === el.dataset.id); if (!m) return;
  modal(`<h2>✍️ Signer l’ordre de mission</h2><p>${esc(m.profNom)} — ${esc(m.titre)} · ${m.contenu.eleves.length} élève(s)</p>
    <p><button type="button" class="btn mini sec" data-a="omPdf" data-id="${m.id}">👁️ Relire le PDF</button></p>
    <p class="doux petit">Signez dans le cadre (doigt, stylet ou souris), ou envoyez la photo de votre signature (et du cachet).</p>
    <canvas id="omPad" class="pad-signature" aria-label="Signature du chef d’établissement"></canvas>
    <div class="actions"><button class="btn" data-a="omValiderSig" data-id="${m.id}">✅ Signer</button><button class="btn sec" data-a="omEffacerSig">Effacer</button>
      <label class="btn sec depot-fichier">📷 Photo de la signature<input type="file" accept="image/*" capture="environment" data-c="omPhotoSig" data-id="${m.id}"></label></div>`);
  padMission = CONV.padSignature($('#omPad'));
};
A.omEffacerSig = () => { if (padMission) padMission.effacer(); };
async function signerMission(id, img) {
  const m = await api('POST', '/api/mission/signer', { id, img });
  S.missions = S.missions.map(x => x.id === m.id ? m : x); modal(''); render(); toast('Ordre de mission signé : le professeur peut télécharger le PDF signé');
}
A.omValiderSig = async el => {
  if (!padMission || padMission.vide()) throw new Error('Signez d’abord dans le cadre.');
  await signerMission(el.dataset.id, padMission.image());
};
C.omPhotoSig = async el => { const f = el.files[0]; if (!f) return; await signerMission(el.dataset.id, await CONV.photoEnImage(f, 600)); };

/* ---------- État de frais ---------- */
A.frOuvrir = () => {
  const mois = val('fr_mois') || today().slice(0, 7), p = S.perso;
  const l = mesVisites().filter(x => x.v.mode === 'terrain' && x.v.statut !== 'annulee' && x.v.date.startsWith(mois));
  modal(`<h2>🚗 État de frais — ${MOIS[+mois.slice(5) - 1]} ${mois.slice(0, 4)}</h2>
    ${!p.adresse1 || !p.puissance ? '<div class="alerte attention petit">Complétez d’abord « Mes informations » (résidence personnelle, puissance fiscale) en bas de la page Visites.</div>' : ''}
    ${l.length ? `<div class="table-scroll"><table class="om-table"><tr><th>Date</th><th>Élève</th><th>Lieu de stage</th><th>Entreprise</th><th>Départ résidence</th><th>Arrivée lieu</th><th>Départ lieu</th><th>Arrivée résidence</th><th>Péage / parking €</th></tr>
      ${l.map(({ e, v }) => { const f = p.frais[v.id] || {}, ent = entrepriseStage(e.d) || v.entreprise || {};
        return `<tr data-visite="${v.id}"><td>${fmt(v.date)}</td><td>${esc(e.d.profil.prenom)} ${esc(nomFamille(e))}</td>
          <td><input class="fr-lieu" value="${esc(f.lieu || communeDe(lieuVisite(e, v)))}" size="14"></td><td><input class="fr-ent" value="${esc(f.entreprise || ent.nom || '')}" size="14"></td>
          ${['depart', 'arrivee', 'departLieu', 'retour'].map(k => `<td><input type="time" class="fr-${k}" value="${esc(f[k] || '')}"></td>`).join('')}
          <td><input type="number" min="0" step="0.01" class="fr-peage" value="${esc(f.peage || '')}" style="width:80px"></td></tr>`; }).join('')}</table></div>
      <div class="actions"><button class="btn" data-a="frPdf" data-mois="${mois}">⬇️ Éditer l’état de frais (PDF)</button></div>`
      : '<p class="doux">Aucune visite sur le terrain ce mois-ci (les visites annulées et en visio ne comptent pas).</p>'}
    <p class="doux petit">À joindre : l’ordre de mission signé par le proviseur et la fiche de visite tamponnée par les entreprises.</p>`, true);
};
A.frPdf = async el => {
  const lignes = $$('.om-table tr[data-visite]').map(tr => ({ id: tr.dataset.visite, lieu: $('.fr-lieu', tr).value.trim(), entreprise: $('.fr-ent', tr).value.trim(),
    depart: $('.fr-depart', tr).value, arrivee: $('.fr-arrivee', tr).value, departLieu: $('.fr-departLieu', tr).value, retour: $('.fr-retour', tr).value, peage: $('.fr-peage', tr).value }));
  await mutPerso(p => { lignes.forEach(l => { const { id, ...f } = l; p.frais[id] = f; }); });
  const rows = lignes.map(l => { const t = trouverVisite(l.id), cl = classeDe(t.e.d); return { ...l, date: t.v.date, eleve: nomFamille(t.e), classe: cl ? cl.nom : '' }; });
  ouvrirPdf(await pdfFrais(rows), `Etat de frais ${el.dataset.mois} - ${S.perso.nom}.pdf`);
};

/* ---------- PDF ---------- */
function ouvrirPdf(octets, nom) {
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = nom.replace(/[\\/:*?"<>|]/g, '-'); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); toast('PDF téléchargé');
}
async function outilsPdf(paysage) {
  const L = await chargerPdfLib(), doc = await L.PDFDocument.create();
  const f = { n: await doc.embedFont(L.StandardFonts.Helvetica), b: await doc.embedFont(L.StandardFonts.HelveticaBold), i: await doc.embedFont(L.StandardFonts.HelveticaOblique) };
  const [W, H] = paysage ? [841.89, 595.28] : [595.28, 841.89], noir = L.rgb(0, 0, 0);
  const o = { L, doc, f, W, H, noir, page: null };
  // Polices standard : on remplace les caractères qu'elles ne savent pas écrire.
  const jeux = new Map();
  o.propre = (font, s) => { if (!jeux.has(font)) jeux.set(font, new Set(font.getCharacterSet())); const ok = jeux.get(font);
    return [...String(s == null ? '' : s).replace(/[\n\r\t]+/g, ' ')].map(c => ok.has(c.codePointAt(0)) ? c : c === '’' ? "'" : c === '…' ? '...' : '').join(''); };
  o.large = (s, t, font = f.n) => font.widthOfTextAtSize(o.propre(font, s), t);
  o.txt = (s, x, y, t, font = f.n, coul = noir) => o.page.drawText(o.propre(font, s), { x, y: H - y, size: t, font, color: coul });
  o.centre = (s, cx, y, t, font = f.n, coul) => o.txt(s, cx - o.large(s, t, font) / 2, y, t, font, coul);
  o.droite = (s, rx, y, t, font = f.n, coul) => o.txt(s, rx - o.large(s, t, font), y, t, font, coul);
  o.souligne = (s, x, y, t, font = f.n) => { o.txt(s, x, y, t, font); o.page.drawLine({ start: { x, y: H - y - 1.6 }, end: { x: x + o.large(s, t, font), y: H - y - 1.6 }, thickness: 0.7, color: noir }); };
  o.couper = (s, t, largeur, font = f.n) => {
    const lignes = []; for (const para of String(s || '').split('\n')) { let l = '';
      for (const mot of para.split(/\s+/).filter(Boolean)) { const essai = l ? l + ' ' + mot : mot; if (l && o.large(essai, t, font) > largeur) { lignes.push(l); l = mot; } else l = essai; }
      lignes.push(l); }
    return lignes;
  };
  o.rect = (x, y, w, h, opts = {}) => o.page.drawRectangle({ x, y: H - y - h, width: w, height: h, borderWidth: opts.bord == null ? 0.8 : opts.bord, borderColor: opts.coul || (opts.bord === 0 ? undefined : noir), color: opts.fond });
  o.ligne = (x1, y1, x2, y2, ep = 0.8, coul = noir) => o.page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: ep, color: coul });
  o.nouvellePage = () => { o.page = doc.addPage([W, H]); return o.page; };
  o.image = async url => { const octets = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), c => c.charCodeAt(0)); return url.startsWith('data:image/png') ? doc.embedPng(octets) : doc.embedJpg(octets); };
  return o;
}
const nomEtablissement = etab => { const n = String(etab.nom || '').replace(/^lyc[ée]e\s+(polyvalent\s+)?(r[ée]gional\s+)?/i, '').trim(); return 'Lycée ' + n.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase()); };
function lignesEtab(etab) { const n = String(etab.nom || '').toUpperCase(), m = /^(LYC[EÉ]E(?: POLYVALENT)?(?: R[EÉ]GIONAL)?)\s+(.+)$/.exec(n); return m ? [m[1], m[2]] : [n]; }

async function pdfMission(m) {
  const o = await outilsPdf(false), { f, H } = o, c = m.contenu, etab = Object.assign({}, CONV.ETAB_DEFAUT, c.etab || etabCourant());
  const prof = `${c.prof.civilite} ${c.prof.nom} ${String(c.prof.prenom || '').toUpperCase()}`.trim();
  o.nouvellePage();
  // En-tête de l'établissement
  o.rect(40, 19, 220, 75);
  const le = lignesEtab(etab); le.forEach((l, i) => o.centre(l, 150, 36 + i * 9, 7.5, f.b));
  String(etab.adressePostale || '').split('\n').forEach((l, i) => o.centre(l, 150, 60 + i * 8, 6));
  const titre = 'ORDRE DE MISSION'; o.souligne(titre, 297.6 - o.large(titre, 12.5, f.b) / 2, 122, 12.5, f.b);
  o.txt('Vu le décret n°2006-781 du 3 juillet 2006,', 72, 143, 6.8, f.i);
  o.txt('Vu l’arrêté du 26 février 2019 modifiant l’arrêté du 3 juillet 2006,', 72, 151, 6.8, f.i);
  let y = 178;
  const para = (s, t = 10.5, x = 72, l = 455, font = f.n, inter = 13) => { o.couper(s, t, l, font).forEach(ligne => { o.txt(ligne, x, y, t, font); y += inter; }); };
  para(`Le chef d’établissement du ${nomEtablissement(etab)} autorise, dans le cadre du suivi des élèves en entreprise, le déplacement de l’enseignant(e) ${prof}.`);
  y += 9;
  para('Vous trouverez ci-dessous la liste des stagiaires dont vous devez assurer le suivi ainsi que les coordonnées de leur entreprise d’accueil afin de pouvoir effectuer les visites nécessaires à votre mission.');
  y += 18;
  for (const e of c.eleves) {
    const lignes = [`${e.prenom} ${e.nom}`, e.stage ? `en stage ${e.stage}` : '', e.entreprise, ...String(e.adresse || '').split('\n')].filter(Boolean);
    if (y + lignes.length * 12.5 + 40 > H - 40) { o.nouvellePage(); y = 60; }
    lignes.forEach(l => { o.couper(l, 10.5, 455).forEach(x => { o.txt(x, 72, y, 10.5); y += 12.5; }); });
    y += 12; o.souligne('Date de la visite', 74, y, 10.5, f.b);
    const xd = 74 + o.large('Date de la visite', 10.5, f.b);
    o.txt(e.dateVisite ? ` : ${e.dateVisite}` : ': ................................................................', xd, y, 10.5);
    y += 34;
  }
  if (y > H - 270) { o.nouvellePage(); y = 70; } else y += 20;
  const t = c.transport || {};
  const moyen = t.vehicule ? 'utilisera son véhicule personnel' : t.commun ? 'utilisera les transports en commun' : `se déplacera par : ${t.autre || '…'}`;
  para(`A cette occasion, ${prof}, ${moyen} et sera remboursé(e) de ses frais, selon le barème en vigueur, le cas échéant de ses frais de péage.`, 10.5, 72, 455, f.n, 13);
  y += 14; o.souligne('PRISE EN CHARGE DES FRAIS DE TRANSPORT :', 72, y, 7.5, f.b); y += 20;
  o.txt('•', 120, y, 7.5); o.txt('Transport autorisé :', 132, y, 7.5); y += 10;
  const caseCoche = (coche, texte) => {
    o.rect(150, y - 6.5, 6, 6, { bord: 0.6 }); if (coche) { o.ligne(150.8, y - 5.7, 155.2, y - 1.3, 0.8); o.ligne(155.2, y - 5.7, 150.8, y - 1.3, 0.8); }
    o.couper(texte, 7.5, 360).forEach(l => { o.txt(l, 162, y, 7.5); y += 9; });
  };
  caseCoche(t.vehicule, 'Véhicule personnel (articles 3 et 10 – Décret n° 2006-781 du 3/07/2006) ; arrêté du 26/08/2008 – Circulaire n° 2010-134 du 3/08/2010');
  caseCoche(t.commun, 'Transport en commun');
  caseCoche(!!t.autre, `Autre(s), à préciser : ${t.autre || '…………………………………………………….'}`);
  y += 10; o.txt('•', 120, y, 7.5); o.txt('Frais annexes :', 132, y, 7.5); y += 9;
  para('Remboursement possible des frais de parking et de péage sur présentation des justificatifs. Au terme de l’article 2 de la déclaration concernant les modalités de prise en charge des déplacements, le choix de la résidence retenu pour le droit à remboursement, est la résidence la plus proche du lieu de déplacement.', 7.5, 120, 400, f.n, 9);
  y += 22;
  o.txt(`Le ${etab.qualiteChef || 'Proviseur'}`, 375, y, 8); o.txt(etab.chef || '', 357, y + 16, 8);
  if (m.signature) {
    const img = await o.image(m.signature.img), sc = Math.min(150 / img.width, 55 / img.height);
    o.page.drawImage(img, { x: 360, y: H - (y + 24) - img.height * sc, width: img.width * sc, height: img.height * sc });
    o.txt(`Signé électroniquement par ${m.signature.par} le ${fmt(m.signature.date)}`, 330, y + 90, 6.5, f.i);
  }
  // Fiche des visites (tampons des entreprises)
  for (let k = 0; k < Math.max(1, Math.ceil(c.eleves.length / 12)); k++) {
    o.nouvellePage();
    const tf = 'VISITE DES STAGIAIRES EN ENTREPRISES'; o.souligne(tf, 297.6 - o.large(tf, 12.5) / 2, 58, 12.5);
    o.txt('Cher(e) collègue,', 168, 104, 7.5); y = 126;
    para('Vous voudrez bien à chaque visite d’élève, faire apposer le tampon de l’entreprise dans les cases prévues à cet effet. Ce document sera à faire signer au D.D.F.P.T. dans les 15 jours suivant la période de stage et à remettre au Service Intendance.', 7.5, 52, 490, f.n, 9);
    o.txt('Bien cordialement', 52, y, 7.5);
    o.txt(`Le ${etab.qualiteChef || 'Proviseur'}`, 380, 183, 7.5); o.txt(etab.chef || '', 357, 228, 7.5);
    const x0 = 52, y0 = 262, cw = 159.3, rh = 97.5;
    o.rect(x0, y0, cw * 3, rh * 4);
    for (let i = 1; i < 3; i++) o.ligne(x0 + i * cw, y0, x0 + i * cw, y0 + rh * 4, 0.6);
    for (let i = 1; i < 4; i++) o.ligne(x0, y0 + i * rh, x0 + cw * 3, y0 + i * rh, 0.6);
    for (let i = 0; i < 12; i++) {
      const cx = x0 + (i % 3) * cw, cy = y0 + Math.floor(i / 3) * rh, e = c.eleves[k * 12 + i];
      o.txt('Date et nom de l’élève', cx + 3, cy + 9, 7.5);
      if (e) o.couper(`${e.dateVisite || '…/…/…'} — ${e.prenom} ${e.nom}`, 8, cw - 8, f.b).slice(0, 2).forEach((l, j) => o.txt(l, cx + 3, cy + 21 + j * 10, 8, f.b));
      o.centre('Tampon de l’entreprise', cx + cw / 2, cy + rh - 9, 7.5);
    }
    o.txt(`Professeur :  ${c.prof.nom} ${String(c.prof.prenom || '').toUpperCase()}      Date : …………………….`, 52, 664, 7.5);
    o.txt('Visa D.D.F.P.T.', 52, 686, 7.5);
  }
  o.doc.setTitle('Ordre de mission - ' + prof);
  return o.doc.save();
}

async function pdfFrais(rows) {
  const o = await outilsPdf(true), { f, L } = o, k = 841.89 / 1300, X = v => v * k, p = S.perso, etab = etabCourant();
  const bleu = L.rgb(0.18, 0.33, 0.65), gris = L.rgb(0.9, 0.91, 0.94), bleuCadre = L.rgb(0.27, 0.45, 0.77);
  const cols = [30, 357, 590, 785, 848, 952, 1023, 1097, 1160, 1228, 1275].map(X), PARPAGE = 11;
  const pages = Math.max(1, Math.ceil(rows.length / PARPAGE));
  for (let n = 0; n < pages; n++) {
    o.nouvellePage();
    // Cadre de gauche : résidence administrative
    o.rect(X(30), X(68), X(327), X(217)); o.ligne(X(30), X(98), X(357), X(98)); o.ligne(X(30), X(128), X(357), X(128));
    o.centre('MINISTERE DE L’EDUCATION NATIONALE', X(193), X(88), 6.8, f.b); o.centre('RESIDENCE ADMINISTRATIVE', X(193), X(118), 6.8, f.b);
    [...lignesEtab(etab), ...String(etab.adressePostale || '').split('\n')].forEach((l, i) => o.centre(l, X(193), X(153 + i * 28), 10.5));
    // Professeur
    [['Professeur', 85], ['NOM', 113], ['Prénom', 141], ['Résidence personnelle', 168]].forEach(([l, y]) => o.droite(l, X(585), X(y), 10.5));
    [[p.nom, 113], [p.prenom, 141], [p.adresse1, 168], [p.adresse2, 194]].forEach(([v, y]) => o.centre(v || '', X(720), X(y), 12, f.n, bleu));
    o.droite('Puissance fiscale du véhicule', X(792), X(250), 10.5); o.txt(p.puissance || '', X(800), X(250), 10.5, f.n, bleu);
    // Cadre de droite
    o.rect(X(848), X(68), X(424), X(62)); o.txt('ETAT DE FRAIS DE DEPLACEMENT', X(860), X(95), 12.5); o.centre('(Visite d’élève stagiaire)', X(1060), X(119), 9);
    o.ligne(X(848), X(180), X(1228), X(180), 0.5); [['Service', 850], ['Domaine', 955], ['Activité', 1012], ['Compte', 1065], ['n°', 1135]].forEach(([l, x]) => o.txt(l, X(x), X(198), 6.5, f.b));
    o.rect(X(848), X(205), X(380), X(28), { bord: 0, fond: gris }); o.ligne(X(848), X(262), X(1228), X(262), 0.5);
    // Rappel
    o.rect(X(115), X(296), X(1082), X(37), { coul: L.rgb(0.86, 0.15, 0.15), bord: 1.2 });
    o.txt('Joindre impérativement l’ordre de mission signé par le proviseur & la fiche de visite de stage tamponnée', X(125), X(320), 10.5);
    // Tableau
    const yT = X(352), yH = X(412), rh = X(22);
    o.rect(cols[0], yT, cols[10] - cols[0], yH - yT, { fond: gris, bord: 1.4 });
    for (let i = 1; i < 10; i++) o.ligne(cols[i], i === 6 || i === 8 ? X(367) : yT, cols[i], yH + rh * PARPAGE, 0.6);
    o.ligne(cols[5], X(367), cols[9], X(367), 0.5);
    ['Lieu de stage', 'Nom de l’entreprise', 'Elève visité', 'Classe', 'Date de visite'].forEach((l, i) => o.centre(l, (cols[i] + cols[i + 1]) / 2, X(388), i < 3 ? 8.5 : 7, f.b, bleu));
    o.centre('Heure de départ', (cols[5] + cols[7]) / 2, X(363), 6.5, f.n, L.rgb(0.6, 0.6, 0.65)); o.centre('Heure d’arrivée', (cols[7] + cols[9]) / 2, X(363), 6.5, f.n, L.rgb(0.6, 0.6, 0.65));
    [['Départ', 'résidence'], ['Arrivée lieu', 'de stage'], ['Départ lieu', 'de stage'], ['Arrivée', 'résidence']].forEach(([a, b], i) => { o.txt(a, cols[5 + i] + 2, X(385), 5.5, f.b, bleu); o.txt(b, cols[5 + i] + 2, X(400), 5.5, f.b, bleu); });
    o.txt('KMS', cols[9] + 2, X(375), 7, f.b, bleu); o.txt('Ne rien', cols[9] + 2, X(390), 5.5, f.b, bleu); o.txt('inscrire', cols[9] + 2, X(402), 5.5, f.b, bleu);
    o.rect(cols[0], yH, cols[10] - cols[0], rh * PARPAGE, { bord: 1.4 });
    for (let i = 1; i < PARPAGE; i++) o.ligne(cols[0], yH + i * rh, cols[10], yH + i * rh, 0.5);
    rows.slice(n * PARPAGE, (n + 1) * PARPAGE).forEach((r, i) => {
      const y = yH + i * rh + rh - 4, cell = (s, j, t = 9.5) => { let v = String(s || ''); while (v && o.large(v, t) > cols[j + 1] - cols[j] - 4) v = v.slice(0, -1); o.centre(v, (cols[j] + cols[j + 1]) / 2, y, t, f.n, bleu); };
      let lieu = r.lieu; while (lieu && o.large(lieu, 9.5) > cols[1] - cols[0] - 4) lieu = lieu.slice(0, -1);
      o.txt(lieu, cols[0] + 3, y, 9.5, f.n, bleu); cell(r.entreprise, 1); cell(r.eleve, 2); cell(r.classe, 3, 7); cell(fmt(r.date), 4, 8.5);
      [r.depart, r.arrivee, r.departLieu, r.retour].forEach((h, j) => cell(h, 5 + j));
    });
    // Bas : cadre réservé à l'administration
    const yB = yH + rh * PARPAGE + X(14);
    o.rect(cols[0], yB, cols[10] - cols[0], X(22), { bord: 1.2 }); o.txt('kms', X(590), yB + X(16), 8); o.txt('€', X(785), yB + X(16), 8);
    const yA = yB + X(24);
    o.rect(X(30), yA, X(1245), X(118), { coul: bleuCadre, bord: 1.6 }); o.rect(X(30), yA + X(2), X(327), X(20), { bord: 0, fond: gris });
    o.txt('Cadre réservé à l’administration', X(33), yA + X(16), 8); o.txt('indemnité de tournée', X(360), yA + X(16), 7); o.txt('égal', X(848), yA + X(16), 7);
    o.txt('Frais calculés le', X(1027), yA + X(16), 7); o.txt('Transport commun/péage/parking :', X(360), yA + X(38), 7); o.txt('égal', X(848), yA + X(38), 7); o.txt('Par :', X(1027), yA + X(38), 7);
    if (n === pages - 1) {
      const total = rows.reduce((s, r) => s + (parseFloat(String(r.peage).replace(',', '.')) || 0), 0);
      if (total) { const tt = total.toFixed(2).replace('.', ','); o.droite(tt, X(780), yA + X(38), 7.5); o.droite(tt + ' €', X(1018), yA + X(38), 7.5); }
    }
    o.ligne(X(30), yA + X(50), X(1022), yA + X(50), 1.4); o.txt('Arrêté le présent état à la somme de :', X(33), yA + X(66), 8, f.b);
    o.rect(X(848), yA + X(52), X(174), X(20), { bord: 0, fond: L.rgb(1, 0.95, 0.2) }); o.txt('total', X(851), yA + X(67), 7.5);
    o.ligne(X(848), yA + X(50), X(848), yA + X(118), 1.4); o.ligne(X(1022), yA, X(1022), yA + X(118), 1.4);
    if (pages > 1) o.droite(`Page ${n + 1}/${pages}`, X(1275), X(890), 7);
  }
  o.doc.setTitle(`Etat de frais - ${p.nom} ${p.prenom}`);
  return o.doc.save();
}
