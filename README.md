# Quasarzero Website

Site vitrine bilingue `FR / EN` pour Quasarzero, construit avec `Vite`, `GSAP` et `Lenis`.

## Stack

- `Vite`
- `GSAP`
- `Lenis`
- `Prettier`

## Dépendances

Ce projet **n'utilise pas Python**, donc il ne nécessite **pas** de `requirements.txt`.

Les dépendances du projet sont gérées par :

- [package.json](/Users/koula/Documents/Projects/quasarzero/site%20web/package.json)
- [package-lock.json](/Users/koula/Documents/Projects/quasarzero/site%20web/package-lock.json)

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

- [index.html](/Users/koula/Documents/Projects/quasarzero/site%20web/index.html) : home en français
- [index-en.html](/Users/koula/Documents/Projects/quasarzero/site%20web/index-en.html) : home en anglais
- [styles.css](/Users/koula/Documents/Projects/quasarzero/site%20web/styles.css) : styles globaux
- [script.js](/Users/koula/Documents/Projects/quasarzero/site%20web/script.js) : animations, scroll fluide, chargement dynamique du pricing
- [data/offers.json](/Users/koula/Documents/Projects/quasarzero/site%20web/data/offers.json) : offres en français
- [data/offers-en.json](/Users/koula/Documents/Projects/quasarzero/site%20web/data/offers-en.json) : offres en anglais
- [mentions-legales.html](/Users/koula/Documents/Projects/quasarzero/site%20web/mentions-legales.html) : mentions légales FR
- [politique-confidentialite.html](/Users/koula/Documents/Projects/quasarzero/site%20web/politique-confidentialite.html) : confidentialité FR
- [legal-notice.html](/Users/koula/Documents/Projects/quasarzero/site%20web/legal-notice.html) : legal notice EN
- [privacy-policy.html](/Users/koula/Documents/Projects/quasarzero/site%20web/privacy-policy.html) : privacy policy EN
- [assets](/Users/koula/Documents/Projects/quasarzero/site%20web/assets) : images et visuels

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

- [index.html](/Users/koula/Documents/Projects/quasarzero/site%20web/index.html)
- [index-en.html](/Users/koula/Documents/Projects/quasarzero/site%20web/index-en.html)

URL actuelle :

```text
https://calendar.app.google/NJxBfKmLydDcTFr39
```

## Mise en ligne

Le projet produit un build statique dans le dossier :

- [dist](/Users/koula/Documents/Projects/quasarzero/site%20web/dist)

Il peut être déployé sur n'importe quel hébergement statique compatible :

- Vercel
- Netlify
- GitHub Pages
- OVH
- GoDaddy Hosting
- autre hébergement statique

## Notes légales

Avant mise en ligne définitive, vérifier et compléter si nécessaire :

- l'hébergeur du site
- l'adresse de l'hébergeur
- la TVA intracommunautaire si applicable
- la durée exacte de conservation des données