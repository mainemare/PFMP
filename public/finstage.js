'use strict';
/* Parcours de stage en trois temps (avant / pendant / fin) et page « Fin de stage » :
 * bilan d'évaluation (journal de bord, portfolio) et attestation de présence (PDF pré-rempli à faire signer
 * par l'entreprise, puis dépôt de l'attestation signée : photo ou PDF, rangée dans le dossier privé du Drive). */
const PHASES = [
  { id: 'avant', n: 1, titre: 'Avant le stage', sous: 'Trouver mon stage', ic: '🔎', c: '#2563eb',
    vues: [['cv', '📄 CV'], ['lettre', '✉️ Lettre'], ['profil', '👤 Mon profil'], ['memento', '📝 Memento'], ['entreprises', '🏢 Entreprises'], ['offres', '📢 Offres de stage'], ['suivi', '📞 Mes appels'], ['protocole', '🤝 Protocole']] },
  { id: 'pendant', n: 2, titre: 'Pendant le stage', sous: 'Garder une trace', ic: '🛠️', c: '#0d9488',
    vues: [['bord', '📓 Journal de bord'], ['portfolio', '🗂️ Portfolio']] },
  { id: 'fin', n: 3, titre: 'Fin du stage', sous: 'Évaluation et attestation', ic: '🏁', c: '#7c3aed',
    vues: [['fin', '🏁 Évaluation et attestation']] },
];
function phaseEleve(d) {
  const dt = datesEleve(d);
  if (!dt || today() < dt.debut) return 'avant';
  return today() <= dt.fin ? 'pendant' : 'fin';
}
const phaseDeVue = v => (PHASES.find(p => p.vues.some(([x]) => x === v)) || {}).id;

/* ---------- Menu élève groupé par étape ---------- */
function navEleve(d, pastilles) {
  const ici = phaseEleve(d), bouton = ([v, l]) => {
    const n = pastilles[v];
    return `<button data-a="aller" data-v="${v}" class="${S.vue === v ? 'actif' : ''}">${l}${n ? `<span class="pastille">${n}</span>` : ''}</button>`;
  };
  return bouton(['accueil', '🏠 Accueil']) + PHASES.map(p => `<div class="nav-groupe ${p.id === ici ? 'ici' : ''}" style="--ph:${p.c}" role="group" aria-label="${p.titre}">
    <span class="nav-etape">${p.n} · ${p.titre}</span>${p.vues.map(bouton).join('')}</div>`).join('');
}

