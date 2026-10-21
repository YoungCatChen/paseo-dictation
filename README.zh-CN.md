# Paseo Dictation

[English](README.md) | [简体中文](README.zh-CN.md)

用说话代替打字，给 [Paseo](https://paseo.sh) 的 agent 发消息。点 agent 输入框上方的**录音**，说完再点一下停止。daemon 会把录音和最近几轮对话发给一个支持音频输入的模型，由模型转写并稍作整理：去掉口头禅、说错重来的部分和重复的话，保留技术术语原样，然后以你的名义发给 agent。

支持中英混说，比如中文里夹着英文技术术语。插件界面有英文和简体中文两种，默认跟随 Paseo 的语言设置。

## 工作方式

- **录音在客户端完成。** iOS 和 Android 上直接用 Paseo app 自带的原生录音器，桌面端和网页用浏览器的 `MediaRecorder`。
- **转写在 daemon 主机上完成。** 客户端上传录音后就可以关掉，后续调用模型、发送消息都由 daemon 完成，进度显示在 agent 对话里的一行记录中。
- **这行记录会保留逐字转写**，和实际发出的消息放在一起，方便你核对模型改了什么。
- 短于 0.6 秒的录音，以及没识别出语音的录音，一律不发送。

## 设置

打开 **设置 → 插件 → 语音输入**。

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| Base URL | Gemini 的 OpenAI 兼容接口 | 任何支持 `input_audio` 的 OpenAI 兼容 `/chat/completions` 接口都可以。 |
| 模型 | `gemini-3.5-flash` | 需要支持音频输入。 |
| API key 来源 | API key | 可选 `API key`、`Key helper 命令` 或 `不需要`。 |
| API key | 空 | 以明文存在 daemon 的插件设置里，所有已连接的客户端都能读到。 |
| Key helper 命令 | 空 | 在 daemon 主机的 shell 里执行，取标准输出的最后一行作为 key。 |
| Key 缓存时长 | 1800 秒 | helper 拿到的 key 复用多久。填 `0` 则每次录音都重新执行。 |
| 额外请求头 | 无 | 每行一个 `Name: value`，每次请求都会带上。 |
| 最近对话轮数 | 3 | 附带之前的消息作为上下文，帮助模型拼对专有名词。 |
| 上下文长度上限 | 8000 字符 | 超出时先丢最早的部分。 |
| 发送前确认 | 关 | 打开后先显示整理好的文字，带发送、编辑、丢弃按钮。 |
| 额外的 prompt 指令 | 空 | 追加在内置 prompt 后面。 |
| 插件语言 | 跟随 Paseo | 英文或简体中文。 |

**测试连接**会发一个纯文本请求，检查 URL、key 和模型是否可用。

设置保存在 daemon 主机的 `$PASEO_HOME/plugin-settings/<插件 id>/dictation.json`（默认是 `~/.paseo`），也可以直接编辑这个文件。比如接入一个通过凭据 helper 鉴权的内部网关：

```json
{
  "version": 1,
  "values": {
    "baseUrl": "https://gateway.example.com/v1",
    "model": "gemini-3.5-flash",
    "authMode": "command",
    "apiKeyCommand": "my-gateway-key-helper",
    "extraHeaders": { "X-Client-Name": "paseo-dictation" }
  }
}
```

没写的字段取默认值。

## 安装

```bash
paseo plugin add github:YoungCatChen/paseo-dictation
```

需要 Paseo 0.11.0 或更高版本，并且 daemon 主机的 `PATH` 里有 `npm`。安装时 manifest 会执行 `npm ci` 拉取 `expo-modules-core`，客户端代码要靠它连上 app 的原生录音器。

## 限制

- 录音按钮只出现在已有的 agent 上。Paseo 没有给插件在新建 agent、新建 workspace 的输入框里留位置，内置麦克风按钮旁边也放不了。
- 同一个客户端上同时只能录一段，不分 agent。
- 等待确认的消息只存在 daemon 内存里，daemon 重启就没了。
- 手机上能录音，依赖 Paseo 自带 `expo-audio` 和 `expo-file-system` 这两个原生模块。如果哪个 Paseo 版本把它们去掉或改名，手机端录音会失效，桌面端不受影响。
- 录音和最近的对话会发送到你配置的接口。
- 插件的记录行会出现在本轮「工作了 …」那一行的上方。Paseo 把这一行固定在 agent 最后一条回复下面，插件没法调整行的顺序。
- 跟随 Paseo 语言是通过读取 Paseo 自己存储的应用设置实现的，这不是公开的插件 API。万一以后读不到了，插件会改为跟随设备语言。

## 开发

```bash
npm install
npm run check   # 先 typecheck，再用 Hermes 解析客户端 bundle
paseo plugin install "$PWD" --id dictation-dev
paseo plugin reload dictation-dev
paseo plugin logs dictation-dev
```

Paseo 手机 app 用 Hermes 运行插件的客户端 bundle。有些语法 typecheck 和 esbuild 都放行，Hermes 却不认，最典型的是 `class`。所以客户端代码用闭包和带标记的 Error 代替 class，`npm run check` 可以提前发现这类问题。
