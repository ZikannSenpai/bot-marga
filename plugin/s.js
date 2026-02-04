const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const { writeFileSync } = require("fs");
const path = require("path");

module.exports = async (sock, msg, args) => {
    try {
        const from = msg.key.remoteJid;
        const q = msg.message?.imageMessage || msg.message?.videoMessage;

        if (!q) {
            return await sock.sendMessage(
                from,
                {
                    text: "Send image/gif with command `.s`"
                },
                { quoted: msg }
            );
        }

        const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage }
        );

        // path folder sampah
        const folder = path.join(__dirname, "../sampah/stiker");
        const filePath = path.join(folder, `stiker_${Date.now()}.jpg`);

        // simpan buffer ke folder sampah
        writeFileSync(filePath, buffer);

        // bikin stiker
        const stiker = new Sticker(buffer, {
            pack: args[0] || "ZikkBot 🍁",
            author: args[1] || `Zikksenpai🔱`,
            type: StickerTypes.FULL
        });

        const stickerBuffer = await stiker.build();

        await sock.sendMessage(
            from,
            {
                sticker: stickerBuffer
            },
            { quoted: msg }
        );
    } catch (err) {
        console.error("Error:", err);
    }
};
