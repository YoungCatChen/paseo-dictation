import {
  type PluginSurfaceProps,
  type SettingsState,
  useRpc,
  useSettings,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useMemo, useState } from "react";
import { Text } from "react-native";
import { testConnectionRpc } from "../shared/rpc";
import { type DictationSettings, dictationSettings } from "../shared/settings";
import { type Translate, useTranslate } from "./locale";

type Ready = Extract<SettingsState<typeof dictationSettings.schema>, { status: "ready" }>;

// Text fields edit a draft committed by Save; switches and selects save at
// once. Numbers and headers stay as text until saved so typing is not lossy.
interface Draft {
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyCommand: string;
  apiKeyCommandTtlSeconds: string;
  extraHeaders: string;
  contextTurns: string;
  contextMaxChars: string;
  promptAddendum: string;
}

function toDraft(values: DictationSettings): Draft {
  return {
    baseUrl: values.baseUrl,
    model: values.model,
    apiKey: values.apiKey,
    apiKeyCommand: values.apiKeyCommand,
    apiKeyCommandTtlSeconds: String(values.apiKeyCommandTtlSeconds),
    extraHeaders: Object.entries(values.extraHeaders)
      .map(([name, value]) => `${name}: ${value}`)
      .join("\n"),
    contextTurns: String(values.contextTurns),
    contextMaxChars: String(values.contextMaxChars),
    promptAddendum: values.promptAddendum,
  };
}

function parseHeaders(text: string): Record<string, string> | null {
  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) return null;
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
}

function parseCount(text: string): number | null {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : null;
}

function fromDraft(
  draft: Draft,
  values: DictationSettings,
  t: Translate,
): { values: DictationSettings } | { error: string } {
  const ttl = parseCount(draft.apiKeyCommandTtlSeconds);
  const turns = parseCount(draft.contextTurns);
  const maxChars = parseCount(draft.contextMaxChars);
  if (ttl === null || turns === null || maxChars === null) return { error: t("settings.invalidNumber") };
  const extraHeaders = parseHeaders(draft.extraHeaders);
  if (!extraHeaders) return { error: t("settings.invalidHeaders") };
  return {
    values: {
      ...values,
      baseUrl: draft.baseUrl,
      model: draft.model,
      apiKey: draft.apiKey,
      apiKeyCommand: draft.apiKeyCommand,
      apiKeyCommandTtlSeconds: ttl,
      extraHeaders,
      contextTurns: turns,
      contextMaxChars: maxChars,
      promptAddendum: draft.promptAddendum,
    },
  };
}

