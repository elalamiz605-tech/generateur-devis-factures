# Devis & Factures

Une application web pour créer des **devis** et des **factures** professionnels, suivre vos paiements et gérer vos clients, directement dans le navigateur. Pas de compte, pas de serveur : vos données restent sur votre appareil.

**👉 Utiliser l'application : https://elalamiz605-tech.github.io/generateur-devis-factures/**

## Fonctionnalités

### Éditeur
- Devis ou facture, avec aperçu en direct au format A4
- Numérotation automatique par année (`D-2026-001`, `F-2026-001`…)
- Lignes avec quantité, **unité** (heure, jour, forfait…), prix HT et TVA par ligne
- Objet du document, remise globale, acompte et « reste à payer »
- Délai et moyen de paiement, IBAN et BIC
- Option **« TVA non applicable, art. 293 B du CGI »** pour les micro-entreprises
- **Mentions légales** de paiement (pénalités de retard, indemnité de 40 €)
- Tampon **« Payée »** ou **« Annulée »** sur les factures
- Signature « Bon pour accord » sur les devis
- Impression et export **PDF**

### Apparence
- Votre **logo** (redimensionné automatiquement)
- La **couleur de votre marque** : 8 couleurs prêtes ou couleur personnalisée
- Deux modèles : **Épuré** ou **Bandeau couleur**

### Tableau de bord
- Chiffre d'affaires facturé, encaissé, en attente, **en retard**
- Devis en cours et taux d'acceptation
- Statut de chaque document : brouillon, envoyé, accepté, refusé, payée, annulée, et automatiquement **en retard** ou **expiré** une fois l'échéance passée
- Recherche et filtres par type, statut et période
- Transformer un devis en facture en un clic (le devis passe en « Accepté »)

### Clients et catalogue
- **Carnet clients** : coordonnées, SIRET/ICE, n° de TVA, total facturé par client
- **Catalogue** de prestations habituelles, à ajouter à un document en un clic

### Sauvegarde
- Export et import de **toutes** vos données (documents, clients, catalogue) en un fichier JSON

## Données

Tout est enregistré dans le `localStorage` du navigateur. Vider les données du site efface tout : pensez à faire **Tableau de bord → Exporter tout** régulièrement.

## Technologies

HTML, CSS et JavaScript, sans dépendance ni étape de build. Police : Inter (Google Fonts).