/* ---------- Avancement de chaque rubrique (barres de progression) ---------- */
function avDepot(doc, quoi) {
  if (!doc) return [0, 'à déposer'];
  if (doc.valide) return [100, 'validé par ton professeur'];
  if (doc.fichierLe) return nbAnnotations(doc) && !doc.aRelire ? [70, 'annoté : corrige et redépose'] : [60, 'déposé, en attente de relecture'];
  return doc.deposeLe ? [30, 'à déposer en PDF ici'] : [0, quoi];
}
const AVANCEMENT = {
  cv: d => avDepot(d.cv, 'à rédiger puis déposer'),
  lettre: d => avDepot(d.lettre, 'à rédiger puis déposer'),
  profil: d => { const n = d.profil.residences.filter(r => r.lat != null).length;
    return [Math.min(100, 34 + 33 * n), n ? `${n} commune(s) de résidence${n < 2 ? ' : ajoutes-en une 2e' : ''}` : 'indique tes communes de résidence']; },
  memento: d => { const m = d.memento; if (m.valide) return [100, 'validé par ton professeur'];
    const n = CHAMPS.memento.filter(([k]) => String(m[k] || '').trim()).length; return [Math.round(n / CHAMPS.memento.length * 90), `${n}/${CHAMPS.memento.length} parties remplies`]; },
  entreprises: d => { const n = demandesP(d).length; return [Math.min(100, Math.round(n / SEUIL_ACTIVE * 100)), `${n} entreprise(s) sélectionnée(s) · objectif ${SEUIL_ACTIVE}`]; },
  suivi: d => { if (niveau(d) >= 3) return [100, NIV[niveau(d)].l]; const n = nbContactees(d);
    return [Math.min(95, Math.round(n / SEUIL_TRES_ACTIVE * 100)), `${n} entreprise(s) contactée(s) · objectif ${SEUIL_TRES_ACTIVE}`]; },
  protocole: d => { const n = niveau(d), l = demandesP(d);
    if (n >= 4) return [100, n >= 5 ? 'convention signée' : 'protocole signé'];
    if (l.some(x => x.protocole && x.protocole.soumisLe)) return [75, 'envoyé au professeur référent'];
    if (l.some(x => x.protocole)) return [40, 'commencé'];
    return n === 3 ? [15, 'rendez-vous obtenu : prépare-le'] : [0, 'après un rendez-vous']; },
  bord: d => { const b = bilanBord(d); return b.passes ? [Math.round(b.complets / b.passes * 100), `${b.complets}/${b.passes} jour(s) remplis`] : [0, 'dès le 1er jour du stage']; },
  portfolio: d => { const ev = d.prof.portfolio; if (ev && ev.valide) return [100, `noté ${fmtNote(ev.total)}/20`];
    const p = d.portfolio || {}; if (!Object.keys(p).length) return [0, 'à rédiger'];
    const s = totalPf(noteAutoPf(p)); return [Math.min(95, Math.round(s / 20 * 100)), `note indicative ${fmtNote(s)}/20`]; },
  fin: d => { const k = periodeFin(d), a = attP(d, k); return a.valide ? [100, 'attestation validée'] : a.fichierLe ? [80, 'attestation signée'] : lienAtt(k) ? [40, 'en attente de la signature'] : [0, 'attestation à faire signer']; },
};
const coulAv = p => p >= 100 ? '#16a34a' : p >= 60 ? '#0d9488' : p >= 30 ? '#ca8a04' : p > 0 ? '#ea580c' : '#cbd5e1';
function barresPhase(d, p, ici) {
  const lignes = p.vues.filter(([v]) => AVANCEMENT[v]).map(([v, l]) => [v, l, ...AVANCEMENT[v](d)]);
  const moy = lignes.length ? Math.round(lignes.reduce((s, x) => s + x[2], 0) / lignes.length) : 0;
  return { moy, html: `<div class="barres">${p.vues.map(([v, l]) => { const a = AVANCEMENT[v];
    if (!a) return `<button class="barre-ligne sans" data-a="aller" data-v="${v}"><span class="barre-nom">${l}</span><span class="petit doux">à consulter</span></button>`;
    const [pc, txt] = a(d);
    return `<button class="barre-ligne" data-a="aller" data-v="${v}" title="${esc(txt)}"><span class="barre-nom">${l}</span>
      <span class="barre-fond" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(l.replace(/^\S+\s/, ''))}"><span style="width:${pc}%;background:${coulAv(pc)}"></span></span>
      <b class="barre-pc">${pc} %</b><span class="barre-txt petit doux">${esc(txt)}</span></button>`; }).join('')}</div>` };
}

/* ---------- Accueil : « Mon parcours » ---------- */
function bilanBord(d) {
  const jours = joursBord(d).filter(j => j <= today()), complets = jours.filter(j => ['complet', 'absent'].includes(etatJour(d, j))).length;
  return { total: joursBord(d).length, passes: jours.length, complets };
}
function blocParcours(d) {
  const ici = phaseEleve(d), n = niveau(d);
  const etat = {
    avant: n >= 5 ? '✅ Convention signée' : `Niveau ${n} : ${NIV[n].l}`,
    pendant: 'Avancement',
    fin: 'Avancement',
  };
  return `<section class="carte parcours"><h2>Mon parcours de stage</h2><div class="parcours-etapes">${PHASES.map(p => `
    <div class="parcours-etape ${p.id === ici ? 'ici' : ''}" style="--ph:${p.c}">
      <div class="parcours-tete"><span class="parcours-num">${p.n}</span><div><b>${p.ic} ${p.titre}</b><div class="petit">${p.sous}</div></div>${p.id === ici ? '<span class="parcours-ici">📍 Tu es ici</span>' : ''}</div>
      <p class="petit parcours-etat">${etat[p.id]} · <b>${barresPhase(d, p).moy} %</b></p>
      ${barresPhase(d, p).html}
    </div>`).join('')}</div></section>`;
}

