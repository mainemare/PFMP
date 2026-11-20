'use strict';
/* ===== Offres de stage (CAP, bac pro, BTS) =====
 * Deux sources : les entreprises les déposent par un lien public (page offre.html), ou l'équipe les saisit.
 * Les offres déposées par les entreprises attendent la validation d'un professeur ou du DDFPT (commun/offres_proposees)
 * avant d'être publiées pour les élèves (commun/offres). */
S.offres = []; S.offresProposees = []; S.fo = { niveau: null, secteur: '', zones: true };
const NIVEAUX = ['CAP', 'Bac pro', 'BTS'];
const offreActive = o => (!o.fin || o.fin >= today()) && (!o.expireLe || o.expireLe >= today());
const lienSurOffre = u => /^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : '';
const badgeSource = o => o.source === 'france_travail' ? '<span class="badge" style="background:#1d4ed8">France Travail</span>' : '';
async function chargerOffresProposees() {
  try { S.offresProposees = ((await getDoc('commun/offres_proposees')) || {}).liste || []; } catch { S.offresProposees = []; }
  try { S.ft = await api('GET', '/api/francetravail/etat'); } catch { S.ft = null; }
}
const lienOffres = () => S.codeOffres ? new URL('offre.html', location.href).href.split('#')[0] + '#k=' + S.codeOffres : '';
const periodeOffre = o => o.debut || o.fin ? `${o.debut ? 'du ' + fmt(o.debut) : ''} ${o.fin ? 'au ' + fmt(o.fin) : ''}`.trim() : 'dates à convenir';
const badgesNiveaux = o => (o.niveaux || []).map(n => `<span class="badge clair">${esc(n)}</span>`).join(' ');