function Editor({ settings, theme }: { settings: Ready; theme: PluginSurfaceProps["theme"] }) {
  const t = useTranslate();
  const test = useRpc(testConnectionRpc);
  // Draft text survives immediate saves from switches and selects; Save
  // merges it over the latest stored values.
  const [fields, setFields] = useState(() => toDraft(settings.values));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const styles = useMemo(
    () => ({
      ok: { color: theme.colors.statusSuccess },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );

  const field = useCallback(
    (name: keyof Draft) => (text: string) =>
      setFields((current) => ({ ...current, [name]: text })),
    [],
  );
  const saveNow = useCallback(
    (patch: Partial<DictationSettings>) =>
      void settings.save({ ...settings.values, ...patch }, settings.revision),
    [settings],
  );
  const saveDraft = useCallback(async () => {
    const parsed = fromDraft(fields, settings.values, t);
    if ("error" in parsed) {
      setStatus({ ok: false, text: parsed.error });
      return;
    }
    const saved = await settings.save(parsed.values, settings.revision);
    setStatus(saved ? { ok: true, text: t("settings.saved") } : null);
  }, [fields, settings, t]);
  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const result = await test({});
      setStatus({ ok: result.ok, text: result.detail });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }, [test]);

  const values = settings.values;
  const disabled = settings.saving;
  return (
    <>
      <SettingsSection title={t("settings.model.section")}>
        <SettingsCard>
          <SettingsInput
            label={t("settings.model.baseUrl")}
            hint={t("settings.model.baseUrlHint")}
            initialValue={fields.baseUrl}
            onChangeText={field("baseUrl")}
            disabled={disabled}
          />
          <SettingsInput
            label={t("settings.model.model")}
            hint={t("settings.model.modelHint")}
            initialValue={fields.model}
            onChangeText={field("model")}
            disabled={disabled}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.auth.section")}>
        <SettingsCard>
          <SettingsSelect
            label={t("settings.auth.mode")}
            value={values.authMode}
            options={[
              { label: t("settings.auth.key"), value: "key" },
              { label: t("settings.auth.command"), value: "command" },
              { label: t("settings.auth.none"), value: "none" },
            ]}
            onValueChange={(authMode) => saveNow({ authMode })}
            disabled={disabled}
          />
          {values.authMode === "key" ? (
            <SettingsInput
              label={t("settings.auth.apiKey")}
              hint={t("settings.auth.apiKeyHint")}
              initialValue={fields.apiKey}
              onChangeText={field("apiKey")}
              secureTextEntry
              disabled={disabled}
            />
          ) : null}
          {values.authMode === "command" ? (
            <SettingsInput
              label={t("settings.auth.command.label")}
              hint={t("settings.auth.command.hint")}
              initialValue={fields.apiKeyCommand}
              onChangeText={field("apiKeyCommand")}
              disabled={disabled}
            />
          ) : null}
          {values.authMode === "command" ? (
            <SettingsInput
              label={t("settings.auth.ttl")}
              hint={t("settings.auth.ttlHint")}
              initialValue={fields.apiKeyCommandTtlSeconds}
              onChangeText={field("apiKeyCommandTtlSeconds")}
              disabled={disabled}
            />
          ) : null}
          <SettingsInput
            label={t("settings.auth.headers")}
            hint={t("settings.auth.headersHint")}
            initialValue={fields.extraHeaders}
            onChangeText={field("extraHeaders")}
            placeholder="X-Example: value"
            disabled={disabled}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.context.section")}>
        <SettingsCard>
          <SettingsInput
            label={t("settings.context.turns")}
            hint={t("settings.context.turnsHint")}
            initialValue={fields.contextTurns}
            onChangeText={field("contextTurns")}
            disabled={disabled}
          />
          <SettingsInput
            label={t("settings.context.maxChars")}
            initialValue={fields.contextMaxChars}
            onChangeText={field("contextMaxChars")}
            disabled={disabled}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.behavior.section")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.behavior.review")}
            hint={t("settings.behavior.reviewHint")}
            value={values.reviewBeforeSend}
            onValueChange={(reviewBeforeSend) => saveNow({ reviewBeforeSend })}
            disabled={disabled}
          />
          <SettingsInput
            label={t("settings.behavior.prompt")}
            initialValue={fields.promptAddendum}
            onChangeText={field("promptAddendum")}
            disabled={disabled}
          />
          <SettingsSelect
            label={t("settings.behavior.language")}
            value={values.uiLanguage}
            options={[
              { label: t("settings.behavior.languageSystem"), value: "system" },
              { label: "English", value: "en" },
              { label: "简体中文", value: "zh-CN" },
            ]}
            onValueChange={(uiLanguage) => saveNow({ uiLanguage })}
            disabled={disabled}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsCard>
        <SettingsAction
          label={t("settings.save")}
          actionLabel={t("settings.save")}
          onPress={() => void saveDraft()}
          disabled={disabled}
        />
        <SettingsAction
          label={t("settings.test")}
          actionLabel={testing ? t("settings.testing") : t("settings.test")}
          onPress={() => void runTest()}
          disabled={testing}
        />
        {status || settings.saveError ? (
          <SettingsRow label="">
            <Text style={status?.ok ? styles.ok : styles.error}>
              {settings.saveError ?? status?.text}
            </Text>
          </SettingsRow>
        ) : null}
      </SettingsCard>
    </>
  );
}

export function DictationSettingsScreen({ theme }: PluginSurfaceProps) {
  const t = useTranslate();
  const settings = useSettings(dictationSettings);
  const style = useMemo(() => ({ color: theme.colors.statusDanger }), [theme]);
  if (settings.status === "loading") return null;
  if (settings.status !== "ready") {
    return <Text style={style}>{t("settings.loadFailed", { error: settings.error })}</Text>;
  }
  return <Editor settings={settings} theme={theme} />;
}