/* ---------- Attestation de stage (Annexe 3) : une par période ----------
 * Pré-remplie par l'application (demande et protocole de la période, fichier des entreprises, dates de la classe,
 * jours non travaillés du journal de bord), corrigeable par le professeur, complétée et signée par l'entreprise
 * avec un lien à durée limitée (même mécanisme chiffré que le protocole). Le nom de famille et la date de naissance
 * de l'élève restent sur son appareil ; l'attestation signée (PDF) est rangée dans le dossier privé du Drive. */
const villeDe = a => { const m = /\b\d{5}\s+(.+)$/.exec(String(a || '').trim()); return m ? m[1].replace(/\s*\bcedex\b.*$/i, '').trim() : ''; };
const JOURS_SEM = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function joursEffectifs(d, debut, fin, js) {
  let n = 0;
  const avecJours = js && Object.values(js).some(Boolean);
  for (let x = new Date(debut + 'T12:00:00'); isoJour(x) <= fin; x.setDate(x.getDate() + 1)) {
    const travaille = avecJours ? !!js[JOURS_SEM[x.getDay()]] : x.getDay() >= 1 && x.getDay() <= 5, e = ((d.bord && d.bord.jours) || {})[isoJour(x)];
    if (travaille && !(e && e.absent)) n++;
  }
  return n;
}
// Période affichée sur la page « Fin du stage » : celle choisie, sinon la dernière commencée.
function periodeFin(d) {
  const ps = periodesEleve(d);
  if (S.periodeFinVue && ps.some(p => cleP(p) === S.periodeFinVue)) return S.periodeFinVue;
  const commencees = ps.filter(p => p.debut <= today());
  const p = commencees[commencees.length - 1] || ps[0];
  return p ? cleP(p) : '';
}
const attP = (d, k) => ((d.attestation && d.attestation.periodes) || {})[k] || {};
function demandeDePeriode(d, k) { const l = demandesP(d, k); return l.find(x => x.statut === 'convention') || l.find(x => x.statut === 'protocole') || null; }
function attDefaut(d, k) {
  const ps = periodesEleve(d), p = ps.find(x => cleP(x) === k) || {}, dem = demandeDePeriode(d, k);
  const base = (dem && S.entreprises.find(e => e.id === dem.entrepriseId)) || {}, bp = base.protocole || {}, pr = (dem && dem.protocole) || {}, pe = pr.ent || {};
  const o = k && k === periodeActive(d) && d.prof.dates && d.prof.dates.debut ? d.prof.dates : p;
  const adresse = pe.adresse || (dem && dem.adresse) || bp.adresse || base.adresse || '';
  const r = { entreprise: pe.entreprise || (dem && dem.nom) || '', adresse, siret: pe.siret || bp.siret || '', representant: pe.signataire || bp.signataire || '', fonction: pe.fonctionSignataire || bp.fonctionSignataire || '',
    numero: ps.indexOf(p) >= 0 ? String(ps.indexOf(p) + 1) : '', debut: o.debut || '', fin: o.fin || o.debut || '', jours: '', gratification: '', faitA: villeDe(adresse), faitLe: o.fin || '' };
  if (r.debut) r.jours = String(joursEffectifs(d, r.debut, r.fin, pr.jours));
  return r;
}
// Les corrections du professeur, puis les réponses de l'entreprise, passent devant le pré-remplissage.
function attDonnees(d, k) {
  const r = attDefaut(d, k), sauve = attP(d, k).donnees || {};
  for (const [c, v] of Object.entries(sauve)) if (v != null && String(v).trim() !== '') r[c] = String(v);
  return r;
}
function etabAtt() {
  const t = Object.assign({}, CONV.ETAB_DEFAUT, typeof etabCourant === 'function' ? etabCourant() : {});
  return { nom: String(t.nom || '').toUpperCase(), adresse: String(t.adressePostale || t.adresse || '').split('\n').map(s => s.trim()).filter(Boolean).join(' - '), chef: t.chef || '' };
}
function identiteAtt(d) { const i = identiteCV(), cl = classeEleve(d) || {}; return { nom: i.nom || '', prenom: d.profil.prenom || i.prenom || '', naissance: i.naissance || '', classe: cl.nom || '' }; }
function lireIdentiteAtt() {
  const nom = $('#att_nom') ? val('att_nom') : null, naissance = $('#att_naissance') ? val('att_naissance') : null;
  try { const i = identiteCV(); if (nom != null) i.nom = nom; if (naissance != null) i.naissance = naissance; localStorage.setItem(cleIdentite(), JSON.stringify(i)); } catch { /* stockage indisponible */ }
  return identiteAtt(S.el);
}
function etatAttestation(d) {
  const k = periodeFin(d), a = attP(d, k);
  return a.valide ? ['✅', 'Attestation validée'] : a.fichierLe ? ['🟣', 'Attestation signée, en attente de validation'] : lienAtt(k) ? ['⏳', 'En attente de la signature de l’entreprise'] : ['⬜', 'Attestation à faire signer'];
}

