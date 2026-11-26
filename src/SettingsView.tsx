import { useCallback, useEffect, useMemo, useState } from 'react';
import { Breaker, BreakerPanel, BreakerPanelTitle, BreakerRow } from '@/components/ui/breaker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/card';
import { DetentKnob, DetentKnobStop } from '@/components/ui/detent-knob';
import { Dial, DialMark } from '@/components/ui/dial';
import {
  DipSwitch,
  DipSwitchBank,
  DipSwitchLegend,
  DipSwitchReadout,
  DipSwitchToggle,
} from '@/components/ui/dip-switch';
import { Key } from '@/components/ui/key';
import { NumberWheel } from '@/components/ui/number-wheel';
import { Progress } from '@/components/ui/progress/progress';
import { Separator } from '@/components/ui/separator/separator';
import { TextField, TextFieldDescription, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import { cn } from '@/lib/utils';
import { compareVersions, parseReleaseNotes } from './release';
import type { ReleaseInfo, UpdateStatus } from './release';
import type { Settings } from './types';
import type { OverlayStatus } from './usePlayerState';
import { invoke, listen } from './commands';
import type { DownloadProgress } from './commands';

// GitHub Pages 是应用发布与下载的统一入口
const DOWNLOAD_PAGE = 'https://asinkluno.github.io/MusicDan/';
// 设置页多次进出时复用检查结果，避免重复请求
let updateCache: UpdateStatus | null = null;

const PERCENT_FORMAT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 0 };
const FONT_SIZE_MARK = <DialMark value={16} tone="amber" />;
const OPACITY_MARK = <DialMark value={0.6} tone="amber" />;
const REFRESH_STOPS = [5, 10, 20, 35, 50, 100];