/* ---------- Console : offres à vérifier, offres publiées, lien pour les entreprises ---------- */
function vueOffresProf() {
  const l = S.offresProposees, lien = lienOffres();
  const pub = [...S.offres].sort((a, b) => String(b.publieLe).localeCompare(String(a.publieLe)));
  const nbEleves = o => S.eleves.filter(e => e.d.demandes.liste.some(x => x.offreId === o.id)).length;
  return `${l.length ? `<section class="carte propositions"><h2>🆕 Offres déposées par des entreprises (${l.length})</h2>
      <p class="doux petit">Vérifiez chaque offre (et localisez l’adresse) avant de la publier : elle sera alors visible par les élèves du niveau indiqué.</p>
      ${l.some(o => o.source === 'france_travail') ? `<div class="actions" style="margin-top:0"><button class="btn mini sec" data-a="ofToutFT" data-v="publier">📢 Publier toutes les offres France Travail</button><button class="btn mini danger" data-a="ofToutFT" data-v="refuser">Écarter toutes les offres France Travail</button></div>` : ''}
      ${l.map(o => `<div class="offre"><div class="offre-tete"><b>${esc(o.intitule)}</b> ${badgesNiveaux(o)} ${badgeSource(o)}${o.typeContrat ? ` <span class="petit doux">${esc(o.typeContrat)}</span>` : ''}</div>
        <div>🏢 <b>${esc(o.entreprise)}</b> — ${esc(o.adresse)}${o.secteur ? ` · ${esc(o.secteur)}` : ''}</div>
        <div class="petit">📅 ${esc(periodeOffre(o))} · ${o.places} stagiaire(s) · 👤 ${esc([o.contact, o.tel, o.email].filter(Boolean).join(' · '))}</div>
        ${o.description ? `<p class="petit">${esc(o.description.length > 400 ? o.description.slice(0, 400) + '…' : o.description)}</p>` : ''}<div class="petit doux">${o.source === 'france_travail' ? 'Publiée sur France Travail' : 'Déposée'} le ${fmtDT(o.deposeLe)}${lienSurOffre(o.lien) ? ` · <a href="${esc(o.lien)}" target="_blank" rel="noopener">voir l’offre d’origine</a>` : ''}</div>
        <div class="actions">${o.source === 'france_travail' ? `<button class="btn mini" data-a="ofPublierDirect" data-id="${o.id}">📢 Publier</button><button class="btn mini sec" data-a="ofEditer" data-prop="${o.id}">Modifier puis publier</button>` : `<button class="btn mini" data-a="ofEditer" data-prop="${o.id}">✅ Vérifier et publier</button>`}<button class="btn mini danger" data-a="ofRefuser" data-id="${o.id}">Refuser</button></div></div>`).join('')}</section>` : ''}
    <section class="carte"><h2>🔗 Lien à donner aux entreprises</h2>
      <p class="doux petit">Les entreprises (partenaires, tuteurs, entreprises de la base) décrivent leur offre de stage avec ce lien, sans compte. Vous la vérifiez avant publication.</p>
      ${lien ? `<div class="ligne"><input id="of_lien" value="${esc(lien)}" readonly aria-label="Lien pour déposer une offre"><button class="btn sec" data-a="ofCopier">📋 Copier</button></div>
        <div class="actions"><a class="btn sec" href="mailto:?subject=${encodeURIComponent('Proposer un stage aux élèves du lycée')}&body=${encodeURIComponent(`Bonjour,\n\nVous pouvez proposer une période de formation en milieu professionnel (stage) à nos élèves de CAP, bac pro ou BTS en remplissant ce formulaire :\n${lien}\n\nVotre offre sera transmise aux élèves concernés après vérification par l’équipe pédagogique.\n\nCordialement,\n${nomComplet(S.user)}`)}">✉️ Préparer un e-mail</a></div>`
        : '<p class="doux">Le lien n’est disponible qu’avec la version Google de l’application (Code.gs à jour).</p>'}</section>
    ${carteFranceTravail()}
    <section class="carte"><div class="ag-tete"><h2 style="text-align:left;text-transform:none">📢 Offres publiées (${pub.filter(offreActive).length})</h2><span style="flex:1"></span><button class="btn mini" data-a="ofEditer">➕ Saisir une offre</button></div>
      <p class="doux petit">Offres reçues par téléphone, par mail ou lors d’une visite : saisissez-les ici. Une offre disparaît pour les élèves après sa date de fin.</p>
      ${pub.length ? `<div class="table-scroll"><table><tr><th>Offre</th><th>Entreprise</th><th>Période</th><th>Élèves</th><th></th></tr>
        ${pub.map(o => `<tr class="${offreActive(o) ? '' : 'expiree'}"><td><b>${esc(o.intitule)}</b><br>${badgesNiveaux(o)}${offreActive(o) ? '' : ' <span class="badge" style="background:#9ca3af">terminée</span>'}</td>
          <td>${esc(o.entreprise)}<br><span class="petit doux">${esc(o.adresse)}${o.lat == null ? ' · ⚠️ non localisée' : ''}</span></td>
          <td class="petit">${esc(periodeOffre(o))}<br>${o.places} place(s)</td><td class="centre">${nbEleves(o)}</td>
          <td style="white-space:nowrap"><button class="btn mini sec" data-a="ofEditer" data-id="${o.id}">Modifier</button><button class="btn mini danger" data-a="ofSupprimer" data-id="${o.id}">Supprimer</button></td></tr>`).join('')}</table></div>`
        : '<p class="doux">Aucune offre publiée pour le moment.</p>'}</section>`;
}
A.ofCopier = async () => {
  const c = $('#of_lien'); c.select();
  try { await navigator.clipboard.writeText(c.value); } catch { document.execCommand('copy'); }
  toast('Lien copié');
};
A.ofEditer = el => {
  const prop = el.dataset.prop && S.offresProposees.find(x => x.id === el.dataset.prop);
  const o = (el.dataset.id && S.offres.find(x => x.id === el.dataset.id)) || prop
    || { id: '', entreprise: '', adresse: '', lat: null, lon: null, secteur: '', intitule: '', description: '', niveaux: [], debut: '', fin: '', places: 1, contact: '', tel: '', email: '' };
  const dansBase = o.entrepriseId || S.entreprises.some(e => normaliserNom(e.nom) === normaliserNom(o.entreprise));
  modal(`<h2>${prop ? '✅ Vérifier et publier l’offre' : o.id ? 'Modifier l’offre' : '➕ Nouvelle offre de stage'}</h2>
    <label>Entreprise<input id="of_ent" value="${esc(o.entreprise)}" list="of_ents"></label>
    <datalist id="of_ents">${S.entreprises.map(e => `<option value="${esc(e.nom)}">`).join('')}</datalist>
    <div style="font-weight:600;font-size:.88rem">Adresse du lieu de stage</div>${champGeo('of', o.adresse, o.lat, o.lon)}
    <div class="deux" style="margin-top:10px"><label>Secteur<input id="of_sect" value="${esc(o.secteur)}" list="of_sects"></label>
      <label>Métier ou activités<input id="of_int" value="${esc(o.intitule)}"></label></div>
    <datalist id="of_sects">${secteursBase().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <fieldset class="choix-groupe"><legend>Niveaux</legend>${NIVEAUX.map(n => `<label class="choix"><input type="checkbox" class="of-niv" value="${n}" ${(o.niveaux || []).includes(n) ? 'checked' : ''}>${n}</label>`).join('')}</fieldset>
    <div class="deux"><label>Du<input type="date" id="of_debut" value="${esc(o.debut)}"></label><label>Au<input type="date" id="of_fin" value="${esc(o.fin)}"></label>
      <label>Places<input type="number" id="of_places" min="1" max="50" value="${esc(o.places || 1)}"></label></div>
    <label>Description<textarea id="of_desc" rows="3">${esc(o.description)}</textarea></label>
    <div class="deux"><label>Contact<input id="of_contact" value="${esc(o.contact)}"></label><label>Téléphone<input id="of_tel" value="${esc(o.tel)}"></label><label>E-mail<input id="of_mail" value="${esc(o.email)}"></label></div>
    ${dansBase ? '' : `<label class="choix" style="margin-top:8px"><input type="checkbox" id="of_base" ${o.source === 'france_travail' ? '' : 'checked'}>Ajouter aussi cette entreprise à la base d’entreprises</label>`}
    <div class="actions"><button class="btn" data-a="ofSauver" data-id="${esc(prop ? '' : o.id)}" data-prop="${esc(prop ? prop.id : '')}">${prop || !o.id ? '📢 Publier l’offre' : 'Enregistrer'}</button></div>`, true);
};
A.ofSauver = async el => {
  const niveaux = $$('.of-niv:checked').map(x => x.value), ancien = el.dataset.id && S.offres.find(x => x.id === el.dataset.id), prop = el.dataset.prop && S.offresProposees.find(x => x.id === el.dataset.prop);
  const o = Object.assign({}, prop || ancien || {}, { id: (ancien && ancien.id) || uid(), entreprise: val('of_ent'), ...lireGeo('of'), secteur: val('of_sect'), intitule: val('of_int'), niveaux,
    debut: val('of_debut'), fin: val('of_fin'), places: Math.max(1, +val('of_places') || 1), description: val('of_desc'), contact: val('of_contact'), tel: val('of_tel'), email: val('of_mail'),
    source: (prop || ancien || {}).source || 'equipe', publieLe: (ancien && ancien.publieLe) || maintenant(), publiePar: (ancien && ancien.publiePar) || nomComplet(S.user) });
  if (!o.entreprise || !o.intitule || !niveaux.length) throw new Error('Indiquez l’entreprise, le métier et au moins un niveau.');
  if (o.debut && o.fin && o.fin < o.debut) throw new Error('La date de fin est avant la date de début.');
  await assurerGeo(o);
  const existe = S.entreprises.find(e => normaliserNom(e.nom) === normaliserNom(o.entreprise));
  if (existe) o.entrepriseId = existe.id;
  else if ($('#of_base') && $('#of_base').checked) {
    const n = { id: uid(), nom: o.entreprise, secteur: o.secteur, adresse: o.adresse, lat: o.lat, lon: o.lon, tel: o.tel, email: o.email, contact: o.contact, notes: `Offre de stage : ${o.intitule}` };
    await mutCommun('entreprises', l => l.push(n)); o.entrepriseId = n.id;
  }
  await mutCommun('offres', l => { const i = l.findIndex(x => x.id === o.id); if (i >= 0) l[i] = o; else l.push(o); });
  if (prop) await retirerOffreProposee(prop.id);
  modal(''); render(); toast(o.lat == null ? 'Offre publiée (adresse non localisée : pas de distance pour les élèves)' : 'Offre publiée : les élèves la voient');
};
async function retirerOffreProposee(id) {
  const d = (await getDoc('commun/offres_proposees')) || { liste: [] };
  d.liste = (d.liste || []).filter(x => x.id !== id); await putDoc('commun/offres_proposees', d); S.offresProposees = d.liste;
}
A.ofRefuser = async el => {
  const o = S.offresProposees.find(x => x.id === el.dataset.id); if (!o || !confirm(`Refuser l’offre « ${o.intitule} » de ${o.entreprise} ?`)) return;
  await retirerOffreProposee(o.id); render(); toast('Offre refusée');
};
A.ofSupprimer = async el => {
  const o = S.offres.find(x => x.id === el.dataset.id); if (!o || !confirm(`Supprimer l’offre « ${o.intitule} » ? Les élèves ne la verront plus (elle reste dans leurs appels s’ils l’ont ajoutée).`)) return;
  await mutCommun('offres', l => { const i = l.findIndex(x => x.id === o.id); if (i >= 0) l.splice(i, 1); }); render(); toast('Offre supprimée');
};

