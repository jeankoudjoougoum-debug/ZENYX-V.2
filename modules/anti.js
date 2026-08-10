// Anti-Spam
async function antiSpam(conn, msg, sender) {
    // Logique : 5 messages en 3 sec = warn
}

// Anti-Liens
async function antiLink(conn, msg, sender) {
    const links = ['youtube', 'tiktok', 'whatsapp', 'http'];
    // Si lien détecté => supprime + warn
}

// Anti-NSFW (API externe)
async function antiNSFW(conn, msg, sender) {
    // Vérifie avec API NSFW
}

// ... Tous les autres anti (word, fake, bot, pub, voice, sticker, media, salon, edit, delete, tagadmin)