import baileys from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

// Anti-spam très simple : on ne répond au même contact qu'une fois toutes les X minutes
const dernierContact = new Map();

function estDansLesHoraires() {
  const heure = new Date().getHours();
  return heure >= config.heureOuverture && heure < config.heureFermeture;
}

function construireReponse() {
  if (estDansLesHoraires()) {
    return config.messageBienvenue.replace('{nomAtelier}', config.nomAtelier);
  }
  return config.messageHorsHoraires
    .replace('{horaires}', config.horairesOuverture)
    .replace('{nomAtelier}', config.nomAtelier);
}

async function demarrerBot() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_session'));

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scanne ce QR code avec WhatsApp (Appareils liés) :\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connexion fermée.', shouldReconnect ? 'Reconnexion...' : 'Déconnecté définitivement (relance et re-scanne le QR).');
      if (shouldReconnect) demarrerBot();
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp connecté et prêt à répondre automatiquement.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const from = msg.key.remoteJid;

      // On ignore les groupes et les statuts, on ne répond qu'aux messages privés
      if (from.endsWith('@g.us') || from === 'status@broadcast') continue;

      const delaiMs = (config.delaiEntreReponsesMinutes || 60) * 60 * 1000;
      const dernier = dernierContact.get(from) || 0;
      if (Date.now() - dernier < delaiMs) continue; // déjà répondu récemment à ce contact

      dernierContact.set(from, Date.now());

      try {
        await sock.sendMessage(from, { text: construireReponse() });
        console.log(`↳ Réponse automatique envoyée à ${from}`);
      } catch (err) {
        console.error('Erreur envoi message:', err);
      }
    }
  });
}

demarrerBot();
