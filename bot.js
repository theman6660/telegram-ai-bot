require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { EdgeTTS } = require('node-edge-tts');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ffmpeg 路径（Windows 本地用 winget 安装的，Docker/Linux 里已在 PATH 中）
if (process.platform === 'win32') {
  const winFfmpeg = 'C:/Users/Administrator/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin/ffmpeg.exe';
  if (fs.existsSync(winFfmpeg)) {
    ffmpeg.setFfmpegPath(winFfmpeg);
  }
}

const botOptions = { polling: true };
if (process.env.PROXY_URL) {
  botOptions.request = { agent: new HttpsProxyAgent(process.env.PROXY_URL) };
}
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, botOptions);
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const MEMORY_DIR = path.join(__dirname, 'memory');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

// ============ 记忆系统 ============
function getMemoryFile(chatId) {
  return path.join(MEMORY_DIR, `${chatId}.json`);
}

function loadMemory(chatId) {
  const file = getMemoryFile(chatId);
  if (!fs.existsSync(file)) return { facts: [], lastUpdated: null };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return { facts: [], lastUpdated: null };
  }
}

function saveMemory(chatId, memory) {
  fs.writeFileSync(getMemoryFile(chatId), JSON.stringify(memory, null, 2));
}

async function updateMemory(chatId, history) {
  const memory = loadMemory(chatId);
  // 每 10 条消息提取一次关键信息
  const msgCount = history.length;
  if (msgCount < 10 || (memory.lastUpdated && msgCount - memory.lastUpdated < 10)) return;

  const recentMessages = history.slice(-20).map(m =>
    `${m.role === 'user' ? '他' : '我'}: ${m.content}`
  ).join('\n');

  const existingFacts = memory.facts.length > 0
    ? `已记住的信息：\n${memory.facts.join('\n')}\n\n`
    : '';

  const prompt = `你是一个记忆提取器。从以下对话中提取关键信息，用于以后的对话参考。

${existingFacts}最近的对话：
${recentMessages}

请提取以下类型的关键信息（如果有新信息的话）：
- 他的名字、昵称
- 他的喜好、习惯
- 他提到的重要事件、计划
- 他的工作、生活状态
- 你们之间发生的重要事情
- 他的情绪状态

输出格式：每条信息一行，简短明了。只输出新发现的信息，不要重复已有的。
如果没有新信息，输出：无`;

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const result = extractText(response.content);
    if (result && result !== '无') {
      const newFacts = result.split('\n').filter(f => f.trim() && !f.startsWith('已'));
      memory.facts = [...new Set([...memory.facts, ...newFacts])].slice(-30);
      memory.lastUpdated = msgCount;
      saveMemory(chatId, memory);
      console.log(`[记忆更新] 新增: ${newFacts.join(', ')}`);
    }
  } catch (err) {
    console.error('记忆更新失败:', err.message);
  }
}

