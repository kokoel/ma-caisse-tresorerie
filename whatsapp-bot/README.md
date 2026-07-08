# 🤖 Atelier WhatsApp Bot (Baileys)

Bot de réponse automatique WhatsApp, pensé pour informer tes clients (horaires, message d'accueil) pendant que tu es occupé en atelier.

## ⚠️ À savoir avant de l'utiliser

- Ce bot se connecte à **ton compte WhatsApp personnel/business** en scannant un QR code (comme WhatsApp Web). Ce n'est **pas l'API officielle WhatsApp Business** de Meta.
- WhatsApp peut, dans de rares cas, suspendre des numéros qui utilisent des outils non officiels de façon excessive (trop de messages automatiques, en particulier vers des numéros qui n'ont jamais écrit en premier). Utilise-le avec modération : réponse automatique aux gens qui **t'écrivent**, jamais d'envoi en masse non sollicité.
- Recommandé : utilise un **numéro dédié à l'atelier** (pas ton numéro personnel principal), au cas où.
- Ce bot doit tourner **en continu** sur un serveur (pas sur Vercel, qui est fait pour des sites web, pas des process permanents). Options simples et peu chères : une petite VPS (Contabo, Hetzner, Railway.app, Render "background worker"), ou un vieux PC/Raspberry Pi laissé allumé.

## Installation

```bash
cd whatsapp-bot
npm install
```

## Configuration

Modifie `config.json` :
- `nomAtelier` : le nom qui apparaît dans le message d'accueil
- `heureOuverture` / `heureFermeture` : tes horaires (format 24h)
- `messageBienvenue` / `messageHorsHoraires` : les textes envoyés automatiquement
- `delaiEntreReponsesMinutes` : le bot ne répond qu'une fois par contact toutes les X minutes (évite le spam si quelqu'un t'écrit 10 messages d'affilée)

## Lancer le bot

```bash
npm start
```

Un QR code s'affiche dans le terminal : ouvre WhatsApp sur ton téléphone → **Paramètres → Appareils liés → Lier un appareil** → scanne le code.

Une fois connecté, le bot répond automatiquement à toute personne qui t'écrit en privé (pas dans les groupes), avec un délai anti-spam par contact.

## Prochaines évolutions possibles

- Envoyer automatiquement le récap de caisse du jour (déjà généré dans l'app principale) à un numéro admin
- Répondre avec le menu / tarifs à la demande (mot-clé "menu")
- Prise de commande simple par message-guidé