export default function SettingsView({
  permissionGranted,
  cfg,
  overlay,
  onSetOverlay,
  onChange,
  onClearError,
  onError,
}: {
  permissionGranted: boolean;
  cfg: Settings;
  overlay: OverlayStatus;
  onSetOverlay: (next: OverlayStatus) => void;
  onChange: (patch: Partial<Settings>) => void;
  onClearError: () => void;
  onError: (error: unknown) => void;
}) {
  const [commentLimitDraft, setCommentLimitDraft] = useState(() =>
    cfg.commentLimit == null ? '' : String(cfg.commentLimit),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCommentLimitDraft(cfg.commentLimit == null ? '' : String(cfg.commentLimit));
  }, [cfg.commentLimit]);

  async function toggleOverlay() {
    setBusy(true);
    onClearError();
    try {
      if (!overlay.granted) {
        await invoke('plugin:media|open_overlay_settings');
      } else {
        await invoke('plugin:media|set_overlay', { enabled: !overlay.running });
        onSetOverlay({ ...overlay, running: !overlay.running });
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const dipValues = useMemo(
    () => [
      ...(cfg.keepScreenOnFullscreen ? ['keepScreenOnFullscreen'] : []),
      ...(cfg.pinLongComments ? ['pinLongComments'] : []),
    ],
    [cfg.keepScreenOnFullscreen, cfg.pinLongComments],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex flex-col gap-4">
        <div className="flex shrink-0 flex-col gap-1">
          <h1 className="m-0 text-xl font-bold">控制台设置</h1>
          <p className="m-0 text-xs text-muted-foreground">使用旋钮、拨码与总闸调节弹幕与跨应用显示</p>
        </div>

        <BreakerPanel>
          <BreakerPanelTitle>电源与权限总闸</BreakerPanelTitle>
          <BreakerRow className="justify-around">
            <Breaker
              label="播放信息"
              description={permissionGranted ? '已授权' : '点击授权'}
              checked={permissionGranted}
              tripped={!permissionGranted}
              onCheckedChange={() => void invoke('plugin:media|open_permission_settings').catch(onError)}
            />
            <Breaker
              label="悬浮弹幕"
              description={overlay.granted ? '跨应用显示' : '需悬浮权限'}
              checked={overlay.running}
              tripped={!overlay.granted && !overlay.running}
              disabled={busy || !overlay.supported}
              onCheckedChange={() => void toggleOverlay()}
            />
          </BreakerRow>
        </BreakerPanel>

        <Card>
          <CardHeader>
            <CardTitle>弹幕调音台</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 place-items-center gap-4 py-4">
            <Dial
              className="w-32 gap-2"
              min={12}
              max={32}
              step={1}
              ticks={20}
              value={cfg.fontSize}
              marks={FONT_SIZE_MARK}
              label="字号 (px)"
              onValueChange={(v) => onChange({ fontSize: v })}
            />
            <Dial
              className="w-32 gap-2"
              min={0.2}
              max={0.8}
              step={0.01}
              ticks={20}
              value={cfg.opacity}
              format={PERCENT_FORMAT}
              marks={OPACITY_MARK}
              label="不透明度"
              onValueChange={(v) => onChange({ opacity: Number(v.toFixed(2)) })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>硬件拨码开关</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <DipSwitch
              aria-label="播放与弹幕拨码开关"
              variant="red"
              value={dipValues}
              onValueChange={(values) =>
                onChange({
                  keepScreenOnFullscreen: values.includes('keepScreenOnFullscreen'),
                  pinLongComments: values.includes('pinLongComments'),
                })
              }
              className="flex flex-wrap items-center gap-5"
            >
              <DipSwitchBank>
                <DipSwitchToggle value="keepScreenOnFullscreen">全屏保持常亮</DipSwitchToggle>
                <DipSwitchToggle value="pinLongComments">长评驻留顶部</DipSwitchToggle>
              </DipSwitchBank>
              <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
                <DipSwitchLegend />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>配置码</span>
                  <DipSwitchReadout format="hex" />
                </div>
              </div>
            </DipSwitch>
            <p className="m-0 text-xs text-muted-foreground">
              拨码 1 控制全屏播放时屏幕常亮；拨码 2 将长评改为在顶部或底部居中停留数秒后淡出，不遮挡当前歌词。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>评论更新与显示</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium text-foreground">评论增长后重新抓取</span>
              <RefreshPercentKnob
                value={cfg.commentRefreshPercent}
                onChange={(v) => onChange({ commentRefreshPercent: v })}
              />
              <p className="m-0 text-center text-xs text-muted-foreground">
                默认增长 10% 后更新。仅在打开或切换歌曲时检查总评论数，未达到阈值时继续使用本地缓存。
              </p>
            </div>
            <Separator />
            <TextField>
              <div className="flex items-center justify-between gap-2">
                <TextFieldLabel htmlFor="comment-limit">合并后的弹幕显示上限</TextFieldLabel>
                {cfg.commentLimit != null && <NumberWheel value={cfg.commentLimit} tone="black" className="text-xs" />}
              </div>
              <div className="flex items-center gap-2">
                <TextFieldInput
                  id="comment-limit"
                  aria-label="合并后的弹幕显示上限"
                  inputMode="numeric"
                  className="flex-1"
                  placeholder="不限，显示全部合并弹幕"
                  value={commentLimitDraft}
                  onChange={(e) => setCommentLimitDraft(e.target.value)}
                />
                <Key
                  size="md"
                  variant="secondary"
                  onClick={() => {
                    const value = commentLimitDraft.trim();
                    if (!value) {
                      onChange({ commentLimit: null });
                      return;
                    }
                    const limit = Number(value);
                    if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1 || limit > 4294967295) {
                      onError('请输入有效的正整数，或留空表示不限');
                      return;
                    }
                    onChange({ commentLimit: limit });
                  }}
                >
                  保存上限
                </Key>
              </div>
              <TextFieldDescription>
                后台始终全量抓取，每新增 1000
                条更新弹幕。合并后的一组算一条，留空则全部显示；设置上限后优先显示高赞弹幕。修改显示上限无需重新抓取。
              </TextFieldDescription>
            </TextField>
          </CardContent>
        </Card>

        <VersionSection />
      </div>
    </div>
  );
}

function RefreshPercentKnob({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const stops = useMemo(
    () => (REFRESH_STOPS.includes(value) ? REFRESH_STOPS : [...REFRESH_STOPS, value].sort((a, b) => a - b)),
    [value],
  );
  return (
    <DetentKnob
      aria-label="评论增长后重新抓取阈值"
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
    >
      {stops.map((stop) => (
        <DetentKnobStop key={stop} value={String(stop)}>
          {`${stop}%`}
        </DetentKnobStop>
      ))}
    </DetentKnob>
  );
}

function ReleaseNotes({ label, release }: { label: string; release?: ReleaseInfo | null }) {
  const blocks = useMemo(() => (release?.notes ? parseReleaseNotes(release.notes) : []), [release?.notes]);
  if (!blocks.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-sm font-bold text-foreground">{label}</p>
      {blocks.map((block, index) =>
        block.kind === 'heading' ? (
          <p key={index} className={cn('m-0 text-xs font-semibold text-foreground/90', index > 0 && 'pt-1')}>
            {block.text}
          </p>
        ) : block.kind === 'item' ? (
          <div key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span>·</span>
            <p className="m-0 flex-1">{block.text}</p>
          </div>
        ) : (
          <p key={index} className="m-0 text-xs text-muted-foreground">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

function VersionSection() {
  const [status, setStatus] = useState<UpdateStatus | null>(updateCache);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(updateCache ? 'ready' : 'loading');
  const [checkError, setCheckError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [busy, setBusy] = useState<'download' | 'install' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [installerOpened, setInstallerOpened] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

  const check = useCallback(async () => {
    setPhase('loading');
    setCheckError('');
    setUpdateError('');
    try {
      const next = await invoke('check_update');
      updateCache = next;
      setStatus(next);
      setPhase('ready');
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);
  useEffect(() => {
    if (!updateCache) void check();
  }, [check]);
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void listen<DownloadProgress>('update://progress', (payload) => {
      setProgress(payload.total > 0 ? Math.min(1, payload.received / payload.total) : null);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const latest = status?.latest ?? null;
  const hasUpdate = !!status && !!latest && compareVersions(status.currentVersion, latest.version) < 0;

  const openUrl = async (url: string) => {
    setUpdateError('');
    try {
      await invoke('plugin:media|open_url', { url });
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
    }
  };
  const openInstallPermission = async () => {
    setUpdateError('');
    try {
      await invoke('plugin:media|open_install_permission_settings');
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
    }
  };
  const installUpdate = async () => {
    if (!latest?.apkUrl) return;
    if (!latest.sha256) {
      setUpdateError('该版本未提供 SHA-256 校验值，请到发布页手动下载');
      return;
    }
    setUpdateError('');
    setInstallerOpened(false);
    try {
      const permission = await invoke('plugin:media|install_permission');
      if (!permission.supported) {
        setUpdateError('当前平台不支持应用内安装');
        return;
      }
      if (!permission.granted) {
        setNeedsPermission(true);
        await openInstallPermission();
        setUpdateError('请在系统设置中允许 MusicDan 安装应用，然后返回重试');
        return;
      }
      setNeedsPermission(false);
      setBusy('download');
      setProgress(0);
      const file = await invoke('download_update', { url: latest.apkUrl, sha256: latest.sha256 });
      setBusy('install');
      await invoke('plugin:media|install_apk', { path: file.path });
      setInstallerOpened(true);
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const percent = progress === null ? null : Math.round(progress * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle>版本与更新</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex-1 text-sm font-medium text-foreground">当前版本</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {status ? `v${status.currentVersion}` : '…'}
          </span>
          <Key size="sm" variant="secondary" pending={phase === 'loading'} onClick={() => void check()}>
            {phase === 'loading' ? '检查中…' : '检查更新'}
          </Key>
        </div>
        {phase === 'error' && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs text-muted-foreground">检查更新失败：{checkError}</p>
            <Key size="sm" variant="secondary" className="self-start" onClick={() => void openUrl(DOWNLOAD_PAGE)}>
              打开下载页
            </Key>
          </div>
        )}
        {phase === 'ready' && hasUpdate && latest && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex-1 text-sm font-semibold text-foreground">发现新版本 v{latest.version}</span>
              <Key size="sm" variant="primary" pending={!!busy} onClick={() => void installUpdate()}>
                {busy === 'download'
                  ? '下载中…'
                  : busy === 'install'
                    ? '安装中…'
                    : installerOpened
                      ? '再次安装'
                      : '下载并安装'}
              </Key>
            </div>
            {busy === 'download' && (
              <Progress
                value={(progress ?? 0) * 100}
                label={percent === null ? '正在下载并校验安装包…' : `正在下载并校验安装包 ${percent}%`}
              />
            )}
            {installerOpened && (
              <p className="m-0 text-xs text-muted-foreground">安装包已通过 SHA-256 校验，请在系统安装器中确认安装。</p>
            )}
            {needsPermission && (
              <Key size="sm" variant="secondary" className="self-start" onClick={() => void openInstallPermission()}>
                打开安装授权设置
              </Key>
            )}
            {updateError && <p className="m-0 text-xs text-muted-foreground">{updateError}</p>}
          </div>
        )}
        {phase === 'ready' && latest && !hasUpdate && <p className="m-0 text-xs text-muted-foreground">已是最新版本</p>}
        {phase === 'ready' && !latest && <p className="m-0 text-xs text-muted-foreground">暂时无法获取更新信息</p>}
        {updateError && phase !== 'ready' && (
          <p className="m-0 text-xs text-muted-foreground">操作失败：{updateError}</p>
        )}
        <Separator />
        {status?.currentRelease ? (
          <ReleaseNotes label={`v${status.currentVersion} 更新内容`} release={status.currentRelease} />
        ) : (
          <p className="m-0 text-xs text-muted-foreground">暂无本版本的更新说明</p>
        )}
        {phase === 'ready' && hasUpdate && latest && (
          <ReleaseNotes label={`v${latest.version} 更新内容`} release={latest} />
        )}
      </CardContent>
    </Card>
  );
}
