'use strict';
/* Évaluation du stage (grille E3 du lycée) : une fiche par période, dans la partie « prof » du dossier de l'élève
 * (l'élève ne peut pas la modifier). Le professeur la remplit avec le tuteur pendant la visite, ou l'envoie au tuteur
 * par un lien à durée limitée (même mécanisme chiffré que le protocole) : le tuteur la complète et la signe. */
S.evalOuverte = null;   // { eleveId, k, ev }
const evalsDe = d => (d.prof && d.prof.evaluations) || {};
const copieEval = ev => JSON.parse(JSON.stringify(Object.assign(nouvelleEval(), ev || {})));

function dosEvaluation(e) {
  const d = e.d, ps = periodesEleve(d);
  if (!ps.length) return '<p class="doux">Les dates de stage de la classe ne sont pas encore fixées.</p>';
  const ouverte = S.evalOuverte && S.evalOuverte.eleveId === e.id ? S.evalOuverte : null;
  return `<p class="doux">Fiche d’évaluation de l’apprenant en entreprise (grille du lycée, épreuve E3). À remplir avec le tuteur pendant la visite, ou par le tuteur à distance grâce à un lien envoyé par SMS. Toutes les compétences ne peuvent pas être évaluées pendant un stage : la note sur 20 est calculée sur les compétences évaluées, avec leur pondération (total 240).</p>`
    + ps.map(p => {
      const k = cleP(p);
      if (ouverte && ouverte.k === k) return blocEditionEval(e, p, ouverte);
      const ev = evalsDe(d)[k], r = ev ? noteEval(ev) : null;
      return `<div class="att-prof"><h3>📅 ${esc(p.label || 'Stage')} <span class="petit doux">${fmt(p.debut)} → ${fmt(p.fin)}</span></h3>
        <p>${ev ? `${r.n ? `Note : <b>${fmtN(r.sur20)} / 20</b> <span class="petit doux">(${r.n} compétence(s) évaluée(s))</span>` : 'Grille commencée'}${ev.tuteur ? ` · ✍️ complétée et signée par ${esc(ev.tuteur.nom)} le ${fmtDT(ev.tuteur.date)}` : ''}${ev.valide ? ` · ✅ validée par ${esc(ev.valide.par)}` : ''}` : '⬜ Pas encore évaluée.'}</p>
        <div class="actions"><button class="btn mini" data-a="evalOuvrir" data-p="${esc(k)}">✏️ ${ev ? 'Ouvrir la grille' : 'Remplir la grille'}</button>
          ${ev ? `<button class="btn mini sec" data-a="evalPdf" data-p="${esc(k)}">⬇️ Fiche PDF</button>` : ''}</div>
        ${blocLienEval(e, k)}</div>`;
    }).join('');
}
function blocEditionEval(e, p, o) {
  return `<div class="att-prof ev-edition" id="evalEditeur"><h3>✏️ ${esc(p.label || 'Stage')} <span class="petit doux">${fmt(p.debut)} → ${fmt(p.fin)}</span></h3>
    ${o.ev.tuteur ? `<p class="petit">✍️ Complétée et signée par le tuteur ${esc(o.ev.tuteur.nom)} le ${fmtDT(o.ev.tuteur.date)}. Vos modifications sont ajoutées à sa grille.</p>` : ''}
    ${grilleEvalHTML(o.ev, false)}
    <div class="deux"><label>Date de la visite<input type="date" id="ev_visite" value="${esc(o.ev.visite || today())}"></label>
      <label class="choix" style="align-self:end"><input type="checkbox" id="ev_valide" ${o.ev.valide ? 'checked' : ''}>Évaluation terminée et validée (visible par l’élève)</label></div>
    <div class="actions"><button class="btn" data-a="evalSauver">💾 Enregistrer</button><button class="btn sec" data-a="evalFermer">Fermer</button></div></div>`;
}
// Appelé après chaque affichage du dossier : branche la grille ouverte.
function brancherEvalProf() { const z = document.getElementById('evalEditeur'); if (z && S.evalOuverte) brancherGrilleEval(z, S.evalOuverte.ev); }
A.evalOuvrir = el => { const e = eleveOuvert(); S.evalOuverte = { eleveId: e.id, k: el.dataset.p, ev: copieEval(evalsDe(e.d)[el.dataset.p]) }; render(); const z = document.getElementById('evalEditeur'); if (z) z.scrollIntoView({ block: 'start' }); };
A.evalFermer = () => { S.evalOuverte = null; render(); };
A.evalSauver = async () => {
  const e = eleveOuvert(), o = S.evalOuverte; if (!o) return;
  const ev = o.ev; ev.visite = val('ev_visite'); ev.par = nomComplet(S.user); ev.majLe = maintenant();
  ev.valide = $('#ev_valide').checked ? (ev.valide || { par: nomComplet(S.user), date: maintenant() }) : null;
  await mutProf(e.id, p => { p.evaluations = p.evaluations || {}; p.evaluations[o.k] = ev; });
  S.evalOuverte = null; render(); toast('Évaluation enregistrée');
};
function infosPdfEval(e, k, ev) {
  const d = e.d, p = periodesEleve(d).find(x => cleP(x) === k) || {}, ps = periodesEleve(d), dem = demandeDePeriode(d, k);
  return { ev, eleve: { nom: d.profil.nom, prenom: d.profil.prenom, classe: (classeEleve(d) || {}).nom || '' }, numero: String(ps.indexOf(p) + 1), debut: p.debut, fin: p.fin,
    session: (p.fin || '').slice(0, 4), entreprise: dem ? (((dem.protocole || {}).ent || {}).entreprise || dem.nom) : '', tuteur: ev.tuteur || null,
    prof: { nom: ev.valide ? ev.valide.par : ev.par || '', date: ev.visite || '', valide: ev.valide ? ev.valide.date : '' } };
}
A.evalPdf = async el => { const e = eleveOuvert(), k = el.dataset.p; ouvrirPdf(await fabriquerPdfEvaluation(infosPdfEval(e, k, evalsDe(e.d)[k])), `Evaluation E3 ${nomEleve(e)}.pdf`); };

