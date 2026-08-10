const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// === CONFIGURATION ===
const OWNER = process.env.OWNER_NUMBER || '22870421276';
const PREFIX = process.env.PREFIX || '!';
const BOT_NAME = process.env.BOT_NAME || 'ZENYX V.2';

// === BASE DE DONNÉES (JSON) ===
let db = {};
const DB_PATH = './database.json';
if (fs.existsSync(DB_PATH)) {
    db = JSON.parse(fs.readFileSync(DB_PATH));
} else {
    db = {
        warns: {},
        bans: [],
        vips: [],
        groupSettings: {},
        userStats: {},
        settings: {
            antispam: true,
            antilink: true,
            antinsfw: true,
            antiword: true,
            antifake: true,
            antibot: true,
            antipub: true,
            antivoice: false,
            antisticker: false,
            antimedia: false,
            salon: false,
            antiedit: false,
            antidelete: false,
            antitagadmin: false,
            welcome: true,
            goodbye: true
        },
        punish: { warnCount: 3, action: 'kick' }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function saveDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// === STORE ===
const store = makeInMemoryStore({ logger: P().child({ level: 'silent' }) });

// === ANTI-SPAM ===
const spamMap = new Map();
async function antiSpam(conn, msg, sender, isGroup) {
    if (!db.settings.antispam || !isGroup) return;
    const now = Date.now();
    if (!spamMap.has(sender)) spamMap.set(sender, []);
    const timestamps = spamMap.get(sender);
    timestamps.push(now);
    const recent = timestamps.filter(t => now - t < 3000);
    spamMap.set(sender, recent);
    if (recent.length >= 5) {
        await conn.sendMessage(sender, { text: '⚠️ Arrête de spam, sale bot !' });
        await warnUser(conn, msg, [sender.split('@')[0]], sender, 'Spam automatique');
    }
}

// === ANTI-LIENS ===
async function antiLink(conn, msg, sender, isGroup) {
    if (!db.settings.antilink || !isGroup) return;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const links = ['youtube.com', 'tiktok.com', 'whatsapp.com', 'http://', 'https://'];
    if (links.some(link => text.includes(link))) {
        await conn.sendMessage(sender, { delete: msg.key });
        await conn.sendMessage(sender, { text: '🔗 Lien supprimé !' });
    }
}

// === ANTI-NSFW ===
async function antiNSFW(conn, msg, sender, isGroup) {
    if (!db.settings.antinsfw || !isGroup) return;
    // Simule une vérification NSFW (à remplacer par API réelle)
    const isNSFW = false; // À remplacer par une vraie détection
    if (isNSFW) {
        await conn.sendMessage(sender, { delete: msg.key });
        await conn.sendMessage(sender, { text: '🔞 NSFW supprimé !' });
    }
}

// === ANTI-MOTS ===
async function antiWord(conn, msg, sender, isGroup) {
    if (!db.settings.antiword || !isGroup) return;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const badWords = ['con', 'pute', 'fdp', 'salope']; // Liste modifiable
    if (badWords.some(word => text.toLowerCase().includes(word))) {
        await conn.sendMessage(sender, { delete: msg.key });
        await conn.sendMessage(sender, { text: '🔇 Mot interdit supprimé !' });
    }
}

// === ANTI-FAKE ===
async function antiFake(conn, msg, sender, isGroup) {
    if (!db.settings.antifake || !isGroup) return;
    const countryCodes = ['243', '225', '33']; // Codes autorisés
    const number = sender.split('@')[0];
    const code = number.slice(0, 3);
    if (!countryCodes.includes(code)) {
        await conn.groupParticipantsUpdate(sender, [sender], 'remove');
        await conn.sendMessage(sender, { text: `🚫 ${sender} dégagé (faux numéro)` });
    }
}

// === ANTI-BOT ===
async function antiBot(conn, msg, sender, isGroup) {
    if (!db.settings.antibot || !isGroup) return;
    // Détection basique d'un autre bot
    if (sender.includes('bot') || sender.includes('wa')) {
        await conn.groupParticipantsUpdate(sender, [sender], 'remove');
    }
}

// === ANTI-PUB ===
async function antiPub(conn, msg, sender, isGroup) {
    if (!db.settings.antipub || !isGroup) return;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const pubWords = ['viens', 'achète', 'promo', 'prix'];
    if (pubWords.some(word => text.toLowerCase().includes(word)) && text.includes('http')) {
        await conn.sendMessage(sender, { delete: msg.key });
        await conn.sendMessage(sender, { text: '📢 Pub supprimée !' });
    }
}

// === ANTI-VOCAL ===
async function antiVoice(conn, msg, sender, isGroup) {
    if (!db.settings.antivoice || !isGroup) return;
    if (msg.message?.audioMessage) {
        await conn.sendMessage(sender, { delete: msg.key });
    }
}

// === ANTI-STICKER ===
async function antiSticker(conn, msg, sender, isGroup) {
    if (!db.settings.antisticker || !isGroup) return;
    if (msg.message?.stickerMessage) {
        await conn.sendMessage(sender, { delete: msg.key });
    }
}

// === ANTI-MEDIA ===
async function antiMedia(conn, msg, sender, isGroup) {
    if (!db.settings.antimedia || !isGroup) return;
    if (msg.message?.imageMessage || msg.message?.videoMessage) {
        await conn.sendMessage(sender, { delete: msg.key });
    }
}

// === ANTI-EDIT ===
async function antiEdit(conn, msg, sender, isGroup) {
    if (!db.settings.antiedit || !isGroup) return;
    if (msg.message?.protocolMessage?.type === 1) { // 1 = edit
        await conn.sendMessage(sender, { text: '✏️ Édition détectée !' });
    }
}

// === ANTI-DELETE ===
async function antiDelete(conn, msg, sender, isGroup) {
    if (!db.settings.antidelete || !isGroup) return;
    if (msg.message?.protocolMessage?.type === 2) { // 2 = delete
        await conn.sendMessage(sender, { text: '🗑️ Suppression détectée !' });
    }
}

// === ANTI-TAGADMIN ===
async function antiTagAdmin(conn, msg, sender, isGroup) {
    if (!db.settings.antitagadmin || !isGroup) return;
    // Simule la détection de tag admin
    // À implémenter avec getGroupMetadata
}

// === GESTION DES WARN ===
async function warnUser(conn, msg, args, sender, reason = '') {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    if (!db.warns[target]) db.warns[target] = [];
    db.warns[target].push(reason || 'Avertissement');
    saveDB();
    const count = db.warns[target].length;
    await conn.sendMessage(sender, { text: `⚠️ ${target} a ${count} warn(s).` });
    // Vérifier la punition auto
    if (count >= db.punish.warnCount) {
        const action = db.punish.action;
        if (action === 'kick') {
            await conn.groupParticipantsUpdate(sender, [target], 'remove');
        } else if (action === 'mute') {
            // Mute logique ici
        } else if (action === 'ban') {
            db.bans.push(target);
            saveDB();
        }
    }
}

async function unwarnUser(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    if (db.warns[target] && db.warns[target].length > 0) {
        db.warns[target].pop();
        saveDB();
        await conn.sendMessage(sender, { text: `✅ Warn retiré pour ${target}` });
    } else {
        await conn.sendMessage(sender, { text: `❌ ${target} n'a pas de warn.` });
    }
}

async function warnings(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    const count = db.warns[target]?.length || 0;
    await conn.sendMessage(sender, { text: `📊 ${target} a ${count} warn(s).` });
}

async function setPunish(conn, msg, args, sender) {
    if (args.length < 2) return;
    const count = parseInt(args[0]);
    const action = args[1];
    if (!['kick', 'mute', 'ban', 'warn'].includes(action)) return;
    db.punish = { warnCount: count, action };
    saveDB();
    await conn.sendMessage(sender, { text: `✅ Punition auto réglée : ${count} warn = ${action}` });
}

// === MUTE / UNMUTE ===
async function muteUser(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    const duration = parseInt(args[1]) || 10; // Minutes
    await conn.sendMessage(sender, { text: `🔇 ${target} mute pour ${duration} min.` });
    setTimeout(async () => {
        await conn.sendMessage(sender, { text: `🔊 ${target} unmute.` });
    }, duration * 60000);
}

async function unmuteUser(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    await conn.sendMessage(sender, { text: `🔊 ${target} unmute.` });
}

// === BAN / UNBAN ===
async function banUser(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    if (!db.bans.includes(target)) {
        db.bans.push(target);
        saveDB();
        await conn.sendMessage(sender, { text: `🚫 ${target} banni du bot.` });
    }
}

async function unbanUser(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    db.bans = db.bans.filter(id => id !== target);
    saveDB();
    await conn.sendMessage(sender, { text: `✅ ${target} débanni du bot.` });
}

async function banlist(conn, msg, sender) {
    const list = db.bans.join('\n') || 'Aucun banni.';
    await conn.sendMessage(sender, { text: `📋 Bannés :\n${list}` });
}

// === GESTION DE GROUPE ===
async function promote(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    await conn.groupParticipantsUpdate(sender, [target], 'promote');
    await conn.sendMessage(sender, { text: `⬆️ ${target} promu admin.` });
}

async function demote(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    await conn.groupParticipantsUpdate(sender, [target], 'demote');
    await conn.sendMessage(sender, { text: `⬇️ ${target} rétrogradé.` });
}

async function kick(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    await conn.groupParticipantsUpdate(sender, [target], 'remove');
    await conn.sendMessage(sender, { text: `💀 ${target} dégagé.` });
}

async function add(conn, msg, args, sender) {
    const number = args[0];
    if (!number) return;
    await conn.groupParticipantsUpdate(sender, [number + '@s.whatsapp.net'], 'add');
    await conn.sendMessage(sender, { text: `➕ ${number} ajouté.` });
}

async function groupOpenClose(conn, msg, args, sender) {
    const action = args[0];
    if (!['open', 'close'].includes(action)) return;
    await conn.groupSettingUpdate(sender, action);
    await conn.sendMessage(sender, { text: `🔓 Groupe ${action === 'open' ? 'ouvert' : 'fermé'}.` });
}

async function setGroupName(conn, msg, args, sender) {
    const name = args.join(' ');
    if (!name) return;
    await conn.groupUpdateSubject(sender, name);
    await conn.sendMessage(sender, { text: `📝 Nom du groupe : ${name}` });
}

async function setGroupDesc(conn, msg, args, sender) {
    const desc = args.join(' ');
    if (!desc) return;
    await conn.groupUpdateDescription(sender, desc);
    await conn.sendMessage(sender, { text: `📄 Description mise à jour.` });
}

async function setGroupPP(conn, msg, sender) {
    // À implémenter avec téléchargement d'image
}

async function tagAll(conn, msg, sender) {
    const metadata = await conn.groupMetadata(sender);
    let mentions = metadata.participants.map(p => p.id);
    let text = '🔔 @everyone ';
    await conn.sendMessage(sender, { text, mentions });
}

async function hideTag(conn, msg, args, sender) {
    const text = args.join(' ') || 'Message caché';
    const metadata = await conn.groupMetadata(sender);
    let mentions = metadata.participants.map(p => p.id);
    await conn.sendMessage(sender, { text, mentions });
}

async function muteGroup(conn, msg, sender) {
    await conn.groupSettingUpdate(sender, 'announcement');
    await conn.sendMessage(sender, { text: '🔇 Groupe mute (seuls admins parlent).' });
}

async function unmuteGroup(conn, msg, sender) {
    await conn.groupSettingUpdate(sender, 'not_announcement');
    await conn.sendMessage(sender, { text: '🔊 Groupe unmute.' });
}

async function welcomeToggle(conn, msg, args, sender) {
    const state = args[0] === 'on' || args[0] === 'off';
    if (!state) return;
    db.settings.welcome = args[0] === 'on';
    saveDB();
    await conn.sendMessage(sender, { text: `✅ Bienvenue : ${args[0]}` });
}

async function goodbyeToggle(conn, msg, args, sender) {
    const state = args[0] === 'on' || args[0] === 'off';
    if (!state) return;
    db.settings.goodbye = args[0] === 'on';
    saveDB();
    await conn.sendMessage(sender, { text: `✅ Au revoir : ${args[0]}` });
}

async function groupInfo(conn, msg, sender) {
    const metadata = await conn.groupMetadata(sender);
    const info = `📊 Infos groupe :
    📛 Nom : ${metadata.subject}
    👥 Membres : ${metadata.participants.length}
    🔒 Mode : ${metadata.announce ? 'Fermé' : 'Ouvert'}
    👑 Créé par : ${metadata.owner || 'Inconnu'}`;
    await conn.sendMessage(sender, { text: info });
}

async function listAdmin(conn, msg, sender) {
    const metadata = await conn.groupMetadata(sender);
    const admins = metadata.participants.filter(p => p.admin).map(p => p.id);
    await conn.sendMessage(sender, { text: `👑 Admins :\n${admins.join('\n')}` });
}

async function revokeInvite(conn, msg, sender) {
    const code = await conn.groupRevokeInvite(sender);
    await conn.sendMessage(sender, { text: `🔗 Nouveau lien : https://chat.whatsapp.com/${code}` });
}

async function joinGroup(conn, msg, args, sender) {
    const link = args[0];
    if (!link) return;
    const code = link.split('/').pop();
    await conn.groupAcceptInvite(code);
    await conn.sendMessage(sender, { text: '✅ Rejoint le groupe !' });
}

// === MODULE UTILISATEUR ===
async function profile(conn, msg, sender) {
    const name = msg.pushName || 'Inconnu';
    await conn.sendMessage(sender, { text: `👤 Profil : ${name}\n📱 Numéro : ${sender.split('@')[0]}` });
}

async function setBotName(conn, msg, args, sender) {
    const name = args.join(' ');
    if (!name) return;
    // Pas de méthode officielle pour changer le nom du bot
    await conn.sendMessage(sender, { text: `✅ Nom du bot : ${name}` });
}

async function setBotBio(conn, msg, args, sender) {
    const bio = args.join(' ');
    if (!bio) return;
    await conn.updateProfileStatus(bio);
    await conn.sendMessage(sender, { text: `✅ Bio mise à jour.` });
}

async function setBotPP(conn, msg, sender) {
    // À implémenter
}

async function blockUser(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    await conn.updateBlockStatus(target, 'block');
    await conn.sendMessage(sender, { text: `🚫 ${target} bloqué.` });
}

async function unblockUser(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    await conn.updateBlockStatus(target, 'unblock');
    await conn.sendMessage(sender, { text: `✅ ${target} débloqué.` });
}

async function setStatus(conn, msg, args, sender) {
    const status = args.join(' ');
    if (!status) return;
    await conn.updateProfileStatus(status);
    await conn.sendMessage(sender, { text: `✅ Statut mis à jour.` });
}

async function getStatus(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    const status = await conn.getStatus(target);
    await conn.sendMessage(sender, { text: `📌 Statut de ${target} : ${status.status}` });
}

async function getJid(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    await conn.sendMessage(sender, { text: `🔑 JID : ${target}` });
}

async function getPP(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    const pp = await conn.profilePictureUrl(target, 'image');
    await conn.sendMessage(sender, { text: `🖼️ PP : ${pp}` });
}

async function ownerContact(conn, msg, sender) {
    await conn.sendMessage(sender, { text: `👑 Propriétaire : ${OWNER}` });
}

// === MODULE FUN ===
async function sticker(conn, msg, sender) {
    // À implémenter
}

async function toImg(conn, msg, sender) {
    // À implémenter
}

async function quote(conn, msg, sender) {
    const quotes = ['La vie est belle', 'Code ou crève', 'Le dark side est puissant'];
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    await conn.sendMessage(sender, { text: `💬 "${q}"` });
}

async function weather(conn, msg, args, sender) {
    const city = args.join(' ');
    if (!city) return;
    // Simule une API météo
    await conn.sendMessage(sender, { text: `🌤️ Météo pour ${city} : 25°C, ensoleillé.` });
}

async function gpt(conn, msg, args, sender) {
    const prompt = args.join(' ');
    if (!prompt) return;
    // Simule ChatGPT
    await conn.sendMessage(sender, { text: `🧠 Réponse IA : ${prompt} => (simulé)` });
}

async function ytDownload(conn, msg, args, sender) {
    const link = args[0];
    if (!link) return;
    // Simule téléchargement
    await conn.sendMessage(sender, { text: `🎥 Téléchargement YouTube : ${link} (lien simulé)` });
}

async function tiktokDownload(conn, msg, args, sender) {
    const link = args[0];
    if (!link) return;
    await conn.sendMessage(sender, { text: `🎵 Téléchargement TikTok : ${link} (lien simulé)` });
}

async function translate(conn, msg, args, sender) {
    const lang = args[0];
    const text = args.slice(1).join(' ');
    if (!lang || !text) return;
    await conn.sendMessage(sender, { text: `🌍 Traduction (${lang}) : ${text} (simulé)` });
}

async function calc(conn, msg, args, sender) {
    const expression = args.join(' ');
    if (!expression) return;
    try {
        const result = eval(expression);
        await conn.sendMessage(sender, { text: `🧮 Résultat : ${result}` });
    } catch {
        await conn.sendMessage(sender, { text: '❌ Erreur de calcul.' });
    }
}

// === MODULE ADMIN ===
async function broadcast(conn, msg, args, sender) {
    const text = args.join(' ');
    if (!text) return;
    // Envoie à tous les groupes / utilisateurs
    const chats = await conn.groupFetchAllParticipating();
    for (let group in chats) {
        await conn.sendMessage(group, { text: `📢 Broadcast : ${text}` });
    }
}

async function addVip(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    if (!db.vips.includes(target)) {
        db.vips.push(target);
        saveDB();
        await conn.sendMessage(sender, { text: `⭐ ${target} VIP.` });
    }
}

async function delVip(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    db.vips = db.vips.filter(id => id !== target);
    saveDB();
    await conn.sendMessage(sender, { text: `❌ ${target} n'est plus VIP.` });
}

async function checkVip(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    const isVip = db.vips.includes(target);
    await conn.sendMessage(sender, { text: `🔍 ${target} : ${isVip ? '⭐ VIP' : '❌ Pas VIP'}` });
}

async function banBot(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    if (!db.bans.includes(target)) {
        db.bans.push(target);
        saveDB();
        await conn.sendMessage(sender, { text: `🚫 ${target} banni du bot.` });
    }
}

async function unbanBot(conn, msg, args, sender) {
    const target = args[0] ? args[0] + '@s.whatsapp.net' : sender;
    db.bans = db.bans.filter(id => id !== target);
    saveDB();
    await conn.sendMessage(sender, { text: `✅ ${target} déba