# Retraites 2027 : où trouveriez-vous les 6 milliards ?

Un simulateur citoyen, simple et sourcé, sur le débat budgétaire de l'automne 2026 : trois leviers
(revalorisation des pensions de base, abattement fiscal de 10 %, CSG des retraités), un objectif
de 6 milliards d'euros d'économies, et l'effet concret sur quatre retraités types.

Tout tourne dans le navigateur, sans serveur, sans publicité, sans collecte de données.

## Fichiers

- `index.html` : la page.
- `style.css` : les styles, adaptés au mobile et au mode sombre.
- `params.js` : **tous les paramètres chiffrés et leurs sources**. C'est ici que se discute la méthode.
- `app.js` : le moteur de calcul (économies pour l'État, revenu net des personnages) et l'affichage.
- `outils/simulation-plafond.py` : la microsimulation qui calibre le rendement des plafonds intermédiaires de l'abattement.

## Méthode

Voir la section « Méthode, hypothèses et sources » en bas de la page. En résumé :

- Économies pour l'État : coefficients issus des estimations publiées (Rexecode, Cour des comptes,
  PLF 2026, déclarations du gouvernement), avec les fourchettes quand les sources divergent.
- Effet sur les retraités : calcul complet du revenu net après CSG, CRDS, CASA, cotisation maladie
  sur la complémentaire et impôt sur le revenu (barème, quotient familial, décote, réduction EHPAD),
  par différence avec une situation de référence où les pensions suivent l'inflation.

## Contribuer

Une erreur de chiffre, une source plus récente, une hypothèse discutable : ouvrez une issue ou une
pull request. Les valeurs sont toutes dans `params.js`.

## Licence

MIT.
