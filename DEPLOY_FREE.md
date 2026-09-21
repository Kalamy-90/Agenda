# Copier et héberger Agenda gratuitement

## Important avant de commencer

Agenda n’est pas un simple site statique. Le calendrier pourrait être servi par GitHub Pages, mais les fonctions PolyTrack nécessitent le serveur Node/Express : relais `/v6/*`, profils, classement, map de la semaine et signalisation multijoueur. GitHub sert donc à stocker et versionner le code ; il faut un hébergeur de serveur séparé pour exécuter Agenda.

Le guide ci-dessous utilise **GitHub + Render Web Service**. Render propose un déploiement depuis GitHub, un sous-domaine `onrender.com`, HTTPS géré et le support WebSocket. Le plan gratuit peut mettre le service en veille ou appliquer des limites de ressources ; cela peut provoquer un premier chargement lent et le multijoueur n’est pas adapté à une charge importante.

## Option recommandée : GitHub + Render

### 1. Récupérer le code

Depuis GitHub :

```bash
git clone https://github.com/Kalamy-90/Agenda.git
cd Agenda
```

Ou téléchargez le bouton **Code > Download ZIP** de GitHub, puis décompressez l’archive.

### 2. Tester sur son ordinateur

Installez Node.js 22 et pnpm, puis lancez :

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
pnpm start
```

Le serveur local utilise le port `3000` par défaut. Pour choisir un port :

```bash
PORT=3000 pnpm start
```

Le serveur écoute sur `0.0.0.0`, ce qui est nécessaire pour un hébergeur public. En local, ouvrez `http://localhost:3000`.

### 3. Créer le service Render

1. Créez ou utilisez un compte sur [Render](https://dashboard.render.com/).
2. Choisissez **New > Web Service**.
3. Connectez GitHub et sélectionnez `Kalamy-90/Agenda`.
4. Choisissez la branche `main`.
5. Utilisez les paramètres suivants :

| Paramètre | Valeur |
|---|---|
| Language | `Node` |
| Build Command | `corepack enable && pnpm install --frozen-lockfile && pnpm build` |
| Start Command | `pnpm start` |
| Instance type | `Free`, si disponible dans votre compte |
| Health check path | `/` |

Render fournit ensuite une adresse du type `https://agenda-xxxx.onrender.com`. Chaque push sur `main` peut déclencher un nouveau déploiement automatique.

Si Render ne reconnaît pas `pnpm`, utilisez ce build command :

```bash
npm install -g pnpm && pnpm install --frozen-lockfile && pnpm build
```

### 4. Variables d’environnement

Pour le calendrier, le relais PolyTrack et le multijoueur, aucune clé PolyTrack privée ne doit être ajoutée dans Render. Ne copiez jamais un token de profil dans les variables d’environnement.

Le template contient également les variables du template Manus OAuth et de la base de données. Elles ne sont nécessaires que si vous activez l’authentification Manus ou les fonctions DB correspondantes :

```text
DATABASE_URL
JWT_SECRET
VITE_APP_ID
OAUTH_SERVER_URL
VITE_OAUTH_PORTAL_URL
OWNER_OPEN_ID
OWNER_NAME
BUILT_IN_FORGE_API_URL
BUILT_IN_FORGE_API_KEY
VITE_FRONTEND_FORGE_API_URL
VITE_FRONTEND_FORGE_API_KEY
```

Ne créez ces variables que si vous disposez réellement des valeurs correspondantes. Ne committez jamais `.env`.

## URLs : ce qu’il faut modifier ou ne pas modifier

Dans le client, ne remplacez pas les chemins suivants :

```text
/v6/user
/v6/leaderboard
/v6/recordings
/v6/trackOfTheWeek
/v6/iceServers
/v6/multiplayer/host
/v6/multiplayer/join
```

Ce sont des URLs relatives. Elles pointent automatiquement vers le domaine Render ou vers votre propre domaine. Cela évite les problèmes de `localhost`, `run.app` et de domaines internes.

Le serveur Agenda contacte ensuite PolyTrack avec la constante suivante dans `server/polytrack-api.ts` :

```ts
const POLYTRACK_ORIGIN = "https://vps.kodub.com";
```

Ne changez cette constante que si vous exploitez une autre API PolyTrack compatible. Les en-têtes `Origin` et `Referer` vers `https://www.kodub.com` sont destinés au serveur officiel et ne correspondent pas au domaine public de votre copie d’Agenda.

## Domaine personnalisé

Avec Render, vous pouvez ajouter un domaine dans **Settings > Custom Domains**. Le client ne doit toujours pas être modifié : les appels `/v6/...` suivront automatiquement le nouveau domaine.

Le reverse proxy ou le fournisseur doit transmettre les requêtes `GET`, `POST` et `OPTIONS`, et autoriser les WebSockets pour `/v6/multiplayer/*`. Il doit aussi fournir HTTPS, car les profils, les classements et WebRTC fonctionnent mal ou pas du tout sur une page distante non sécurisée.

## Mise à jour après modification

Depuis le dossier local :

```bash
git pull origin main
# modifier les fichiers
git add .
git commit -m "Décrire la modification"
git push origin main
```

Render redéploie normalement la nouvelle version automatiquement. Avant chaque push important :

```bash
pnpm test && pnpm check && pnpm build
```

Ne poussez pas les éléments suivants :

```text
node_modules/
dist/
.env
*.log
les tokens privés PolyTrack
les captures contenant un token
```

## Créer une archive ZIP propre

Depuis le dossier parent du projet :

```bash
zip -r Agenda-source.zip Agenda \
  -x 'Agenda/.git/*' \
     'Agenda/node_modules/*' \
     'Agenda/dist/*' \
     'Agenda/.manus-logs/*' \
     'Agenda/.webdev/*' \
     'Agenda/.env*' \
     'Agenda/*.log'
```

L’archive doit contenir `client/`, `server/`, `shared/`, `drizzle/`, `scripts/`, `package.json`, `pnpm-lock.yaml`, `README.md` et ce guide. Elle ne doit pas contenir les dépendances installées, le build généré, un dépôt `.git` ou des secrets.

## Limites de GitHub Pages

GitHub Pages est adapté à une page HTML/CSS/JavaScript statique. Il ne peut pas exécuter le serveur Express d’Agenda. Si vous déployez seulement `client/public` sur GitHub Pages, le calendrier ou le jeu statique pourrait s’afficher, mais le relais API, les profils, les classements et le multijoueur ne fonctionneront pas correctement.

## Vérifications après mise en ligne

Remplacez `https://votre-service.onrender.com` par votre URL :

```bash
curl -I https://votre-service.onrender.com/
curl -sS 'https://votre-service.onrender.com/v6/trackOfTheWeek?version=0.6.3'
curl -sS 'https://votre-service.onrender.com/v6/iceServers'
```

La réponse de la map hebdomadaire doit contenir des URLs utilisables depuis votre domaine, ou des chemins `/v6/...` réécrits par Agenda. Si vous obtenez une erreur de piste, vérifiez d’abord le log Render, le HTTPS et les routes `/v6/*`.

## Sources officielles

La procédure suit la documentation Render : [déployer une application Node Express](https://render.com/docs/deploy-node-express-app) et [Web Services](https://render.com/docs/web-services). GitHub Pages est documenté sur [pages.github.com](https://pages.github.com/).