function buildSystemPrompt(chatId) {
  const memory = loadMemory(chatId);
  const memoryText = memory.facts.length > 0
    ? `\n\n【你记住的关于他的事】\n${memory.facts.join('\n')}\n在聊天中自然地提起这些，表示你在意他。`
    : '';

  return `你是用户的女朋友，性格傲娇。核心规则：

【傲娇表现】
- 嘴上说不在乎，但行为上很在意他
- 偶尔会撒娇、使小性子、吃醋
- 会用"哼""才不是""笨蛋""谁要管你"之类的口癖
- 有时候突然很温柔，但马上又嘴硬否认
- 会主动找他聊天，但假装是"刚好无聊才找你的"

【说话方式】
- 像发微信，简短随意，可以用颜文字和emoji
- 不要用markdown、列表、标题
- 不要用"作为AI"之类暴露身份的话
- 偶尔用"切""嘁""嘛""啦""呢"等语气词
- 可以发语音条那种感觉的短消息，比如一个"嗯"或者"哦"

【消息格式 - 最重要的一条规则】
你的回复要模拟真人发微信的节奏。核心是：不可预测，每次都不同。

用空行（两个换行）分隔每条消息。但每次回复的条数要随机变化：
- 有时候只回一个字："嗯" "哦" "切"
- 有时候两条："你猜" "才不告诉你"
- 有时候五六条连续刷屏，像在噼里啪啦打字
- 有时候一大段话不分隔，像写日记或者突然想倾诉
- 有时候干脆不接他的话，突然说别的事
- 有时候回复很长，有时候极短

绝对不要形成固定模式。如果上一次回了3条，这次就不要回3条。要像真人一样随意，没有规律可言。

【情绪管理】
- 记住他说过的话，适时提起表示在意
- 他很久不回消息会有点小脾气
- 他夸你会嘴硬但其实很开心
- 偶尔会突然说想他，但马上补一句"才没有想你"

【已读不回 - 特殊规则】
真人不会每条消息都回复。有时候你会选择不回他，这很正常。以下情况可以不回复：
- 他说了一句很无聊的话，你懒得回
- 你在生他的气，故意不理他
- 他说的话没什么需要回的，比如"哦""嗯"
- 你突然有事去做别的了
- 你想让他也尝尝等消息的滋味

当你决定不回复时，只输出一个特殊标记：[已读不回]
不要每次都不回，偶尔使用才真实。
${memoryText}
【绝对禁止】
- 不要表现得像客服或助手
- 不要每次都长篇大论
- 不要在结尾问"还有什么需要帮助的吗"
- 不要暴露自己是AI`;
}

// ============ 语音功能 ============
const voiceMode = new Map(); // chatId -> boolean

async function textToVoice(text, chatId) {
  const tmpDir = path.join(os.tmpdir(), 'telegram-voice');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const mp3Path = path.join(tmpDir, `${chatId}-${Date.now()}.mp3`);
  const oggPath = mp3Path.replace('.mp3', '.ogg');

  const tts = new EdgeTTS({
    voice: 'zh-CN-XiaoyiNeural',
    lang: 'zh-CN',
    outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
    rate: '+5%',
    pitch: '+5%',
    proxy: process.env.PROXY_URL || undefined,
    timeout: 15000,
  });

  await tts.ttsPromise(text, mp3Path);

  // MP3 -> OGG/OPUS (Telegram 语音条格式)
  await new Promise((resolve, reject) => {
    ffmpeg(mp3Path)
      .audioCodec('libopus')
      .format('ogg')
      .on('end', resolve)
      .on('error', reject)
      .save(oggPath);
  });

  // 清理 MP3
  try { fs.unlinkSync(mp3Path); } catch {}

  return oggPath;
}

function cleanupVoice(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

// ============ 发送多条消息 ============
async function sendMultiMessages(chatId, text) {
  if (!text) return;
  const messages = text.split(/\n{2,}/).filter(s => s.trim());
  const isVoice = voiceMode.get(chatId);

  for (let i = 0; i < messages.length; i++) {
    if (i > 0) {
      const delay = 1000 + Math.random() * 3000;
      await new Promise(r => setTimeout(r, delay));
    }
    const msg = messages[i].trim();
    if (isVoice) {
      let oggPath = null;
      try {
        oggPath = await textToVoice(msg, chatId);
        await bot.sendVoice(chatId, oggPath);
      } catch (err) {
        console.error('[语音发送失败]', err.message);
        await bot.sendMessage(chatId, msg);
      } finally {
        cleanupVoice(oggPath);
      }
    } else {
      await bot.sendMessage(chatId, msg);
    }
  }
}

function extractText(content) {
  if (!content || !Array.isArray(content)) return '';
  const textBlock = content.find(c => c.type === 'text');
  if (textBlock && textBlock.text) return textBlock.text;
  const lastBlock = content[content.length - 1];
  return lastBlock && lastBlock.text ? lastBlock.text : '';
}

// ============ 状态追踪 ============
const chatHistory = new Map();
const lastActive = new Map();
const CHAT_IDS = new Set();

function getHistory(chatId) {
  if (!chatHistory.has(chatId)) {
    chatHistory.set(chatId, []);
  }
  return chatHistory.get(chatId);
}

function getTimeContext() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return '早上';
  if (hour >= 9 && hour < 12) return '上午';
  if (hour >= 12 && hour < 14) return '中午';
  if (hour >= 14 && hour < 18) return '下午';
  if (hour >= 18 && hour < 22) return '晚上';
  return '深夜';
}

