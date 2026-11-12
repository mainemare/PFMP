'use strict';
/* ===== Convention de PFMP : chiffrement et fabrication du PDF =====
 * Partagé entre l'application (élève, professeur) et la page de signature (signer.html).
 * Le contenu de la convention (identité de l'élève, signatures) est chiffré dans le navigateur (AES-GCM 256 bits).
 * La clé ne figure que dans le lien de signature (partie après « # », jamais envoyée au serveur).
 */
const CONV = (() => {
  /* ---------- Encodage ---------- */
  const enB64u = octets => {
    const t = octets instanceof Uint8Array ? octets : new Uint8Array(octets); let s = '';
    for (let i = 0; i < t.length; i += 0x8000) s += String.fromCharCode.apply(null, t.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const deB64u = s => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); const t = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) t[i] = b.charCodeAt(i); return t; };
  const texte = new TextEncoder(), lecteur = new TextDecoder();

  /* ---------- Chiffrement ---------- */
  const importer = cle => crypto.subtle.importKey('raw', deB64u(cle), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const nouvelleCle = () => enB64u(crypto.getRandomValues(new Uint8Array(32)));
  async function chiffrer(obj, cle) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importer(cle), texte.encode(JSON.stringify(obj))));
    const t = new Uint8Array(12 + c.length); t.set(iv); t.set(c, 12); return enB64u(t);
  }
  async function dechiffrer(s, cle) {
    const t = deB64u(s);
    try { return JSON.parse(lecteur.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: t.subarray(0, 12) }, await importer(cle), t.subarray(12)))); }
    catch { throw new Error('Impossible de lire la convention : le lien est incomplet ou la clé ne correspond pas.'); }
  }
  // Clé personnelle de l'élève, dérivée de son mot de passe : lui permet de rouvrir sa convention sans le lien.
  async function cleDepuisMotDePasse(motdepasse, identifiant) {
    const base = await crypto.subtle.importKey('raw', texte.encode(motdepasse), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: texte.encode('suivi-stages|' + String(identifiant).toLowerCase()), iterations: 150000 }, base, 256);
    return enB64u(new Uint8Array(bits));
  }
  // Code personnel d'un signataire externe : 8 caractères sans ambiguïté (pas de 0/O, 1/I…), affiché XXXX-XXXX.
  function nouveauCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', t = crypto.getRandomValues(new Uint8Array(8));
    const c = [...t].map(x => a[x % a.length]).join(''); return c.slice(0, 4) + '-' + c.slice(4);
  }
  const normaliserCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
  const lien = (id, cle) => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'signer.html#c=' + id + '&k=' + cle;

  /* ---------- Rôles ---------- */
  const ROLES = {
    representant: { titre: 'Le représentant légal de l’élève mineur', court: 'Représentant légal', externe: true },
    eleve: { titre: 'L’élève', court: 'Élève', externe: false },
    entreprise: { titre: 'Le représentant de l’entreprise ou de l’organisme d’accueil', court: 'Représentant de l’entreprise', externe: true, cachet: true },
    tuteur: { titre: 'Le tuteur si différent du représentant', court: 'Tuteur', externe: true, cachet: true },
    chef: { titre: 'Le chef d’établissement', court: 'Chef d’établissement (ou DDFPT par délégation)', externe: false, cachet: true },
    referent: { titre: 'L’enseignant référent', court: 'Enseignant référent', externe: false },
  };
  const ORDRE_ROLES = ['eleve', 'representant', 'entreprise', 'tuteur', 'referent', 'chef'];
  function rolesRequis(D) {
    return ORDRE_ROLES.filter(r => r !== 'representant' || D.mineur).filter(r => r !== 'tuteur' || !D.tuteur.memeQueRepresentant);
  }
  function nomSignataire(D, role) {
    return { eleve: `${D.eleve.prenom} ${D.eleve.nom}`, representant: D.representant.nom, entreprise: D.entreprise.representant,
      tuteur: D.tuteur.nom, referent: D.referent.nom, chef: D.etab.chef }[role] || '';
  }

  /* ---------- Paramètres de l'établissement (modifiables par les professeurs) ---------- */
  const ETAB_DEFAUT = {
    nom: 'LYCEE POLYVALENT Raymond QUENEAU', adresse: 'Rue du Docteur Zamenhof 76190 YVETOT', adressePostale: 'RUE DU DOCTEUR ZAMENHOF\n76194 YVETOT CEDEX',
    tel: '02.35.95.12.66', mail: '', chef: 'Monsieur LE TORTOREC', qualiteChef: 'Proviseur', ville: 'Yvetot', signataireCourrier: 'Le DDFPT',
    adresseRetour: 'Lycée Queneau - Bureau du DDFPT, Rue du Dr Zamenhof 76 190 Yvetot', dateCA: '', assureur: '', contrat: '',
  };

  /* ---------- Calculs ---------- */
  const JOURS_SEMAINE = [['lundi', 'Lundi'], ['mardi', 'Mardi'], ['mercredi', 'Mercredi'], ['jeudi', 'Jeudi'], ['vendredi', 'Vendredi'], ['samedi', 'Samedi']];
  const minutes = v => { if (!v) return null; const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0); };
  const dureeJour = (h, j) => ['matin', 'apresmidi'].reduce((t, p) => { const a = minutes(h[`${j}_${p}_de`]), b = minutes(h[`${j}_${p}_a`]); return t + (a != null && b != null && b > a ? b - a : 0); }, 0);
  const hhmm = v => v ? v.replace(':', 'h') : '';
  const fmtDuree = m => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
  const dateFr = v => /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.slice(0, 10).split('-').reverse().join('/') : (v || '');
  const dateCourte = v => { const d = dateFr(v); return d.length === 10 ? d.slice(0, 6) + d.slice(8) : d; };
  function age(naissance, au) {
    if (!naissance) return null; const n = new Date(naissance + 'T00:00:00'), a = new Date((au || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
    let x = a.getFullYear() - n.getFullYear(); if (a < new Date(a.getFullYear(), n.getMonth(), n.getDate())) x--; return x;
  }
  function joursStage(du, au, h) {
    if (!du || !au || au < du) return { jours: 0, semaines: 0 };
    const avecHoraires = JOURS_SEMAINE.filter(([j]) => dureeJour(h || {}, j) > 0).map(([j]) => j);
    const ouvres = avecHoraires.length ? avecHoraires : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
    const noms = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    let n = 0; for (let d = new Date(du + 'T12:00:00'); d <= new Date(au + 'T12:00:00'); d.setDate(d.getDate() + 1)) if (ouvres.includes(noms[d.getDay()])) n++;
    const total = Math.round((new Date(au + 'T00:00:00') - new Date(du + 'T00:00:00')) / 864e5) + 1;
    return { jours: n, semaines: Math.max(1, Math.round(total / 7)) };
  }

  /* ---------- Texte fixe de la convention-type du lycée ---------- */
  const PREAMBULE = [
    'Vu le code du travail, notamment ses articles L. 4153-8 et 9, R.4153-38 à R.4153-45, D.4153-2 à D. 4153-4 et D.4153-15 à D. 4153-37,',
    'Vu le code de l’éducation, notamment ses articles. L 124-1 à 20 et D. 124-1 à D. 124-9,',
    'Vu la délibération du conseil d’administration du lycée en date du {dateCA} approuvant la convention-type et autorisant le chef d’établissement à conclure au nom de l’établissement toute convention relative aux périodes de formation en milieu professionnel conforme à la convention-type, il a été convenu ce qui suit :',
  ];
  const ARTICLES = [
    ['Article 1 - Objet de la convention', ['La présente convention a pour objet la mise en œuvre, au bénéfice de l’élève de l’établissement désigné, de périodes de formation en milieu professionnel réalisées dans le cadre de l’enseignement professionnel.']],
    ['Article 2 - Finalité de la formation en milieu professionnel', ['Les périodes de formation en milieu professionnel correspondent à des périodes temporaires de mise en situation en milieu professionnel au cours desquelles l’élève acquiert des compétences professionnelles et met en œuvre les acquis de sa formation en vue d’obtenir un diplôme ou une certification et de favoriser son insertion professionnelle. Le stagiaire se voit confier une ou des missions conformes au projet pédagogique défini par son établissement d’enseignement et approuvées par l’organisme d’accueil (article L.124-1 du code de l’éducation).', 'En aucun cas, sa participation à ces activités ne doit porter préjudice à la situation de l’emploi dans l’entreprise.']],
    ['Article 3 - Dispositions de la convention', ['La convention comprend des dispositions générales et des dispositions particulières constituées par les annexes pédagogique et financière.', 'L’annexe pédagogique définit les objectifs et les modalités pédagogiques de la période de formation en milieu professionnel. L’annexe financière définit les modalités de prise en charge des frais afférents à la période, ainsi que les modalités d’assurance.', 'La convention accompagnée de ses annexes est signée par le chef d’établissement, le représentant de l’entreprise ou l’organisme d’accueil de l’élève, le stagiaire ou, s’il est mineur, par son représentant légal, l’enseignant-référent et le tuteur de stage. La convention est ensuite adressée à la famille pour information.']],
    ['Article 4 - Obligations de la structure d’accueil (entreprise, administration, association…)', ['La structure d’accueil doit désigner un tuteur de stage qui dispose des connaissances et de l’expérience nécessaires à l’encadrement d’un stagiaire et s’assurer de sa disponibilité pour assurer cette fonction pendant toute la durée du stage.', 'La structure d’accueil veille à ce que le stagiaire bénéficie d’un accueil lors de son arrivée, au cours duquel il est informé des règles applicables dans l’établissement et notamment de celles relatives à la santé et à la sécurité.']],
    ['Article 5 - Statut et obligations de l’élève', ['L’élève demeure, durant la période de formation en milieu professionnel, sous statut scolaire. Il reste sous la responsabilité du chef d’établissement scolaire.', 'L’élève n’est pas pris en compte dans le calcul de l’effectif de l’entreprise. Il ne peut participer aux éventuelles élections professionnelles.', 'L’élève est soumis aux règles générales en vigueur dans l’entreprise, notamment en matière de sécurité, d’horaires et de discipline, sous réserve des dispositions des articles 5 et 6 de la présente convention.', 'L’élève est soumis au secret professionnel. Il est tenu d’observer une entière discrétion sur l’ensemble des renseignements qu’il pourra recueillir à l’occasion de ses fonctions ou du fait de sa présence dans l’entreprise. En outre, l’élève s’engage à ne faire figurer dans son rapport de stage aucun renseignement confidentiel concernant l’entreprise.', 'L’élève signale à l’enseignant référent les situations éventuelles de discrimination, harcèlement, violence à caractère sexiste ou sexuel.']],
    ['Article 6 - Allocation de l’Etat', ['Conformément au décret n° 2023-765 du 11 août 2023, relatif au versement d’une allocation en faveur des lycéens de la voie professionnelle dans le cadre de la valorisation des périodes de formation en milieu professionnel, et à l’arrêté du 11 août 2023 déterminant les montants et les conditions de versement de l’allocation aux lycéens de la voie professionnelle engagés dans les périodes de formation en milieu professionnel, une allocation financière est créée à destination des lycéens réalisant leurs périodes de formation en milieu professionnel (PFMP), dans le cadre d’une formation diplômante de niveau 3 et 4 ou dans le cadre de formations complémentaires d’initiative locale (FCIL) complémentaires à ces diplômes.', 'Cette allocation est versée par l’État au titre de l’ensemble des jours effectués par le lycéen en PFMP dans le cadre de la convention et attestés au moyen de l’attestation de stage mentionnée à l’article 21 de la présente convention.']],
    ['Article 7 - Gratification', ['L’élève ne peut prétendre à aucune rémunération de l’entreprise. Toutefois, il peut lui être alloué une gratification lorsque la durée de la période de formation en milieu professionnel au sein d’un même organisme d’accueil est supérieure à deux mois consécutifs ou, au cours d’une même année scolaire, à deux mois consécutifs (soit plus de quarante-quatre jours) ou non, la ou les périodes de formation en milieu professionnel font l’objet d’une gratification versée mensuellement. Son montant correspond à 15 % du plafond horaire de la sécurité sociale prévu à l’article D. 242-2-1 du code de la sécurité sociale.', 'Cette gratification n’a pas le caractère d’un salaire au sens de l’article L. 3221-3 du code du travail.', 'Lorsque le montant de la gratification dépasse le plafond indiqué ci-dessus, les obligations de l’employeur incombent à l’entreprise d’accueil du stagiaire, conformément aux dispositions du II-A de l’article R. 412-4 du code de la sécurité sociale.']],
    ['Article 8 - Durée du travail', ['En ce qui concerne la durée du travail, tous les élèves sont soumis à la durée hebdomadaire légale ou conventionnelle si celle-ci est inférieure à la durée légale.']],
    ['Article 9 - Durée et horaires de travail des élèves majeurs', ['Dans l’hypothèse où l’élève majeur est soumis à une durée hebdomadaire modulée, la moyenne des durées de travail hebdomadaires effectuées pendant la période en milieu professionnel ne pourra excéder les limites indiquées ci-dessus.', 'En ce qui concerne le travail de nuit, seul l’élève majeur nommément désigné par le chef d’établissement scolaire peut être incorporé à une équipe de nuit.']],
    ['Article 10 - Durée et horaires de travail des élèves mineurs', ['La durée de travail de l’élève mineur ne peut excéder 8 heures par jour et 35 heures par semaine.', 'Le repos hebdomadaire de l’élève mineur doit être d’une durée minimale de deux jours consécutifs. La période minimale de repos hebdomadaire doit comprendre le dimanche, sauf en cas de dérogation légale.', 'Pour chaque période de vingt-quatre heures, la période minimale de repos quotidien est fixée à quatorze heures consécutives pour l’élève mineur de moins de seize ans et à douze heures consécutives pour l’élève mineur de seize à dix-huit ans.', 'Au-delà de quatre heures et demie de travail quotidien, l’élève mineur doit bénéficier d’une pause d’au moins trente minutes consécutives.', 'Le travail de nuit est interdit :', '- à l’élève mineur de seize à dix-huit ans entre vingt-deux heures le soir et six heures le matin ;', '- à l’élève de moins de seize ans entre vingt heures et six heures.', 'Ces dispositions ne peuvent pas faire l’objet d’une dérogation.']],
    ['Article 11 - Avantages offerts par l’entreprise ou l’organisme d’accueil', ['Conformément à l’article L.124-13 du code de l’éducation, le stagiaire a accès au restaurant d’entreprise ou aux titres-restaurant prévus à l’article L. 3262-1 du code du travail, dans les mêmes conditions que les salariés de l’organisme d’accueil. Il bénéficie également de la prise en charge des frais de transport prévue à l’article L. 3261-2 du même code.']],
    ['Article 12 - Santé et sécurité au travail', ['Le stagiaire étant placé sous l’autorité du responsable de l’entreprise (ou organisme) d’accueil, il bénéficie des mêmes droits que les salariés dans le domaine de la santé et sécurité. L’entreprise ou l’organisme d’accueil veille à :', '- Procéder à l’évaluation des risques professionnels auxquels le stagiaire est susceptible d’être exposé, en fonction de son âge et de la réglementation en vigueur ;', '- Prendre toutes les mesures nécessaires pour assurer la sécurité et protéger la santé physique et mentale du stagiaire ;', '- Fournir au stagiaire les équipements de protection individuelle nécessaires, et veiller au port effectif de ces équipements par le stagiaire après l’avoir formé à leur utilisation ;', '- Informer et former le stagiaire des risques liés au poste de travail et des moyens pour les prévenir. En cas de non-respect des règles d’hygiène et de sécurité prévues par le règlement intérieur, l’employeur peut suspendre et mettre fin au stage en concertation avec l’établissement d’enseignement.', 'Le stagiaire bénéficie de dispositions spécifiques qui le protègent.', '- Conformément à l’art.L.124-14 du Code de l’éducation, il est interdit de confier au stagiaire des tâches dangereuses pour sa santé et sa sécurité.', '- Conformément aux articles L.4154-2 et L.4154-3 du Code du travail, le stagiaire affecté à un poste de travail présentant des risques particuliers pour sa santé ou sécurité bénéficie d’une formation renforcée à la sécurité ainsi que d’un accueil et d’une information adaptés dans l’entreprise dans laquelle il est employé. La liste de ces postes de travail est établie par le responsable de l’entreprise (ou organisme) d’accueil, après avis du médecin du travail et du comité social et économique, s’il existe. Elle est tenue à la disposition de l’agent de contrôle de l’inspection du travail.']],
    ['Article 13 - Sécurité - travaux interdits aux mineurs', ['En application des articles R.4153-38 à R.4153-45, D.4153-2 à D. 4153-4 et D.4153-15 à D. 4153-37 du code du travail, l’élève mineur de quinze ans au moins, peut être affecté aux travaux réglementés après que l’entreprise ait adressé à l’inspecteur du travail une déclaration de dérogation aux travaux interdits aux mineurs.', 'La déclaration de dérogation doit préciser le secteur d’activité de l’entreprise, les formations professionnelles pour lesquelles elle est établie, les différents lieux de formation, la liste des travaux susceptibles de dérogation et les équipements de travail liés à ces travaux ainsi que la qualité et la fonction de la (ou des) personne(s) compétente(s) pour encadrer le jeune pendant l’exécution des travaux précités. Elle est signée par le chef d’entreprise et adressée à l’inspecteur du travail.', 'L’élève ne doit utiliser ces machines, produits ou effectuer ces travaux en entreprise qu’avec l’autorisation et sous le contrôle permanent du tuteur.']],
    ['Article 14 - Sécurité électrique', ['L’élève ayant à intervenir, au cours de sa période de formation en milieu professionnel, sur - ou à proximité - des installations et des équipements électriques, doit y être habilité par le chef de l’entreprise d’accueil en fonction de la nature des travaux à effectuer. Cette habilitation ne peut être accordée qu’à l’issue d’une formation à la prévention des risques électriques suivie par l’élève en établissement scolaire, préalablement à sa période de formation en milieu professionnel.', 'L’habilitation est délivrée au vu d’un carnet individuel de formation établi par l’établissement scolaire qui certifie que, pour les niveaux d’habilitation mentionnés, la formation correspondante a été suivie avec succès par l’élève.']],
    ['Article 15 - Couverture des accidents du travail', ['En application de l’article L. 412-8 du code de la sécurité sociale, l’élève bénéficie de la législation sur les accidents du travail.', 'Conformément à l’article R. 412-4 du code de la sécurité sociale, lorsque l’élève est victime d’un accident survenant soit au cours du travail, soit au cours du trajet, l’obligation de déclaration d’accident incombe à l’entreprise d’accueil. Celle-ci adressera à la CPAM compétente, une lettre recommandée avec accusé de réception, dans les 48 heures suivant l’accident. Pour le calcul de ce délai de 48 heures, les dimanches et jours fériés ne sont pas comptés. L’entreprise fait parvenir, sans délai, une copie de la déclaration au chef d’établissement.']],
    ['Article 16 - Autorisation d’absence', ['En cas de grossesse, de paternité ou d’adoption, le stagiaire bénéficie de congés et d’autorisations d’absence d’une durée équivalente à celles prévues pour les salariés aux articles L. 1225-16 à L. 1225-28, L. 1225-35, L. 1225-37 et L. 1225-46 du code du travail.', 'Pour les périodes de formation en milieu professionnel dont la durée est supérieure à deux mois et dans la limite de six mois, la convention de stage doit prévoir la possibilité de congés et d’autorisations d’absence au bénéfice du stagiaire au cours de la période de formation en milieu professionnel.']],
    ['Article 17 - Assurance responsabilité civile', ['Le chef de l’entreprise d’accueil prend les dispositions nécessaires pour garantir sa responsabilité civile chaque fois qu’elle peut être engagée.', 'Le chef d’établissement contracte une assurance couvrant la responsabilité civile de l’élève pour les dommages qu’il pourrait causer pendant la durée de sa période de formation en milieu professionnel dans l’entreprise ou à l’occasion de la préparation de celle-ci.']],
    ['Article 18 - Encadrement et suivi de la période de formation en milieu professionnel', ['Les conditions dans lesquelles l’enseignant-référent de l’établissement et le tuteur dans l’entreprise (ou l’organisme) d’accueil assurent l’encadrement et le suivi du stagiaire figurent dans l’annexe pédagogique jointe à la présente convention. L’encadrement et le suivi du stage comporte à minima :', '- une prise de contact d’un professeur référent avec l’élève et le tuteur au cours de la première partie du stage ;', '- un suivi régulier d’un professeur référent avec élève et tuteur.', '- l’évaluation du stage.', 'L’encadrement et le suivi donne lieu à minima à une rencontre entre professeur référent, élève et tuteur.']],
    ['Article 19 - Suspension et résiliation de la convention de stage', ['Le chef d’établissement et le représentant de l’entreprise d’accueil se tiendront mutuellement informés des difficultés qui pourraient être rencontrées à l’occasion de la période de formation en milieu professionnel. Le cas échéant, ils prendront, d’un commun accord et en liaison avec l’équipe pédagogique, les dispositions propres à résoudre les problèmes d’absentéisme ou de manquement à la discipline. Au besoin, ils étudieront ensemble les modalités de suspension ou de résiliation de la période de formation en milieu professionnel.']],
    ['Article 20 - Validation de la période de formation en milieu professionnel en cas d’interruption', ['Lorsque le stagiaire interrompt sa période de formation en milieu professionnel pour un motif lié à la maladie, à un accident, à la grossesse, à la paternité, à l’adoption ou, en accord avec l’établissement, en cas de non-respect des stipulations pédagogiques de la convention ou en cas de rupture de la convention à l’initiative de l’organisme d’accueil, l’établissement propose au stagiaire une modalité alternative de validation de sa formation. En cas d’accord des parties à la convention, un report de la fin de la période de formation en milieu professionnel ou du stage, en tout ou partie, est également possible.']],
    ['Article 21 - Attestation de stage', ['A l’issue de la période de formation en milieu professionnel, le responsable de l’entreprise ou organisme d’accueil délivre une attestation conforme à l’attestation remise par le stagiaire en début de stage.', 'Ce document doit être complété et signé le dernier jour du stage par un responsable autorisé de l’entreprise ou organisme d’accueil.', 'Elle est remise au lycéen stagiaire, remise ou envoyée à l’établissement scolaire et conservée dans l’entreprise et dans l’établissement.']],
  ];

  /* ---------- pdf-lib (chargé à la demande) ---------- */
  const PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  const PDFLIB_SRI = 'sha512-z8IYLHO8bTgFqj+yrPyIJnzBDf7DDhWwiEsk4sY+Oe6J2M+WQequeGS7qioI5vT6rXgVRb4K1UVQC5ER7MKzKQ==';
  let chargement = null;
  function pdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!chargement) chargement = new Promise((ok, ko) => {
      const s = document.createElement('script'); Object.assign(s, { src: PDFLIB_URL, integrity: PDFLIB_SRI, crossOrigin: 'anonymous' });
      s.onload = () => ok(window.PDFLib); s.onerror = () => { chargement = null; ko(new Error('Impossible de préparer le PDF (connexion Internet ?)')); };
      document.head.append(s);
    });
    return chargement;
  }
  const octetsImage = url => deB64u(url.slice(url.indexOf(',') + 1).replace(/\+/g, '-').replace(/\//g, '_'));

  /* ---------- Fabrication du PDF ---------- */
  async function pdf(D, signatures) {
    const { PDFDocument, StandardFonts, rgb } = await pdfLib();
    const doc = await PDFDocument.create();
    const P = {
      h: await doc.embedFont(StandardFonts.Helvetica), hb: await doc.embedFont(StandardFonts.HelveticaBold), hi: await doc.embedFont(StandardFonts.HelveticaOblique),
      t: await doc.embedFont(StandardFonts.TimesRoman), tb: await doc.embedFont(StandardFonts.TimesRomanBold), ti: await doc.embedFont(StandardFonts.TimesRomanItalic),
    };
    const NOIR = rgb(0, 0, 0), ORANGE = rgb(0.89, 0.42, 0.04), GRIS = rgb(0.3, 0.3, 0.3), ROUGE = rgb(0.8, 0.05, 0.05);
    const W = 595.28, H = 841.89, L = 55, R = 545;
    let logo = null;
    try { const src = await PDFDocument.load(await fetch('protocole-2026-2027.pdf').then(r => r.arrayBuffer())); logo = await doc.embedPage(src.getPages()[0], { left: 35, bottom: 730, right: 205, top: 836 }); } catch { /* sans logo */ }
    const propre = (t, f) => [...String(t ?? '').replace(/\t/g, ' ')].filter(c => { if (c === '\n') return true; try { f.encodeText(c); return true; } catch { return false; } }).join('');
    const largeur = (t, f, s) => f.widthOfTextAtSize(t, s);
    function couper(t, f, s, w) {
      const out = [];
      for (const para of propre(t, f).split('\n')) {
        let ligne = '';
        for (const mot of para.split(' ')) {
          const essai = ligne ? ligne + ' ' + mot : mot;
          if (largeur(essai, f, s) <= w || !ligne) ligne = essai; else { out.push(ligne); ligne = mot; }
        }
        out.push(ligne);
      }
      return out;
    }
    let page, y;
    const nouvellePage = () => { page = doc.addPage([W, H]); y = H - 50; };
    const reserver = h => { if (y - h < 60) nouvellePage(); };
    const ecrire = (t, x, yy, f, s, c = NOIR) => { const p = propre(t, f); if (p) page.drawText(p, { x, y: yy, size: s, font: f, color: c }); };
    function paragraphe(t, { f = P.t, s = 9.5, c = NOIR, x = L, w = R - L, ecart = 1.2, apres = 2, retrait = 0 } = {}) {
      for (const l of couper(t, f, s, w - retrait)) { reserver(s * ecart); y -= s * ecart; ecrire(l, x + retrait, y, f, s, c); }
      y -= apres;
    }
    // Ligne « libellé : valeur » (valeur en gras), plusieurs paires possibles sur la même ligne.
    function champs(paires, { s = 9.5, x = L, f = P.h, fb = P.hb, ecart = 1.45 } = {}) {
      reserver(s * ecart); y -= s * ecart; let cx = x;
      for (const [lib, val, decal] of paires) {
        if (decal) cx = x + decal;
        ecrire(lib + ' : ', cx, y, f, s); cx += largeur(propre(lib + ' : ', f), f, s);
        const v = propre(val, fb), place = R - cx - 4; let taille = s;
        while (taille > 6 && largeur(v, fb, taille) > place) taille -= 0.25;
        ecrire(v, cx, y, fb, taille); cx += largeur(v, fb, taille) + 14;
      }
    }
    function cadre(debut, fin, x = L - 6, w = R - L + 12) { page.drawRectangle({ x, y: fin, width: w, height: debut - fin, borderColor: NOIR, borderWidth: 0.7 }); }
    function titreSection(t) { reserver(40); y -= 18; ecrire(t, L + 10, y, P.hb, 10, ORANGE); y -= 6; }
    function tableau(cols, lignes, { s = 8.5, f = P.h, fb = P.hb, entete = true, h = 16, centre = false } = {}) {
      for (let i = 0; i < lignes.length; i++) {
        const cellules = lignes[i], fi = entete && i === 0 ? fb : f;
        const hauteur = Math.max(h, ...cellules.map((c, j) => couper(c, fi, s, cols[j] - 8).length * s * 1.2 + 6));
        reserver(hauteur); let cx = L;
        for (let j = 0; j < cols.length; j++) {
          page.drawRectangle({ x: cx, y: y - hauteur, width: cols[j], height: hauteur, borderColor: NOIR, borderWidth: 0.6 });
          const ls = couper(cellules[j] || '', fi, s, cols[j] - 8);
          ls.forEach((l, k) => { const lw = largeur(l, fi, s); ecrire(l, centre || (entete && i === 0) ? cx + (cols[j] - lw) / 2 : cx + 4, y - 4 - (k + 1) * s * 1.1 + 1, fi, s); });
          cx += cols[j];
        }
        y -= hauteur;
      }
    }
    const e = D.eleve, n = D.entreprise, t = D.tuteur, et = D.etab, h = D.horaires || {};
    const ageEleve = age(e.naissance, D.stage.du), js = joursStage(D.stage.du, D.stage.au, h);

    /* Page 1 : courrier d'accompagnement */
    nouvellePage();
    page.drawRectangle({ x: 52, y: 715, width: 215, height: 72, borderColor: NOIR, borderWidth: 0.7 });
    const blocEtab = [et.nom.toUpperCase().replace('LYCEE POLYVALENT', 'LYCEE POLYVALENT\n')].join('').split('\n').filter(Boolean);
    blocEtab.forEach((l, i) => { const lw = largeur(propre(l, P.hb), P.hb, 8.5); ecrire(l, 159.5 - lw / 2, 768 - i * 10, P.hb, 8.5); });
    et.adressePostale.split('\n').forEach((l, i) => { const lw = largeur(propre(l, P.h), P.h, 6.5); ecrire(l, 159.5 - lw / 2, 738 - i * 8, P.h, 6.5); });
    ['Le Directeur Délégué aux', 'Formations', 'Professionnelles et Technologiques'].forEach((l, i) => { const lw = largeur(propre(l, P.h), P.h, 10); ecrire(l, 520 - lw, 795 - i * 12, P.h, 10); });
    ecrire('à', 515, 752, P.h, 10);
    [n.nom, ...String(n.adresse || '').split(/,\s*/)].forEach((l, i) => ecrire(l, 318, 700 - i * 11, P.h, 9.5));
    ecrire(n.representant || '', 316, 640, P.h, 10.5);
    ecrire('Affaire suivie par :', 55, 570, P.h, 10.5); ecrire(D.referent.nom || '', 55, 557, P.h, 10.5);
    ecrire('Professeur référent', 55, 532, P.h, 10.5);
    ecrire(`${et.ville}, le ${dateFr(D.creeLe)}`, 330, 557, P.h, 10.5);
    y = 500; ecrire('Madame, Monsieur,', 55, y, P.h, 10.5); y -= 14;
    const corps = [
      `Nous vous remercions d’accueillir au sein de votre entreprise notre élève ${e.prenom} ${e.nom.toUpperCase()}, de ${e.classe}, le temps de sa période de formation en entreprise.`,
      'Cette expérience sera très importante pour sa formation et les tâches auxquelles vous l’aurez associé(e) vont lui permettre de consolider ses connaissances, ses techniques et d’en développer de nouvelles.',
      'Votre participation conforte notre volonté de renforcer l’adéquation entre nos formations et la réalité professionnelle.',
      `Vous trouverez, jointe à ce courrier, la convention de stage de l’élève. Chaque signataire peut la consulter et la signer en ligne grâce au lien et au code personnels qui lui ont été transmis. Nous vous demandons de la vérifier et éventuellement de signaler toute correction. Vous pouvez aussi la retourner signée par voie postale à l’adresse « ${et.adresseRetour} ». Un exemplaire complet vous sera remis.`,
      'Vous remerciant pour votre collaboration à la formation des élèves, nous vous prions de recevoir, Madame, Monsieur, nos salutations distinguées.',
    ];
    for (const p of corps) { y -= 6; paragraphe(p, { f: P.h, s: 10.5, ecart: 1.3, retrait: 0, x: 55, w: 490 }); }
    y -= 20; ecrire(et.signataireCourrier, 400, y, P.h, 10.5);

    /* Page 2 : laissée blanche (impression recto verso) */
    nouvellePage();

    /* Page 3 : les parties */
    nouvellePage();
    if (logo) page.drawPage(logo, { x: 50, y: 715, width: 110, height: 68 });
    ['CONVENTION RELATIVE A LA FORMATION EN MILIEU', 'PROFESSIONNEL DES ELEVES DE LYCEE PROFESSIONNEL'].forEach((l, i) => ecrire(l, 190, 778 - i * 20, P.hb, 11.5));
    y = 700; if (D.diplome) { ecrire(D.diplome.toUpperCase(), 105, y, P.tb, 10); }
    y = 678; ecrire('Entre l’entreprise (ou l’organisme d’accueil) ci-dessous désigné(e) :', 135, y, P.hb, 9.5, ORANGE); y -= 8;
    let d0 = y;
    champs([['Nom de l’entreprise (ou organisme d’accueil )', n.nom]]);
    champs([['Adresse', n.adresse]]); champs([['Domaine d’activités de l’entreprise', n.domaine]]);
    champs([['N° de téléphone', n.tel], ['N° de portable', n.portable, 260]]);
    champs([['N° d’immatriculation de l’entreprise', n.siret]]);
    champs([['Représenté(e)par', n.representant], ['Fonction', n.fonction], ['E-mail', n.email]]);
    paragraphe('Atteste avoir adressé à l’inspecteur du travail le …/…/… la déclaration de dérogation aux travaux interdits aux mineurs prévue à l’article R.4153-41 du code du travail.', { f: P.hi, s: 9, apres: 0 });
    champs([['Nom et fonction du tuteur', [t.nom, t.fonction].filter(Boolean).join(' - ')], ['E-mail', t.email]]);
    champs([['N° de tél', t.tel]]); y -= 8; cadre(d0, y);
    y -= 18; ecrire('L’établissement d’enseignement professionnel :', 70, y, P.hb, 9.5, ORANGE); y -= 8; d0 = y;
    champs([['Nom de l’établissement', et.nom]]); champs([['Adresse', et.adresse]]); champs([['N° de téléphone', et.tel]]);
    champs([['Représenté par', et.chef], ['En qualité de', et.qualiteChef, 270]]); champs([['Mail', et.mail]]);
    champs([['Nom de l’enseignant référent', D.referent.nom], ['N° Téléphone', D.referent.tel || et.tel, 270]]); champs([['Mail', D.referent.email]]);
    y -= 8; cadre(d0, y);
    y -= 18; ecrire('L’élève :', 70, y, P.hb, 9.5, ORANGE); y -= 8; d0 = y;
    champs([['Nom', e.nom.toUpperCase()], ['Prénom', e.prenom, 260]]);
    champs([['Date de naissance', `${dateFr(e.naissance)}${ageEleve != null ? `   ${ageEleve} ans` : ''}`], ['Classe', e.classe, 260], ['Groupe', e.groupe || '', 380]]);
    champs([['Adresse personnelle', e.adresse]]);
    champs([['N° de téléphone', e.tel], ['E-mail', e.email || '', 260]]);
    if (D.mineur) champs([['Représentant légal', [D.representant.nom, D.representant.tel].filter(Boolean).join(' - ')]]);
    y -= 8; cadre(d0, y);
    y -= 18; ecrire('Pour une durée :', 70, y, P.hb, 9.5, ORANGE); y -= 8; d0 = y;
    y -= 18; ecrire(`Du : du ${dateCourte(D.stage.du)} au ${dateCourte(D.stage.au)} Soit ${js.jours} jours , ${js.semaines} semaine${js.semaines > 1 ? 's' : ''} .`, L, y, P.tb, 11); y -= 6;
    paragraphe('* Conformément à l’article D.124-6 du code de l’éducation, « Chaque période au moins égale à sept heures de présence, consécutives ou non, est considérée comme équivalente à un jour et chaque période au moins égale à vingt-deux jours de présence, consécutifs ou non, est considérée comme équivalente à un mois. »', { f: P.ti, s: 9 });
    y -= 10; cadre(d0, y);

    /* Pages 4 à 6 : dispositions générales */
    nouvellePage();
    for (const p of PREAMBULE) paragraphe(p.replace('{dateCA}', et.dateCA || '…/…/…'), { s: 9.5 });
    for (const [titre, paras] of ARTICLES) {
      reserver(40); y -= 10; paragraphe(titre, { f: P.tb, s: 11, c: ORANGE, apres: 0 });
      for (const p of paras) paragraphe(p, { s: 9.2, apres: 0.5, retrait: p.startsWith('- ') ? 18 : 0 });
    }

    /* Page des signatures */
    nouvellePage();
    ecrire('Signatures et cachets :', 75, 790, P.tb, 12, ORANGE);
    const X = [75, 185, 365, 545], HAUT = 775, HROW = 236;
    const lignesSig = [['L’élève', 'representant', 'eleve'], ['L’entreprise ou\norganisme d’accueil', 'entreprise', 'tuteur'], ['L’établissement\nscolaire', 'chef', 'referent']];
    for (let i = 0; i < 3; i++) {
      const yh = HAUT - i * HROW, yb = yh - HROW, [titre, ...rs] = lignesSig[i];
      for (let j = 0; j < 3; j++) page.drawRectangle({ x: X[j], y: yb, width: X[j + 1] - X[j], height: HROW, borderColor: NOIR, borderWidth: 0.7 });
      titre.split('\n').forEach((l, k) => ecrire(l, X[0] + 6, yb + HROW / 2 - k * 13, P.tb, 10.5, ORANGE));
      for (let j = 0; j < 2; j++) {
        const role = rs[j], sg = signatures[role], cx = X[j + 1] + 6, w = X[j + 2] - X[j + 1] - 12;
        let yy = yh - 15;
        couper(ROLES[role].titre, P.ti, 9.5, w).forEach(l => { ecrire(l, cx, yy, P.ti, 9.5); yy -= 12; });
        if (!rolesRequis(D).includes(role)) { yy -= 8; ecrire(role === 'representant' ? 'Sans objet : élève majeur' : 'Sans objet : le représentant est aussi le tuteur', cx, yy, P.hi, 8.5, GRIS); continue; }
        yy -= 6;
        ecrire(`Fait à ${sg ? sg.lieu : '…………………'} le ${sg ? dateFr(sg.date) : '……………'}`, cx, yy, P.ti, 9.5); yy -= 18;
        const lib = ['entreprise', 'tuteur', 'chef'].includes(role) ? 'Signature et cachet' : 'Nom et signature';
        couper(`${lib} : ${sg ? sg.nom : nomSignataire(D, role) || ''}`, P.ti, 9.5, w).forEach(l => { ecrire(l, cx, yy, P.ti, 9.5); yy -= 12; });
        if (role === 'chef') couper('Ou par délégation le chef d’établissement adjoint ou le DDFPT', P.ti, 8, w).forEach(l => { ecrire(l, cx, yy, P.ti, 8); yy -= 10; });
        if (sg) {
          const zone = { x: cx, y: yb + 22, w, h: yy - yb - 30 };
          const images = [sg.img, sg.cachet].filter(Boolean);
          for (let k = 0; k < images.length; k++) {
            try {
              const url = images[k], img = url.startsWith('data:image/png') ? await doc.embedPng(octetsImage(url)) : await doc.embedJpg(octetsImage(url));
              const bw = images.length > 1 ? zone.w / 2 - 4 : zone.w, sc = Math.min(bw / img.width, zone.h / img.height, 1);
              page.drawImage(img, { x: zone.x + k * (zone.w / 2 + 4) + (bw - img.width * sc) / 2, y: zone.y + (zone.h - img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
            } catch { /* image illisible : ignorée */ }
          }
          ecrire(`Signé électroniquement le ${dateFr(sg.signeLe)} à ${String(sg.signeLe || '').slice(11, 16)}`, cx, yb + 8, P.hi, 6.5, GRIS);
        }
      }
    }

    /* Annexe pédagogique */
    nouvellePage();
    ecrire('ANNEXE PEDAGOGIQUE - Annexe 1', 205, 790, P.tb, 12, ORANGE); y = 770; d0 = y;
    const ligneT = (lib, val, gras = true) => { y -= 22; ecrire(lib + ' : ', L + 6, y, P.tb, 10); ecrire(val || '', L + 6 + largeur(lib + ' : ', P.tb, 10), y, gras ? P.tb : P.t, 10); };
    ligneT('Nom, prénom de l’élève', `${e.nom.toUpperCase()} ${e.prenom}${ageEleve != null ? `    ${ageEleve} ans` : ''}`);
    ligneT('Diplôme préparé', D.diplome || ''); ligneT('Classe', e.classe);
    y -= 22; ecrire('Nom du (ou des) enseignant(s)-référent(s) chargé(s) de suivre le déroulement de la formation en', L + 6, y, P.tb, 10);
    y -= 16; ecrire('entreprise : ' + (D.referent.nom || ''), L + 6, y, P.t, 10);
    ligneT('Nom du tuteur', t.nom, false);
    y -= 22; ecrire('Dates de la période de formation en milieu professionnel :', L + 6, y, P.t, 10);
    y -= 22; ecrire(`du ${dateCourte(D.stage.du)} au ${dateCourte(D.stage.au)}`, 230, y, P.tb, 10); y -= 12; cadre(d0, y, L, R - L);
    y -= 20; ecrire('1 - Horaires journaliers de l’élève', L, y, P.tb, 10.5); y -= 14;
    const lignesH = [['', 'Matin', 'Après-midi']].concat(JOURS_SEMAINE.filter(([j]) => dureeJour(h, j) > 0)
      .map(([j, l]) => [l, h[j + '_matin_de'] ? `${hhmm(h[j + '_matin_de'])}-${hhmm(h[j + '_matin_a'])}` : '', h[j + '_apresmidi_de'] ? `${hhmm(h[j + '_apresmidi_de'])}-${hhmm(h[j + '_apresmidi_a'])}` : '']));
    tableau([120, 100, 100], lignesH, { s: 9.5, f: P.t, fb: P.t, h: 14 });
    const hebdo = JOURS_SEMAINE.reduce((s, [j]) => s + dureeJour(h, j), 0);
    y -= 22; ecrire(`Soit une durée totale hebdomadaire de : ${fmtDuree(hebdo)}`, 220, y, P.tb, 10);
    y -= 22; paragraphe('2 - Modalités de concertation entre le(s) enseignant(s)-référent(s) et le tuteur pour contrôler le déroulement de la période :', { s: 10 });
    tableau([150, 160, 165], [['Etapes de l’encadrement et du suivi', 'Date / période / fréquence', 'Modalité(s) d’encadrement et de suivi'], ['au début du stage', '', 'O à distance      O sur site'], ['pendant le stage', '', 'O à distance      O sur site']], { s: 8.5 });
    y -= 14; paragraphe('3 - Objectifs assignés et compétences à acquérir ou à développer au cours de la période de formation en milieu professionnel :', { s: 10 });
    tableau([160, 155, 160], [['Compétences visées', 'Bloc de compétences du référentiel, auquel les compétences visées sont rattachées', 'Résultat/performance attendu'], ['', '', ''], ['', '', ''], ['', '', '']], { s: 8.5, h: 20 });
    nouvellePage();
    paragraphe('4 - Activités prévues en milieu professionnel : Document fourni par le professeur de la spécialité.', { s: 10, apres: 10 });
    paragraphe('5 - Travaux effectués, équipements ou produits utilisés soumis à la procédure de dérogation pour les travaux interdits aux mineurs (cf. article 10 de la présente convention) :', { s: 10, apres: 30 });
    paragraphe('6 - Modalités d’évaluation de la période de formation en milieu professionnel, en référence au règlement d’examen du diplôme préparé :', { s: 10 });
    tableau([240, 235], [['Type d’évaluation', 'Date / période'], ['O  formative', ''], ['O  certificative', '']], { s: 8.5, h: 22 });
    y -= 14; d0 = y; y -= 14; ecrire('Si évaluation certificative, précisez la forme et l’objet de l’épreuve prévue au référentiel d’évaluation :', L + 4, y, P.hb, 8.5); y -= 150; cadre(d0, y, L, R - L);

    /* Annexe financière */
    nouvellePage();
    ecrire('ANNEXE FINANCIERE – Annexe 2', 200, 790, P.tb, 12, ORANGE); y = 765; d0 = y;
    y -= 28; ecrire('Nom, prénom de l’élève : ', L + 6, y, P.hb, 9); ecrire(`${e.nom.toUpperCase()} ${e.prenom}`, L + 6 + largeur('Nom, prénom de l’élève : ', P.hb, 9), y, P.hb, 9);
    y -= 20; ecrire('Classe : ', L + 6, y, P.hb, 9); ecrire(e.classe, L + 6 + largeur('Classe : ', P.hb, 9), y, P.tb, 10); y -= 28; cadre(d0, y, L, 460);
    y -= 4; paragraphe('Pour aider l’établissement à mieux gérer ses frais d’organisation des périodes de formation en milieu professionnel, nous vous serions reconnaissants de bien vouloir remplir le document suivant et le retourner avec la convention signée.', { f: P.ti, s: 10, w: 460 });
    y -= 6; paragraphe('1 - Avantages offerts par l’entreprise ou l’organisme d’accueil', { f: P.tb, s: 10, apres: 0 });
    paragraphe('L’entreprise participe-t-elle aux frais occasionnés par l’élève pendant la période de formation en entreprise ?', { s: 10 });
    paragraphe('Oui  □                               Non  □', { f: P.tb, s: 10, apres: 10 });
    paragraphe('Si oui :', { f: P.tb, s: 10 });
    for (const [a, b] of [['□  Frais de restauration :', 'soit par repas :'], ['□  Frais de transport :', 'soit par jour :'], ['□  Frais d’hébergement :', 'soit par nuit']]) { y -= 14; ecrire(a, L, y, P.t, 10); ecrire(b, 310, y, P.t, 10); }
    y -= 20; paragraphe('2 - Gratification éventuelle', { f: P.tb, s: 10, apres: 0 }); paragraphe('Montant de la gratification :', { s: 10, apres: 0 }); paragraphe('Modalités de versement :', { s: 10, apres: 12 });
    paragraphe('3 - Assurances', { f: P.tb, s: 10, apres: 8 });
    d0 = y; y -= 18; ecrire('Pour l’entreprise', L + 6, y, P.tb, 10);
    y -= 20; ecrire(`Nom de l’assureur : ${D.assurance.assureur || ''}`, L + 6, y, P.tb, 10, ROUGE);
    y -= 14; ecrire(`N° du contrat : ${D.assurance.contrat || ''}`, L + 26, y, P.tb, 10, ROUGE);
    y -= 20; ecrire('Pour l’établissement', L + 6, y, P.tb, 10);
    y -= 16; ecrire(`Nom de l’assureur : ${et.assureur || ''}`, L + 6, y, P.t, 10);
    y -= 14; ecrire(`N° du contrat : ${et.contrat || ''}`, L + 26, y, P.t, 10); y -= 14; cadre(d0, y, L, 460);

    // Numéros de page
    doc.getPages().forEach((p, i) => p.drawText(`Page ${i + 1}`, { x: R - 30, y: 30, size: 10, font: P.h, color: NOIR }));
    doc.setTitle(`Convention de stage - ${e.prenom} ${e.nom} - ${n.nom}`); doc.setCreator('Suivi des stages');
    return doc.save();
  }

  /* ---------- Signature : capture au doigt, au stylet, à la souris ou par photo ---------- */
  function padSignature(canvas) {
    const ctx = canvas.getContext('2d'); let traits = 0, dessin = false, dernier = null;
    function dimensionner() {
      const r = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * ratio); canvas.height = Math.round(r.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1a5c';
      traits = 0;
    }
    const pos = ev => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    canvas.addEventListener('pointerdown', ev => { dessin = true; dernier = pos(ev); try { canvas.setPointerCapture(ev.pointerId); } catch { /* stylet ou souris sans capture */ } ev.preventDefault(); });
    canvas.addEventListener('pointermove', ev => {
      if (!dessin) return; const p = pos(ev);
      ctx.beginPath(); ctx.moveTo(dernier[0], dernier[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); dernier = p; traits++; ev.preventDefault();
    });
    const fin = () => { dessin = false; };
    canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
    dimensionner();
    return { effacer: dimensionner, vide: () => traits < 5, image: () => canvas.toDataURL('image/png') };
  }
  // Photo (signature sur papier, cachet) : réduite à 900 px pour rester légère.
  function photoEnImage(fichier, max = 900) {
    return new Promise((ok, ko) => {
      if (!fichier || !/^image\//.test(fichier.type)) return ko(new Error('Choisissez une photo (JPEG ou PNG).'));
      const url = URL.createObjectURL(fichier), img = new Image();
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Photo illisible.')); };
      img.src = url;
    });
  }

  return { nouvelleCle, chiffrer, dechiffrer, cleDepuisMotDePasse, nouveauCode, normaliserCode, lien, ROLES, ORDRE_ROLES, rolesRequis, nomSignataire,
    ETAB_DEFAUT, joursStage, age, dateFr, pdf, padSignature, photoEnImage, dureeJour, JOURS_SEMAINE };
})();
