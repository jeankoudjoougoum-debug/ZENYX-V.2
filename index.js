const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const { antiSpam, antiLink, antiNSFW, antiWord, antiFake, antiBot, antiPub, antiVoice, antiSticker, antiMedia, salonMode, antiEdit, antiDelete, antiTagAdmin } = require('./modules/anti');
const { warnUser, unwarnUser, warnings, setPunish, muteUser, unmuteUser, banUser, unbanUser, banlist } = require('./modules/moderation');
const { promote, demote, kick, add, groupOpenClose, setGroupName, setGroupDesc, setGroupPP, tagAll, hideTag, muteGroup, unmuteGroup, welcomeToggle, goodbyeToggle, groupInfo, listAdmin, revokeInvite, joinGroup } = require('./modules/group');
const { profile, setBotName, setBotBio, setBotPP, blockUser, unblockUser, setStatus, getStatus, getJid, getPP, ownerContact } = require('./modules/user');
const { sticker, toImg, quote, weather, gpt, ytDownload, tiktokDownload, translate, calc } = require('./modules/fun');
const { broadcast, addVip, delVip, checkVip, banBot, unbanBot, restartBot, shutdownBot, statsBot, actif } = require('./modules/admin');

// Chargement des variables d'environnement
require('dotenv').config();
const store = makeInMemoryStore({ logger: P().child({ level: 'silent' }) });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();
    
    const conn = makeWASocket({
        version,
        logger: P({ level: 'silent' }),
        auth: state,
        browser: Browsers.macOS('Chrome'),
        printQRInTerminal: false, // On utilise le pairing code
    });

    store.bind(conn.ev);

    // Événement : Connexion réussie
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, pairingCode } = update;
        if (pairingCode) {
            console.log(`📱 Code de pairage : ${pairingCode}`);
        }
        if (connection === 'open') {
            console.log('✅ Bot connecté !');
            conn.sendMessage(conn.user.id, { text: '🔥 Bot prêt à tout casser !' });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot();
            } else {
                console.log('❌ Déconnecté, arrêt.');
            }
        }
    });

    // Événement : Messages
    conn.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const isGroup = sender.endsWith('@g.us');

        // --- MODULE ANTI ---
        if (isGroup) {
            await antiSpam(conn, msg, sender);
            await antiLink(conn, msg, sender);
            await antiNSFW(conn, msg, sender);
            await antiWord(conn, msg, sender);
            await antiFake(conn, msg, sender);
            await antiBot(conn, msg, sender);
            await antiPub(conn, msg, sender);
            await antiVoice(conn, msg, sender);
            await antiSticker(conn, msg, sender);
            await antiMedia(conn, msg, sender);
            await salonMode(conn, msg, sender);
            await antiEdit(conn, msg, sender);
            await antiDelete(conn, msg, sender);
            await antiTagAdmin(conn, msg, sender);
        }

        // --- COMMANDES ---
        if (!text.startsWith('!')) return;
        const args = text.slice(1).trim().split(' ');
        const command = args.shift().toLowerCase();

        // MODULE ADMIN
        if (command === 'broadcast') await broadcast(conn, msg, args, sender);
        else if (command === 'addvip') await addVip(conn, msg, args, sender);
        else if (command === 'delvip') await delVip(conn, msg, args, sender);
        else if (command === 'checkvip') await checkVip(conn, msg, args, sender);
        else if (command === 'ban') await banBot(conn, msg, args, sender);
        else if (command === 'unban') await unbanBot(conn, msg, args, sender);
        else if (command === 'restart') await restartBot(conn, msg, sender);
        else if (command === 'shutdown') await shutdownBot(conn, msg, sender);
        else if (command === 'stats') await statsBot(conn, msg, sender);
        else if (command === 'actif') await actif(conn, msg, sender);

        // MODULE MODERATION
        else if (command === 'warn') await warnUser(conn, msg, args, sender);
        else if (command === 'unwarn') await unwarnUser(conn, msg, args, sender);
        else if (command === 'warnings') await warnings(conn, msg, args, sender);
        else if (command === 'setpunish') await setPunish(conn, msg, args, sender);
        else if (command === 'mute') await muteUser(conn, msg, args, sender);
        else if (command === 'unmute') await unmuteUser(conn, msg, args, sender);
        else if (command === 'ban') await banUser(conn, msg, args, sender);
        else if (command === 'unban') await unbanUser(conn, msg, args, sender);
        else if (command === 'banlist') await banlist(conn, msg, sender);

        // MODULE GROUPE
        else if (command === 'promote') await promote(conn, msg, args, sender);
        else if (command === 'demote') await demote(conn, msg, args, sender);
        else if (command === 'kick') await kick(conn, msg, args, sender);
        else if (command === 'add') await add(conn, msg, args, sender);
        else if (command === 'group') await groupOpenClose(conn, msg, args, sender);
        else if (command === 'setname') await setGroupName(conn, msg, args, sender);
        else if (command === 'setdesc') await setGroupDesc(conn, msg, args, sender);
        else if (command === 'setpp') await setGroupPP(conn, msg, sender);
        else if (command === 'tagall') await tagAll(conn, msg, sender);
        else if (command === 'hidetag') await hideTag(conn, msg, args, sender);
        else if (command === 'mute') await muteGroup(conn, msg, sender);
        else if (command === 'unmute') await unmuteGroup(conn, msg, sender);
        else if (command === 'welcome') await welcomeToggle(conn, msg, args, sender);
        else if (command === 'goodbye') await goodbyeToggle(conn, msg, args, sender);
        else if (command === 'groupinfo') await groupInfo(conn, msg, sender);
        else if (command === 'listadmin') await listAdmin(conn, msg, sender);
        else if (command === 'revoke') await revokeInvite(conn, msg, sender);
        else if (command === 'join') await joinGroup(conn, msg, args, sender);

        // MODULE UTILISATEUR
        else if (command === 'profile') await profile(conn, msg, sender);
        else if (command === 'setnamebot') await setBotName(conn, msg, args, sender);
        else if (command === 'setbio') await setBotBio(conn, msg, args, sender);
        else if (command === 'setppbot') await setBotPP(conn, msg, sender);
        else if (command === 'block') await blockUser(conn, msg, args, sender);
        else if (command === 'unblock') await unblockUser(conn, msg, args, sender);
        else if (command === 'status') await setStatus(conn, msg, args, sender);
        else if (command === 'getstatus') await getStatus(conn, msg, args, sender);
        else if (command === 'jid') await getJid(conn, msg, args, sender);
        else if (command === 'pp') await getPP(conn, msg, args, sender);
        else if (command === 'owner') await ownerContact(conn, msg, sender);

        // MODULE FUN
        else if (command === 'sticker') await sticker(conn, msg, sender);
        else if (command === 'toimg') await toImg(conn, msg, sender);
        else if (command === 'quote') await quote(conn, msg, sender);
        else if (command === 'weather') await weather(conn, msg, args, sender);
        else if (command === 'gpt') await gpt(conn, msg, args, sender);
        else if (command === 'yt') await ytDownload(conn, msg, args, sender);
        else if (command === 'tiktok') await tiktokDownload(conn, msg, args, sender);
        else if (command === 'translate') await translate(conn, msg, args, sender);
        else if (command === 'calc') await calc(conn, msg, args, sender);
    });

    // Sauvegarde des crédentials
    conn.ev.on('creds.update', saveCreds);
}

startBot().catch(console.error);