/* ---------- Page « Fin du stage » ---------- */
function vueFinStage() {
  const d = S.el, k = periodeFin(d), p = periodesEleve(d).find(x => cleP(x) === k), b = bilanBord(d), ev = d.prof.portfolio;
  const pf = d.portfolio || {}, pfCommence = Object.keys(pf).length > 0, auto = pfCommence ? totalPf(noteAutoPf(pf)) : 0, fini = p && (p.fin || p.debut) < today();
  return `<div class="bandeau-phase" style="--ph:#7c3aed"><span>3</span><div><b>🏁 Fin du stage</b><br>Évaluation et attestation de stage</div></div>
  ${ongletsPeriodes(d, k, 'voirPeriodeFin')}
  ${p && !fini ? `<div class="alerte info">Ce stage se termine le <b>${fmt(p.fin)}</b>. L’entreprise doit compléter et signer ton attestation <b>le dernier jour</b> : prépare le lien dès maintenant.</div>` : ''}
  <div class="grille">
  <section class="carte"><h2>📊 Mon évaluation</h2>
    <h3>📓 Journal de bord</h3>
    ${b.total ? `<p><b>${b.complets}</b> jour(s) complet(s) sur <b>${b.passes}</b> jour(s) passé(s)${b.passes < b.total ? ` (${b.total} jours de stage prévus)` : ''}.</p>
      ${nbBordEnRetard(d) ? `<p class="petit">⚠️ ${nbBordEnRetard(d)} jour(s) encore à compléter. <button class="lien" style="display:inline" data-a="aller" data-v="bord">Compléter</button></p>` : ''}`
      : '<p class="doux">Rien à afficher pour le moment.</p>'}
    <h3>🗂️ Portfolio (compte rendu d’activité)</h3>
    ${ev && ev.valide ? `<p class="note-finale">✅ Note de ton professeur : <b>${fmtNote(ev.total)} / 20</b></p>${ev.general ? `<div class="correction">💬 ${esc(ev.general)}</div>` : ''}`
      : pfCommence ? `<p>Note indicative : <b>${fmtNote(auto)} / 20</b> <span class="petit doux">(calcul automatique, en attente de la note de ton professeur)</span></p>`
      : '<p>⬜ Pas encore commencé.</p>'}
    <div class="actions"><button class="btn sec" data-a="aller" data-v="portfolio">Ouvrir mon portfolio</button></div>
  </section>
  ${blocAttestation(d, k)}</div>`;
}
A.voirPeriodeFin = el => { S.periodeFinVue = el.dataset.p; render(); };

