// =============================================================================
// ||                      VOICE LOBBY PARA LEGUE OF LEGENDS                  ||
// ||                           BACK-END (index.js)                           ||
// =============================================================================
// || Autor: Seu Nome/Apelido                                                 ||
// || Descrição: Este servidor gerencia lobbies de voz, associando-os a IDs   ||
// || e validando para que um usuário não possa pegar mais de uma role.       ||
// || VERSÃO COMPATÍVEL COM DISCORD.JS v14                                    ||
// =============================================================================

const express = require("express");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
require("dotenv").config();
const cors = require("cors");

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

const app = express();
const PORT = process.env.PORT || 3000;

const activeLobbies = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

app.use(cors());
app.use(express.json());

client.once("ready", () => {
  console.log(`✅ Bot ${client.user.tag} está online e pronto!`);
  setInterval(cleanupEmptyChannels, 300000);
});

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
      maxAge: 7200,
      maxUses: 10,
      unique: true,
      reason: `Convite para o lobby temporário ${channel.name}.`,
    });

    activeLobbies.set(channel.id, {
      inviteUrl: invite.url,
      claimedRoles: {
        top: null,
        jungle: null,
        mid: null,
        adc: null,
        support: null,
      },
    });
    console.log(`📢 Lobby ${channel.id} criado e armazenado.`);

    res.status(201).json({ channelId: channel.id });
  } catch (error) {
    console.error("❌ Erro ao criar o lobby:", error);
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
});

// [MODIFICADO] Rota para reivindicar role com validação de usuário
app.post("/api/claim-role/:channelId", (req, res) => {
  const { channelId } = req.params;
  const { role, username } = req.body;

  const lobby = activeLobbies.get(channelId);

  if (!lobby) {
    return res.status(404).json({ error: "Lobby não encontrado." });
  }

  // Validações
  if (!username || username.trim() === "") {
    return res.status(400).json({ error: "Nome de usuário é obrigatório." });
  }
  if (lobby.claimedRoles[role] !== null) {
    return res.status(409).json({ error: "Esta posição já foi escolhida." });
  }

  // [NOVA VALIDAÇÃO] Verifica se o nick já pegou outra role
  const existingUser = Object.entries(lobby.claimedRoles).find(
    ([key, value]) => value?.toLowerCase() === username.trim().toLowerCase()
  );
  if (existingUser) {
    return res
      .status(409)
      .json({
        error: `O nick "${username}" já reivindicou a posição de ${existingUser[0].toUpperCase()}.`,
      });
  }

  // Se tudo estiver certo, reivindica a role
  lobby.claimedRoles[role] = username.trim();
  console.log(
    `🙋‍♂️ No lobby ${channelId}, a role ${role} foi reivindicada por ${username}.`
  );
  res.status(200).json({ success: true });
});

app.get("/api/lobby-status/:channelId", async (req, res) => {
  try {
    const { channelId } = req.params;
    const lobby = activeLobbies.get(channelId);

    if (!lobby) {
      return res.status(404).json({ error: "Lobby não existe mais." });
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(channelId).catch(() => null);

    let membersInChannel = [];
    if (channel) {
      membersInChannel = channel.members.map((member) => member.displayName);
    }

    res.status(200).json({
      usersInChannel: membersInChannel,
      claimedRoles: lobby.claimedRoles,
      inviteUrl: lobby.inviteUrl,
    });
  } catch (error) {
    if (error.code === 10003) {
      return res.status(404).json({ error: "Lobby não existe mais." });
    }
    console.error("❌ Erro ao consultar status do lobby:", error);
    res.status(500).json({ error: "Erro ao consultar o lobby." });
  }
});

function cleanupEmptyChannels() {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    console.log("🧹 Limpando canais vazios...");
    guild.channels.cache.forEach((channel) => {
      if (
        channel.type === ChannelType.GuildVoice &&
        channel.name.startsWith("Lobby-") &&
        channel.members.size === 0
      ) {
        console.log(`🗑️ Deletando canal vazio: ${channel.name}`);
        channel.delete("Canal vazio, limpeza automática.").catch(console.error);
        activeLobbies.delete(channel.id);
      }
    });
  } catch (error) {
    console.error("❌ Erro durante a limpeza de canais:", error);
  }
}

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
