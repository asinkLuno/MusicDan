import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';
import { ArrowDownToLine, AudioLines, Code2, Layers, MessageCircle, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AspectRatio } from '@/components/ui/aspect-ratio';
const overlay = '/screenshots/november-rain-danmaku';
const danmaku = '/screenshots/app-danmaku';
const search = '/screenshots/november-rain-search';
const heroSizes = '(min-width: 640px) 384px, calc(100vw - 48px)';
const cardSizes = '(min-width: 1152px) 492px, (min-width: 768px) calc(50vw - 84px), (min-width: 640px) calc(100vw - 112px), calc(100vw - 80px)';
const srcSet = (base: string, format: 'avif' | 'webp') =>
  [540, 810, 1080].map(width => `${base}-${width}.${format} ${width}w`).join(', ');
import './index.css';

const repository = 'https://github.com/asinkLuno/MusicDan';
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.6, ease: 'easeOut' },
} as const;
type Release = {
  version: string;
  name: string;
  size: number;
  sha256: string;
  download_url: string;
  notes?: string;
  published_at: string;
};

function validRelease(value: unknown): value is Release {
  if (!value || typeof value !== 'object') return false;
  const release = value as Record<string, unknown>;
  return typeof release.version === 'string' && typeof release.name === 'string'
    && typeof release.size === 'number' && release.size > 0
    && typeof release.sha256 === 'string' && /^[a-f0-9]{64}$/.test(release.sha256)
    && typeof release.download_url === 'string' && /^\/releases\/(?:latest\.apk|(?:[\w.-]+\/)?MusicDan_[\w.-]+_arm64\.apk)$/.test(release.download_url)
    && typeof release.published_at === 'string' && Number.isFinite(Date.parse(release.published_at));
}

