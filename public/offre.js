'use strict';
/* ===== Page publique : une entreprise propose une offre de stage (PFMP) =====
 * Le lien contient un code (après « # ») donné par le lycée. L'offre n'est montrée aux élèves
 * qu'après vérification par un professeur ou le DDFPT. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = (window.STAGES_API || '').trim();
const code = (new URLSearchParams(location.hash.slice(1))).get('k') || '';
const ERREURS = { lien_offre: 'Ce lien n’est plus valable : demandez un nouveau lien au lycée.', offre_incomplete: 'Merci de remplir les champs obligatoires (*) et d’indiquer un téléphone ou un e-mail.',
  trop_essais: 'Trop d’offres envoyées en peu de temps : réessayez dans un quart d’heure.', trop_de_propositions: 'Le lycée a déjà beaucoup d’offres à vérifier : réessayez dans quelques jours.', offre_indisponible: 'Le dépôt d’offres n’est pas disponible sur ce serveur.' };

async function api(method, p, b) {
  let statut, j = null;
  try {
    if (API) { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ m: method, p, b }) }); const rep = await r.json(); statut = rep.s; j = rep.d; }
    else { const r = await fetch(p, { method, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }); statut = r.status; try { j = await r.json(); } catch { /* */ } }
  } catch { throw new Error('Serveur injoignable : vérifiez votre connexion Internet.'); }
  if (statut < 200 || statut >= 300) throw new Error(ERREURS[j && j.erreur] || 'Erreur du serveur, réessayez plus tard.');
  return j;
}
function toast(m, err) { const t = $('#toast'); t.innerHTML = `<div class="${err ? 'err' : ''}" role="status">${esc(m)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, err ? 6000 : 3000); }
const v = id => ($('#' + id).value || '').trim();

function formulaire(secteurs) {
  return `<section class="carte"><h1 style="margin-top:0">Proposer un stage à nos élèves</h1>
    <p>Vous pouvez accueillir un ou plusieurs élèves pour une <b>période de formation en milieu professionnel</b> (PFMP) ? Décrivez votre offre :
      elle sera vérifiée par l’équipe du lycée puis proposée aux élèves concernés, qui vous contacteront.</p>
    <form id="f" novalidate>
      <h2>Votre entreprise</h2>
      <label>Nom de l’entreprise *<input id="o_ent" required maxlength="120" autocomplete="organization"></label>
      <label>Adresse du lieu de stage *<input id="o_adr" required maxlength="200" placeholder="N° et rue, code postal et commune" autocomplete="street-address"></label>
      <label>Secteur d’activité<select id="o_sect"><option value="">— Choisir —</option>${secteurs.map(s => `<option>${esc(s)}</option>`).join('')}<option value="autre">Autre…</option></select></label>
      <label id="o_sect_autre_l" hidden>Précisez le secteur<input id="o_sect_autre" maxlength="80"></label>
      <h2>Le stage</h2>
      <label>Métier ou activités proposées *<input id="o_int" required maxlength="120" placeholder="ex. Électricien en bâtiment, vente en magasin…"></label>
      <fieldset class="choix-groupe"><legend>Niveau des élèves accueillis *</legend>
        ${['CAP', 'Bac pro', 'BTS'].map(n => `<label class="choix"><input type="checkbox" name="niv" value="${n}">${n}</label>`).join('')}</fieldset>
      <div class="deux"><label>Du<input type="date" id="o_debut"></label><label>Au<input type="date" id="o_fin"></label>
        <label>Nombre de stagiaires<input type="number" id="o_places" min="1" max="50" value="1"></label></div>
      <label>Description <span class="doux petit">(missions, horaires, tenue, permis ou véhicule nécessaire…)</span><textarea id="o_desc" rows="4" maxlength="1500"></textarea></label>
      <h2>Contact</h2>
      <div class="deux"><label>Nom du contact<input id="o_contact" maxlength="120" autocomplete="name"></label>
        <label>Téléphone<input id="o_tel" type="tel" maxlength="40" autocomplete="tel"></label><label>E-mail<input id="o_mail" type="email" maxlength="120" autocomplete="email"></label></div>
      <p class="doux petit">* obligatoire. Indiquez au moins un téléphone ou un e-mail. Ces coordonnées professionnelles seront montrées aux élèves du lycée
        intéressés par votre offre. L’offre est retirée à la fin de la période indiquée, ou sur simple demande au lycée.</p>
      <div class="actions"><button class="btn" type="submit">📨 Envoyer l’offre au lycée</button></div>
    </form></section>`;
}
async function init() {
  if (!code) { $('#app').innerHTML = '<section class="carte"><h1>Lien incomplet</h1><p>Utilisez le lien complet transmis par le lycée.</p></section>'; return; }
  let secteurs = [];
  try { secteurs = await api('GET', '/api/public/secteurs'); } catch { /* liste facultative */ }
  $('#app').innerHTML = formulaire(secteurs || []);
  $('#o_sect').addEventListener('change', e => { $('#o_sect_autre_l').hidden = e.target.value !== 'autre'; });
  $('#f').addEventListener('submit', async ev => {
    ev.preventDefault();
    const bouton = $('#f button[type=submit]');
    const niveaux = [...document.querySelectorAll('input[name=niv]:checked')].map(x => x.value);
    const o = { k: code, entreprise: v('o_ent'), adresse: v('o_adr'), secteur: v('o_sect') === 'autre' ? v('o_sect_autre') : v('o_sect'), intitule: v('o_int'), niveaux,
      debut: v('o_debut'), fin: v('o_fin'), places: v('o_places'), description: v('o_desc'), contact: v('o_contact'), tel: v('o_tel'), email: v('o_mail') };
    if (!o.entreprise || !o.adresse || !o.intitule || !niveaux.length || (!o.tel && !o.email)) return toast(ERREURS.offre_incomplete, true);
    if (o.debut && o.fin && o.fin < o.debut) return toast('La date de fin est avant la date de début.', true);
    bouton.disabled = true; bouton.textContent = 'Envoi…';
    try {
      await api('POST', '/api/public/offre', o);
      $('#app').innerHTML = `<section class="carte"><h1>✅ Merci !</h1><p>Votre offre « ${esc(o.intitule)} » a bien été transmise au lycée. Elle sera proposée aux élèves après vérification.</p>
        <div class="actions"><button class="btn sec" id="encore">Proposer une autre offre</button></div></section>`;
      $('#encore').addEventListener('click', init);
    } catch (e) { toast(e.message, true); bouton.disabled = false; bouton.textContent = '📨 Envoyer l’offre au lycée'; }
  });
}
init();
