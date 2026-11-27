'use strict';
/* CV et lettre de motivation en PDF : dépôt par l'élève, visionneuse et annotations du professeur
 * (bulles de remarques numérotées, surligneur, stylo). Les PDF sont rangés dans un dossier privé du Drive
 * de l'application ; les annotations sont gardées à part (coordonnées relatives à la page), le PDF n'est pas modifié. */
const PDFJS = {
  js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  sri: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
  worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  workerSri: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2'
};
const MAX_PDF = 4 * 1024 * 1024;
let pdfjsPret = null;
function chargerPdfJs() {
  if (!pdfjsPret) pdfjsPret = (async () => {
    await new Promise((ok, ko) => {
      const s = document.createElement('script');
      Object.assign(s, { src: PDFJS.js, integrity: PDFJS.sri, crossOrigin: 'anonymous', onload: ok, onerror: () => ko(new Error('Impossible de charger le lecteur de PDF : vérifie ta connexion.')) });
      document.head.append(s);
    });
    // Le worker est vérifié (empreinte) puis lancé depuis une copie locale.
    const r = await fetch(PDFJS.worker, { integrity: PDFJS.workerSri });
    if (!r.ok) throw new Error('Impossible de charger le lecteur de PDF.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
  })().catch(e => { pdfjsPret = null; throw e; });
  return pdfjsPret;
}
function enBase64(o) {
  let s = '';
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
  return btoa(s);
}
const nbAnnotations = doc => doc && doc.annotations ? (doc.annotations.notes || []).length + (doc.annotations.traits || []).length : 0;
const tailleLisible = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';

/* ---------- Élève : dépôt du PDF ---------- */
C.deposerFichier = async el => {
  const f = el.files[0], t = el.dataset.t; el.value = '';
  if (!f) return;
  if (f.size > MAX_PDF) throw new Error(`Fichier trop lourd (${tailleLisible(f.size)}) : 4 Mo maximum. Enregistre-le en PDF « taille minimale » ou retire les grandes images.`);
  const o = new Uint8Array(await f.arrayBuffer());
  if (String.fromCharCode(...o.subarray(0, 5)) !== '%PDF-') throw new Error('Ce fichier n’est pas un PDF. Dans ton traitement de texte : Fichier › Enregistrer sous (ou Exporter) › PDF.');
  toast('Envoi du document…');
  const d = await api('POST', '/api/fichier/deposer', { type: t, pdf: enBase64(o) });
  S.el[t] = Object.assign(DEF[t](), d);
  journal(`${TITRES[t]} déposé (PDF)`); render(); toast('Document déposé : ton professeur est prévenu');
};
A.retirerFichier = async el => {
  const t = el.dataset.t;
  if (!confirm(`Retirer ton ${TITRES[t]} de l’application ? Les annotations de ton professeur seront aussi effacées.`)) return;
  S.el[t] = Object.assign(DEF[t](), await api('POST', '/api/fichier/supprimer', { type: t }));
  journal(`${TITRES[t]} retiré`); render(); toast('Document retiré');
};
A.voirFichier = el => ouvrirVisionneuse({ eleveId: S.user.id, type: el.dataset.t, periode: el.dataset.p || undefined, prof: false, titre: { cv: 'Mon CV', lettre: 'Ma lettre de motivation', attestation: 'Mon attestation de stage' }[el.dataset.t] || TITRES[el.dataset.t] });

/* ---------- Professeur : ouvrir et annoter ---------- */
A.annoterFichier = el => {
  const e = eleveOuvert(); if (!e) return;
  return ouvrirVisionneuse({ eleveId: e.id, type: el.dataset.t, prof: true, titre: `${TITRES[el.dataset.t]} de ${nomEleve(e)}` });
};

/* ---------- Visionneuse ---------- */
let V = null;   // document ouvert
const OUTILS = [['', '✋', 'Lire'], ['note', '💬', 'Remarque'], ['surligneur', '🖍️', 'Surligner'], ['stylo', '✏️', 'Stylo'], ['gomme', '🧽', 'Gomme']];
async function ouvrirVisionneuse(o) {
  const [, f, docTout] = await Promise.all([chargerPdfJs(), api('POST', '/api/fichier/lire', { eleveId: o.eleveId, type: o.type, periode: o.periode }), getDoc(`eleve/${o.eleveId}/${o.type}`)]);
  // Attestation : un document par période de stage (consultation seulement)
  const doc = o.periode ? ((docTout && docTout.periodes) || {})[o.periode] || {} : docTout;
  const a = (doc && doc.annotations) || {};
  V = Object.assign(o, { doc: doc || {}, fichierLe: doc ? doc.fichierLe : null, outil: '', modifie: false, pages: [],
    notes: (a.notes || []).map(n => Object.assign({}, n)), traits: (a.traits || []).map(t => Object.assign({}, t)), annule: [] });
  const z = document.createElement('div'); z.id = 'visio'; z.className = 'visio'; z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-label', o.titre);
  document.body.append(z); document.body.classList.add('visio-ouverte');
  z.innerHTML = `<div class="visio-barre"><b class="visio-titre">${esc(o.titre)}</b>
      ${o.prof ? `<div class="visio-outils" role="toolbar" aria-label="Outils d’annotation">${OUTILS.map(([k, i, l]) => `<button type="button" data-a="visioOutil" data-o="${k}" aria-pressed="${V.outil === k}" title="${l}">${i}<span>${l}</span></button>`).join('')}
        <button type="button" data-a="visioAnnuler" title="Annuler la dernière annotation">↶<span>Annuler</span></button></div>
        <button type="button" class="btn mini" data-a="visioSauver">💾 Enregistrer</button>` : ''}
      <button type="button" class="btn mini sec" data-a="visioFermer">Fermer</button></div>
    <div class="visio-corps"><div class="visio-pages"><p class="doux" style="color:#fff">Ouverture du document…</p></div>
      <aside class="visio-notes"><h3>💬 Remarques</h3><div id="visioListe"></div>
        ${o.prof ? '<p class="doux petit">Choisissez 💬 puis touchez le document à l’endroit voulu pour ajouter une remarque. 🖍️ et ✏️ : tracez au doigt, au stylet ou à la souris.</p>' : ''}</aside></div>`;
  try { await afficherPages(z, f); } catch (e) { fermerVisionneuse(); throw e; }
}
async function afficherPages(z, f) {
  const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(f.pdf), c => c.charCodeAt(0)), isEvalSupported: false }).promise;
  const zone = z.querySelector('.visio-pages'), largeur = Math.min(zone.clientWidth - 16, 900), dpr = Math.min(window.devicePixelRatio || 1, 2);
  zone.innerHTML = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i), vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: largeur / vp1.width * dpr });
    const div = document.createElement('div'); div.className = 'visio-page'; div.dataset.p = i; div.style.aspectRatio = `${vp.width} / ${vp.height}`;
    div.innerHTML = `<canvas class="fond" width="${Math.round(vp.width)}" height="${Math.round(vp.height)}"></canvas><canvas class="calque" width="${Math.round(vp.width)}" height="${Math.round(vp.height)}" aria-hidden="true"></canvas><div class="bulles"></div>`;
    zone.append(div);
    await page.render({ canvasContext: div.querySelector('.fond').getContext('2d'), viewport: vp }).promise;
    V.pages[i] = div; brancherCalque(div.querySelector('.calque'), i);
  }
  if (pdf.numPages > 10) zone.insertAdjacentHTML('beforeend', '<p style="color:#fff">Seules les 10 premières pages sont affichées.</p>');
  dessinerTout();
}
function fermerVisionneuse() { const z = $('#visio'); if (z) z.remove(); document.body.classList.remove('visio-ouverte'); V = null; }
A.visioFermer = () => {
  if (V && V.modifie && !confirm('Fermer sans enregistrer les annotations ?')) return;
  fermerVisionneuse();
};
A.visioOutil = el => {
  V.outil = el.dataset.o;
  $$('#visio .visio-outils [data-o]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.o === V.outil)));
  $('#visio').classList.toggle('outil-actif', !!V.outil);
  $('#visio').dataset.outil = V.outil;
};
A.visioAnnuler = () => {
  const x = V.annule.pop(); if (!x) return toast('Rien à annuler');
  const l = x.type === 'note' ? V.notes : V.traits, i = l.findIndex(y => y.id === x.id);
  if (x.action === 'ajout' && i >= 0) l.splice(i, 1);
  else if (x.action === 'retrait') l.splice(Math.min(x.index, l.length), 0, x.objet);
  V.modifie = true; dessinerTout();
};
A.visioSupNote = el => { retirer('note', el.dataset.id); };
A.visioBulle = el => {
  const n = $(`#visioListe [data-note="${el.dataset.id}"]`); if (!n) return;
  n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1200);
  const t = n.querySelector('textarea'); if (t) t.focus();
};
A.visioVoirNote = el => {
  const n = V.notes.find(x => x.id === el.dataset.id), p = n && V.pages[n.page]; if (!p) return;
  p.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const b = p.querySelector(`[data-id="${n.id}"]`); if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1200); }
};
I.visioNote = el => { const n = V.notes.find(x => x.id === el.dataset.id); if (n) { n.texte = el.value.slice(0, 1000); V.modifie = true; } };
A.visioSauver = async () => {
  const k = `eleve/${V.eleveId}/${V.type}`, d = (await getDoc(k)) || {};
  if (d.fichierLe !== V.fichierLe) throw new Error('L’élève a déposé une nouvelle version entre-temps : fermez puis rouvrez le document.');
  const notes = V.notes.filter(n => n.texte.trim());
  d.annotations = notes.length || V.traits.length ? { notes, traits: V.traits, par: nomComplet(S.user), date: maintenant() } : null;
  // Annoter vaut relecture : le document n'est plus « à relire » (l'élève voit « Corrigé par… »).
  d.aRelire = false; d.correction = { par: nomComplet(S.user), date: maintenant(), commentaire: d.correction ? d.correction.commentaire : '' };
  await putDoc(k, d);
  const e = S.eleves.find(x => x.id === V.eleveId); if (e) e.d[V.type] = Object.assign(DEF[V.type](), d);
  V.modifie = false; V.doc = d; toast('Annotations enregistrées : l’élève les voit sur son document');
  if (S.dossier) render();
};

