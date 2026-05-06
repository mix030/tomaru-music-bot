import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Player } from "discord-player";
import pkgExtractor from '@discord-player/extractor';
const { DefaultExtractors } = pkgExtractor;
import ffmpeg from "ffmpeg-static";
import http from "http";
// ตั้งค่า FFmpeg
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
    ytdlOptions: { quality: 'highestaudio', highWaterMark: 1 << 25 }
});

// --- ระบบกันแครช ---
process.on("unhandledRejection", (reason) => console.log(" [Error] Rejection:", reason));
process.on("uncaughtException", (err) => console.log(" [Error] Exception:", err));

player.events.on("error", (queue, error) => console.log(`[Queue Error] ${error.message}`));
player.events.on("playerError", (queue, error) => console.log(`[Player Error] ${error.message}`));

// --- สร้าง Web Server เล็กๆ สำหรับ Render (สำคัญมาก) ---
http.createServer((req, res) => {
    res.write("Bot is running!");
    res.end();
}).listen(process.env.PORT || 3000);

client.on("interactionCreate", async (interaction) => {
    const queue = player.nodes.get(interaction.guildId);

    if (interaction.isButton()) {
        try {
            if (!queue) return;
            await interaction.deferUpdate();
            if (interaction.customId === 'pause_resume') queue.node.setPaused(!queue.node.isPaused());
            else if (interaction.customId === 'skip') queue.node.skip();
            else if (interaction.customId === 'stop') queue.delete();
        } catch (e) { console.log(e); }
        return;
    }

    if (!interaction.isCommand()) return;

    if (interaction.commandName === "play") {
        try { await interaction.deferReply(); } catch (e) {}
        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.editReply("❌ เข้าห้องเสียงก่อนครับ!");

        try {
            const query = interaction.options.getString("url");
            const { track } = await player.play(channel, query, {
                nodeOptions: {
                    metadata: interaction.channel,
                    selfDeaf: true,
                    leaveOnEmpty: true,
                    bufferingTimeout: 15000,
                    onBeforeCreateStream: async (track) => {
                        try {
                            // พยายามหาจาก YouTube ก่อน ถ้าไม่ได้ค่อยไป SoundCloud
                            const result = await playdl.search(track.title, { limit: 1 });
                            const stream = await playdl.stream(result[0].url, { discordPlayerCompatibility: true });
                            return stream.stream;
                        } catch (err) {
                            console.log("Stream Error:", err.message);
                            return null;
                        }
                    }
                }
            });

            const embed = new EmbedBuilder()
                .setColor("#5865F2")
                .setTitle("🎶 เริ่มเล่นเพลง")
                .setDescription(`**[${track.title}](${track.url})**`)
                .setThumbnail(track.thumbnail)
                .setFooter({ text: `สั่งโดย: ${interaction.user.username}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pause_resume').setLabel('⏸️/▶️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('skip').setLabel('⏭️ ข้าม').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('stop').setLabel('🛑 หยุด').setStyle(ButtonStyle.Danger),
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (e) {
            await interaction.editReply("❌ หาเพลงไม่เจอครับ");
        }
    }
    
    // คำสั่งอื่นๆ (skip, stop, pause, resume)
    if (["skip", "stop", "pause", "resume"].includes(interaction.commandName)) {
        if (!queue) return interaction.reply({ content: "❌ ไม่มีเพลงเล่นอยู่", ephemeral: true });
        if (interaction.commandName === "skip") queue.node.skip();
        if (interaction.commandName === "stop") queue.delete();
        if (interaction.commandName === "pause") queue.node.setPaused(true);
        if (interaction.commandName === "resume") queue.node.setPaused(false);
        return interaction.reply({ content: `✅ ดำเนินการ ${interaction.commandName} แล้ว`, ephemeral: true });
    }
});

client.once("clientReady", async (c) => {
    console.log(`${c.user.tag} ออนไลน์บน Render แล้ว!`);
    
    try {
        // ใช้คำสั่งมาตรฐานของเวอร์ชัน 6.x
        await player.extractors.loadMulti(DefaultExtractors);
        console.log("✅ Extractors loaded successfully!");
    } catch (e) {
        console.log("❌ Load Error:", e.message);
    }

    await client.application.commands.set([
        { name: "play", description: "เล่นเพลง", options: [{ name: "url", description: "ชื่อเพลง/ลิงก์", type: 3, required: true }] },
        { name: "skip", description: "ข้ามเพลง" },
        { name: "stop", description: "หยุดเพลง" },
        { name: "pause", description: "พักเพลง" },
        { name: "resume", description: "เล่นต่อ" }
    ]);
});

// ใช้ Token จาก Environment Variable ของ Render
client.login(process.env.TOKEN);
