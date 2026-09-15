// Tous les paramètres du simulateur, avec leurs sources (recherche arrêtée au 15 septembre 2026).
// Convention : on raisonne en euros 2027, sur une année pleine. Les valeurs « [estimation] » sont
// déduites des sources citées quand aucun chiffre officiel n'existe encore (PLF et PLFSS 2027 non déposés).
const P = {
  annee: 2027,
  objectif: 6,               // Md€ : économies visées par le gouvernement sur les retraites en 2027 (Amiel, 11/09/2026)
  hausseSpontanee: 12,       // Md€ : hausse spontanée des dépenses des régimes de base (Martinot ; fourchette 10,5 à 12)
  inflation: 2.1,            // % : revalorisation légale prévue au 1er janvier 2027 (Bercy sept. 2026 ; CCSS mai 2026 : 1,6)
  inflationFourchette: [1.6, 2.1],
  revaloComplementaire: 2.1,  // % : la complémentaire est supposée suivre l'inflation, pour isoler l'effet des leviers.
  revaloAgircAttendue: 1.6,   // % : en réalité, revalorisation Agirc-Arrco attendue au 1er novembre 2026 (inflation − 0,4 point ; fourchette 1,2 à 2,0)
  revaloAgircFourchette: [1.2, 2.0],

  // Levier 1 : revalorisation des pensions de base
  mdParPoint: 2.9,           // Md€ par point de revalorisation en moins : 6 Md€ pour 2,1 % selon Bercy
  mdParPointFourchette: [2.2, 3.5],   // PLFSS 2026 annexe 3 (2,2) à Rexecode (3,5) ; masse 2027 ≈ 315 Md€ → 3,0 [estimation]
  // Part de l'économie conservée si l'on protège les pensions sous un seuil (brut mensuel) :
  // gel > 2 000 € = 2,9 Md€ (Rexecode) sur un gel total de 6 à 7 Md€ ; gel > 1 400 € ≈ 4 Md€ [estimation Sénat/PLFSS 2026]
  partMasseAuDessus: { 0: 1, 1400: 0.67, 2000: 0.45 },

  // Levier 2 : abattement de 10 % sur les pensions (art. 158-5-a CGI). Le curseur abaisse le plafond par foyer, jusqu'à 0 (suppression).
  abatt: {
    taux: 0.10,
    plafond: 4528, minimum: 463,        // revenus 2026 [estimation : 4 439 € / 454 € pour les revenus 2025, indexés de 2 %]
    plafonds: [0, 1000, 2000, 3000, 4528],
    // Md€ économisés selon le plafond retenu. 0 = suppression totale (Cour des comptes / OFCE 4,5 ; Bercy 5,7 ; retenu 5,5).
    // Plafonds intermédiaires : [estimation] microsimulation simplifiée (distribution des pensions calée sur la DREES,
    // barème 2027, abattement des plus de 65 ans, décote), normalisée pour que la suppression totale rapporte 5,5 Md€.
    gains: { 0: 5.5, 1000: 3.9, 2000: 2.4, 3000: 1.1, 4528: 0 },
    gainSuppressionFourchette: [4.5, 5.7],
    cout: 5.3,                          // Md€ : dépense fiscale n° 120401, prévision 2025 (Voies et moyens, PLF 2026)
    beneficiaires: 15.1,                // millions de ménages (Voies et moyens)
  },

  // Levier 3 : CSG sur les pensions
  csg: {
    tauxPlein: 8.3, tauxSalaries: 9.2,
    mdParPoint: 3.3, mdParPointFourchette: [2.2, 3.9],  // alignement 8,3 → 9,2 : 2 à 3,5 Md€ ; précédent 2018 : 4,5 Md€ pour 1,7 point
    repartition: { 0: 29, 3.8: 15, 6.6: 27, 8.3: 29 },  // % des retraités du régime général par taux (2024)
    // seuils de revenu fiscal de référence : [exonération, taux 3,8 %, taux 6,6 %], au-delà taux plein
    // 2026 (instruction DSS 11/12/2025) : 1 part 13 048 / 17 057 / 26 472 ; 2 parts 20 016 / 26 167 / 40 604. Ici indexés de 0,9 % pour 2027 [estimation]
    seuils: { 1: [13165, 17211, 26710], 2: [20196, 26402, 40969] },
    deductible: { 8.3: 5.9, 6.6: 4.2, 3.8: 3.8, 0: 0 },  // points de CSG déductibles du revenu imposable (art. 154 quinquies CGI)
    crds: 0.5, casa: 0.3, maladieComplementaire: 1.0,
  },

  // Impôt sur le revenu : barème revenus 2025 (LF 2026) indexé de 2 % comme annoncé pour le PLF 2027 [estimation]
  indexBareme: 1.02,       // les paramètres fiscaux 2027 ci-dessous sont divisés par ce coefficient pour reconstituer 2026
  indexSeuilsCsg: 1.009,   // idem pour les seuils de CSG (revalorisés de l'inflation 2025, 0,9 %)
  ir: {
    tranches: [[11832, 0], [30091, 0.11], [86269, 0.30], [185555, 0.41], [Infinity, 0.45]],
    decote: { seul: [915, 2022], couple: [1513, 3344], taux: 0.4525 },   // revenus 2025 : 897 € / 1 483 €
    abattement65: { montant1: 2878, seuil1: 18023, montant2: 1439, seuil2: 28999 },  // art. 157 bis CGI, revenus 2025 : 2 822 € si ≤ 17 670 € ; 1 411 € si ≤ 28 430 €
  },

  ehpad: { reductionTaux: 0.25, reductionPlafond: 10000, prixMoyenASH: 2164, prixMoyenNonASH: 3128 },  // CNSA, prix 2024, hébergement + dépendance GIR 5-6
  population: 69.1e6,        // INSEE, 1er janvier 2026
  deficitSecu2026: 23.2,     // Md€, régimes obligatoires de base + FSV (CCSS mai 2026)
  deficitVieillesse2026: 7.5,

  personas: [
    {
      id: 'bernard', nom: 'Bernard et Chantal', emoji: '👫', age: '72 et 70 ans', parts: 2,
      story: "Il a été professeur de lycée, elle cadre dans une PME. Propriétaires de leur maison, ils aident un peu leurs petits-enfants et voyagent une fois par an.",
      membres: [
        { nom: 'Bernard', brut: 2600, base: 2600, compl: 0, note: 'pension de fonctionnaire, 100 % régime de base' },
        { nom: 'Chantal', brut: 1700, base: 1050, compl: 650, note: 'régime général + Agirc-Arrco' },
      ],
    },
    {
      id: 'simone', nom: 'Simone', emoji: '👵', age: '79 ans', parts: 1,
      story: "Veuve, ancienne employée de commerce à temps partiel. Sa pension inclut la réversion de son mari. Locataire, elle compte chaque euro à la fin du mois.",
      membres: [
        { nom: 'Simone', brut: 1050, base: 780, compl: 270, note: 'droits propres + réversion ; à peu près le niveau du minimum vieillesse (1 044 €)' },
      ],
    },
    {
      id: 'rene', nom: 'René', emoji: '👴', age: '94 ans', parts: 1, ehpad: 2500,
      story: "Ancien ouvrier puis chef d'équipe, il vit en EHPAD depuis trois ans. Sa pension ne couvre pas le tarif : son épargne et sa fille complètent chaque mois.",
      membres: [
        { nom: 'René', brut: 1900, base: 1300, compl: 600, note: 'régime général + Agirc-Arrco' },
      ],
    },
  ],

  sources: [
    { id: 'amiel', titre: "David Amiel, ministre des Comptes publics, 11 septembre 2026 : l'indexation coûte 6 Md€, l'abattement de 10 % en vaut autant (Moneyvox)", url: 'https://www.moneyvox.fr/retraite/actualites/110346/budget-2027-abattement-de-10-ou-indexation-des-retraites-le-gouvernement-veut-faire-un-choix' },
    { id: 'afp', titre: "AFP, 14 septembre 2026 : gel, fin de l'abattement (5,7 Md€ selon Bercy), hausse de la CSG, les pistes pour trouver 6 Md€", url: 'https://www.moneyvox.fr/retraite/actualites/110372/retraites-gel-fin-de-abattement-hausse-de-la-csg-comment-executif-espere-trouver-6-milliards-euros' },
    { id: 'martinot', titre: "Bertrand Martinot, 13 septembre 2026 : hausse spontanée de 12 Md€ des dépenses de retraite en 2027", url: 'https://econostrum.info/retraites-desindexation-ou-suppression-de-labattement/' },
    { id: 'rexecode', titre: "Rexecode (août 2026) : gel total 7 Md€, gel au-dessus de 2 000 € 2,9 Md€", url: 'https://www.moneyvox.fr/votre-argent/actualites/110064/budget-2027-gel-partiel-des-retraites-niches-fiscales-les-premieres-pistes-du-gouvernement' },
    { id: 'ccss', titre: "Commission des comptes de la Sécurité sociale, rapport de mai 2026 : masse des pensions de base 304,3 Md€ en 2026, déficit 23,2 Md€, inflation de référence 1,6 %", url: 'https://www.securite-sociale.fr/files/live/sites/SSFR/files/medias/CCSS/2026/CCSS%20mai%202026_assembl%C3%A9_V2.pdf' },
    { id: 'plfss2026', titre: "PLFSS 2026, annexe 3 : rendement du gel des pensions en 2026", url: 'https://www.assemblee-nationale.fr/dyn/dyn/contenu/visualisation/1089896/file/PLFSS2026-Annexe3-20251015-103900-55-4.pdf' },
    { id: 'ipp', titre: "Institut des politiques publiques, juin 2026 : sous-indexer les retraites, effets et effet retour d'environ 20 %", url: 'https://www.ipp.eu/wp-content/uploads/2026/06/Chapitre_Desindexation_retraite___Rapport_Perspectives_Budgetaires_2027-3.pdf' },
    { id: 'voies', titre: "PLF 2026, Voies et moyens tome II : dépense fiscale n° 120401 (abattement de 10 %), 4,8 Md€ en 2024, 5,3 Md€ en 2025, 15,1 millions de ménages", url: 'https://www.budget.gouv.fr/documentation/file-download/30586' },
    { id: 'ofce', titre: "OFCE, Pierre Madec, janvier 2025 : coût de l'abattement de 10 %, 4,5 Md€", url: 'https://www.ofce.fr/blog2024/fr/2025/20250109_PM/' },
    { id: 'plf2026', titre: "PLF 2026, article 6 : abattement forfaitaire de 2 000 € par pensionné (rejeté le 13 novembre 2025) ; le Sénat proposait plutôt d'abaisser le plafond", url: 'https://www.assemblee-nationale.fr/dyn/opendata/PRJLANR5L17B1906.html' },
    { id: 'drees2025', titre: "DREES, Les retraités et les retraites, édition 2025 : distribution des pensions", url: 'https://www.drees.solidarites-sante.gouv.fr/sites/default/files/2025-07/Les%20retrait%C3%A9s%20et%20les%20retraites%20-%20%C3%89dition%202025.pdf' },
    { id: 'senat2017', titre: "Sénat, novembre 2017 : la hausse de 1,7 point de CSG rapporte 4,5 Md€ sur les retraités", url: 'https://www.senat.fr/presse/cp20171108a.html' },
    { id: 'dss', titre: "Instruction DSS du 11 décembre 2025 : seuils de CSG 2026 sur les pensions", url: 'https://legislation.lassuranceretraite.fr/Pdf/instruction_ministerielle_11122025.pdf' },
    { id: 'cfdt', titre: "CFDT Retraités : taux de CSG, répartition des retraités par taux (2024)", url: 'https://www.xn--cfdt-retraits-mhb.fr/CSG2026' },
    { id: 'cgi197', titre: "Article 197 du CGI : barème de l'impôt et décote (revenus 2025)", url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053542636' },
    { id: 'bareme2027', titre: "Indexation du barème 2027 sur l'inflation, environ 2 % (annonce du 13 septembre 2026)", url: 'https://www.moneyvox.fr/impot/actualites/110310/impot-sur-le-revenu-2027-le-nouveau-bareme-indexe-a-inflation' },
    { id: 'abatt', titre: "impots.gouv : abattement de 10 % sur les pensions, minimum et plafond (revenus 2025)", url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/pensions.htm' },
    { id: 'boi157', titre: "BOFiP : abattement en faveur des personnes âgées de plus de 65 ans (art. 157 bis CGI)", url: 'https://bofip.impots.gouv.fr/bofip/2036-PGP.html/identifiant=BOI-IR-BASE-40-20260407' },
    { id: 'ehpad', titre: "CNSA : prix des EHPAD en 2024 (2 164 € par mois en place habilitée à l'aide sociale, 3 128 € sinon)", url: 'https://www.cnsa.fr/' },
    { id: 'drees', titre: "DREES, mai 2026 : 17,3 millions de retraités, pension moyenne brute 1 705 € fin 2024", url: 'https://drees.solidarites-sante.gouv.fr/communique-de-presse-jeux-de-donnees/jeux-de-donnees/effectifs-de-retraites-et-montants-des' },
    { id: 'cnav', titre: "Assurance retraite : revalorisation de 0,9 % au 1er janvier 2026, minimum vieillesse 1 043,59 €", url: 'https://www.lassuranceretraite.fr/portail-info/hors-menu/actualites-nationales/retraite/2025/revalorisation-2026.html' },
    { id: 'agirc', titre: "Agirc-Arrco : la valeur du point est fixée par les partenaires sociaux (accord de 2023), gel en novembre 2025", url: 'https://www.agirc-arrco.fr/storage/20251017_CP_Revalorisation-valeur-du-point-Agirc-Arrco.pdf' },
    { id: 'insee', titre: "INSEE : population de la France au 1er janvier 2026, 69,1 millions", url: 'https://www.insee.fr/fr/statistiques/8719824' },
  ],
  repo: 'https://github.com/AntoineTilloy/retraites-2027',
};