/* ---------- Élève : offres de stage de son niveau ---------- */
function niveauClasse(cl) {
  const t = cl ? `${cl.nom} ${cl.diplome || ''}` : '';
  return /\bBTS\b/i.test(t) ? 'BTS' : /\bCAP\b/i.test(t) ? 'CAP' : 'Bac pro';
}
function offresEleve(d) {
  const niv = S.fo.niveau == null ? niveauClasse(S.classes.find(c => c.id === d.profil.classeId)) : S.fo.niveau;
  const localise = d.profil.residences.some(r => r.lat != null);
  return S.offres.filter(o => offreActive(o) && (!niv || (o.niveaux || []).includes(niv)) && (!S.fo.secteur || o.secteur === S.fo.secteur))
    .map(o => ({ o, pos: plusProche(d, o) }))
    .filter(x => !S.fo.zones || !localise || !x.pos || x.pos.dans)
    .sort((a, b) => (a.pos ? a.pos.km : 9999) - (b.pos ? b.pos.km : 9999));
}
function vueOffresEleve() {
  const d = S.el, niv = S.fo.niveau == null ? niveauClasse(S.classes.find(c => c.id === d.profil.classeId)) : S.fo.niveau;
  const l = offresEleve(d), secteurs = [...new Set(S.offres.filter(offreActive).map(o => o.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const pris = new Set(d.demandes.liste.map(x => x.offreId).filter(Boolean));
  return `<section class="carte"><h2>📢 Offres de stage</h2>
    <p class="doux">Des entreprises proposent des stages aux élèves du lycée. Ajoute celles qui t’intéressent à tes appels, puis contacte-les rapidement : les places partent vite.</p>
    <div class="deux"><label>Niveau<select data-c="foNiveau"><option value="">Tous les niveaux</option>${NIVEAUX.map(n => `<option ${n === niv ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${secteurs.length ? `<label>Secteur<select data-c="foSecteur"><option value="">Tous les secteurs</option>${secteurs.map(s => `<option ${s === S.fo.secteur ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      <label class="choix" style="align-self:end"><input type="checkbox" data-c="foZones" ${S.fo.zones ? 'checked' : ''}>Seulement près de mes communes</label></div></section>
  ${l.length ? l.map(({ o, pos }) => `<section class="carte offre">
      <div class="offre-tete"><h3 style="margin:0">${esc(o.intitule)}</h3> ${badgesNiveaux(o)} ${badgeSource(o)}</div>
      <div>🏢 <b>${esc(o.entreprise)}</b>${o.secteur ? ` · ${esc(o.secteur)}` : ''}</div>
      <div class="petit">📍 ${esc(o.adresse)}${pos ? ` · <b>${pos.km.toFixed(1).replace('.', ',')} km</b> de ${esc(pos.res)}` : ''}</div>
      <div class="petit">📅 ${esc(periodeOffre(o))} · ${o.places} place${o.places > 1 ? 's' : ''}</div>
      ${o.description ? `<p class="petit">${esc(o.description.length > 600 ? o.description.slice(0, 600) + '…' : o.description)}</p>` : ''}
      <div class="petit" ${o.contact || o.tel || o.email ? '' : 'hidden'}>👤 ${esc(o.contact || 'Contact')}${o.tel ? ` · ☎ <a href="tel:${esc(o.tel.replace(/\s/g, ''))}">${esc(o.tel)}</a>` : ''}${o.email ? ` · ✉️ <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''}</div>
      ${o.typeContrat ? `<div class="petit doux">Contrat : ${esc(o.typeContrat)}</div>` : ''}
      <div class="actions">${lienSurOffre(o.lien) ? `<a class="btn sec" href="${esc(o.lien)}" target="_blank" rel="noopener">↗️ Voir l’offre et postuler</a>` : ''}${pris.has(o.id) ? '<span class="badge" style="background:#16a34a">✔ Dans mes appels</span>' : `<button class="btn" data-a="foAjouter" data-id="${o.id}" data-km="${pos ? pos.km.toFixed(1) : ''}">➕ Ajouter à mes appels</button>`}</div></section>`).join('')
    : `<section class="carte"><p>Aucune offre ${niv ? `de niveau ${esc(niv)} ` : ''}pour le moment${S.fo.zones ? ' près de tes communes' : ''}. ${S.fo.zones ? 'Décoche « Seulement près de mes communes » ou ' : ''}regarde aussi les entreprises proposées dans « Entreprises ».</p></section>`}`;
}
C.foNiveau = el => { S.fo.niveau = el.value; render(); };
C.foSecteur = el => { S.fo.secteur = el.value; render(); };
C.foZones = el => { S.fo.zones = el.checked; render(); };
A.foAjouter = async el => {
  const o = S.offres.find(x => x.id === el.dataset.id); if (!o) return;
  const dem = nouvelleDemande({ id: o.entrepriseId || null, nom: o.entreprise, secteur: o.secteur, adresse: o.adresse, tel: o.tel, email: o.email, contact: o.contact }, el.dataset.km);
  dem.offreId = o.id; dem.suite = `Offre de stage : ${o.intitule}`;
  S.el.demandes.liste.push(dem); await sauver('demandes'); journal(`Offre de stage ajoutée aux appels : ${o.entreprise}`);
  render(); toast('Ajoutée à tes appels : appelle vite l’entreprise !');
};
const nbOffresEleve = () => S.el ? offresEleve(S.el).filter(x => !S.el.demandes.liste.some(d => d.offreId === x.o.id)).length : 0;

/* ---------- Import des offres France Travail ---------- */
function carteFranceTravail() {
  const f = S.ft; if (!f) return '';
  const der = f.dernier;
  return `<section class="carte"><h2>🇫🇷 Offres France Travail</h2>
    ${f.configure ? `<p class="petit">✅ Connexion à France Travail configurée. Import automatique chaque matin s’il a été programmé dans Apps Script.
        ${der ? `Dernier import le <b>${fmtDT(der.date)}</b> : <b>${der.nouvelles} nouvelle(s) offre(s)</b> à vérifier.` : 'Aucun import pour le moment.'}</p>`
      : '<div class="alerte attention petit">La connexion à France Travail n’est pas encore configurée : créez une application sur francetravail.io (API « Offres d’emploi v2 »), puis renseignez FT_CLIENT_ID et FT_CLIENT_SECRET dans les propriétés du script Google (voir le guide, section 11).</div>'}
    <div class="deux"><label>Départements <span class="doux petit">(séparés par des virgules)</span><input id="ft_dep" value="${esc((f.departements || []).join(', '))}" placeholder="76, 27"></label>
      <label>Mots-clés <span class="doux petit">(une recherche par mot-clé)</span><input id="ft_mots" value="${esc((f.motsCles || []).join(', '))}" placeholder="stage, stagiaire"></label></div>
    <label class="choix"><input type="checkbox" id="ft_alt" ${f.alternance ? 'checked' : ''}>Inclure les contrats d’apprentissage (utile pour les BTS en alternance)</label>
    <p class="doux petit">Les offres trouvées arrivent dans les offres à vérifier ; une offre déjà publiée ou écartée n’est pas reproposée. Le niveau (CAP, bac pro, BTS) est déduit du texte de l’offre : vérifiez-le.</p>
    <div class="actions"><button class="btn sec" data-a="ftReglages">Enregistrer les réglages</button>${f.configure ? '<button class="btn" data-a="ftImporter">⬇️ Importer maintenant</button>' : ''}</div></section>`;
}
A.ftReglages = async () => {
  const liste = id => val(id).split(/[,;]/).map(x => x.trim()).filter(Boolean);
  await api('POST', '/api/francetravail/reglages', { departements: liste('ft_dep'), motsCles: liste('ft_mots'), alternance: $('#ft_alt').checked });
  S.ft = await api('GET', '/api/francetravail/etat'); render(); toast('Réglages enregistrés');
};
A.ftImporter = async () => {
  const r = await api('POST', '/api/francetravail/importer');
  await chargerOffresProposees(); render(); toast(r.nouvelles ? `${r.nouvelles} nouvelle(s) offre(s) à vérifier` : 'Aucune nouvelle offre depuis le dernier import');
};
async function publierOffres(liste) {
  await mutCommun('offres', l => {
    for (const o of liste) {
      const p = Object.assign({}, o, { publieLe: maintenant(), publiePar: nomComplet(S.user) });
      const e = S.entreprises.find(x => normaliserNom(x.nom) === normaliserNom(o.entreprise)); if (e) p.entrepriseId = e.id;
      const i = l.findIndex(x => x.id === p.id); if (i >= 0) l[i] = p; else l.push(p);
    }
  });
  const ids = new Set(liste.map(o => o.id)), d = (await getDoc('commun/offres_proposees')) || { liste: [] };
  d.liste = (d.liste || []).filter(x => !ids.has(x.id)); await putDoc('commun/offres_proposees', d); S.offresProposees = d.liste;
}
A.ofPublierDirect = async el => {
  const o = S.offresProposees.find(x => x.id === el.dataset.id); if (!o) return;
  await publierOffres([o]); render(); toast('Offre publiée');
};
A.ofToutFT = async el => {
  const l = S.offresProposees.filter(o => o.source === 'france_travail'), pub = el.dataset.v === 'publier';
  if (!l.length || !confirm(`${pub ? 'Publier' : 'Écarter'} les ${l.length} offre(s) France Travail en attente ?`)) return;
  if (pub) await publierOffres(l);
  else { const d = (await getDoc('commun/offres_proposees')) || { liste: [] }; d.liste = (d.liste || []).filter(x => x.source !== 'france_travail'); await putDoc('commun/offres_proposees', d); S.offresProposees = d.liste; }
  render(); toast(pub ? 'Offres publiées' : 'Offres écartées');
};
