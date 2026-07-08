# 🍰 Atelier Manager (v2.0)

Application de gestion pour ateliers de pâtisserie et petits commerces : trésorerie, stock et ventes, avec compte en ligne (Supabase) et récap quotidien envoyable par WhatsApp.

## Fonctionnalités (Phase 1)

- Suivi des ventes et dépenses avec solde mensuel
- Gestion de produits avec stock et alerte de stock bas
- Historique complet, filtrable par mois
- Récapitulatif journalier avec envoi manuel via WhatsApp (lien `wa.me` prérempli)
- **Compte utilisateur (connexion/inscription) et sauvegarde en ligne via Supabase** — tes données sont accessibles depuis n'importe quel appareil

## Fonctionnalités (Phase 3)

- Gestion des ingrédients (prix, unité, stock)
- Recette par produit → coût de revient et marge calculés automatiquement
- Tableau de bord "Rentabilité" : marge brute, coût total, marge %, top produits

## Fonctionnalités (Phase 4)

- 🧾 Génération de factures PDF par vente (bouton dans l'historique)
- 📊 Export Excel complet du mois (ventes, dépenses, résumé) — bouton "Exporter" dans la Vue d'ensemble
- 🤖 Bot WhatsApp de réponse automatique (dossier `whatsapp-bot/`, à héberger séparément — voir son README)

## Configuration Supabase (à faire une seule fois)

1. Crée un fichier `.env` à la racine (copie `.env.example`) avec ton URL et ta clé anon Supabase.
2. Dans le Dashboard Supabase → **SQL Editor**, exécute dans l'ordre :
   - `supabase-schema.sql`
   - `supabase-schema-update.sql`

## Lancer le projet en local

```bash
npm install
npm run dev
```

L'application sera disponible sur `http://localhost:5173`.

## Build de production

```bash
npm run build
npm run preview
```

## Déploiement sur Vercel

### Option 1 — via l'interface Vercel
1. Pousse ce projet sur un dépôt GitHub/GitLab/Bitbucket.
2. Sur [vercel.com](https://vercel.com), clique sur "Add New Project" et importe le dépôt.
3. Vercel détecte automatiquement Vite. Les réglages par défaut suffisent :
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Clique sur "Deploy".

### Option 2 — via la CLI Vercel
```bash
npm install -g vercel
vercel
```
Suis les instructions à l'écran (la première fois, `vercel` te demandera de lier le projet).

## Important à savoir

- **Stockage des données** : les données (ventes, produits, stock, numéro WhatsApp) sont stockées dans le `localStorage` du navigateur de l'appareil utilisé. Elles ne sont donc pas partagées entre plusieurs appareils, et un nettoyage du cache du navigateur les effacera. Pour une sauvegarde centralisée multi-appareils, il faudrait ajouter un vrai backend (base de données).
- **Envoi WhatsApp automatique à minuit** : ce n'est pas possible avec une appli qui tourne uniquement dans le navigateur (elle doit être ouverte). Le bouton "Envoyer par WhatsApp" fonctionne en un clic à tout moment. Un envoi réellement automatique chaque nuit nécessiterait un petit service séparé (ex. un bot Node.js/Baileys hébergé sur un VPS) qui appellerait la même logique de génération de récap.

## Structure du projet

```
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx
    ├── App.jsx
    └── index.css
```