function App() {
  const [release, setRelease] = useState<Release | null>(null);
  const [history, setHistory] = useState<Release[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    async function loadLatest() {
      try {
        const response = await fetch('/latest.json', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Latest release unavailable');
        const value: unknown = await response.json();
        if (!validRelease(value)) throw new Error('Invalid release metadata');
        setRelease(value);
        setStatus('ready');
      } catch {
        if (!disposed) setStatus('error');
      }
    }
    let disposed = false;
    void loadLatest();
    void fetch('/releases.json', { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : [])
      .then((value: unknown) => { if (!disposed && Array.isArray(value)) setHistory(value.filter(validRelease)); })
      .catch(() => {});
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6 sm:px-10">
        <Button asChild variant="ghost" className="gap-2 px-0 text-lg font-semibold">
          <a href="/" aria-label="MusicDan 首页">
            <img src="/brand/icon-128.webp" alt="" width={28} height={28} className="size-7" />
            MusicDan
          </a>
        </Button>
        <nav aria-label="主导航" className="flex items-center gap-2">
          <Button asChild variant="ghost"><a href="#download">下载</a></Button>
          <Button asChild variant="outline" className="hidden sm:flex"><a href={repository}><Code2 aria-hidden="true" /> GitHub</a></Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-20 px-6 pb-12 sm:px-10 sm:pb-20">
        <section aria-labelledby="intro-title" className="grid items-center gap-12 py-10 md:grid-cols-2 md:gap-16 md:py-16">
          <div className="space-y-7">
            <h1 id="intro-title" className="text-5xl leading-tight font-semibold tracking-tight sm:text-6xl">让热评，<br />跟着音乐走。</h1>
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">MusicDan 把网易云音乐评论变成弹幕，让你在喜欢的音乐 App 里，也能看见同一首歌的共鸣。</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><a href="#download"><ArrowDownToLine aria-hidden="true" /> 下载 Android 版</a></Button>
              <Button asChild size="lg" variant="outline"><a href="#experience">看看实际效果</a></Button>
            </div>
          </div>
          <m.div className="mx-auto w-full max-w-sm" {...reveal}>
            <Card className="gap-0 p-0">
              <CardContent className="p-0">
                <AspectRatio ratio={6 / 13}>
                  <picture className="block size-full">
                    <source type="image/avif" srcSet={srcSet(overlay, 'avif')} sizes={heroSizes} />
                    <img src={`${overlay}-1080.webp`} srcSet={srcSet(overlay, 'webp')} sizes={heroSizes} alt="MusicDan 实际运行画面，November Rain 合并评论与双语歌词" width={1080} height={2340} fetchPriority="high" className="size-full object-cover" />
                  </picture>
                </AspectRatio>
              </CardContent>
            </Card>
          </m.div>
        </section>

        <section id="experience" aria-labelledby="experience-title" className="space-y-8">
          <m.div className="max-w-xl space-y-3" {...reveal}>
            <h2 id="experience-title" className="text-3xl font-semibold tracking-tight">本地音乐，在线评论</h2>
            <p className="leading-relaxed text-muted-foreground">不用换播放器。自动识别正在播放的歌曲，把散落在评论区的文字带到你眼前。</p>
          </m.div>
          <m.div className="grid gap-6 md:grid-cols-2" {...reveal}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><Layers aria-hidden="true" className="size-5" /> 弹幕，浮在音乐之上</CardTitle>
                <CardDescription className="leading-relaxed">支持反向控制原音乐 App。</CardDescription>
              </CardHeader>
              <CardContent>
                <AspectRatio ratio={6 / 13} className="overflow-hidden rounded-lg bg-muted">
                  <picture className="block size-full">
                    <source type="image/avif" srcSet={srcSet(danmaku, 'avif')} sizes={cardSizes} />
                    <img src={`${danmaku}-1080.webp`} srcSet={srcSet(danmaku, 'webp')} sizes={cardSizes} alt="MusicDan 播放 Creep 时的应用内弹幕，1000 条热评跟随进度滚动" width={1080} height={2340} loading="lazy" className="size-full object-contain" />
                  </picture>
                </AspectRatio>
              </CardContent>
              <CardFooter><MessageCircle aria-hidden="true" className="mr-2 size-4" /> 热评优先，上千条评论跟随播放进度滚动</CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><Search aria-hidden="true" className="size-5" /> 同一首歌，不止一个版本</CardTitle>
                <CardDescription className="leading-relaxed">自动匹配歌曲，也能手动选版本。把原唱、现场和翻唱的评论合在一起，发现更多听众的故事。</CardDescription>
              </CardHeader>
              <CardContent>
                <AspectRatio ratio={6 / 13} className="overflow-hidden rounded-lg bg-muted">
                  <picture className="block size-full">
                    <source type="image/avif" srcSet={srcSet(search, 'avif')} sizes={cardSizes} />
                    <img src={`${search}-1080.webp`} srcSet={srcSet(search, 'webp')} sizes={cardSizes} alt="搜索歌曲并勾选多个版本以合并评论" width={1080} height={2340} loading="lazy" className="size-full object-contain" />
                  </picture>
                </AspectRatio>
              </CardContent>
              <CardFooter><AudioLines aria-hidden="true" className="mr-2 size-4" /> 字号、不透明度、显示上限随时调整</CardFooter>
            </Card>
          </m.div>
        </section>

        <m.section id="download" aria-labelledby="download-title" {...reveal}>
          <Card>
            <CardHeader className="gap-3">
              <CardTitle id="download-title" role="heading" aria-level={2} className="text-3xl">下一首歌，和大家一起听。</CardTitle>
              <CardDescription>从官网下载 APK 安装到 Android 手机，每个版本均提供 SHA-256 校验信息。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {status === 'loading' ? <Skeleton className="h-10 w-52" aria-label="正在读取最新版本" /> : null}
              {release ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge>v{release.version}</Badge>
                    <p className="text-sm text-muted-foreground">{(release.size / 1024 / 1024).toFixed(1)} MB · {new Date(release.published_at).toLocaleDateString('zh-CN')}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild size="lg"><a href={release.download_url} download={release.name}><ArrowDownToLine aria-hidden="true" /> 本站下载 APK</a></Button>
                    <Button asChild variant="link"><a href="#release-notes">查看更新说明</a></Button>
                  </div>
                </div>
              ) : null}
              {status === 'error' ? (
                <Alert>
                  <AlertTitle>暂时无法读取本站安装包</AlertTitle>
                  <AlertDescription>
                    <p>请稍后刷新重试，也可以直接使用固定下载地址。</p>
                    <Button asChild variant="outline"><a href="/releases/latest.apk">下载最新 APK</a></Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              <p className="text-sm leading-relaxed text-muted-foreground">需要 Android 7.0（API 24）及以上。仅提供 arm64-v8a（64 位）安装包，暂不支持 32 位 armv7 或 x86 / x86_64 模拟器。</p>
              <Separator />
              {release?.notes ? (
                <div id="release-notes" className="space-y-3">
                  <p className="font-medium">v{release.version} 更新内容</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{release.notes.replace(/^#{1,6} /gm, '')}</p>
                </div>
              ) : null}
              <Accordion type="single" collapsible>
                <AccordionItem value="setup">
                  <AccordionTrigger>安装后，如何开启弹幕？</AccordionTrigger>
                  <AccordionContent className="space-y-3 leading-relaxed">
                    <p>首次安装时，按系统提示允许从浏览器安装应用。打开 MusicDan，在设置中授予通知使用权，用于识别音乐 App 当前播放的歌曲。</p>
                    <p>想在其他音乐 App 上看弹幕，还需要授予“显示在其他应用上层”权限，并开启悬浮弹幕。随后回到播放器播放歌曲即可。</p>
                    <p>如果主动关闭了悬浮服务，需回到设置重新开启。部分系统页面或屏蔽悬浮窗的 App 可能隐藏弹幕层。</p>
                  </AccordionContent>
                </AccordionItem>
                {release ? (
                  <AccordionItem value="checksum">
                    <AccordionTrigger><span className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4" /> 安装包校验信息</span></AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      <p>文件：{release.name}</p>
                      <p className="break-all text-muted-foreground">SHA-256：{release.sha256}</p>
                      <Button asChild variant="link" className="px-0"><a href={`${release.download_url}.sha256`}>下载校验文件</a></Button>
                    </AccordionContent>
                  </AccordionItem>
                ) : null}
                {history.length > 1 ? (
                  <AccordionItem value="history">
                    <AccordionTrigger>历史版本下载</AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      {history.filter(item => item.version !== release?.version).map(item => (
                        <div key={item.download_url} className="flex flex-wrap items-center justify-between gap-2">
                          <p>v{item.version} · {new Date(item.published_at).toLocaleDateString('zh-CN')}</p>
                          <Button asChild variant="outline"><a href={item.download_url} download>下载 {item.name}</a></Button>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                ) : null}
              </Accordion>
            </CardContent>
          </Card>
        </m.section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-sm text-muted-foreground">
          <p>MusicDan · 让喜欢的歌，多一点共鸣。</p>
          <Button asChild variant="link"><a href={`${repository}/issues`}>反馈问题</a></Button>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </LazyMotion>,
);
