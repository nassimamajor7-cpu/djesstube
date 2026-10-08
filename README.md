# DjessTube

Un « YouTube perso » stylé : cherche, regarde, garde tes favoris et **télécharge en MP3 / MP4**.
Responsive : ordinateur, tablette et téléphone (installable comme une appli, PWA).

## Fonctionnalités

- **Recherche** avec suggestions, historique de recherche et filtres de durée ; **coller un lien** pour l'ouvrir direct
- **Lecteur persistant** : la vidéo passe en mini-lecteur quand tu navigues, reprise là où tu t'étais arrêté
- File d'attente, lecture auto de la suite, boucle, vitesse, minuteur de sommeil, mode cinéma, chapitres cliquables
- **Bibliothèque** : favoris, « plus tard », historique, export / import JSON
- Accueil avec rubriques, « Surprends-moi », catégories à explorer
- 3 thèmes (sombre, AMOLED, clair) × 5 couleurs, raccourcis clavier (`?` pour la liste)
- **Téléchargement** MP3, M4A, MP4 (voir ci-dessous)

## Lancer en local (le plus complet)

Prérequis : Python 3.10+.

```bash
run.bat                       # Windows : installe tout et ouvre http://localhost:5000
# ou à la main :
pip install -r requirements-local.txt
python app.py
```

En local, [yt-dlp](https://github.com/yt-dlp/yt-dlp) + ffmpeg (fourni par `imageio-ffmpeg`, rien à installer) sont utilisés :
MP3 192 kbps, MP4 jusqu'à 4K, et **tous les sites** supportés par yt-dlp (pas seulement YouTube).
Les fichiers sont aussi gardés dans `downloads/`.

## Déployer sur GitHub + Vercel

```bash
git init
git add .
git commit -m "DjessTube"
git branch -M main
git remote add origin https://github.com/<toi>/djesstube.git
git push -u origin main
```

Puis sur [vercel.com/new](https://vercel.com/new) : importe le dépôt, **ne change aucun réglage** (Vercel détecte Flask
via `app.py` + `requirements.txt` et sert `public/` en statique). Ou en CLI : `npx vercel --prod`.

### Comment les téléchargements marchent sur Vercel

Vercel ne peut pas lancer yt-dlp ni ffmpeg. L'appli bascule donc automatiquement en **mode navigateur** :

| Format | Comment |
|---|---|
| **M4A** | le serveur relaie l'audio d'origine par morceaux de 3 Mo (limite des fonctions serverless) |
| **MP3** | audio récupéré puis converti **dans ton navigateur** (lamejs) |
| **MP4 360p** | flux vidéo + son relayé directement |
| **MP4 HD** (480p → 1080p+) | vidéo et audio récupérés puis fusionnés **dans ton navigateur** (ffmpeg.wasm, ≈30 Mo chargés une fois) |

Limites à connaître :
- Le téléchargement se fait dans l'onglet : il faut le laisser ouvert. Les très longues vidéos (MP3 > 25 min, HD de plusieurs centaines de Mo) sont lourdes pour un téléphone.
- YouTube bloque parfois les adresses IP d'hébergeurs. Si c'est le cas, l'appli le dit clairement.
- **Plan B** : dans *Paramètres → Serveur de téléchargement*, saisis l'adresse d'une instance DjessTube lancée en local
  (ex. `http://localhost:5000`, ou une URL de tunnel type Cloudflare/ngrok) : la version en ligne l'utilisera pour
  la qualité maximale et les autres sites.

## Structure

```
app.py                 API Flask (recherche, suggestions, infos, relais de flux, mode local yt-dlp)
public/                front statique (index.html, css/, js/, PWA)
requirements.txt       dépendances Vercel (flask seulement)
requirements-local.txt dépendances du mode local (+ yt-dlp, imageio-ffmpeg)
```

## Avertissement

Utilise DjessTube uniquement pour du contenu que tu as le droit de télécharger. Respecte les conditions d'utilisation des plateformes et le droit d'auteur.
