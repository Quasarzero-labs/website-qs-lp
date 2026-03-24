# Quasarzero Website

Site vitrine bilingue `FR / EN` pour Quasarzero, construit avec `Vite`, `GSAP` et `Lenis`.

## Stack

- `Vite`
- `GSAP`
- `Lenis`
- `Prettier`
- `GitHub Pages` via `GitHub Actions`

## Dépendances

Ce projet n'utilise pas Python, donc il ne nécessite pas de `requirements.txt`.

Les dépendances sont gérées par :

- `package.json`
- `package-lock.json`

## Installation

```bash
npm install
```

## Lancer en local

```bash
npm run dev
```

## Build de production

```bash
npm run build
```

## Prévisualiser le build

```bash
npm run preview
```

## Formatage

```bash
npm run format
```

## Structure du projet

- `index.html` : home en français
- `index-en.html` : home en anglais
- `styles.css` : styles globaux
- `script.js` : animations, scroll fluide, chargement dynamique du pricing
- `mentions-legales.html` : mentions légales FR
- `politique-confidentialite.html` : confidentialité FR
- `legal-notice.html` : legal notice EN
- `privacy-policy.html` : privacy policy EN
- `vite.config.js` : configuration multi-pages du build Vite
- `public/CNAME` : domaine custom GitHub Pages
- `public/data/offers.json` : offres FR publiées dans le build
- `public/data/offers-en.json` : offres EN publiées dans le build
- `assets/` : images et visuels
- `.github/workflows/deploy.yml` : workflow de déploiement GitHub Pages

## Fonctionnalités

- site bilingue avec switch `FR / EN`
- hero éditorial `AI Studio`
- case studies horizontaux avec barre de défilement
- pricing dynamique via JSON
- scroll fluide avec `Lenis`
- animations de révélation avec `GSAP`
- pages légales FR / EN
- CTA Google Calendar dans le header

## Lien de planification

Le lien Google Calendar est actuellement utilisé dans :

- `index.html`
- `index-en.html`

URL actuelle :

```text
https://calendar.app.google/Q6rPuyXWyxjVM8BN7
```

## Déploiement

Le projet est déployé sur `GitHub Pages` via `GitHub Actions`.

Le workflow :

1. installe les dépendances avec `npm ci`
2. lance `npm run build`
3. publie le contenu de `dist`

Le build produit :

- `dist/index.html`
- `dist/index-en.html`
- `dist/mentions-legales.html`
- `dist/politique-confidentialite.html`
- `dist/legal-notice.html`
- `dist/privacy-policy.html`
- `dist/data/offers.json`
- `dist/data/offers-en.json`

Le domaine custom est défini via :

- `public/CNAME`

## Notes légales

Avant mise en ligne définitive, vérifier et compléter si nécessaire :

- l'hébergeur du site
- l'adresse de l'hébergeur
- la TVA intracommunautaire si applicable
- la durée exacte de conservation des données
