import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { Player } from "discord-player";
import pkg from '@discord-player/extractor';
const { DefaultExtractors } = pkg;
import playdl from "play-dl";
import ffmpeg from "ffmpeg-static";
import http from "http";

// --- ตั้งค่าระบบพื้นฐาน ---
process.env.FFMPEG_PATH = ffmpeg;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const player = new Player(client, {
    ytdlOptions: { 
        quality: 'highestaudio', 
        highWaterMark: 1 << 25 
    }
});

// --- ระบบกันบอทหลับสำหรับ Render (Web Service) ---
http.createServer((req, res) => {
    res.write("Bot is running!");
    res.end();
}).listen(process.env.PORT || 3000);

// --- เมื่อบอทพร้อมทำงาน ---
client.once("clientReady", async (c) => {
    console.log(`✅ ${c.user.tag} ออนไลน์บน Render แล้ว!`);
    
    try {
        // ใช้ register สำหรับเวอร์ชัน 6.x เพื่อโหลดตัวดึงเพลง
        await player.extractors.register(DefaultExtractors);
        console.log("🎵 ระบบค้นหาเพลง (Extractors) พร้อมใช้งาน!");
    } catch (e) {
        console.log("❌ ระบบดึงเพลงมีปัญหา:", e.message);
    }

    // ลงทะเบียนคำสั่ง Slash Commands
    await client.application.commands.set([
        { 
            name: "play", 
            description: "เล่นเพลงจากชื่อหรือลิงก์", 
            options: [{ name: "query", description: "ชื่อเพลงหรือลิงก์ YouTube/SoundCloud", type: 3, required: true }] 
        },
        { name: "skip", description: "ข้ามเพลงปัจจุบัน" },
        { name: "stop", description: "หยุดเล่นและให้บอทออกจากห้อง" }
    ]);
});

// --- ระบบเล่นเพลง ---
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member } = interaction;

    if (commandName === "play") {
        await interaction.deferReply();
        const query = options.getString("query");

        if (!member.voice.channel) {
            return interaction.editReply("❌ คุณต้องเข้าห้องเสียงก่อนครับ!");
        }

        try {
            const result = await player.search(query, {
                requestedBy: interaction.user,
            });

            if (!result || !result.tracks.length) {
                return interaction.editReply("❌ หาเพลงไม่เจอครับ ลองเปลี่ยนชื่อเพลงดูนะ");
            }

            const { track } = await player.play(member.voice.channel, result, {
                nodeOptions: {
                    metadata: interaction.channel,
                    selfDeaf: true,
                    leaveOnEmpty: true,
                    onBeforeCreateStream: async (track) => {
                        // ดึง Stream ผ่าน play-dl เพื่อเลี่ยงปัญหา YouTube บล็อก
                        const stream = await playdl.stream(track.url, { discordPlayerCompatibility: true });
                        return stream.stream;
                    }
                }
            });

            const embed = new EmbedBuilder()
                .setTitle("🎶 เริ่มเล่นเพลง")
                .setDescription(`**[${track.title}](${track.url})**`)
                .setThumbnail(track.thumbnail)
                .setColor("#00ff00")
                .setFooter({ text: `ขอโดย: ${interaction.user.username}` });

            await interaction.editReply({ embeds: [embed] });

        } catch (e) {
            console.error(e);
            await interaction.editReply("❌ เกิดข้อผิดพลาดในการเล่นเพลงครับ (อาจเป็นที่ YouTube บล็อก IP)");
        }
    }

    if (commandName === "skip") {
        const queue = player.nodes.get(guild.id);
        if (!queue || !queue.isPlaying()) return interaction.reply("❌ ไม่มีเพลงที่เล่นอยู่ครับ");
        queue.node.skip();
        interaction.reply("⏭️ ข้ามเพลงให้แล้วครับ!");
    }

    if (commandName === "stop") {
        const queue = player.nodes.get(guild.id);
        if (!queue) return interaction.reply("❌ บอทไม่ได้ทำงานอยู่ครับ");
        queue.delete();
        interaction.reply("🛑 หยุดเล่นและออกจากห้องแล้วครับ!");
    }
});

// ดักจับ Error ไม่ให้บอทดับ
process.on("unhandledRejection", (reason) => console.log("[Error]:", reason));

client.login(process.env.TOKEN);