function blocAttestation(d, k) {
  if (!k) return '<section class="carte"><h2>📝 Attestation de stage</h2><p class="doux">Les dates de stage de ta classe ne sont pas encore fixées.</p></section>';
  const a = attP(d, k), at = attDonnees(d, k), id = identiteAtt(d), sg = a.signature;
  const ligne = (l, v) => `<tr><th>${l}</th><td>${v ? esc(v) : '<span class="doux">à compléter par l’entreprise</span>'}</td></tr>`;
  return `<section class="carte"><h2>📝 Attestation de stage</h2>
    <p class="petit doux">Obligatoire : complétée et signée par l’entreprise le dernier jour, elle prouve les jours effectués et permet le versement de l’allocation de stage de l’État.</p>
    ${a.fichierLe ? `<div class="fichier-depose"><span class="icone-pdf" aria-hidden="true">PDF</span><div><b>Attestation signée</b>${sg ? ` par ${esc(sg.nom)}${sg.fonction ? ` (${esc(sg.fonction)})` : ''}` : ''} le ${fmtDT(sg ? sg.date : a.fichierLe)}
        <br>${a.valide ? '✅ Validée par ton professeur.' : '🟣 En attente de vérification par ton professeur.'}</div></div>${blocCorrection(a)}
      <div class="actions"><button class="btn sec" data-a="voirFichier" data-t="attestation" data-p="${esc(k)}">👁️ Voir l’attestation signée</button></div>` : ''}
    <h3>Pré-remplie par l’application</h3>
    <div class="table-scroll"><table class="att-resume">${ligne('Entreprise', at.entreprise)}${ligne('Adresse', at.adresse)}${ligne('N° SIRET', at.siret)}${ligne('Représentée par', [at.representant, at.fonction].filter(Boolean).join(', '))}
      ${ligne('Période', at.debut ? `n° ${at.numero || '…'} du ${dateAtt(at.debut)} au ${dateAtt(at.fin)}` : '')}${ligne('Durée effective', at.jours ? `${at.jours} jours` : '')}</table></div>
    <p class="doux petit">Ton professeur peut corriger ces informations ; l’entreprise les vérifie et les complète avant de signer.</p>
    <div class="deux"><label>Ton nom de famille <span class="doux petit">(gardé sur cet appareil)</span><input id="att_nom" value="${esc(id.nom)}" autocomplete="family-name"></label>
      <label>Ta date de naissance <span class="doux petit">(gardée sur cet appareil)</span><input id="att_naissance" type="date" value="${esc(id.naissance)}"></label></div>
    <div class="actions"><button class="btn sec" data-a="attApercu" data-p="${esc(k)}">👁️ Aperçu de l’attestation</button></div>
    <h3>📱 Faire signer l’entreprise</h3>${blocLienAtt(k)}
    <details class="petit" style="margin-top:12px"><summary>Signée sur papier ? Dépose une photo ou un PDF</summary>
      <label class="btn sec depot-fichier" style="margin-top:8px">📷 Photo ou PDF de l’attestation signée<input type="file" accept="image/*,application/pdf,.pdf" data-c="deposerAttestation" data-p="${esc(k)}"></label></details>
    <p class="doux petit">🔒 L’attestation signée est rangée dans le dossier privé de l’application, visible seulement par tes professeurs.</p></section>`;
}

