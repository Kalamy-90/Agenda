# Agenda

Agenda est un calendrier mensuel personnel qui embarque PolyTrack 0.6.3 dans une expérience locale. Le dépôt contient la version validée du site et du serveur : calendrier avec libellés de jours, lancement du jeu, relais API PolyTrack, map de la semaine, classements, multijoueur et synchronisation des profils natifs.

## Ce qui fonctionne dans cette version

- Calendrier mensuel avec le numéro et le nom du jour dans chaque case.
- Notes personnelles conservées dans le `localStorage` du navigateur.
- Déverrouillage du jeu depuis le lundi 7 septembre avec le mot `polytrack`.
- PolyTrack 0.6.3 servi depuis `client/public`.
- Relais serveur `/v6/*` vers `https://vps.kodub.com` pour les profils, maps, classements, temps et autres appels officiels.
- Réécriture des URLs officielles en chemins same-origin (`/v6/...`) pour éviter que le navigateur tente de charger des ressources depuis un hôte interne `run.app`.
- Sélection automatique de l’onglet `Official tracks` au lancement afin que la map de la semaine soit visible.
- Signalisation multijoueur Agenda sur `/v6/multiplayer/host` et `/v6/multiplayer/join`.
- Synchronisation automatique des profils natifs stockés par PolyTrack sous les clés `polytrack_v5_prod_user_*` vers `POST /v6/user`.
- Normalisation des `userToken` dans les requêtes GET et dans les formulaires POST.

## Prérequis

- Node.js 22 ou version compatible.
- pnpm 10.
- Un serveur accessible en HTTPS si le multijoueur et les appels PolyTrack doivent fonctionner depuis un navigateur distant.
- Les fichiers PolyTrack présents dans `client/public`, notamment `main.bundle.js`, `error_screen.bundle.js`, les bundles secondaires, les fichiers WASM et les polices.

## Installation locale

```bash
git clone https://github.com/Kalamy-90/Agenda.git
cd Agenda
pnpm install --frozen-lockfile
pnpm dev
```

Le serveur de développement écoute sur le port 3000 par défaut. Pour une URL différente :

```bash
PORT=3000 pnpm dev
```

## Vérification avant publication

Toujours exécuter les trois commandes suivantes après toute modification :

```bash
pnpm test
pnpm check
pnpm build
```

Les tests couvrent le calendrier, l’architecture du lancement PolyTrack, le relais d’URLs, le nettoyage des tokens et la déconnexion. Le build produit le serveur dans `dist/index.js` et les fichiers web dans `dist/public`.

## Architecture à préserver

### Client

- `client/index.html` contient le calendrier et le lanceur PolyTrack.
- `client/public/` contient les bundles et assets PolyTrack. Ne pas renommer les bundles ni déplacer les fichiers chargés par `main.bundle.js`.
- Le lanceur doit conserver :
  - `localStorage.setItem('polytrack_v5_prod_selected_track_tab', 'official')` ;
  - les versions de cache `agenda-weekly-profile-fix-1` ;
  - la synchronisation des clés `polytrack_v5_prod_user_*` vers `/v6/user`.

### Serveur

- `server/_core/index.ts` enregistre `registerPolyTrackApi(app)` avant les parseurs de corps et avant les routes génériques.
- `server/polytrack-api.ts` relaie les requêtes `/v6/*` vers `https://vps.kodub.com`.
- La route `/v6/iceServers` doit rester disponible pour le serveur multijoueur local et ne doit pas être envoyée au relais officiel.
- Les URLs `https://vps.kodub.com/...` dans les réponses JSON doivent devenir des chemins relatifs comme `/v6/...`. Ne pas reconstruire ces URLs avec `run.app`, `localhost` ou un autre domaine interne.
- Les en-têtes envoyés au serveur officiel doivent garder :
  - `Origin: https://www.kodub.com`
  - `Referer: https://www.kodub.com/`
  - un `User-Agent` Agenda côté serveur.

## Profils PolyTrack

PolyTrack distingue le profil local et le profil enregistré sur son serveur. Une clé privée générée uniquement dans le navigateur ne suffit pas : le profil doit être envoyé au serveur officiel avec :

```http
POST /v6/user
Content-Type: application/x-www-form-urlencoded

version=0.6.3&userToken=<token>&nickname=<pseudo>&countryCode=<code>&carStyle=<style>
```

Le lanceur Agenda synchronise automatiquement les profils locaux présents dans `localStorage` :

```text
polytrack_v5_prod_user_0
polytrack_v5_prod_user_1
polytrack_v5_prod_user_2
```

Pour diagnostiquer une clé :

```bash
TOKEN='remplacer_par_la_cle_privee'
curl -sS "https://votre-domaine/v6/user?version=0.6.3&userToken=${TOKEN}"
```

Une réponse `null` signifie que le token n’est pas encore enregistré côté serveur PolyTrack. Une réponse JSON contenant `nickname`, `countryCode`, `carStyle` et `isVerifier` signifie que le profil est disponible.

Ne jamais publier une clé privée PolyTrack dans le dépôt, les logs, une issue ou une capture d’écran.

