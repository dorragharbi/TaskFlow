# TaskFlow

Application web de gestion de tâches, réalisée dans le cadre de ma formation en 3ᵉ année d'ingénierie multimédia. Objectif : maîtriser le fonctionnement complet d'une application web, du navigateur jusqu'à la base de données.

## Fonctionnalités
- Création de compte et connexion sécurisée (mots de passe chiffrés, jeton JWT)
- Ajout, modification et suppression de tâches
- Priorités (haute, moyenne, basse), statuts et dates d'échéance
- Vue liste et vue Kanban avec glisser-déposer
- Catégories personnalisables avec couleurs
- Tableau de bord : progression et statistiques
- Mode clair et sombre, rappels pour les tâches en retard
- Données sauvegardées dans MySQL, séparées pour chaque utilisateur

## Technologies
Node.js, Express, MySQL, JavaScript, HTML/CSS, API REST, JWT, bcrypt

## Ce que j'ai appris
Architecture client-serveur, conception d'une API REST, modélisation d'une base relationnelle (utilisateurs, catégories, tâches), authentification, sécurité (validation des données, requêtes SQL paramétrées) et conception d'interface.

## Installation
(copie ici les étapes d'installation de ton README actuel)

## Auteure
Dorra, étudiante en 3ᵉ année IM


# TaskFlow

Application web de gestion des tâches : ajout, modification, suppression, priorités, échéances, recherche, filtres, mode sombre et rappels. Les données sont sauvegardées dans MySQL.

**Stack** : Node.js, Express, MySQL (mysql2), HTML/CSS/JavaScript natif.

## Lancer le projet
1. Installer Node.js (nodejs.org) et vérifier que MySQL tourne.
2. Ouvrir le dossier dans VS Code, puis un terminal (Ctrl + ù).
3. `npm install`
4. Copier `.env.example` en `.env` et mettre votre mot de passe MySQL.
5. `npm start` puis ouvrir http://localhost:3000
La base `taskflow` et la table `tasks` se créent toutes seules au premier lancement.

## Architecture
```
Navigateur (public/app.js)  --fetch JSON-->  API REST (server.js)  --SQL-->  MySQL
GET /api/tasks   POST /api/tasks   PUT /api/tasks/:id   DELETE /api/tasks/:id
```
