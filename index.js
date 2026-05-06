import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { Player } from "discord-player";
import pkg from '@discord-player/extractor';
const { DefaultExtractors } = pkg;
import playdl from "play-dl";
import ffmpeg from "ffmpeg-static";
import http from "http";

// ตั้งค่า Path ของ ffmpeg ให้ถูกต้อง
process.env.FFMPEG_PATH = ffmpeg;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// สร้างระบบ Player
const player = new Player(client);

// สร้าง Web Server เล็กๆ เพื่อกัน Render สั่งหลับ
http.createServer((req, res) => {
    res.write("Bot Status: Online");
    res.end();
}).listen(process.env.PORT || 3000);

// เมื่อบอทพร้อมทำงาน
client.once("clientReady", async (c) => {
    console.log(`✅ ${c.user.tag} ออนไลน์แล้ว!`);
    
    try {
        // โหลดตัวดึงข้อมูลเพลง
        await player.extractors.loadMulti(DefaultExtractors);
        console.log("🎵 ระบบเพลงพร้อมใช้งาน!");
    } catch (e) {
        console.log("❌ ระบบเพลง Error:", e.message);
    }

    // อัปเดต Slash Commands ทั้งหมด (ถ้าไม่ขึ้นให้เตะบอทแล้วเชิญใหม่)
    await client.application.commands.set([
        { 
            name: "play", 
            description: "เล่นเพลง", 
            options: [{ name: "query", description: "ชื่อเพลงหรือลิงก์", type: 3, required: true }] 
        },
        { name: "skip", description: "ข้ามเพลง" },
        { name: "pause", description: "พักเพลง" },
        { name: "resume", description: "เล่นเพลงต่อ" },
        { name: "stop", description: "หยุดเล่นและออกจากห้อง" }
    ]);
});

// ระบบจัดการคำสั่ง
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member } = interaction;
    const queue = player.nodes.get(guild.id);

    if (commandName === "play") {
        await interaction.deferReply();
        if (!member.voice.channel) return interaction.editReply("❌ เข้าห้องเสียงก่อนครับ!");

        try {
            const query = options.getString("query");
            const { track } = await player.play(member.voice.channel, query, {
                nodeOptions: {
                    metadata: interaction.channel,
                    selfDeaf: true,
                    leaveOnEmpty: true,
                    leaveOnEnd: false,
                    onBeforeCreateStream: async (track) => {
                        // ดึง Stream ผ่าน play-dl เพื่อความเสถียรสูงสุด
                        const stream = await playdl.stream(track.url, { discordPlayerCompatibility: true });
                        return stream.stream;
                    }
                }
            });

            await interaction.editReply(`🎶 กำลังเริ่มเล่น: **${track.title}**`);
        } catch (e) {
            console.error(e);
            await interaction.editReply("❌ ไม่สามารถเล่นเพลงนี้ได้ (อาจติดลิขสิทธิ์หรือ IP โดนบล็อก)");
        }
    }

    // ระบบควบคุมเพลง (คัดกรองเฉพาะเมื่อมีเพลงในคิว)
    if (commandName === "pause") {
        if (!queue || !queue.isPlaying()) return interaction.reply("❌ ไม่มีเพลงเล่นอยู่ครับ");
        queue.node.setPaused(true);
        return interaction.reply("⏸️ พักเพลงให้แล้วครับ!");
    }

    if (commandName === "resume") {
        if (!queue) return interaction.reply("❌ ไม่มีคิวเพลงครับ");
        queue.node.setPaused(false);
        return interaction.reply("▶️ เล่นเพลงต่อแล้วครับ!");
    }

    if (commandName === "skip") {
        if (!queue || !queue.isPlaying()) return interaction.reply("❌ ไม่มีเพลงให้ข้ามครับ");
        queue.node.skip();
        return interaction.reply("⏭️ ข้ามเพลงปัจจุบันแล้ว!");
    }

    if (commandName === "stop") {
        if (!queue) return interaction.reply("❌ บอทไม่ได้ทำงานอยู่ครับ");
        queue.delete();
        return interaction.reply("🛑 หยุดเล่นและออกจากห้องเรียบร้อย!");
    }
});

// ดักจับ Error ป้องกันบอทดับ
process.on("unhandledRejection", (reason) => console.log("[Unhandled Error]:", reason));

client.login(process.env.TOKEN);