/* Lien de signature pour l'entreprise (lien et clé gardés sur cet appareil le temps de récupérer la signature) */
const cleLienAtt = k => 'attsig_' + (S.user && S.user.id) + '_' + k;
function lienAtt(k) { try { const x = JSON.parse(localStorage.getItem(cleLienAtt(k)) || 'null'); return x && new Date(x.expire) > new Date() ? x : null; } catch { return null; } }
function memoriserLienAtt(k, x) { try { if (x) localStorage.setItem(cleLienAtt(k), JSON.stringify(x)); else localStorage.removeItem(cleLienAtt(k)); } catch { /* stockage indisponible */ } }
const texteSmsAtt = x => `Bonjour, voici l’attestation de stage de ${S.el.profil.prenom} (lycée Raymond Queneau, Yvetot) à vérifier et à signer avant le ${fmtDT(x.expire)}. Merci !\n${urlLienTuteur(x)}`;
function blocLienAtt(k) {
  const x = lienAtt(k);
  if (!x) return `<p class="petit">Le dernier jour, envoie un lien par SMS à ton tuteur : sur son téléphone, l’entreprise vérifie l’attestation, indique le nombre de jours effectués, signe avec le doigt et peut ajouter la photo de son tampon. L’attestation signée revient ici et chez ton professeur.</p>
    <div class="deux"><label>Téléphone portable du tuteur <span class="doux petit">(n’est pas enregistré)</span><input id="att_tel" type="tel" placeholder="06 12 34 56 78"></label>
      <label>Le lien expire dans<select id="att_duree"><option value="24">24 heures</option><option value="48" selected>48 heures</option><option value="72">72 heures</option></select></label></div>
    <div class="actions"><button type="button" class="btn" data-a="attLienCreer" data-p="${esc(k)}">📱 Créer le lien et l’envoyer par SMS</button></div>`;
  return `<div class="lien-tuteur" id="attSigAttente" data-p="${esc(k)}"><p>⏳ <b>En attente de la signature de l’entreprise</b> · lien valable jusqu’au ${fmtDT(x.expire)}</p>
    <div class="actions"><a class="btn sec" href="sms:${esc((x.tel || '').replace(/[^\d+]/g, ''))}?&body=${encodeURIComponent(texteSmsAtt(x))}">📱 Renvoyer le SMS</a>
      <button type="button" class="btn sec" data-a="attLienCopier" data-p="${esc(k)}">📋 Copier le lien</button><button type="button" class="btn" data-a="attLienVerifier" data-p="${esc(k)}">🔄 Vérifier si c’est signé</button>
      <button type="button" class="lien petit" style="display:inline" data-a="attLienAnnuler" data-p="${esc(k)}">Annuler le lien</button></div>
    <p class="doux petit">La page vérifie toute seule toutes les 20 secondes.</p></div>`;
}
A.attApercu = async el => {
  const k = el.dataset.p, id = lireIdentiteAtt();
  ouvrirPdf(await fabriquerPdfAttestation(Object.assign(attDonnees(S.el, k), { eleve: id, etab: etabAtt() })), `Attestation de stage ${S.el.profil.prenom}.pdf`);
};
A.attLienCreer = async el => {
  const k = el.dataset.p, d = S.el, id = lireIdentiteAtt(), tel = val('att_tel'), heures = +val('att_duree') || 48;
  if (!id.nom) throw new Error('Indique ton nom de famille : il est écrit sur l’attestation.');
  if (tel && !/^[\d\s+.()-]{8,20}$/.test(tel)) throw new Error('Numéro de téléphone invalide.');
  toast('Préparation du lien…');
  const cle = CONV.nouvelleCle(), att = attDonnees(d, k), dem = demandeDePeriode(d, k);
  const chiffre = await CONV.chiffrer({ att, ident: id, etab: etabAtt(), eleve: `${id.prenom} ${id.nom.toUpperCase()}`.trim(), classe: id.classe, entreprise: att.entreprise }, cle);
  const r = await api('POST', '/api/protosig/creer', { chiffre, heures, entrepriseId: (dem && dem.entrepriseId) || undefined });
  const x = { id: r.id, cle, expire: r.expire, tel, ident: id };
  memoriserLienAtt(k, x); journal(`Attestation de stage envoyée à l’entreprise pour signature (${att.entreprise || 'entreprise'})`); render();
  location.href = `sms:${tel.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(texteSmsAtt(x))}`;
};
A.attLienCopier = async el => {
  const x = lienAtt(el.dataset.p); if (!x) return;
  try { await navigator.clipboard.writeText(urlLienTuteur(x)); toast('Lien copié : colle-le dans un SMS ou un e-mail au tuteur'); } catch { prompt('Copie ce lien :', urlLienTuteur(x)); }
};
A.attLienAnnuler = async el => {
  const k = el.dataset.p, x = lienAtt(k); if (!x || !confirm('Annuler ce lien ? L’entreprise ne pourra plus signer avec.')) return;
  try { await api('POST', '/api/protosig/supprimer', { id: x.id }); } catch { /* déjà expiré */ }
  memoriserLienAtt(k, null); render(); toast('Lien annulé');
};
// Signature reçue : l'attestation signée est fabriquée sur cet appareil (avec le nom de l'élève) puis déposée pour le professeur.
async function verifierLienAtt(k, silencieux) {
  const x = lienAtt(k); if (!x) return;
  let r;
  try { r = await api('POST', '/api/protosig/etat', { id: x.id }); }
  catch (e) { if (/expir|introuvable/i.test(e.message)) { memoriserLienAtt(k, null); render(); } if (!silencieux) throw e; return; }
  if (!r.signe) { if (!silencieux) toast('Pas encore signé.'); return; }
  const s = await CONV.dechiffrer(r.sig, x.cle), donnees = Object.assign(attDonnees(S.el, k), s.att || {});
  const pdf = new Uint8Array(await fabriquerPdfAttestation(Object.assign({}, donnees, { eleve: x.ident || identiteAtt(S.el), etab: etabAtt(), sig: { img: s.img, cachet: s.cachet, nom: s.nom, fonction: s.fonction, date: s.date } })));
  S.el.attestation = Object.assign(DEF.attestation(), await api('POST', '/api/fichier/deposer', { type: 'attestation', periode: k, pdf: enBase64(pdf) }));
  const per = S.el.attestation.periodes = S.el.attestation.periodes || {};
  per[k] = Object.assign(per[k] || {}, { donnees: s.att || {}, signature: { nom: s.nom, fonction: s.fonction, date: s.date, mode: 'lien' } });
  await sauver('attestation');
  try { await api('POST', '/api/protosig/supprimer', { id: x.id }); } catch { /* */ }
  memoriserLienAtt(k, null); journal('Attestation de stage complétée et signée à distance par l’entreprise'); render();
  toast('✅ L’entreprise a signé : ton attestation est transmise à ton professeur');
}
A.attLienVerifier = el => verifierLienAtt(el.dataset.p, false);
setInterval(() => { const z = document.getElementById('attSigAttente'); if (z && !document.hidden) verifierLienAtt(z.dataset.p, true).catch(() => {}); }, 20000);