## Map de la semaine et classements

PolyTrack demande d’abord :

```text
GET /v6/trackOfTheWeek?version=0.6.3
```

La réponse contient notamment `trackUrl`, `thumbnailUrl` et `coverUrl`. Ces URLs sont réécrites par le relais vers des chemins du domaine Agenda. Le téléchargement de `trackUrl` doit rester accessible via le même domaine que la page, sinon le jeu affiche `Failed to load track code from URL`.

Ne pas remplacer le relais par des URLs `run.app`. Ces URLs sont des détails internes de l’infrastructure PolyTrack et peuvent être bloquées ou inaccessibles depuis le navigateur.

## Multijoueur

Le serveur Agenda fournit la signalisation multijoueur. Il ne faut pas lancer un second serveur HTTP ou WebSocket séparé dans le même conteneur. Le runtime WebDev attend un seul processus serveur.

Les routes à conserver sont :

```text
/v6/iceServers
/v6/multiplayer/host
/v6/multiplayer/join
```

Les connexions WebSocket doivent être attachées au serveur HTTP créé dans `server/_core/index.ts`. Pour un hébergement autoscale, ne pas supposer qu’un état mémoire persistera entre deux requêtes ou deux instances.

## Modifier le projet sans casser PolyTrack

1. Modifier le calendrier uniquement dans `client/index.html`.
2. Modifier le relais officiel uniquement dans `server/polytrack-api.ts`.
3. Modifier le branchement serveur uniquement dans `server/_core/index.ts`.
4. Ajouter ou modifier les tests dans `server/agenda-gate.test.ts` et `server/polytrack-api.test.ts`.
5. Ne pas éditer manuellement les bundles minifiés PolyTrack sauf nécessité absolue.
6. Ne pas supprimer les assets WASM, les bundles secondaires ou les fichiers de police.
7. Ne pas committer `.env`, les tokens, les logs de navigateur ou les sorties de build.
8. Après chaque changement, exécuter `pnpm test && pnpm check && pnpm build`.

## Publication

Le projet peut être publié depuis l’environnement WebDev après un checkpoint validé. Pour un hébergement Node classique :

```bash
pnpm install --frozen-lockfile
pnpm build
NODE_ENV=production PORT=3000 pnpm start
```

Le reverse proxy doit transmettre les en-têtes `X-Forwarded-Proto` et `X-Forwarded-Host`, et laisser passer les méthodes `GET`, `POST`, `OPTIONS` ainsi que les connexions WebSocket nécessaires au multijoueur.

## Dépannage rapide

| Symptôme | Vérification |
|---|---|
| Map de la semaine invisible | Vérifier `polytrack_v5_prod_selected_track_tab=official`, vider le cache et vérifier `GET /v6/trackOfTheWeek`. |
| Échec du chargement de la piste | Vérifier que `trackUrl` est `/v6/...` sur le domaine Agenda et non une URL `run.app`. |
| Profil absent du serveur | Vérifier la réponse de `GET /v6/user`; `null` signifie que le profil n’a pas été synchronisé. |
| Import impossible après création locale | Modifier/sauvegarder le profil dans PolyTrack, puis attendre le POST `POST /v6/user` avant d’exporter la clé. |
| Classement vide | Vérifier le token, l’identifiant de piste et les réponses du relais officiel. |
| Multijoueur indisponible | Vérifier `/v6/iceServers`, les routes `/v6/multiplayer/*`, le HTTPS et le support WebSocket du reverse proxy. |
| Site blanc après modification | Exécuter `pnpm check`, regarder la console navigateur et vérifier que tous les bundles référencés existent dans `client/public`. |

## Licence et contenu PolyTrack

Le calendrier et le code du relais sont maintenus dans ce dépôt. Les assets et le jeu PolyTrack restent soumis aux conditions de leur auteur et de leurs sources respectives. Vérifier les droits applicables avant toute redistribution ou modification publique.

## Commandes utiles

```bash
pnpm dev       # développement
pnpm test      # tests Vitest
pnpm check     # vérification TypeScript
pnpm build     # build client + serveur
pnpm start     # démarrage production
```

La documentation doit être mise à jour en même temps que toute modification de l’URL API, du format de profil, de la version PolyTrack ou du protocole multijoueur.

---

Version fonctionnelle de référence : Agenda avec PolyTrack 0.6.3, relais `/v6`, map hebdomadaire same-origin et synchronisation native des profils.

## Reproduction depuis un autre clone

Après le clone, il suffit de copier le dépôt tel quel, d’installer les dépendances et de lancer les tests. Les seules valeurs à adapter pour un autre hébergement sont le domaine public, le port d’écoute et les paramètres du reverse proxy. Le code client doit continuer à utiliser des chemins relatifs `/v6/...`; il ne faut pas remplacer ces chemins par le domaine interne du fournisseur d’hébergement.

Pour changer la source officielle PolyTrack, modifier `POLYTRACK_ORIGIN` dans `server/polytrack-api.ts`, les en-têtes `origin`/`referer`, les paramètres `version` dans le lanceur et les tests associés, puis refaire la validation complète.
