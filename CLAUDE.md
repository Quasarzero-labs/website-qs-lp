# CLAUDE.md — Quasarzero Site Web

## Présentation du projet

Site vitrine bilingue **FR / EN** pour [QuasarZero](https://quasarzero.fr), studio IA. Site statique buildé avec Vite, sans framework frontend.

## Stack

- **Vite** — bundler et dev server
- **GSAP + ScrollTrigger** — animations de révélation et scroll-driven
- **Lenis** — scroll fluide (smooth wheel)
- **Prettier** — formatage du code

## Structure des fichiers

```
index.html              — page d'accueil FR
index-en.html           — page d'accueil EN
styles.css              — styles globaux (pas de CSS modulaire)
script.js               — toute la logique JS (animations, carousel, pricing)
data/offers.json        — offres de prix en FR
data/offers-en.json     — offres de prix en EN
assets/                 — images (WebP + fallbacks JPG, fonts auto-hébergées)
public/                 — fichiers copiés tels quels dans dist (CNAME, data/)
mentions-legales.html   — page légale FR
politique-confidentialite.html
legal-notice.html       — page légale EN
privacy-policy.html
.github/workflows/deploy.yml — CI/CD GitHub Actions → GitHub Pages
```

## Commandes

```bash
npm install       # installer les dépendances
npm run dev       # dev server (localhost)
npm run build     # build de production → dist/
npm run preview   # prévisualiser le build
npm run format    # Prettier sur tout le projet
```

## Architecture de script.js

Tout le JS est dans un seul fichier `script.js`. Les grandes sections :

1. **Lenis** — init du scroll fluide, tick GSAP synchronisé
2. **Header / nav toggle** — menu mobile, fermeture au clic
3. **Smooth scroll interne** — liens `href="#..."` défilent via Lenis avec offset header
4. **Pricing dynamique** — fetch de `data/offers.json` (ou `-en.json` selon `lang`), génération des cartes DOM
5. **Carousel case studies** — scroll horizontal sur `.case-track`, scrollbar custom `#case-scrollbar`, flèches `.case-arrow-prev / .case-arrow-next` avec sync bidirectionnel
6. **GSAP reveal** — `.reveal` animés à l'entrée dans le viewport via ScrollTrigger

## Carousel case studies — points clés

- Les flèches sont positionnées en float sur les côtés du carousel (`position: absolute` dans le conteneur)
- Le scroll des flèches est smooth (Lenis), le drag de la scrollbar est instantané (`scrollLeft` direct)
- Le pas des flèches = largeur de `.case-track` (pas fixe)
- Sur mobile les flèches sont masquées (`display: none`)
- Sync bidirectionnel : flèche → scrollbar et scrollbar → track via `input` event

## Pricing

- Les cartes sont générées dynamiquement depuis JSON (pas de markup statique dans le HTML)
- La locale est détectée via `pricingGrid.dataset.locale` ou `document.documentElement.lang`
- L'offre `featured` reçoit la classe `.pricing-card-featured`
- Le prix peut avoir un préfixe textuel (`"Dès "` / `"From "`) rendu dans un `<span class="price-prefix">`

## Déploiement

- Push sur `main` → GitHub Actions build + deploy sur GitHub Pages
- Le domaine personnalisé est configuré via `public/CNAME`
- Le build produit `dist/` — ne jamais committer `dist/` manuellement

## Bilingue

- Deux fichiers HTML distincts (`index.html` et `index-en.html`)
- Le JSON de pricing est sélectionné automatiquement selon la langue
- Toute modification de contenu doit être répercutée dans les deux langues

## Points de vigilance

- `website-qs-lp/` est un dépôt git indépendant (snapshot du site) imbriqué dans ce repo — il est `.gitignore`d
- Ne pas committer `dist/`, `node_modules/`
- Les fonts sont auto-hébergées dans `assets/fonts/` pour la conformité RGPD
- Le lien CTA de prise de rendez-vous : `https://calendly.com/contact-quasarzero/30min` (présent dans les deux HTML — header + sections)