/* Attestation signée sur papier : une photo est mise en page dans un PDF (A4) avant l'envoi. */
async function imageVersPdf(fichier) {
  const url = URL.createObjectURL(fichier), img = new Image();
  try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('Image illisible : reprends la photo.')); img.src = url; }); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  const r = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  const L = await chargerPdfLib(), doc = await L.PDFDocument.create(), jpg = await doc.embedJpg(await (await fetch(c.toDataURL('image/jpeg', 0.82))).arrayBuffer());
  const [W, H] = jpg.width > jpg.height ? [841.89, 595.28] : [595.28, 841.89], s = Math.min((W - 40) / jpg.width, (H - 40) / jpg.height);
  doc.addPage([W, H]).drawImage(jpg, { x: (W - jpg.width * s) / 2, y: (H - jpg.height * s) / 2, width: jpg.width * s, height: jpg.height * s });
  return new Uint8Array(await doc.save());
}
C.deposerAttestation = async el => {
  const f = el.files[0], k = el.dataset.p; el.value = '';
  if (!f) return;
  toast('Préparation du document…');
  const o = /^image\//.test(f.type) ? await imageVersPdf(f) : new Uint8Array(await f.arrayBuffer());
  if (String.fromCharCode(...o.subarray(0, 5)) !== '%PDF-') throw new Error('Choisis une photo ou un fichier PDF.');
  if (o.length > MAX_PDF) throw new Error(`Fichier trop lourd (${tailleLisible(o.length)}) : 4 Mo maximum.`);
  toast('Envoi de l’attestation…');
  S.el.attestation = Object.assign(DEF.attestation(), await api('POST', '/api/fichier/deposer', { type: 'attestation', periode: k, pdf: enBase64(o) }));
  journal('Attestation de stage signée déposée (papier)'); render(); toast('Attestation déposée : ton professeur est prévenu');
};

