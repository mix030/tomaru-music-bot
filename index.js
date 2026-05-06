import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { Player } from "discord-player";
import pkg from '@discord-player/extractor';
const { DefaultExtractors } = pkg;
import playdl from "play-dl";
import ffmpeg from "ffmpeg-static";
import http from "http";

process.env.FFMPEG_PATH = ffmpeg;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const player = new Player(client);

// Web Server กันหลับ
http.createServer((req, res) => {
    res.write("Bot is online!");
    res.end();
}).listen(process.env.PORT || 3000);

client.once("clientReady", async (c) => {
    console.log(`✅ ${c.user.tag} ออนไลน์บน Render แล้ว!`);
    
    try {
        // แก้จาก loadMulti เป็น register เพื่อจบ Error ตัวแดง
        await player.extractors.register(DefaultExtractors);
        console.log("🎵 ระบบเพลงพร้อมใช้งาน 100%!");
    } catch (e) {
        console.log("❌ ระบบเพลง Error:", e.message);
    }

    await client.application.commands.set([
        { name: "play", description: "เล่นเพลง", options: [{ name: "query", description: "ชื่อเพลง/ลิงก์", type: 3, required: true }] },
        { name: "skip", description: "ข้ามเพลง" },
        { name: "pause", description: "พักเพลง" },
        { name: "resume", description: "เล่นต่อ" },
        { name: "stop", description: "หยุดและออก" }
    ]);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member } = interaction;
    const queue = player.nodes.get(guild.id);

    if (commandName === "play") {
        await interaction.deferReply();
        if (!member.voice.channel) return interaction.editReply("❌ เข้าห้องเสียงก่อนครับ");

        try {
            const query = options.getString("query");
            const { track } = await player.play(member.voice.channel, query, {
                nodeOptions: {
                    metadata: interaction.channel,
                    selfDeaf: true,
                    leaveOnEmpty: true,
                    onBeforeCreateStream: async (track) => {
                        const stream = await playdl.stream(track.url, { discordPlayerCompatibility: true });
                        return stream.stream;
                    }
                }
            });
            await interaction.editReply(`🎶 กำลังเล่น: **${track.title}**`);
        } catch (e) {
            console.error(e);
            await interaction.editReply("❌ เล่นไม่ได้ (อาจติดลิขสิทธิ์หรือ IP บล็อก)");
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
        if (!queue || !queue.node.isPlaying()) return interaction.reply("❌ ไม่มีเพลง");
        queue.node.skip();
        return interaction.reply("⏭️ ข้ามเพลงแล้ว");
    }

    if (commandName === "stop") {
        if (!queue) return interaction.reply("❌ บอทไม่ได้ทำงาน");
        queue.delete();
        return interaction.reply("🛑 หยุดและออกแล้ว");
    }
});

client.login(process.env.TOKEN);
