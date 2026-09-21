# Sources de déploiement consultées

- Render Node/Express quickstart: https://render.com/docs/deploy-node-express-app
  - Connecter un dépôt GitHub dans Render Dashboard > New > Web Service.
  - Définir les commandes de build et de démarrage selon le projet.
  - Les pushes sur la branche liée peuvent déclencher les déploiements automatiques.

- Render Web Services: https://render.com/docs/web-services
  - Un Web Service héberge les applications dynamiques Node/Express.
  - Le serveur doit écouter sur `0.0.0.0` et le port fourni par `PORT` (défaut Render documenté : 10000).
  - Les Web Services prennent en charge GitHub, TLS, WebSocket et un sous-domaine `onrender.com`.
  - Le plan Free existe mais possède des limitations de disponibilité et de ressources.

- GitHub Pages: https://pages.github.com/
  - GitHub Pages héberge des fichiers de site directement depuis un dépôt GitHub.
  - Il convient aux sites statiques, mais pas au processus Express/Node ni au relais PolyTrack/multijoueur d’Agenda.

Consultées le 2026-09-21.
