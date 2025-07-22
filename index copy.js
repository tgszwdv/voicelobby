// =============================================================================
// ||                      VOICE LOBBY PARA LEGUE OF LEGENDS                  ||
// ||                           BACK-END (index.js)                           ||
// =============================================================================
// || Autor: Seu Nome/Apelido                                                 ||
// || Descrição: Este servidor gerencia lobbies de voz temporários no Discord, ||
// || associando-os a IDs para páginas de lobby dedicadas.                    ||
// || VERSÃO COMPATÍVEL COM DISCORD.JS v14                                    ||
// =============================================================================

// --- Importações das bibliotecas necessárias ---
const express = require("express");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
require("dotenv").config();
const cors = require("cors");

// --- Verificação das Variáveis de Ambiente ---
if (
  !process.env.DISCORD_BOT_TOKEN ||
  !process.env.GUILD_ID ||
  !process.env.CATEGORY_ID
) {
  console.error(
    "ERRO: Faltam variáveis de ambiente! Verifique se DISCORD_BOT_TOKEN, GUILD_ID, e CATEGORY_ID estão no seu arquivo .env."
  );
  process.exit(1);
}

// --- Configuração Inicial ---
const app = express();
const PORT = process.env.PORT || 3000;

// [NOVO] Armazenamento em memória para associar channelId ao inviteUrl
const activeLobbies = new Map();

// --- Configuração do Cliente Discord (Nosso Bot) ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// --- Variáveis de Ambiente ---
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

// --- Middlewares do Express ---
app.use(cors());
app.use(express.json());

// --- Evento de "Pronto" do Bot ---
client.once("ready", () => {
  console.log(`✅ Bot ${client.user.tag} está online e pronto!`);
  setInterval(cleanupEmptyChannels, 300000); // Limpeza a cada 5 minutos
});

// --- Rota Principal da API para Criar o Lobby ---
app.post("/api/create-lobby", async (req, res) => {
  try {
    console.log("📥 Requisição recebida para criar lobby...");
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild)
      return res
        .status(404)
        .json({ error: "Servidor (Guild) não encontrado." });

    const lobbyName = `Lobby-${Math.random().toString(16).slice(2, 8)}`;

    const channel = await guild.channels.create({
      name: lobbyName,
      type: ChannelType.GuildVoice,
      parent: CATEGORY_ID,
      userLimit: 5,
      reason: "Lobby temporário para partida de LoL criado via API.",
    });

    const invite = await channel.createInvite({
      maxAge: 7200, // 2 horas
      maxUses: 10, // Aumentado para garantir que todos possam entrar
      unique: true,
      reason: `Convite para o lobby temporário ${channel.name}.`,
    });

    // [MODIFICADO] Armazena o lobby criado
    activeLobbies.set(channel.id, invite.url);
    console.log(
      `📢 Lobby ${channel.id} criado e armazenado com o convite ${invite.url}.`
    );

    // [MODIFICADO] Retorna apenas o ID do canal. O front-end construirá a URL do site.
    res.status(201).json({ channelId: channel.id });
  } catch (error) {
    console.error("❌ Erro ao criar o lobby:", error);
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
});

// --- [NOVA ROTA] Para buscar a informação (link do Discord) de um lobby ---
app.get("/api/lobby-info/:channelId", (req, res) => {
  const { channelId } = req.params;
  const inviteUrl = activeLobbies.get(channelId);

  if (inviteUrl) {
    res.status(200).json({ inviteUrl });
  } else {
    res.status(404).json({ error: "Lobby não encontrado ou expirado." });
  }
});

// --- Rota Para Consultar o Status de um Lobby ---
app.get("/api/lobby-status/:channelId", async (req, res) => {
  try {
    const { channelId } = req.params;
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return res
        .status(404)
        .json({ error: "Lobby não encontrado ou não é um canal de voz." });
    }

    const members = channel.members.map((member) => member.displayName);

    res.status(200).json({
      userCount: members.length,
      users: members,
    });
  } catch (error) {
    if (error.code === 10003) {
      // Unknown Channel
      return res.status(404).json({ error: "Lobby não existe mais." });
    }
    console.error("❌ Erro ao consultar status do lobby:", error);
    res.status(500).json({ error: "Erro ao consultar o lobby." });
  }
});

// --- Função para Limpar Canais Vazios ---
async function cleanupEmptyChannels() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) return;

    console.log("🧹 Limpando canais vazios...");
    const channels = await guild.channels.fetch();

    channels.forEach((channel) => {
      if (
        channel.type === ChannelType.GuildVoice &&
        channel.name.startsWith("Lobby-") &&
        channel.members.size === 0
      ) {
        console.log(`🗑️ Deletando canal vazio: ${channel.name}`);
        channel.delete("Canal vazio, limpeza automática.").catch(console.error);
        // [MODIFICADO] Remove o lobby do nosso armazenamento
        activeLobbies.delete(channel.id);
      }
    });
  } catch (error) {
    console.error("❌ Erro durante a limpeza de canais:", error);
  }
}

// --- Inicialização ---
client
  .login(BOT_TOKEN)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Servidor web rodando na porta ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Falha ao fazer login com o bot:", error);
  });
