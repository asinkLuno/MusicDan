import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Paragraph, XStack } from 'tamagui';
import { invoke } from './types';

type UpdateStatus = { currentBuild: number; latestBuild: number | null; available: boolean };

export function UpdateChecker({ settings }: { settings: boolean }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const check = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setChecking(true);
    setError('');
    try {
      const result = await invoke<UpdateStatus>('check_for_updates');
      if (mounted.current) { setStatus(result); setDismissed(false); }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      pending.current = false;
      if (mounted.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void check();
    const timer = setInterval(() => void check(), 6 * 60 * 60 * 1000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [check]);

  if (!settings && (!status?.available || dismissed)) return null;
  return <Card padding="3" gap="2" borderWidth={1} borderColor="border-color" flexShrink={0}>
    <Paragraph role="status">{status?.available
      ? `发现新构建 #${status.latestBuild}，可前往 GitHub 下载 APK 更新`
      : checking ? '正在检查更新…' : error ? '暂时无法检查更新，请稍后重试'
      : status?.latestBuild ? '已是最新构建' : '暂无可用的公开构建'}</Paragraph>
    {settings && <Paragraph size="sm" color="color-10">{status?.currentBuild ? `当前构建 #${status.currentBuild}` : '本地构建'} · 启动时及每 6 小时自动检查</Paragraph>}
    {settings && error && <Paragraph size="sm" color="color-10">{error}</Paragraph>}
    <XStack gap="2" flexWrap="wrap">
      {status?.available && <Button size="sm" theme="accent" onPress={() => {
        void invoke('open_update_download').catch(e => setError(String(e)));
      }}>前往下载</Button>}
      {settings ? <Button size="sm" disabled={checking} onPress={() => void check()}>检查更新</Button>
        : <Button size="sm" onPress={() => setDismissed(true)}>稍后</Button>}
    </XStack>
    {!settings && error && <Paragraph size="sm" color="color-10">{error}</Paragraph>}
  </Card>;
}
