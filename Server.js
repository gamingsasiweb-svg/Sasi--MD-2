import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serve your sasi-md.html from /public

const logger = pino({ level: 'silent' });
const sessions = {};

async function createSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(`sessions/${sessionId}`);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    browser: ['SASI-MD', 'Chrome', '3.0']
  });

  sock.ev.on('creds.update', saveCreds);
  sessions[sessionId] = sock;
  return sock;
}

// ── PAIR CODE endpoint ──
app.get('/pair', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json({ error: 'Phone number required' });

  const sessionId = `pair_${Date.now()}`;
  try {
    const sock = await createSession(sessionId);

    // Wait for socket to be ready
    await new Promise(r => setTimeout(r, 3000));

    const code = await sock.requestPairingCode(phone.replace(/\D/g, ''));
    res.json({ code: code.match(/.{1,4}/g).join('-') });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ── QR CODE endpoint ──
app.get('/qr', async (req, res) => {
  const sessionId = `qr_${Date.now()}`;
  try {
    const sock = await createSession(sessionId);

    sock.ev.on('connection.update', async ({ qr }) => {
      if (qr) {
        const image = await QRCode.toDataURL(qr);
        res.json({ qr: image });
      }
    });

    setTimeout(() => {
      if (!res.headersSent) res.json({ error: 'QR timeout' });
    }, 15000);
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.listen(3000, () => console.log('SASI-MD running on port 3000'));
