'use strict';
/* ===== Lettre de motivation : 5 modèles, méthode « Vous / Moi / Nous », exemples, correction =====
 * Même principe que le CV (cvmodeles.js) : le texte est enregistré dans le dossier de l'élève (lettre.redaction),
 * son identité et ses coordonnées restent sur son appareil et ne sont écrites que dans le PDF. */
S.lmOnglet = null;
const LM_MODELES = [
  { id: 'classique', nom: 'Classique', desc: 'Présentation française traditionnelle : expéditeur à gauche, entreprise à droite.' },
  { id: 'bandeau', nom: 'Bandeau', desc: 'Nom et coordonnées dans un bandeau de couleur.' },
  { id: 'bloc', nom: 'Aligné', desc: 'Tout aligné à gauche, très lisible.' },
  { id: 'filet', nom: 'Filet', desc: 'Trait de couleur dans la marge, nom en couleur.' },
  { id: 'pastille', nom: 'Pastille', desc: 'Initiales dans une pastille, assorti au CV « Créatif ».' },
];
const APPELS = ['Madame, Monsieur', 'Madame', 'Monsieur'];
const POLITESSES = [
  'Je vous prie d’agréer, {appel}, l’expression de mes salutations distinguées.',
  'Dans l’attente de votre réponse, je vous prie de recevoir, {appel}, mes sincères salutations.',
  'Veuillez agréer, {appel}, mes respectueuses salutations.',
];
const CONNECTEURS = ['De plus,', 'En effet,', 'C’est pourquoi', 'Par ailleurs,', 'Enfin,', 'Grâce à', 'Lors de'];

function classeNom() { const cl = S.classes.find(c => c.id === S.el.profil.classeId); return cl ? (cl.diplome || cl.nom) : 'lycée professionnel'; }
function lettreDefaut() {
  const p = periodeTexte(), cv = S.el.cv.redaction;
  return { modele: 'classique', couleur: (cv && cv.couleur) || '#1d4ed8', demandeId: '', entreprise: '', contact: '', adresseEnt: '',
    objet: `Demande de stage (période de formation en milieu professionnel)${p ? ' ' + p : ''}`, appel: 'Madame, Monsieur', p1: '', p2: '', p3: '', p4: '', politesse: 0 };
}
const lettreR = () => { if (!S.el.lettre.redaction) S.el.lettre.redaction = lettreDefaut(); return S.el.lettre.redaction; };
// Exemples des paragraphes : complétés avec l'entreprise, la classe, la filière et les dates de stage.
function exemplesLettre(r) {
  const ent = r.entreprise || 'votre entreprise', fil = filiereEleve(), p = periodeTexte(), cl = classeNom(), c1 = (fil.comp[0] || 'travailler en équipe').toLowerCase();
  return {
    p1: [`Votre entreprise ${ent} est reconnue dans la région et son activité dans ${fil.domaine} m’intéresse beaucoup. C’est pourquoi je souhaite y effectuer ma période de formation en milieu professionnel${p ? ' ' + p : ''}.`,
      `J’ai découvert ${ent} [sur votre site internet / en passant devant votre magasin / grâce à un proche] et j’aimerais beaucoup découvrir votre métier au sein de votre équipe.`],
    p2: [`Actuellement élève en ${cl} au lycée Raymond Queneau d’Yvetot, j’apprends notamment à ${c1}. Lors de [mon stage de 3e / mon précédent stage] chez [entreprise], j’ai pu [ce que tu as fait].`,
      'Sérieux(se), ponctuel(le) et motivé(e), j’aime le travail bien fait. Je suis à l’écoute des conseils et j’apprends vite.'],
    p3: ['Ce stage me permettrait de mettre en pratique ce que j’apprends au lycée et de découvrir le travail en équipe dans une entreprise. Je serai attentif(ve) aux consignes et je m’impliquerai dans les tâches qui me seront confiées.',
      `Je souhaite progresser dans ${fil.domaine} à vos côtés et vous montrer ma motivation pour ce métier.`],
    p4: ['Je me tiens à votre disposition pour un entretien afin de vous présenter ma motivation. Vous trouverez ci-joint mon CV ; la convention de stage vous sera transmise par le lycée.',
      'Je vous remercie de l’attention que vous porterez à ma demande et je reste disponible pour vous rencontrer ou échanger par téléphone.'],
  };
}