/* ---------- Professeur : attestation de chaque période (correction, consultation, validation) ---------- */
const zoneAtt = k => [...document.querySelectorAll('.att-prof')].find(z => z.dataset.k === k);
async function mutAttestation(eleveId, k, fn) {
  const cle = `eleve/${eleveId}/attestation`, doc = Object.assign(DEF.attestation(), (await getDoc(cle)) || {});
  doc.periodes = doc.periodes || {}; doc.periodes[k] = doc.periodes[k] || {}; fn(doc.periodes[k]);
  await putDoc(cle, doc); return doc;
}
function dosAttestation(e) {
  const d = e.d, ps = periodesEleve(d);
  if (!ps.length) return '<p class="doux">Les dates de stage de la classe ne sont pas encore fixées.</p>';
  return `<p class="doux">Une attestation par période (modèle Annexe 3), pré-remplie par l’application. Corrigez-la si besoin <b>avant</b> que l’élève envoie le lien de signature à l’entreprise : l’entreprise la vérifie, la complète et la signe. Le nom de famille et la date de naissance de l’élève ne sont pas enregistrés par l’application : ils sont ajoutés sur l’appareil de l’élève.</p>`
    + ps.map(p => {
      const k = cleP(p), a = attP(d, k), at = attDonnees(d, k), sg = a.signature;
      return `<div class="att-prof" data-k="${esc(k)}"><h3>📅 ${esc(p.label || 'Stage')} <span class="petit doux">${fmt(p.debut)} → ${fmt(p.fin)}</span></h3>
        <p>${a.fichierLe ? `✅ Signée${sg ? ` par <b>${esc(sg.nom)}</b>${sg.fonction ? ` (${esc(sg.fonction)})` : ''} le ${fmtDT(sg.date)}` : ` (document déposé le ${fmtDT(a.fichierLe)})`}
          <button class="btn mini" data-a="voirAttProf" data-p="${esc(k)}">👁️ Voir l’attestation signée</button>` : '⬜ Pas encore signée.'}</p>
        <details ${a.fichierLe ? '' : 'open'}><summary><b>Informations de l’attestation</b>${a.majProf ? ` <span class="petit doux">(corrigées par ${esc(a.majProf.par)} le ${fmtDT(a.majProf.date)})</span>` : ''}</summary>
          <div class="deux">${[...CHAMPS_ATT_ENT, ...CHAMPS_ATT_PERIODE].map(([c, l, type]) => `<label>${esc(l)}<input class="att_c" data-champ="${c}" ${type === 'date' ? 'type="date"' : type === 'number' ? 'type="number" min="0"' : ''} value="${esc(at[c] || '')}"></label>`).join('')}</div>
          <div class="actions"><button class="btn mini" data-a="attSauverProf" data-p="${esc(k)}">Enregistrer les informations</button><button class="btn mini sec" data-a="attApercuProf" data-p="${esc(k)}">👁️ Aperçu</button></div></details>
        ${blocCorrection(a)}
        <label>Commentaire pour l’élève<textarea class="att_com" rows="2">${esc(a.correction ? a.correction.commentaire : '')}</textarea></label>
        <label><input type="checkbox" class="att_valide" ${a.valide ? 'checked' : ''}>Attestation vérifiée et validée</label>
        <button class="btn mini" data-a="attValiderProf" data-p="${esc(k)}">Enregistrer</button></div>`;
    }).join('');
}
A.attSauverProf = async el => {
  const e = eleveOuvert(), k = el.dataset.p, z = zoneAtt(k), def = attDefaut(e.d, k);
  // Seules les valeurs différentes du pré-remplissage sont gardées : le reste suit les données de l'application.
  const v = Object.fromEntries([...z.querySelectorAll('.att_c')].map(i => [i.dataset.champ, i.value.trim()]).filter(([c, x]) => x !== (def[c] || '')));
  e.d.attestation = await mutAttestation(e.id, k, pa => { pa.donnees = v; pa.majProf = { par: nomComplet(S.user), date: maintenant() }; });
  render(); toast('Attestation mise à jour');
};
A.attApercuProf = async el => {
  const e = eleveOuvert(), k = el.dataset.p;
  ouvrirPdf(await fabriquerPdfAttestation(Object.assign(attDonnees(e.d, k), { eleve: { prenom: e.d.profil.prenom, nom: e.d.profil.nom, classe: (classeEleve(e.d) || {}).nom || '' }, etab: etabAtt() })), `Attestation ${nomEleve(e)}.pdf`);
};
A.attValiderProf = async el => {
  const e = eleveOuvert(), k = el.dataset.p, z = zoneAtt(k);
  e.d.attestation = await mutAttestation(e.id, k, pa => { pa.correction = { par: nomComplet(S.user), date: maintenant(), commentaire: z.querySelector('.att_com').value.trim() }; pa.valide = z.querySelector('.att_valide').checked; pa.aRelire = false; });
  render(); toast('Enregistré');
};
A.voirAttProf = el => { const e = eleveOuvert(); return ouvrirVisionneuse({ eleveId: e.id, type: 'attestation', periode: el.dataset.p, prof: false, titre: `Attestation de stage de ${nomEleve(e)}` }); };
