'use strict';
/* ===== Journal de bord du stage =====
 * Chaque jour de stage : au moins 3 lignes de texte et une photo (sauf dispense donnée par le professeur).
 * - Texte : section « bord » du dossier de l'élève ({ jours: { AAAA-MM-JJ: { texte, photo, absent, motif, majLe } } }).
 * - Photo : rangée dans le dossier privé du Drive (routes /api/journal/photo…).
 * - Retours du professeur : section « prof » (bord: { date: { commentaire, correction, statut, par, date } }, dispensePhoto).
 * Le DDFPT n'a pas cet onglet. */
S.bordJour = null;
const LIGNES_MIN = 3;
const nbLignesBord = t => String(t || '').split('\n').filter(l => l.trim().split(/\s+/).length >= 2).length;
const isoJour = x => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function joursBord(d) {
  const dt = datesEleve(d), l = new Set();
  if (dt) for (let x = new Date(dt.debut + 'T12:00:00'); isoJour(x) <= dt.fin; x.setDate(x.getDate() + 1)) if (x.getDay() !== 0) l.add(isoJour(x));
  Object.keys((d.bord && d.bord.jours) || {}).forEach(j => l.add(j));
  return [...l].sort();
}
function etatJour(d, date) {
  const e = ((d.bord && d.bord.jours) || {})[date], dispense = !!d.prof.dispensePhoto;
  if (!e) return date <= today() ? 'manquant' : 'avenir';
  if (e.absent) return 'absent';
  return manquesJour(e, dispense).length ? 'incomplet' : 'complet';
}
const TYPES_CHANTIER = ['Logement individuel (maison)', 'Logement collectif (immeuble)', 'Bureaux / tertiaire', 'Commerce', 'Industriel', 'Établissement public (école, mairie, hôpital…)', 'Atelier ou locaux de l’entreprise', 'Autre'];
const NATURES_CHANTIER = ['Construction neuve', 'Rénovation', 'Entretien / dépannage', 'Travail à l’atelier'];
// Ce qui manque pour qu'une journée soit complète.
function manquesJour(e, dispense) {
  const m = [];
  if (nbLignesBord(e.texte) < LIGNES_MIN) m.push(`au moins ${LIGNES_MIN} lignes`);
  if (!e.lieu) m.push('le lieu du chantier');
  if (!e.type) m.push('le type de chantier');
  if (!e.nature) m.push('neuf ou rénovation');
  if (!e.photo && !dispense) m.push('la photo');
  return m;
}
const ETATS_BORD = { complet: ['✅', 'Complet', '#16a34a'], incomplet: ['⚠️', 'Incomplet', '#b45309'], manquant: ['⬜', 'À remplir', '#dc2626'], avenir: ['·', 'À venir', '#94a3b8'], absent: ['🚫', 'Non travaillé', '#64748b'] };
const STATUT_PROF = { valide: ['✅ Validé', '#16a34a'], reprendre: ['🔁 À reprendre', '#b45309'] };
const jourCourt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const nbBordEnRetard = d => joursBord(d).filter(j => j <= today() && ['manquant', 'incomplet'].includes(etatJour(d, j))).length;