function retirer(type, id) {
  const l = type === 'note' ? V.notes : V.traits, i = l.findIndex(x => x.id === id); if (i < 0) return;
  V.annule.push({ action: 'retrait', type, id, index: i, objet: l[i] }); l.splice(i, 1); V.modifie = true; dessinerTout();
}
const nouvelId = () => Math.random().toString(36).slice(2, 10);
const arrondi = v => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;

function brancherCalque(c, page) {
  if (!V.prof) return;
  const pos = ev => { const r = c.getBoundingClientRect(); return [arrondi((ev.clientX - r.left) / r.width), arrondi((ev.clientY - r.top) / r.height)]; };
  let trait = null;
  c.addEventListener('pointerdown', ev => {
    if (!V || !V.outil) return;
    ev.preventDefault(); const p = pos(ev);
    if (V.outil === 'note') {
      const n = { id: nouvelId(), page, x: p[0], y: p[1], texte: '' };
      V.notes.push(n); V.annule.push({ action: 'ajout', type: 'note', id: n.id }); V.modifie = true; dessinerTout();
      const t = $(`#visioListe [data-note="${n.id}"] textarea`); if (t) t.focus();
      return;
    }
    if (V.outil === 'gomme') { gommer(page, p, c); return; }
    try { c.setPointerCapture(ev.pointerId); } catch { /* pointeur synthétique */ }
    trait = { id: nouvelId(), page, outil: V.outil, pts: [p] };
  });
  c.addEventListener('pointermove', ev => {
    if (!trait) { if (V && V.outil === 'gomme' && ev.buttons) gommer(page, pos(ev), c); return; }
    const p = pos(ev), d = trait.pts[trait.pts.length - 1];
    if (Math.hypot(p[0] - d[0], p[1] - d[1]) < 0.002) return;
    trait.pts.push(p); dessinerPage(page, trait);
  });
  const fin = () => {
    if (!trait) return;
    if (trait.pts.length === 1) trait.pts.push([arrondi(trait.pts[0][0] + 0.003), trait.pts[0][1]]);   // simple point
    V.traits.push(trait); V.annule.push({ action: 'ajout', type: 'trait', id: trait.id }); V.modifie = true; trait = null; dessinerPage(page);
  };
  c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin);
}
function gommer(page, p, c) {
  const r = 0.015 * Math.max(1, c.width / c.height);
  const t = V.traits.find(x => x.page === page && x.pts.some(q => Math.hypot(q[0] - p[0], (q[1] - p[1]) * c.height / c.width) < r));
  if (t) retirer('trait', t.id);
}
function dessinerPage(page, enCours) {
  const div = V.pages[page]; if (!div) return;
  const c = div.querySelector('.calque'), g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  for (const t of V.traits.filter(x => x.page === page).concat(enCours ? [enCours] : [])) {
    g.beginPath(); g.lineJoin = 'round';
    if (t.outil === 'surligneur') { g.strokeStyle = 'rgba(250, 204, 21, .45)'; g.lineWidth = 0.022 * W; g.lineCap = 'butt'; }
    else { g.strokeStyle = '#dc2626'; g.lineWidth = Math.max(2, 0.0035 * W); g.lineCap = 'round'; }
    t.pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
    g.stroke();
  }
  div.querySelector('.bulles').innerHTML = V.notes.map((n, i) => n.page === page
    ? `<button type="button" class="bulle" data-a="visioBulle" data-id="${n.id}" style="left:${n.x * 100}%;top:${n.y * 100}%" aria-label="Remarque ${i + 1}">${i + 1}</button>` : '').join('');
}
function dessinerTout() {
  V.pages.forEach((_, i) => dessinerPage(i));
  const l = $('#visioListe'); if (!l) return;
  l.innerHTML = V.notes.length ? V.notes.map((n, i) => `<div class="visio-note" data-note="${n.id}"><button type="button" class="bulle statique" data-a="visioVoirNote" data-id="${n.id}" aria-label="Voir la remarque ${i + 1} sur le document">${i + 1}</button>
      ${V.prof ? `<textarea rows="2" data-i="visioNote" data-id="${n.id}" placeholder="Votre remarque…" aria-label="Remarque ${i + 1}">${esc(n.texte)}</textarea><button type="button" class="lien" data-a="visioSupNote" data-id="${n.id}" aria-label="Supprimer la remarque ${i + 1}">✕</button>`
        : `<p>${esc(n.texte)}</p>`}</div>`).join('')
    : `<p class="doux petit">${V.prof ? 'Aucune remarque pour le moment.' : 'Pas de remarque écrite.'}</p>`;
  if (!V.prof && V.doc.annotations) l.insertAdjacentHTML('beforeend', `<p class="doux petit">Annoté par ${esc(V.doc.annotations.par)} le ${fmtDT(V.doc.annotations.date)}.${V.traits.length ? ' Les passages surlignés ou entourés sont à revoir.' : ''}</p>`);
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && V) { ev.stopImmediatePropagation(); A.visioFermer(); } }, true);