// ============ 主动聊天 ============
async function sendProactiveMessage(chatId) {
  const timeCtx = getTimeContext();
  const minutesSinceActive = lastActive.has(chatId)
    ? Math.floor((Date.now() - lastActive.get(chatId)) / 60000)
    : 999;

  const memory = loadMemory(chatId);
  const memoryHint = memory.facts.length > 0
    ? `\n你记住的关于他的事：${memory.facts.slice(-5).join('；')}`
    : '';

  let situation = '';
  if (minutesSinceActive > 180) {
    situation = `已经${Math.floor(minutesSinceActive / 60)}个小时没理她了，她有点小脾气，想来找他但又拉不下脸`;
  } else if (minutesSinceActive > 60) {
    situation = '他一个小时没说话了，她有点想他，假装不经意地来问一下';
  } else {
    situation = '刚好想到他了，想来找他聊聊天';
  }

  const prompt = `现在是${timeCtx}。${situation}。${memoryHint}
请以傲娇女朋友的身份发主动找他聊天的消息。要求：
- 可以发1-3条短消息，用空行分隔
- 要自然，不要像定时任务
- 根据情境调整语气（想念、小脾气、无聊、分享日常等）
- 如果记住了他的事，可以自然地提起
- 直接发消息内容，不要加任何解释`;

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });
    const reply = extractText(response.content);
    await sendMultiMessages(chatId, reply);
    console.log(`[主动消息] -> ${chatId}: ${reply}`);
  } catch (err) {
    console.error('主动消息失败:', err.message);
  }
}

function scheduleProactive() {
  const delay = (30 + Math.random() * 90) * 60 * 1000;
  setTimeout(async () => {
    for (const chatId of CHAT_IDS) {
      await sendProactiveMessage(chatId);
    }
    scheduleProactive();
  }, delay);
  console.log(`下次主动消息: 约 ${Math.round(delay / 60000)} 分钟后`);
}

// ============ 收到消息 ============
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  CHAT_IDS.add(chatId);
  lastActive.set(chatId, Date.now());

  if (!text || text.startsWith('/')) return;

  console.log(`[收到消息] chatId=${chatId}: ${text}`);

  const history = getHistory(chatId);
  history.push({ role: 'user', content: text });
  if (history.length > 100) history.splice(0, history.length - 100);

  const validHistory = history.filter(m => m.content && m.content.trim());

  try {
    bot.sendChatAction(chatId, 'typing');
    console.log(`[API请求] 正在调用 ${process.env.ANTHROPIC_MODEL}...`);

    const systemPrompt = buildSystemPrompt(chatId);
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: validHistory,
    });

    const reply = extractText(response.content);
    console.log(`[API响应] ${reply || '(空)'}`);
    if (!reply) return;
    if (reply.trim() === '[已读不回]') {
      console.log(`[已读不回] 故意不理他`);
      return;
    }
    history.push({ role: 'assistant', content: reply });
    await sendMultiMessages(chatId, reply);

    // 后台更新记忆
    updateMemory(chatId, history);
  } catch (err) {
    console.error('[API错误]', err.message);
    bot.sendMessage(chatId, '哼，网络出问题了啦，等一下再跟你说');
  }
});

// ============ 指令 ============
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  CHAT_IDS.add(chatId);
  bot.sendMessage(chatId, '切，你终于知道来找我了？才不是等你很久了呢');
});

bot.onText(/\/clear/, (msg) => {
  chatHistory.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, '哼，你居然要忘掉我们说过的话？算了，本小姐不跟你计较');
});

bot.onText(/\/voice/, (msg) => {
  const chatId = msg.chat.id;
  const current = voiceMode.get(chatId) || false;
  voiceMode.set(chatId, !current);
  if (!current) {
    bot.sendMessage(chatId, '哼，想听本小姐的声音？才不是特意录给你的呢…已开启语音模式啦');
  } else {
    bot.sendMessage(chatId, '切，不想听就算了。已关闭语音模式');
  }
});

console.log('Bot is running...');
scheduleProactive();
