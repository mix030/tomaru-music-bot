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

// ระบบ Web Server สำหรับ Render
http.createServer((req, res) => {
    res.write("Bot is online!");
    res.end();
}).listen(process.env.PORT || 3000);

client.once("clientReady", async (c) => {
    console.log(`✅ ${c.user.tag} ออนไลน์แล้ว!`);
    
    try {
        // โหลดระบบดึงเพลง
        await player.extractors.loadMulti(DefaultExtractors);
        console.log("🎵 ระบบเพลงพร้อมใช้งาน!");
    } catch (e) {
        console.log("❌ ระบบเพลง Error:", e.message);
    }

    // ลงทะเบียนคำสั่ง
    await client.application.commands.set([
        { name: "play", description: "เล่นเพลง", options: [{ name: "query", description: "ชื่อเพลง", type: 3, required: true }] },
        { name: "skip", description: "ข้ามเพลง" },
        { name: "pause", description: "พักเพลง" },
        { name: "resume", description: "เล่นเพลงต่อ" },
        { name: "stop", description: "หยุดและออกจากห้อง" }
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
            await interaction.editReply(`🎶 เริ่มเล่น: **${track.title}**`);
        } catch (e) {
            console.log(e);
            await interaction.editReply("❌ เล่นไม่ได้ครับ (อาจติดลิขสิทธิ์หรือ IP บล็อก)");
        }
    }

    if (commandName === "pause") {
        if (!queue || !queue.isPlaying()) return interaction.reply("❌ ไม่มีเพลงเล่นอยู่");
        queue.node.setPaused(true);
        interaction.reply("⏸️ พักเพลงแล้ว");
    }

    if (commandName === "resume") {
        if (!queue) return interaction.reply("❌ ไม่มีคิวเพลง");
        queue.node.setPaused(false);
        interaction.reply("▶️ เล่นต่อแล้ว");
    }

    if (commandName === "skip") {
        if (!queue || !queue.isPlaying()) return interaction.reply("❌ ไม่มีเพลง");
        queue.node.skip();
        interaction.reply("⏭️ ข้ามเพลงแล้ว");
    }

    if (commandName === "stop") {
        if (!queue) return interaction.reply("❌ บอทไม่ได้ทำงาน");
        queue.delete();
        interaction.reply("🛑 หยุดและออกจากห้องแล้ว");
    }
});

client.login(process.env.TOKEN);
