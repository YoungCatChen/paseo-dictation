// UI strings for the two supported languages. English is the fallback for any
// other locale. Keys are grouped by surface so a missing translation is easy to
// spot in review; the `satisfies` check makes every key mandatory in zh-CN.

const en = {
  "pill.title": "Dictate a message",
  "pill.label": "Rec",
  "pill.recording": "Stop",
  "pill.uploading": "Sending…",

  "recorder.unavailable": "Recording is not available on this client: {detail}",
  "recorder.permissionDenied": "Microphone permission denied",
  "recorder.noFile": "The recorder produced no audio file",
  "recorder.tooShort": "Recording was too short and has been discarded",

  "row.transcribing": "Transcribing a {seconds}s recording…",
  "row.review": "Dictation ready to send",
  "row.sent": "Sent dictation",
  "row.discarded": "Discarded dictation",
  "row.empty": "No speech recognized; nothing was sent",
  "row.failed": "Dictation failed",
  "row.raw": "Verbatim transcript",
  "row.send": "Send",
  "row.discard": "Discard",
  "row.edit": "Edit before sending",

  "settings.title": "Dictation",
  "settings.model.section": "Model",
  "settings.model.baseUrl": "Base URL",
  "settings.model.baseUrlHint": "OpenAI-compatible endpoint; /chat/completions is appended",
  "settings.model.model": "Model",
  "settings.model.modelHint": "Must accept audio input",
  "settings.auth.section": "Authentication",
  "settings.auth.mode": "API key source",
  "settings.auth.none": "None",
  "settings.auth.key": "API key",
  "settings.auth.command": "Key helper command",
  "settings.auth.apiKey": "API key",
  "settings.auth.apiKeyHint":
    "Stored in plain text on the daemon host and readable by every connected client",
  "settings.auth.command.label": "Command",
  "settings.auth.command.hint":
    "Runs in a shell on the daemon host; its standard output is the key",
  "settings.auth.ttl": "Cache key for (seconds)",
  "settings.auth.ttlHint": "0 runs the command for every recording",
  "settings.auth.headers": "Extra headers",
  "settings.auth.headersHint": "One per line as Name: value",
  "settings.context.section": "Context",
  "settings.context.turns": "Recent turns",
  "settings.context.turnsHint": "Earlier messages sent along to help spell names right",
  "settings.context.maxChars": "Context size limit (characters)",
  "settings.behavior.section": "Behavior",
  "settings.behavior.review": "Review before sending",
  "settings.behavior.reviewHint": "Show the tidied text with Send and Discard buttons",
  "settings.behavior.prompt": "Extra prompt instructions",
  "settings.behavior.language": "Plugin language",
  "settings.behavior.languageSystem": "Follow the device",
  "settings.save": "Save",
  "settings.saved": "Saved",
  "settings.test": "Test connection",
  "settings.testing": "Testing…",
  "settings.invalidNumber": "Enter a whole number",
  "settings.invalidHeaders": "Each line must look like Name: value",
  "settings.loadFailed": "Could not load settings: {error}",
};

export type MessageKey = keyof typeof en;

const zhCN = {
  "pill.title": "语音输入一条消息",
  "pill.label": "录音",
  "pill.recording": "停止",
  "pill.uploading": "发送中…",

  "recorder.unavailable": "此客户端无法录音：{detail}",
  "recorder.permissionDenied": "没有麦克风权限",
  "recorder.noFile": "录音没有生成音频文件",
  "recorder.tooShort": "录音太短，已丢弃",

  "row.transcribing": "正在转写 {seconds} 秒的录音…",
  "row.review": "语音消息待发送",
  "row.sent": "已发送语音消息",
  "row.discarded": "已丢弃语音消息",
  "row.empty": "没有识别到语音，未发送",
  "row.failed": "语音转写失败",
  "row.raw": "逐字转写",
  "row.send": "发送",
  "row.discard": "丢弃",
  "row.edit": "发送前编辑",

  "settings.title": "语音输入",
  "settings.model.section": "模型",
  "settings.model.baseUrl": "Base URL",
  "settings.model.baseUrlHint": "OpenAI 兼容的接口地址，会自动拼上 /chat/completions",
  "settings.model.model": "模型",
  "settings.model.modelHint": "需要支持音频输入",
  "settings.auth.section": "认证",
  "settings.auth.mode": "API key 来源",
  "settings.auth.none": "不需要",
  "settings.auth.key": "API key",
  "settings.auth.command": "Key helper 命令",
  "settings.auth.apiKey": "API key",
  "settings.auth.apiKeyHint": "以明文存在 daemon 主机上，所有已连接的客户端都能读到",
  "settings.auth.command.label": "命令",
  "settings.auth.command.hint": "在 daemon 主机的 shell 中执行，标准输出即为 key",
  "settings.auth.ttl": "Key 缓存时长（秒）",
  "settings.auth.ttlHint": "填 0 则每次录音都重新执行命令",
  "settings.auth.headers": "额外请求头",
  "settings.auth.headersHint": "每行一个，格式为 Name: value",
  "settings.context.section": "上下文",
  "settings.context.turns": "最近对话轮数",
  "settings.context.turnsHint": "附带之前的消息，帮助模型拼对专有名词",
  "settings.context.maxChars": "上下文长度上限（字符）",
  "settings.behavior.section": "行为",
  "settings.behavior.review": "发送前确认",
  "settings.behavior.reviewHint": "先显示整理后的文字，带发送和丢弃按钮",
  "settings.behavior.prompt": "额外的 prompt 指令",
  "settings.behavior.language": "插件语言",
  "settings.behavior.languageSystem": "跟随设备",
  "settings.save": "保存",
  "settings.saved": "已保存",
  "settings.test": "测试连接",
  "settings.testing": "测试中…",
  "settings.invalidNumber": "请输入整数",
  "settings.invalidHeaders": "每行格式须为 Name: value",
  "settings.loadFailed": "无法加载设置：{error}",
} satisfies Record<MessageKey, string>;

export type Locale = "en" | "zh-CN";

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, "zh-CN": zhCN };

/** Maps a BCP 47 tag such as "zh-Hans-CN" or "en-US" to a supported locale. */
export function resolveLocale(tag: string | null | undefined): Locale {
  const lower = (tag ?? "").toLowerCase();
  if (lower === "zh" || lower.startsWith("zh-hans") || lower === "zh-cn" || lower === "zh-sg") {
    return "zh-CN";
  }
  return "en";
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = catalogs[locale][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
