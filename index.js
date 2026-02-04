const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const chalk = require("chalk");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const readline = require("readline")
require("./setting");
const moment = require("moment-timezone");
require("moment/locale/id");
moment.locale("id");
let plugins = {};

const logDir = path.join(__dirname, "sampah");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function loadPlugins() {
    const pluginPath = path.join(__dirname, "plugin");
    fs.readdirSync(pluginPath).forEach(file => {
        if (file.endsWith(".js")) {
            const pluginName = file.replace(".js", "");
            delete require.cache[require.resolve(`./plugin/${file}`)];
            plugins[pluginName] = require(`./plugin/${file}`);
            console.log(
                `${chalk.green(
                    "[ ZikkSenpai ]"
                )} ✅ Plugin loaded: ${pluginName}`
            );
        }
    });
}

function watchPlugins() {
    const pluginPath = path.join(__dirname, "plugin");
    fs.watch(pluginPath, (eventType, filename) => {
        if (filename && filename.endsWith(".js")) {
            try {
                const pluginName = filename.replace(".js", "");
                delete require.cache[require.resolve(`./plugin/${filename}`)];
                plugins[pluginName] = require(`./plugin/${filename}`);
                console.log(
                    `${chalk.green("[ ZikkSenpai ]")} ♻️ ${chalk.cyan(
                        "Plugin"
                    )} reloaded: ${pluginName}`
                );
            } catch (err) {
                console.error(`❌ Gagal reload plugin ${filename}:`, err);
                fs.appendFileSync(
                    crashLogPath,
                    `[${new Date().toLocaleString(
                        "id-ID"
                    )}] Gagal reload ${filename}: ${err}\n`
                );
            }
        }
    });
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: "silent" }),
        browser: Browsers.ubuntu("Edge"),
        printQRInTerminal: false,
        defaultQueryTimeoutMs: 60_000,
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 30_000,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        getMessage: async () => ({ conversation: "Halo" })
    });

    sock.ev.on("creds.update", saveCreds);

    /* pairing code handler */
    if (!sock.authState.creds.registered) {
        console.log("\n📞 Belum terdaftar, masukkan nomor WhatsApp (format: 628xxxxx)");
        const phone = await question("=> Your Number : ");
        rl.close();
        const code = await sock.requestPairingCode(phone, "ZIKWANGY");
        console.log(`\n🔑 Kode pairing : ${code}\n`);
    }

    sock.ev.on("connection.update", (up) => {
        const { connection, lastDisconnect } = up;
        if (connection === "open") {
            console.log("✅ Zikk-Bot berhasil konek ke WhatsApp!");
        }
        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            console.log("❌ Koneksi terputus")
        }
    })
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || !msg.key.remoteJid) return;

        // 🔥 AUTO READ
        try {
            if (zik.autoread) {
                await sock.readMessages([msg.key]);
            }
        } catch (err) {
            console.error("❌ Gagal auto read:", err);
            fs.appendFileSync(
                crashLogPath,
                `[${new Date().toLocaleString(
                    "id-ID"
                )}] Auto read error: ${err}\n`
            );
        }

        if (msg.key && msg.key.remoteJid === "status@broadcast") return;

        // 📝 LOG PESAN
        const msgId = msg.key.id;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const messageType = Object.keys(msg.message)[0];
        const tanggal = moment()
            .tz("Asia/Jakarta")
            .format("dddd, DD MMMM YYYY");
        const jam = moment().tz("Asia/Jakarta").hour();
        let emojiWaktu = "🕒";
        if (jam >= 5 && jam < 11) emojiWaktu = "🌅";
        else if (jam >= 11 && jam < 15) emojiWaktu = "☀️";
        else if (jam >= 15 && jam < 18) emojiWaktu = "🌇";
        else if (jam >= 18 && jam < 22) emojiWaktu = "🌌";

        const waktu =
            moment().tz("Asia/Jakarta").format("HH:mm") + " " + emojiWaktu;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";

        const logMsg = `
${chalk.red("====================")}
📩  ${chalk.cyan("Pesan Masuk")}
├─ 📍 ${chalk.yellow("From")}     : ${chalk.blue(from)}
├─ 👤 ${chalk.magenta("Sender")}   : ${chalk.green(sender)}
├─ 🆔 ${chalk.greenBright("MsgID")}    : ${chalk.red(msgId)}
├─ ⏰ ${chalk.yellowBright("Waktu")}    : ${chalk.cyan(waktu)}
├─ 📦 ${chalk.cyanBright("Tipe")}     : ${chalk.yellow(messageType)}
└─ 📝 ${chalk.blueBright("Isi")}      : ${chalk.green(text || "-")}
${chalk.red("====================")}
`;

        const loggermsg = `
====================
📩 Pesan Masuk
├─ 📍 From     : ${from}
├─ 👤 Sender   : ${sender}
├─ 🆔 MsgID    : ${msgId}
├─ ⏰ Waktu    : ${waktu}
├─ 📦 Tipe     : ${messageType}
└─ 📝 Isi      : ${text || "-"}
====================
`;

        console.log(logMsg);
        fs.appendFileSync(msgLogPath, loggermsg);

        const wrapper = {
            ...msg,
            from,
            text,
            quoted: getQuotedRaw(msg)
        };

        if (!text.startsWith(".")) return;

        const args = text.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (plugins[command]) {
            try {
                await plugins[command](sock, wrapper, args, {
                    isOwner: msg.key.fromMe
                });
            } catch (e) {
                console.error(`❌ Error di plugin ${command}:`, e);
                fs.appendFileSync(
                    crashLogPath,
                    `[${new Date().toLocaleString(
                        "id-ID"
                    )}] Error plugin ${command}: ${e}\n`
                );
                await sock.sendMessage(from, {
                    text: "⚠️ Terjadi error di plugin"
                });
            }
        }
    });
}

loadPlugins();
loadStorePlugins();
watchPlugins();
watchStorePlugins();
startBot();

// 🛡️ Anti Crash biar bot ga mati di panel
process.on("uncaughtException", err => {
    console.error("❌ Uncaught Exception:", err);
    fs.appendFileSync(
        crashLogPath,
        `[${new Date().toLocaleString("id-ID")}] UncaughtException: ${
            err.stack
        }\n`
    );
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection:", reason);
    fs.appendFileSync(
        crashLogPath,
        `[${new Date().toLocaleString(
            "id-ID"
        )}] UnhandledRejection: ${reason}\n`
    )
})