/* ---------- Lien pour le tuteur (créé par le professeur, gardé sur son appareil) ---------- */
const cleLienEval = (id, k) => `evalsig_${id}_${k}`;
function lienEval(id, k) { try { const x = JSON.parse(localStorage.getItem(cleLienEval(id, k)) || 'null'); return x && new Date(x.expire) > new Date() ? x : null; } catch { return null; } }
function memoriserLienEval(id, k, x) { try { if (x) localStorage.setItem(cleLienEval(id, k), JSON.stringify(x)); else localStorage.removeItem(cleLienEval(id, k)); } catch { /* */ } }
const texteSmsEval = (e, x) => `Bonjour, voici la fiche d’évaluation du stage de ${e.d.profil.prenom} (lycée Raymond Queneau, Yvetot) à compléter et à signer avant le ${fmtDT(x.expire)}. Merci !\n${urlLienTuteur(x)}`;
function blocLienEval(e, k) {
  const x = lienEval(e.id, k), dem = demandeDePeriode(e.d, k), tel = ((dem && dem.protocole && dem.protocole.ent) || {}).telTuteur || '';
  if (!x) return `<details class="petit"><summary>📱 Faire remplir la grille par le tuteur à distance</summary>
    <div class="deux"><label>Téléphone portable du tuteur<input class="ev_tel" type="tel" value="${esc(tel)}" placeholder="06 12 34 56 78"></label>
      <label>Le lien expire dans<select class="ev_duree"><option value="48">48 heures</option><option value="72">72 heures</option><option value="168" selected>7 jours</option></select></label></div>
    <div class="actions"><button class="btn mini" data-a="evalLienCreer" data-p="${esc(k)}">📱 Créer le lien et l’envoyer par SMS</button></div>
    <p class="doux">Le tuteur reçoit la grille (avec ce qui est déjà rempli), la complète, puis signe et ajoute le cachet. Elle revient ici ; vous pouvez ensuite l’ajuster et la valider.</p></details>`;
  return `<div class="lien-tuteur ev-attente" data-e="${e.id}" data-p="${esc(k)}"><p>⏳ <b>En attente du tuteur</b> · lien valable jusqu’au ${fmtDT(x.expire)}</p>
    <div class="actions"><a class="btn mini sec" href="sms:${esc((x.tel || '').replace(/[^\d+]/g, ''))}?&body=${encodeURIComponent(texteSmsEval(e, x))}">📱 Renvoyer le SMS</a>
      <button class="btn mini sec" data-a="evalLienCopier" data-p="${esc(k)}">📋 Copier le lien</button><button class="btn mini" data-a="evalLienVerifier" data-p="${esc(k)}">🔄 Vérifier</button>
      <button class="lien petit" style="display:inline" data-a="evalLienAnnuler" data-p="${esc(k)}">Annuler le lien</button></div></div>`;
}
A.evalLienCreer = async el => {
  const e = eleveOuvert(), k = el.dataset.p, z = el.closest('.att-prof'), tel = z.querySelector('.ev_tel').value.trim(), heures = +z.querySelector('.ev_duree').value || 168;
  if (tel && !/^[\d\s+.()-]{8,20}$/.test(tel)) throw new Error('Numéro de téléphone invalide.');
  const d = e.d, p = periodesEleve(d).find(x => cleP(x) === k) || {}, dem = demandeDePeriode(d, k), info = infosPdfEval(e, k, copieEval(evalsDe(d)[k]));
  toast('Préparation du lien…');
  const cle = CONV.nouvelleCle();
  const chiffre = await CONV.chiffrer({ evalE3: { ev: info.ev, numero: info.numero, debut: p.debut, fin: p.fin, session: info.session }, eleve: nomEleve(e), eleveInfo: info.eleve, classe: info.eleve.classe, entreprise: info.entreprise }, cle);
  const r = await api('POST', '/api/protosig/creer', { chiffre, heures, eleveId: e.id, entrepriseId: (dem && dem.entrepriseId) || undefined });
  const x = { id: r.id, cle, expire: r.expire, tel };
  memoriserLienEval(e.id, k, x); render();
  location.href = `sms:${tel.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(texteSmsEval(e, x))}`;
};
A.evalLienCopier = async el => { const e = eleveOuvert(), x = lienEval(e.id, el.dataset.p); if (!x) return; try { await navigator.clipboard.writeText(urlLienTuteur(x)); toast('Lien copié'); } catch { prompt('Copiez ce lien :', urlLienTuteur(x)); } };
A.evalLienAnnuler = async el => {
  const e = eleveOuvert(), k = el.dataset.p, x = lienEval(e.id, k); if (!x || !confirm('Annuler ce lien ? Le tuteur ne pourra plus remplir la grille avec.')) return;
  try { await api('POST', '/api/protosig/supprimer', { id: x.id }); } catch { /* */ }
  memoriserLienEval(e.id, k, null); render(); toast('Lien annulé');
};
async function verifierLienEval(eleveId, k, silencieux) {
  const x = lienEval(eleveId, k); if (!x) return;
  let r;
  try { r = await api('POST', '/api/protosig/etat', { id: x.id }); }
  catch (er) { if (/expir|introuvable/i.test(er.message)) { memoriserLienEval(eleveId, k, null); render(); } if (!silencieux) throw er; return; }
  if (!r.signe) { if (!silencieux) toast('Le tuteur n’a pas encore signé.'); return; }
  const s = await CONV.dechiffrer(r.sig, x.cle);
  await mutProf(eleveId, p => { p.evaluations = p.evaluations || {}; const ev = copieEval(s.ev);
    ev.tuteur = { nom: s.nom, fonction: s.fonction, date: s.date, img: s.img, cachet: s.cachet || '' }; ev.majLe = maintenant(); ev.valide = null; p.evaluations[k] = ev; });
  try { await api('POST', '/api/protosig/supprimer', { id: x.id }); } catch { /* */ }
  memoriserLienEval(eleveId, k, null); render(); toast('✅ Le tuteur a complété et signé la grille d’évaluation');
}
A.evalLienVerifier = el => verifierLienEval(eleveOuvert().id, el.dataset.p, false);
setInterval(() => { if (document.hidden) return; for (const z of document.querySelectorAll('.ev-attente')) verifierLienEval(z.dataset.e, z.dataset.p, true).catch(() => {}); }, 30000);

