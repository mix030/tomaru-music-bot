import { Client, GatewayIntentBits } from "discord.js";
import { Player, useQueue } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { SpotifyExtractor } from "@discord-player/extractor";
import http from "http";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const player = new Player(client, { skipFFmpeg: false });

http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is online!");
}).listen(process.env.PORT || 3000);

// แก้จาก "ready" เป็น "clientReady" ตาม discord-player v6
client.once("clientReady", async (c) => {
    console.log(`✅ ${c.user.tag} ออนไลน์แล้ว!`);

    try {
        // YoutubeiExtractor — ใส่ options เพิ่มเพื่อแก้ signature decipher error
        await player.extractors.register(YoutubeiExtractor, {
            authentication: undefined,
            streamOptions: {
                useClient: "WEB_EMBEDDED",
            },
        });
        console.log("✅ YoutubeiExtractor โหลดสำเร็จ");

        await player.extractors.register(SpotifyExtractor, {
            clientId: "a997795db3d04507a610a7bf84e648b4",
            clientSecret: "5cf8600dfcea4e32bede13a1410c4b42",
        });
        console.log("✅ SpotifyExtractor โหลดสำเร็จ");

    } catch (e) {
        console.error("❌ โหลด Extractor ผิดพลาด:", e.message);
    }

    await client.application.commands.set([
        {
            name: "play",
            description: "เล่นเพลง (รองรับ YouTube, Spotify, ชื่อเพลง)",
            options: [{ name: "query", description: "ชื่อเพลง / ลิงก์ YouTube / ลิงก์ Spotify", type: 3, required: true }],
        },
        { name: "skip",   description: "ข้ามเพลงปัจจุบัน" },
        { name: "pause",  description: "พักเพลง" },
        { name: "resume", description: "เล่นเพลงต่อ" },
        { name: "stop",   description: "หยุดเพลงและออกจากห้อง" },
        { name: "queue",  description: "ดูคิวเพลง" },
    ]);

    console.log("✅ Slash commands พร้อมใช้งาน!");
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member } = interaction;
    const queue = useQueue(guild.id);

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

            return interaction.editReply(`🎶 เพิ่มเข้าคิวแล้ว: **${track.title}**\n👤 ${track.author}`);
        } catch (e) {
            console.error("Play error:", e);
            return interaction.editReply(`❌ เล่นไม่ได้ครับ\n\`\`\`${e.message}\`\`\``);
        }
    }

    if (commandName === "pause") {
        if (!queue || !queue.node.isPlaying()) return interaction.reply("❌ ไม่มีเพลงเล่นอยู่");
        queue.node.setPaused(true);
        return interaction.reply("⏸️ พักเพลงแล้ว");
    }

    if (commandName === "resume") {
        if (!queue) return interaction.reply("❌ ไม่มีคิวเพลง");
        queue.node.setPaused(false);
        return interaction.reply("▶️ เล่นต่อแล้ว");
    }

    if (commandName === "skip") {
        if (!queue || !queue.node.isPlaying()) return interaction.reply("❌ ไม่มีเพลงให้ข้าม");
        const skipped = queue.currentTrack;
        queue.node.skip();
        return interaction.reply(`⏭️ ข้ามเพลง: **${skipped?.title ?? "เพลงปัจจุบัน"}**`);
    }

    if (commandName === "stop") {
        if (!queue) return interaction.reply("❌ บอทไม่ได้อยู่ในห้องเสียง");
        queue.delete();
        return interaction.reply("🛑 หยุดและออกจากห้องเสียงแล้ว");
    }

    if (commandName === "queue") {
        if (!queue || queue.tracks.size === 0) return interaction.reply("📭 คิวเพลงว่างอยู่ครับ");
        const tracks = queue.tracks.toArray().slice(0, 10);
        const list = tracks.map((t, i) => `**${i + 1}.** ${t.title}`).join("\n");
        return interaction.reply(`🎵 **กำลังเล่น:** ${queue.currentTrack?.title}\n\n📋 **คิวถัดไป:**\n${list}`);
    }
});

client.login(process.env.TOKEN);
