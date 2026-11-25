# Générateur de devis et factures

Une petite application web pour créer des **devis** et des **factures** propres en quelques secondes, directement dans le navigateur. Pas de compte, pas de serveur : vos données restent sur votre appareil.

## Fonctionnalités

- Devis ou facture en un clic, avec aperçu en direct
- Numérotation automatique par année (`D-2026-001`, `F-2026-001`…)
- Lignes de prestations avec quantité, prix HT et taux de TVA par ligne
- Remise globale, acompte et « reste à payer »
- TVA détaillée par taux (ou « non applicable » si 0 %)
- Logo, coordonnées, SIRET / ICE / NIF et IBAN
- Plusieurs devises : €, MAD, USD, CHF, XOF
- Historique des documents : ouvrir, dupliquer, **transformer un devis en facture**, supprimer
- Impression et export **PDF** au format A4 (via « Imprimer / PDF »)
- Export / import JSON pour sauvegarder ou transférer un document
- Responsive (mobile, tablette, ordinateur) et mode sombre

## Utilisation

Ouvrez simplement `index.html` dans votre navigateur, ou utilisez la version en ligne via GitHub Pages.

Pour obtenir un PDF : cliquez sur **Imprimer / PDF**, puis choisissez « Enregistrer au format PDF » comme imprimante.

## Mettre en ligne avec GitHub Pages

1. Dans le dépôt GitHub : **Settings → Pages**
2. Source : **Deploy from a branch**, branche `main`, dossier `/ (root)`
3. Le site sera disponible quelques instants plus tard à l'adresse `https://<votre-compte>.github.io/generateur-devis-factures/`

## Données

Tout est enregistré dans le `localStorage` du navigateur. Vider les données du site efface l'historique : pensez à exporter vos documents importants en JSON.

## Technologies

HTML, CSS et JavaScript, sans dépendance ni étape de build.