/* ---------- Page Lettre : modèle ou dépôt d'une lettre déjà faite ---------- */
function vueLettre(doc) {
  const onglet = S.lmOnglet || (doc.fichierLe && !doc.redaction ? 'depot' : 'modele');
  return `<div class="onglets" style="margin-bottom:12px"><button class="${onglet === 'modele' ? 'actif' : ''}" data-a="lmOnglet" data-o="modele">✍️ Écrire ma lettre avec un modèle</button>
    <button class="${onglet === 'depot' ? 'actif' : ''}" data-a="lmOnglet" data-o="depot">📤 Déposer une lettre déjà faite${doc.fichierLe ? ' · voir les annotations' : ''}</button></div>`
    + (onglet === 'depot' ? vueDepot('lettre', doc) : vueModeleLettre(doc));
}
A.lmOnglet = el => { if ($('#lm_form')) lireLettre(); S.lmOnglet = el.dataset.o; render(); };

function vueModeleLettre(doc) {
  const r = lettreR(), id = identiteCV(), ex = exemplesLettre(r), nb = nbAnnotations(doc);
  const dem = S.el.demandes.liste.filter(x => x.statut !== 'refus');
  const para = (k, titre, consigne) => `<section class="carte"><h2>${titre}</h2><p class="doux petit">${consigne}</p>
    <textarea id="lm_${k}" rows="5" spellcheck="true" lang="fr" class="lm-para">${esc(r[k])}</textarea>
    ${aide('Exemples à personnaliser', ex[k].map((t, i) => `<button type="button" class="exemple" data-a="lmExemple" data-k="${k}" data-i="${i}">« ${esc(t)} »</button>`).join('') + '<p>Remplace les passages entre [crochets] par tes propres mots.</p>')}</section>`;
  return `${doc.fichierLe ? `<div class="alerte info petit">📄 Lettre déposée le ${fmtDT(doc.fichierLe)}${nb ? ` · ✏️ <b>${nb} annotation${nb > 1 ? 's' : ''}</b> de ton professeur` : ''}. <button class="lien" style="display:inline" data-a="voirFichier" data-t="lettre">Voir</button></div>` : ''}
  ${blocCorrection(doc)}
  <div class="cv-zone" id="lm_form">
   <div class="cv-saisie">
    <section class="carte"><h2>1. Choisis un modèle</h2>
      <div class="cv-modeles">${LM_MODELES.map(m => `<button type="button" class="cv-modele ${r.modele === m.id ? 'actif' : ''}" data-a="lmModele" data-m="${m.id}" aria-pressed="${r.modele === m.id}"><b>${m.nom}</b><span>${m.desc}</span></button>`).join('')}</div>
      <div class="cv-couleurs" role="radiogroup" aria-label="Couleur">${CV_COULEURS.map(([c, n]) => `<button type="button" class="cv-couleur ${r.couleur === c ? 'actif' : ''}" style="background:${c}" data-a="lmCouleur" data-c="${c}" aria-label="${n}" aria-pressed="${r.couleur === c}"></button>`).join('')}</div>
      ${aide('La méthode « Vous, Moi, Nous »', '<b>Vous</b> : pourquoi cette entreprise. <b>Moi</b> : ta formation, tes qualités, tes expériences. <b>Nous</b> : ce que le stage vous apportera à tous les deux. Puis une <b>conclusion</b> qui demande un entretien. Une lettre tient sur une page : 15 à 25 lignes.')}</section>

    <section class="carte"><h2>2. Pour quelle entreprise ?</h2>
      ${dem.length ? `<label>Choisir dans mes appels<select data-c="lmEntreprise"><option value="">— Autre entreprise —</option>${dem.map(x => `<option value="${x.id}" ${x.id === r.demandeId ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>` : ''}
      <div class="deux"><label>Entreprise<input id="lm_entreprise" value="${esc(r.entreprise)}" spellcheck="true" lang="fr"></label>
        <label>À l’attention de <span class="doux petit">(si tu connais la personne)</span><input id="lm_contact" value="${esc(r.contact)}" placeholder="M. Martin, responsable de l’atelier"></label></div>
      <label>Adresse de l’entreprise<textarea id="lm_adresseEnt" rows="2" placeholder="5 route du Havre&#10;76190 Yvetot">${esc(r.adresseEnt)}</textarea></label>
      ${aide('Une lettre pour chaque entreprise', 'Le recruteur repère tout de suite une lettre copiée-collée. Change au moins le nom de l’entreprise et le premier paragraphe pour chacune.')}</section>

    <section class="carte"><h2>3. Mes coordonnées</h2>
      <p class="doux petit">🔒 Les mêmes que pour ton CV : elles restent sur cet appareil.</p>
      <div class="deux"><label>Prénom<input id="cvi_prenom" value="${esc(id.prenom)}"></label><label>Nom<input id="cvi_nom" value="${esc(id.nom)}" style="text-transform:uppercase"></label></div>
      <div class="deux"><label>Adresse<input id="cvi_adresse" value="${esc(id.adresse)}"></label><label>Code postal et commune<input id="cvi_ville" value="${esc(id.ville)}"></label></div>
      <div class="deux"><label>Téléphone<input id="cvi_tel" value="${esc(id.tel)}" type="tel"></label><label>E-mail<input id="cvi_email" value="${esc(id.email)}" type="email"></label></div>
      <input type="hidden" id="cvi_age" value="${esc(id.age)}"></section>

    <section class="carte"><h2>4. Objet et formule d’appel</h2>
      <label>Objet<input id="lm_objet" value="${esc(r.objet)}" spellcheck="true" lang="fr"></label>
      <label>Formule d’appel<select id="lm_appel">${APPELS.map(a => `<option ${a === r.appel ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <p class="doux petit">« Madame, Monsieur » si tu ne sais pas à qui tu écris ; sinon « Madame » ou « Monsieur » (jamais le prénom).</p></section>

    ${para('p1', '5. Vous : pourquoi cette entreprise ?', 'Montre que tu connais l’entreprise : son activité, sa réputation, ce qui t’attire. Cite son nom.')}
    ${para('p2', '6. Moi : qui je suis', 'Ta formation, ce que tu sais déjà faire, une expérience, deux ou trois qualités prouvées par un exemple.')}
    ${para('p3', '7. Nous : ce que le stage nous apportera', 'Ce que tu veux apprendre et ce que tu peux apporter à l’équipe.')}
    ${para('p4', '8. Conclusion', 'Demande un entretien, remercie, annonce le CV joint.')}
    <section class="carte"><h2>9. Formule de politesse</h2>
      ${POLITESSES.map((p, i) => `<label class="choix" style="margin:6px 0"><input type="radio" name="lm_pol" value="${i}" ${+r.politesse === i ? 'checked' : ''}>${esc(p.replace('{appel}', r.appel))}</label>`).join('')}
      <p class="doux petit">Mots de liaison à ajouter dans le dernier paragraphe où tu as écrit :</p>${puces(CONNECTEURS, 'lmConnecteur', '')}</section>
   </div>
   <aside class="cv-apercu-col">
    <section class="carte cv-collant"><h2>Aperçu</h2>
      <canvas id="lm_apercu" class="cv-apercu" aria-label="Aperçu de la lettre"></canvas>
      <div class="actions"><button class="btn sec" data-a="lmApercu">🔄 Actualiser</button><button class="btn sec" data-a="lmVerifier">✔️ Vérifier l’orthographe</button></div>
      <div id="lm_fautes"></div>
      <div id="lm_conseils">${conseilsLettre(r, id)}</div>
      <div class="actions"><button class="btn" data-a="lmEnregistrer">💾 Enregistrer</button><button class="btn sec" data-a="lmTelecharger">⬇️ Télécharger le PDF</button></div>
      <div class="actions"><button class="btn" data-a="lmDeposer">📤 Déposer cette lettre pour mon professeur</button></div>
      <p class="doux petit">La vérification envoie seulement le texte de la lettre (pas ton nom ni tes coordonnées) au service de correction LanguageTool.</p></section>
   </aside>
  </div>`;
}

/* ---------- Lecture du formulaire et actions ---------- */
function lireLettre() {
  if (!$('#lm_form')) return lettreR();
  const r = lettreR(), v = i => ($('#' + i) || {}).value || '';
  const id = Object.assign(identiteCV(), { prenom: v('cvi_prenom').trim(), nom: v('cvi_nom').trim().toUpperCase(), adresse: v('cvi_adresse').trim(), ville: v('cvi_ville').trim(), tel: v('cvi_tel').trim(), email: v('cvi_email').trim() });
  memoriserIdentite(id);
  Object.assign(r, { entreprise: v('lm_entreprise').trim(), contact: v('lm_contact').trim(), adresseEnt: v('lm_adresseEnt').trim(), objet: v('lm_objet').trim(), appel: v('lm_appel') || r.appel,
    p1: v('lm_p1').trim(), p2: v('lm_p2').trim(), p3: v('lm_p3').trim(), p4: v('lm_p4').trim(), politesse: +((document.querySelector('input[name="lm_pol"]:checked') || {}).value || 0) });
  return r;
}
A.lmModele = el => { lireLettre(); lettreR().modele = el.dataset.m; render(); };
A.lmCouleur = el => { lireLettre(); lettreR().couleur = el.dataset.c; render(); };
C.lmEntreprise = el => {
  lireLettre(); const r = lettreR(), x = S.el.demandes.liste.find(d => d.id === el.value);
  r.demandeId = el.value;
  if (x) { const e = S.entreprises.find(z => z.id === x.entrepriseId) || {}; r.entreprise = x.nom || e.nom || ''; r.adresseEnt = (x.adresse || e.adresse || '').replace(/,\s*(\d{5})/, '\n$1'); r.contact = x.interlocuteur || x.contact || e.contact || ''; }
  render(); toast('Pense à adapter le premier paragraphe à cette entreprise');
};
A.lmExemple = el => {
  const t = $('#lm_' + el.dataset.k), ex = exemplesLettre(lireLettre())[el.dataset.k][+el.dataset.i];
  if (t.value.trim() && !confirm('Remplacer ton paragraphe par cet exemple ?')) return;
  t.value = ex; t.focus(); const i = ex.indexOf('['); if (i >= 0) t.setSelectionRange(i, ex.indexOf(']', i) + 1);
  toast(i >= 0 ? 'Remplace le passage sélectionné entre [crochets]' : 'Personnalise l’exemple avec tes mots !');
};
let dernierPara = null;
document.addEventListener('focusin', ev => { if (ev.target.classList && ev.target.classList.contains('lm-para')) dernierPara = ev.target; });
A.lmConnecteur = el => {
  const t = (dernierPara && document.body.contains(dernierPara)) ? dernierPara : $('#lm_p2');
  const pos = t.selectionStart != null ? t.selectionStart : t.value.length, avant = t.value.slice(0, pos), apres = t.value.slice(pos);
  const ins = (avant && !/\s$/.test(avant) ? ' ' : '') + el.dataset.v + ' ';
  t.value = avant + ins + apres; t.focus(); t.setSelectionRange(pos + ins.length, pos + ins.length);
};
function conseilsLettre(r, id) {
  const c = [], tout = [r.p1, r.p2, r.p3, r.p4].join(' ');
  if (!id.nom || (!id.tel && !id.email)) c.push('Complète tes coordonnées (nom, téléphone ou e-mail).');
  if (!r.entreprise) c.push('Indique le nom de l’entreprise.');
  else if (r.p1 && !normaliserNom(r.p1).includes(normaliserNom(r.entreprise))) c.push('Cite le nom de l’entreprise dans le premier paragraphe.');
  [['p1', 'Vous'], ['p2', 'Moi'], ['p3', 'Nous'], ['p4', 'Conclusion']].forEach(([k, n]) => { if (!r[k]) c.push(`Écris le paragraphe « ${n} ».`); });
  if (/\[[^\]]*\]/.test(tout)) c.push('Remplace les passages entre [crochets] par tes propres mots.');
  if (tout.length > 1900) c.push('Ta lettre est un peu longue : elle doit tenir sur une page.');
  if (/\b(tu|ton|ta|tes|t’|t')\b/i.test(tout)) c.push('Vouvoie toujours le recruteur (« vous », « votre »).');
  return c.length ? `<div class="alerte attention petit"><b>Pour améliorer ta lettre :</b><ul style="margin:4px 0 0;padding-left:18px">${c.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '<div class="alerte info petit">✅ Ta lettre est complète. Fais vérifier l’orthographe, puis dépose-la.</div>';
}

/* ---------- PDF : 5 modèles ---------- */
async function pdfLettre(id, r) {
  for (const s of [1, 0.95, 0.9, 0.85, 0.8, 0.75]) {
    const o = await outilsPdf(false), fin = dessinerLettre(o, id, r, s);
    if (fin <= o.H - 36 || s === 0.75) { o.doc.setTitle(`Lettre de motivation ${id.prenom} ${id.nom}`.trim()); return o.doc.save(); }
  }
}
function dessinerLettre(o, id, r, s) {
  const { f, L, W, H } = o, acc = hexRgb(L, r.couleur || '#1d4ed8'), blanc = L.rgb(1, 1, 1), gris = L.rgb(0.35, 0.38, 0.45), noir = L.rgb(0.08, 0.1, 0.15);
  o.nouvellePage();
  const T = 11 * s, inter = 1.42, m = r.modele || 'classique';
  const nom = `${id.prenom} ${id.nom}`.trim() || 'Prénom NOM';
  const coord = [id.adresse, id.ville, id.tel, id.email].filter(Boolean);
  const commune = String(id.ville || '').replace(/^\d{5}\s*/, '') || 'Yvetot';
  const date = `${commune}, le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const dest = [r.entreprise, r.contact ? `À l’attention de ${r.contact}` : '', ...String(r.adresseEnt || '').split('\n')].filter(Boolean);
  const pol = POLITESSES[+r.politesse || 0].replace('{appel}', r.appel);
  let y = 0;
  const bloc = (lignes, x, w, t = T, font = f.n, coul = noir) => { for (const l of lignes) for (const ll of o.couper(l, t, w, font)) { o.txt(ll, x, y + t, t, font, coul); y += t * 1.3; } };
  const gauche = m === 'filet' ? 74 : 62, largeur = W - gauche - 62;
  // En-tête selon le modèle
  if (m === 'bandeau') {
    const h = 34 + 24 * s + o.couper(coord.join('  ·  '), 9.5 * s, W - 124).length * 13 * s + 14;
    o.page.drawRectangle({ x: 0, y: H - h, width: W, height: h, color: acc });
    y = 32; o.txt(nom, 62, y + 22 * s, 22 * s, f.b, blanc); y += 30 * s; bloc([coord.join('  ·  ')], 62, W - 124, 9.5 * s, f.n, blanc);
    y = h + 26; const yd = y; bloc(dest, W / 2 + 20, W / 2 - 82, T); y = Math.max(y, yd) + 14;
  } else if (m === 'pastille') {
    const ini = ((id.prenom[0] || '') + (id.nom[0] || '')).toUpperCase();
    o.page.drawCircle({ x: 62 + 28 * s, y: H - 44 - 28 * s, size: 28 * s, color: acc }); o.centre(ini, 62 + 28 * s, 44 + 28 * s + 7 * s, 18 * s, f.b, blanc);
    y = 44; const x0 = 62 + 70 * s; o.txt(nom, x0, y + 20 * s, 20 * s, f.b, acc); y += 28 * s; bloc([coord.join('  ·  ')], x0, W - 62 - x0, 9.5 * s, f.n, gris);
    y = Math.max(y, 44 + 60 * s) + 8; o.ligne(62, y, W - 62, y, 1, acc); y += 22; const yd = y; bloc(dest, W / 2 + 20, W / 2 - 82, T); y = Math.max(y, yd) + 14;
  } else if (m === 'filet') {
    o.page.drawRectangle({ x: 40, y: 40, width: 4, height: H - 80, color: acc });
    y = 50; o.txt(nom, gauche, y + 20 * s, 20 * s, f.b, acc); y += 28 * s; bloc(coord, gauche, 240, 10 * s, f.n, gris);
    y += 18; const yd = y; bloc(dest, W / 2 + 20, W / 2 - 82, T); y = Math.max(y, yd) + 14;
  } else if (m === 'bloc') {
    y = 50; o.txt(nom, gauche, y + 15 * s, 15 * s, f.b, acc); y += 21 * s; bloc(coord, gauche, largeur, 10 * s, f.n, gris);
    y += 10; o.ligne(gauche, y, gauche + 90, y, 2, acc); y += 18; bloc(dest, gauche, largeur, T); y += 14;
  } else {
    y = 50; bloc([nom], gauche, 260, T, f.b); bloc(coord, gauche, 260, T); y += 18;
    const yd = y; bloc(dest, W / 2 + 20, W / 2 - 82, T); y = Math.max(y, yd) + 14;
  }
  // Lieu et date
  if (m === 'bloc') { bloc([date], gauche, largeur, T); } else { o.droite(date, W - 62, y + T, T); y += T * 1.3; }
  y += 22 * s;
  // Objet
  if (r.objet) { const lab = 'Objet : '; o.txt(lab, gauche, y + T, T, f.b, m === 'classique' ? noir : acc); const wl = o.large(lab, T, f.b); o.couper(r.objet, T, largeur - wl, f.b).forEach(l => { o.txt(l, gauche + wl, y + T, T, f.b); y += T * 1.3; }); }
  y += 20 * s;
  // Corps
  const para = t => { for (const l of o.couper(t, T, largeur)) { o.txt(l, gauche, y + T, T, f.n, noir); y += T * inter; } y += T * 0.8; };
  para(r.appel + ',');
  [r.p1, r.p2, r.p3, r.p4].filter(Boolean).forEach(p => p.split(/\n+/).forEach(para));
  para(pol);
  y += 14 * s; o.droite(nom, W - 62, y + T, T, f.b); y += T * 1.3;
  return y;
}

/* ---------- Aperçu, enregistrement, téléchargement, dépôt, correction ---------- */
async function majApercuLettre() {
  const cv = $('#lm_apercu'); if (!cv) return;
  const r = lireLettre(), id = identiteCV(), octets = await pdfLettre(id, r); await chargerPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: octets, isEvalSupported: false }).promise, page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: Math.max(280, cv.clientWidth || 320) * (window.devicePixelRatio || 1) / page.getViewport({ scale: 1 }).width });
  cv.width = vp.width; cv.height = vp.height;
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  const z = $('#lm_conseils'); if (z) z.innerHTML = conseilsLettre(r, id);
}
A.lmApercu = () => majApercuLettre();
async function sauverLettre() {
  const r = lireLettre(), k = `eleve/${S.user.id}/lettre`, d = (await getDoc(k)) || {};
  d.redaction = r; d.redigeLe = maintenant(); await putDoc(k, d); S.el.lettre = Object.assign(DEF.lettre(), d);
}
A.lmEnregistrer = async () => { await sauverLettre(); journal('Lettre de motivation (modèle) enregistrée'); toast('Lettre enregistrée'); };
const nomFichierLettre = (id, r) => `Lettre de motivation ${id.prenom} ${id.nom}${r.entreprise ? ' - ' + r.entreprise : ''}`.trim().replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
A.lmTelecharger = async () => { const r = lireLettre(), id = identiteCV(); ouvrirPdf(await pdfLettre(id, r), nomFichierLettre(id, r)); };
A.lmDeposer = async () => {
  const r = lireLettre(), id = identiteCV();
  if (!id.nom || (!id.tel && !id.email)) throw new Error('Complète ton nom et un moyen de te contacter avant de déposer ta lettre.');
  if (!r.p1 || !r.p2) throw new Error('Écris au moins les paragraphes « Vous » et « Moi » avant de déposer ta lettre.');
  if (S.el.lettre.fichierLe && !confirm('Remplacer la lettre déjà déposée (et les annotations de ton professeur) par celle-ci ?')) return;
  await sauverLettre();
  const d = await api('POST', '/api/fichier/deposer', { type: 'lettre', pdf: enBase64(new Uint8Array(await pdfLettre(id, r))) });
  S.el.lettre = Object.assign(DEF.lettre(), S.el.lettre, d); journal('Lettre de motivation déposée (créée avec un modèle)'); render(); toast('Lettre déposée : ton professeur est prévenu');
};
A.lmVerifier = () => {
  const champs = [['#lm_objet', 'Objet'], ['#lm_p1', 'Paragraphe « Vous »'], ['#lm_p2', 'Paragraphe « Moi »'], ['#lm_p3', 'Paragraphe « Nous »'], ['#lm_p4', 'Conclusion']]
    .map(([sel, nom]) => ({ el: $(sel), nom })).filter(x => x.el && x.el.value.trim());
  return verifierTextes(champs, 'lm_fautes');
};
