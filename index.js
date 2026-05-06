import { Client, GatewayIntentBits } from "discord.js";
import { Player, useQueue } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import http from "http";

// ===== สร้าง Client =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ===== สร้าง Player =====
const player = new Player(client, {
    skipFFmpeg: false,
});

// ===== Web Server กันหลับบน Render =====
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is online!");
}).listen(process.env.PORT || 3000);

// ===== Ready Event (ชื่อที่ถูกต้องคือ "ready" ไม่ใช่ "clientReady") =====
client.once("ready", async (c) => {
    console.log(`✅ ${c.user.tag} ออนไลน์แล้ว!`);

    try {
        // ใช้ YoutubeiExtractor แทน DefaultExtractors
        // เพราะ Render ถูก YouTube บล็อก IP — ตัวนี้ใช้ Innertube API หลีกเลี่ยงการบล็อกได้
        await player.extractors.register(YoutubeiExtractor, {});
        console.log("🎵 YoutubeiExtractor โหลดสำเร็จ!");
    } catch (e) {
        console.error("❌ โหลด Extractor ผิดพลาด:", e.message);
    }

    // Register slash commands
    await client.application.commands.set([
        {
            name: "play",
            description: "เล่นเพลงจาก YouTube",
            options: [
                {
                    name: "query",
                    description: "ชื่อเพลงหรือลิงก์ YouTube",
                    type: 3,
                    required: true,
                },
            ],
        },
        { name: "skip",   description: "ข้ามเพลงปัจจุบัน" },
        { name: "pause",  description: "พักเพลง" },
        { name: "resume", description: "เล่นเพลงต่อ" },
        { name: "stop",   description: "หยุดเพลงและออกจากห้อง" },
        { name: "queue",  description: "ดูคิวเพลง" },
    ]);

    console.log("✅ Slash commands พร้อมใช้งาน!");
});

// ===== Interaction Handler =====
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member } = interaction;

    // ดึง queue ปัจจุบัน
    const queue = useQueue(guild.id);

    // ----- /play -----
    if (commandName === "play") {
        await interaction.deferReply();

        if (!member.voice?.channel) {
            return interaction.editReply("❌ กรุณาเข้าห้องเสียงก่อนครับ!");
        }

        const query = options.getString("query");

        try {
            const { track } = await player.play(member.voice.channel, query, {
                nodeOptions: {
                    metadata: { channel: interaction.channel },
                    selfDeaf: true,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 5000,
                    leaveOnEnd: false,
                    volume: 80,
                },
            });

            return interaction.editReply(
                `🎶 เพิ่มเข้าคิวแล้ว: **${track.title}**\n🔗 ${track.url}`
            );
        } catch (e) {
            console.error("Play error:", e);
            return interaction.editReply(
                `❌ เล่นไม่ได้ครับ\n\`\`\`${e.message}\`\`\``
            );
        }
    }

    // ----- /pause -----
    if (commandName === "pause") {
        if (!queue || !queue.node.isPlaying()) {
            return interaction.reply("❌ ไม่มีเพลงเล่นอยู่ตอนนี้");
        }
        queue.node.setPaused(true);
        return interaction.reply("⏸️ พักเพลงแล้ว");
    }

    // ----- /resume -----
    if (commandName === "resume") {
        if (!queue) return interaction.reply("❌ ไม่มีคิวเพลง");
        queue.node.setPaused(false);
        return interaction.reply("▶️ เล่นต่อแล้ว");
    }

    // ----- /skip -----
    if (commandName === "skip") {
        if (!queue || !queue.node.isPlaying()) {
            return interaction.reply("❌ ไม่มีเพลงให้ข้าม");
        }
        const skipped = queue.currentTrack;
        queue.node.skip();
        return interaction.reply(`⏭️ ข้ามเพลง: **${skipped?.title ?? "เพลงปัจจุบัน"}**`);
    }

    // ----- /stop -----
    if (commandName === "stop") {
        if (!queue) return interaction.reply("❌ บอทไม่ได้อยู่ในห้องเสียง");
        queue.delete();
        return interaction.reply("🛑 หยุดและออกจากห้องเสียงแล้ว");
    }

    // ----- /queue -----
    if (commandName === "queue") {
        if (!queue || queue.tracks.size === 0) {
            return interaction.reply("📭 คิวเพลงว่างอยู่ครับ");
        }
        const tracks = queue.tracks.toArray().slice(0, 10);
        const list = tracks
            .map((t, i) => `**${i + 1}.** ${t.title}`)
            .join("\n");
        return interaction.reply(
            `🎵 **กำลังเล่น:** ${queue.currentTrack?.title}\n\n📋 **คิวถัดไป:**\n${list}`
        );
    }
});

// ===== Login =====
client.login(process.env.TOKEN);