/* ---------- Élève ---------- */
function choisirJourBord(d) {
  const l = joursBord(d);
  if (S.bordJour && (l.includes(S.bordJour) || S.bordJour <= today())) return S.bordJour;
  if (l.includes(today())) return today();
  return l.filter(j => j <= today()).find(j => ['manquant', 'incomplet'].includes(etatJour(d, j))) || l.filter(j => j <= today()).pop() || l[0] || today();
}
function vueJournalBord() {
  const d = S.el, l = joursBord(d), dt = datesEleve(d), jour = choisirJourBord(d), dispense = d.prof.dispensePhoto;
  const passes = l.filter(j => j <= today() && etatJour(d, j) !== 'absent'), complets = passes.filter(j => etatJour(d, j) === 'complet').length;
  const prec = Object.entries(d.bord.jours || {}).filter(([j, x]) => j < jour && x.lieu).sort().pop();
  const e = Object.assign({ texte: '', photo: false, absent: false, motif: '', lieu: '', type: '', nature: '', duree: '', autonomie: '' }, prec && !(d.bord.jours[jour] || {}).lieu ? { lieu: prec[1].lieu, type: prec[1].type, nature: prec[1].nature, duree: prec[1].duree } : {}, d.bord.jours[jour] || {}), retour = (d.prof.bord || {})[jour], futur = jour > today();
  return `${alertesJoursBord(d)}<section class="carte"><h2>📓 Mon journal de bord</h2>
    <p>Chaque jour de stage, note <b>au moins ${LIGNES_MIN} lignes</b> sur ta journée et ajoute <b>une photo</b>${dispense ? ' (tu en es dispensé)' : ''}. Ton professeur le lit et te fait des retours.</p>
    ${dt ? `<p class="petit">📅 Stage du ${fmt(dt.debut)} au ${fmt(dt.fin)} · <b>${complets}/${passes.length}</b> jour(s) complet(s) à ce jour</p>` : '<div class="alerte info petit">Tes dates de stage ne sont pas encore fixées : choisis le jour ci-dessous.</div>'}
    ${dispense ? `<div class="alerte info petit">📷 Ton professeur t’a dispensé de photo${dispense.motif ? ` : ${esc(dispense.motif)}` : ''}.</div>` : ''}
    ${l.length ? `<div class="bord-jours" role="list">${l.map(j => { const [ic, lib, c] = ETATS_BORD[etatJour(d, j)], r = (d.prof.bord || {})[j];
      return `<button type="button" role="listitem" class="bord-jour ${j === jour ? 'actif' : ''}" style="--c:${c}" data-a="bordJour" data-j="${j}" title="${lib}"><span>${ic}</span>${esc(jourCourt(j))}${r && r.commentaire ? ' 💬' : ''}</button>`; }).join('')}</div>` : ''}
    <label class="petit" style="margin-top:8px">Autre jour<input type="date" data-c="bordAutreJour" value="${jour}" max="${today()}"></label></section>
  <section class="carte"><h2>${esc(jourLong(jour))}</h2>
    ${futur ? '<p class="doux">Ce jour n’est pas encore passé : tu pourras le remplir le jour même.</p>' : `
    ${retour && (retour.commentaire || retour.correction || retour.statut) ? `<div class="correction ${retour.statut === 'valide' ? 'valide' : ''}"><b>${retour.statut ? STATUT_PROF[retour.statut][0] : '💬 Retour'} de ${esc(retour.par)} le ${fmtDT(retour.date)}</b>${retour.commentaire ? `\n${esc(retour.commentaire)}` : ''}${retour.correction ? `\n\n<b>Correction proposée :</b>\n${esc(retour.correction)}` : ''}</div>
      ${retour.correction ? '<button type="button" class="btn mini sec" data-a="bordReprendre">Reprendre la correction dans mon texte</button>' : ''}` : ''}
    <label class="choix"><input type="checkbox" id="bord_absent" data-c="bordAbsent" ${e.absent ? 'checked' : ''}>Je n’ai pas travaillé ce jour-là (repos, jour férié, absence)</label>
    <div id="bord_absent_z" ${e.absent ? '' : 'hidden'}><label>Pourquoi ?<input id="bord_motif" value="${esc(e.motif || '')}" placeholder="Jour de repos de l’entreprise, maladie…"></label></div>
    <div id="bord_travail" ${e.absent ? 'hidden' : ''}>
      <fieldset class="choix-groupe bord-chantier"><legend>🏗️ Le chantier ou le lieu de travail</legend>
        <div class="deux" style="width:100%"><label>Lieu précis <span class="doux petit">(commune, adresse ou nom du site)</span><input id="bord_lieu" value="${esc(e.lieu)}" placeholder="Résidence Les Tilleuls, Yvetot"></label>
          <label>Type de chantier<select id="bord_type"><option value="">— Choisir —</option>${TYPES_CHANTIER.map(x => `<option ${x === e.type ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
        <div class="deux" style="width:100%"><label>Neuf ou rénovation<select id="bord_nature"><option value="">— Choisir —</option>${NATURES_CHANTIER.map(x => `<option ${x === e.nature ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>Durée approximative du chantier<input id="bord_duree" value="${esc(e.duree)}" placeholder="3 semaines, 2 jours…"></label></div></fieldset>
      ${(x => e.texte ? x : x.replace('<details class="aide">', '<details class="aide" open>'))(aide('Que dois-je écrire ? Sois précis !', `Réponds en au moins ${LIGNES_MIN} lignes, avec des phrases complètes et le <b>vocabulaire technique</b> du métier :<br>
        1. <b>Qu’ai-je fait aujourd’hui ?</b> Les tâches, le matériel, les outils, avec qui.<br>
        2. <b>Qu’ai-je fait seul(e), en autonomie</b>, et qu’ai-je fait avec l’aide de mon tuteur ?<br>
        3. <b>Qu’ai-je appris ou découvert ?</b><br>
        4. <b>Une réussite, une difficulté ou une question</b> pour ton professeur.<br>
        <span class="doux">Trop vague : « J’ai mis des fils. »<br>Précis : « J’ai tiré des câbles R2V 3G2,5 dans une gaine ICTA de 20 pour alimenter les prises de la cuisine, puis j’ai raccordé le tableau avec mon tuteur. »</span>`))}
      <label>Ma journée<textarea id="bord_texte" rows="6" spellcheck="true" lang="fr" data-i="bordCompte" placeholder="Ce matin, j’ai… avec mon tuteur.&#10;J’ai appris à…&#10;J’ai trouvé difficile…">${esc(e.texte || '')}</textarea></label>
      <div class="petit" id="bord_n">${nbLignesBord(e.texte)}/${LIGNES_MIN} lignes</div>
      <label>✋ Ce que j’ai fait seul(e), en autonomie<textarea id="bord_auto" rows="2" spellcheck="true" lang="fr" placeholder="J’ai posé seul les boîtes d’encastrement du salon après les explications de mon tuteur.">${esc(e.autonomie)}</textarea></label>
      <h3>📷 Photo du jour${dispense ? ' <span class="doux petit">(facultative : dispense)</span>' : ''}</h3>
      <p class="doux petit">Ton poste, un travail réalisé, un outil, une installation… Demande toujours l’accord de ton tuteur, et ne photographie personne sans son accord.</p>
      ${e.photo ? `<div class="actions"><button type="button" class="btn mini sec" data-a="bordVoirPhoto" data-j="${jour}">👁️ Voir ma photo</button><button type="button" class="lien petit" style="display:inline" data-a="bordRetirerPhoto">Retirer la photo</button></div><div id="bord_photo_${jour}"></div>
        <label class="btn mini sec depot-fichier">📷 Remplacer la photo<input type="file" accept="image/*" capture="environment" data-c="bordPhoto"></label>`
        : `<label class="btn depot-fichier">📷 Prendre ou choisir une photo<input type="file" accept="image/*" capture="environment" data-c="bordPhoto"></label>`}
      <div id="bord_fautes"></div>
    </div>
    <div class="actions"><button class="btn" data-a="bordEnregistrer">💾 Enregistrer</button><button class="btn sec" data-a="bordVerifier">✔️ Vérifier l’orthographe</button></div>`}
  </section>`;
}
A.bordJour = el => { lireBordSiOuvert(); S.bordJour = el.dataset.j; render(); };
C.bordAutreJour = el => { if (el.value) { S.bordJour = el.value; render(); } };
C.bordAbsent = el => { $('#bord_absent_z').hidden = !el.checked; $('#bord_travail').hidden = el.checked; };
I.bordCompte = el => { const n = nbLignesBord(el.value), z = $('#bord_n'); if (z) { z.textContent = `${n}/${LIGNES_MIN} lignes`; z.style.color = n >= LIGNES_MIN ? '#16a34a' : ''; } };
function champsJour() {
  const v = id => ($('#' + id) || {}).value || '';
  return { texte: v('bord_texte'), absent: !!($('#bord_absent') || {}).checked, motif: v('bord_motif'), lieu: v('bord_lieu').trim(), type: v('bord_type'), nature: v('bord_nature'), duree: v('bord_duree').trim(), autonomie: v('bord_auto') };
}
function lireBordSiOuvert() {
  if (!$('#bord_texte')) return;
  const j = choisirJourBord(S.el), e = S.el.bord.jours[j] || {};
  const n = { ...e, ...champsJour() };
  if (n.texte.trim() || n.absent || e.photo) S.el.bord.jours[j] = n;
}
async function sauverJour(date, maj) {
  const k = `eleve/${S.user.id}/bord`, d = Object.assign({ jours: {} }, (await getDoc(k)) || {});
  d.jours = d.jours || {}; d.jours[date] = Object.assign({}, d.jours[date] || {}, maj, { majLe: maintenant() });
  await putDoc(k, d); S.el.bord = d;
}
A.bordEnregistrer = async () => {
  const j = choisirJourBord(S.el);
  await sauverJour(j, champsJour());
  const etat = etatJour(S.el, j), m = manquesJour(S.el.bord.jours[j], !!S.el.prof.dispensePhoto); journal(`Journal de bord : ${fmt(j)}`); render();
  toast(etat === 'complet' || etat === 'absent' ? 'Journée enregistrée ✅' : `Enregistré. Il manque encore : ${m.join(', ')}.`, etat === 'incomplet');
};
C.bordPhoto = async el => {
  const f = el.files[0]; if (!f) return;
  const j = choisirJourBord(S.el), champs = champsJour();
  toast('Envoi de la photo…');
  const img = await CONV.photoEnImage(f, 1280);
  await api('POST', '/api/journal/photo', { date: j, img });
  await sauverJour(j, { ...champs, photo: true, absent: false });
  render(); toast('Photo ajoutée');
};
A.bordRetirerPhoto = async () => {
  const j = choisirJourBord(S.el); if (!confirm('Retirer la photo de ce jour ?')) return;
  await api('POST', '/api/journal/photo/supprimer', { date: j }); await sauverJour(j, { ...champsJour(), photo: false }); render();
};
A.bordVoirPhoto = async el => {
  const z = $('#bord_photo_' + el.dataset.j); if (!z) return;
  if (z.innerHTML) { z.innerHTML = ''; return; }
  const r = await api('POST', '/api/journal/photo/lire', { date: el.dataset.j, eleveId: el.dataset.e || undefined });
  if (!/^data:image\/(jpeg|png);base64,/.test(r.img)) throw new Error('Photo illisible.');
  z.innerHTML = `<img class="bord-photo" src="${r.img}" alt="Photo du ${fmt(el.dataset.j)}">`;
};
A.bordVerifier = () => verifierTextes([{ el: $('#bord_texte'), nom: 'Ma journée' }, { el: $('#bord_auto'), nom: 'En autonomie' }, { el: $('#bord_lieu'), nom: 'Lieu' }].filter(x => x.el && x.el.value.trim()), 'bord_fautes');
A.bordReprendre = () => {
  const r = (S.el.prof.bord || {})[choisirJourBord(S.el)], t = $('#bord_texte');
  if (!r || !t || (t.value.trim() && !confirm('Remplacer ton texte par la correction de ton professeur ?'))) return;
  t.value = r.correction; I.bordCompte(t); toast('Relis la correction puis enregistre');
};
function blocRappelBord(d) {
  const dt = datesEleve(d); if (!dt || today() < dt.debut || today() > dt.fin) return '';
  const n = nbBordEnRetard(d), auj = etatJour(d, today());
  if (!n && auj !== 'manquant') return '';
  return `<div class="alerte attention">📓 <b>Journal de bord</b> : ${auj === 'manquant' || auj === 'incomplet' ? 'n’oublie pas de remplir ta journée d’aujourd’hui' : ''}${n > 1 ? ` · ${n} jour(s) à compléter` : ''}.
    <button class="btn mini" data-a="aller" data-v="bord">Remplir</button></div>`;
}

/* ---------- Professeur : onglet du dossier de l'élève ---------- */
const nbBordALire = d => Object.entries((d.bord && d.bord.jours) || {}).filter(([j, e]) => !e.absent && e.texte && (!(d.prof.bord || {})[j] || String(e.majLe) > String(d.prof.bord[j].date))).length;
function dosBord(e) {
  const d = e.d, l = joursBord(d), disp = d.prof.dispensePhoto;
  const passes = l.filter(j => j <= today() && etatJour(d, j) !== 'absent');
  return `<div class="carte" style="margin:0 0 12px">
      ${disp ? `<p>📷 <b>Dispensé de photo</b>${disp.motif ? ` : ${esc(disp.motif)}` : ''} <span class="petit doux">(${esc(disp.par)}, ${fmt(disp.date)})</span> <button class="btn mini sec" data-a="bordDispense" data-v="0">Annuler la dispense</button></p>`
        : `<details><summary>📷 Dispenser l’élève de photo (le lieu de stage interdit les photos)</summary><div class="ligne" style="margin-top:6px"><input id="bord_disp_motif" placeholder="Motif : site sensible, règlement de l’entreprise…" aria-label="Motif"><button class="btn mini" data-a="bordDispense" data-v="1">Dispenser</button></div></details>`}
      <p class="petit">${passes.filter(j => etatJour(d, j) === 'complet').length}/${passes.length} jour(s) complet(s) · ${nbBordALire(d)} à lire</p></div>
    ${l.length ? l.filter(j => j <= today() || d.bord.jours[j]).reverse().map(j => {
      const en = d.bord.jours[j], r = (d.prof.bord || {})[j] || {}, [ic, lib, c] = ETATS_BORD[etatJour(d, j)], nouveau = en && en.texte && (!r.date || String(en.majLe) > String(r.date));
      return `<div class="bord-carte" style="--c:${c}"><div class="bord-tete"><b>${esc(jourLong(j))}</b> <span class="badge" style="background:${c}">${ic} ${lib}</span>${r.statut ? ` <span class="badge" style="background:${STATUT_PROF[r.statut][1]}">${STATUT_PROF[r.statut][0]}</span>` : ''}${nouveau ? ' <span class="badge" style="background:#7c3aed">nouveau</span>' : ''}</div>
        ${!en ? '<p class="doux petit">Rien d’écrit pour ce jour.</p>' : en.absent ? `<p class="petit">Non travaillé${en.motif ? ` : ${esc(en.motif)}` : ''}</p>` : `
          <p class="petit">🏗️ ${[en.lieu, en.type, en.nature, en.duree && 'durée : ' + en.duree].filter(Boolean).map(esc).join(' · ') || '<span style="color:#b45309">chantier non précisé</span>'}</p>
          <p class="bord-texte">${esc(en.texte) || '<span class="doux">Pas de texte.</span>'}</p>${en.autonomie ? `<p class="bord-texte petit"><b>✋ En autonomie :</b> ${esc(en.autonomie)}</p>` : ''}<p class="petit doux">${nbLignesBord(en.texte)} ligne(s) · ${en.photo ? '📷 photo jointe' : disp ? 'pas de photo (dispense)' : '⚠️ pas de photo'} · écrit le ${fmtDT(en.majLe)}</p>
          ${en.photo ? `<button type="button" class="btn mini sec" data-a="bordVoirPhoto" data-j="${j}" data-e="${e.id}">📷 Voir la photo</button><div id="bord_photo_${j}"></div>` : ''}
          <details ${nouveau ? 'open' : ''}><summary>💬 Commenter et corriger</summary>
            <label>Commentaire pour l’élève<textarea id="bc_${j}" rows="2">${esc(r.commentaire || '')}</textarea></label>
            <label>Correction du texte <span class="doux petit">(facultatif)</span><textarea id="bk_${j}" rows="4" spellcheck="true" lang="fr">${esc(r.correction || '')}</textarea></label>
            <div class="actions"><button type="button" class="btn mini sec" data-a="bordCopier" data-j="${j}">Copier le texte de l’élève pour le corriger</button><button type="button" class="btn mini sec" data-a="bordVerifierProf" data-j="${j}">✔️ Vérifier l’orthographe</button></div>
            <div id="bf_${j}"></div>
            <div class="ligne"><select id="bs_${j}" aria-label="Avis"><option value="">— Avis —</option><option value="valide" ${r.statut === 'valide' ? 'selected' : ''}>✅ Validé</option><option value="reprendre" ${r.statut === 'reprendre' ? 'selected' : ''}>🔁 À reprendre</option></select>
              <button type="button" class="btn mini" data-a="bordCommenter" data-j="${j}">Enregistrer le retour</button></div></details>`}</div>`;
    }).join('') : '<p class="doux">Les dates de stage de cet élève ne sont pas fixées.</p>'}`;
}
A.bordCopier = el => { const j = el.dataset.j, t = $('#bk_' + j), en = eleveOuvert().d.bord.jours[j]; if (t.value.trim() && !confirm('Remplacer la correction en cours ?')) return; t.value = en.texte; t.focus(); };
// Vérifie la correction ; si elle est vide, on y copie d'abord le texte de l'élève (les corrections proposées s'y appliquent).
A.bordVerifierProf = el => {
  const j = el.dataset.j, t = $('#bk_' + j);
  if (!t.value.trim()) t.value = eleveOuvert().d.bord.jours[j].texte || '';
  return verifierTextes([{ el: t, nom: 'Correction' }], 'bf_' + j);
};
A.bordCommenter = async el => {
  const j = el.dataset.j, e = eleveOuvert(), commentaire = val('bc_' + j), correction = ($('#bk_' + j).value || '').trim(), statut = val('bs_' + j);
  if (!commentaire && !correction && !statut) throw new Error('Écrivez un commentaire, une correction ou un avis.');
  await mutProf(e.id, p => { p.bord = p.bord || {}; p.bord[j] = { commentaire, correction, statut, par: nomComplet(S.user), date: maintenant() }; });
  render(); toast('Retour enregistré : l’élève le voit dans son journal');
};
A.bordDispense = async el => {
  const e = eleveOuvert(), oui = el.dataset.v === '1';
  if (!oui && !confirm('Annuler la dispense de photo ?')) return;
  await mutProf(e.id, p => { p.dispensePhoto = oui ? { motif: val('bord_disp_motif'), par: nomComplet(S.user), date: maintenant() } : null; });
  render(); toast(oui ? 'Élève dispensé de photo' : 'Dispense annulée');
};