/* ---------- Élève : sa note d'évaluation (une fois validée par le professeur) ---------- */
function blocEvalEleve(d, k) {
  const ev = evalsDe(d)[k];
  if (!ev || !ev.valide) return '<p>⬜ Pas encore évaluée par ton professeur et ton tuteur.</p>';
  const r = noteEval(ev);
  return `<p class="note-finale">✅ Note : <b>${r.n ? fmtN(r.sur20) + ' / 20' : 'non évaluée'}</b> <span class="petit doux">(${r.n} compétence(s) évaluée(s))</span></p>
    ${ev.synthese ? `<div class="correction">💬 ${esc(ev.synthese)}</div>` : ''}
    <div class="actions"><button class="btn sec" data-a="evalPdfEleve" data-p="${esc(k)}">⬇️ Ma fiche d’évaluation</button></div>`;
}
A.evalPdfEleve = async el => {
  const d = S.el, k = el.dataset.p, ev = evalsDe(d)[k], id = identiteAtt(d), p = periodesEleve(d).find(x => cleP(x) === k) || {}, dem = demandeDePeriode(d, k);
  ouvrirPdf(await fabriquerPdfEvaluation({ ev, eleve: { nom: id.nom || d.profil.nom, prenom: d.profil.prenom, classe: id.classe }, numero: String(periodesEleve(d).indexOf(p) + 1), debut: p.debut, fin: p.fin, session: (p.fin || '').slice(0, 4),
    entreprise: dem ? dem.nom : '', tuteur: ev.tuteur || null, prof: { nom: ev.valide.par, date: ev.visite, valide: ev.valide.date } }), `Evaluation de stage ${d.profil.prenom}.pdf`);
};
