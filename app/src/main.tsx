import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Danmaku } from './Danmaku';
import { defaults, formatTime, invoke, trackKey } from './types';
import type { Settings, Snapshot, Song } from './types';
import './styles.css';

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    wave: <><path d="M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    music: <><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></>,
    arrow: <path d="m9 5 7 7-7 7"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    overlay: <><rect x="3" y="3" width="13" height="13" rx="3"/><rect x="9" y="9" width="12" height="12" rx="3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.music}</svg>;
}
function App() {
  const [tab, setTab] = useState('danmaku');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cfg, setCfg] = useState<Settings>(defaults);
  const [overlay, setOverlay] = useState({ granted: false, running: false, supported: true });
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const searchId = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const np = snapshot?.nowPlaying;
  const currentKey = np ? trackKey(np) : '';
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [state, status] = await Promise.all([invoke<Snapshot>('get_player_state'), invoke<typeof overlay>('plugin:media|overlay_status')]);
        if (stopped) return;
        setSnapshot(state); setOverlay(status);
        if (!initialized.current) { initialized.current = true; setCfg(state.settings); }
      } catch (e) { if (!stopped) fail(e); }
      if (!stopped) timer = setTimeout(poll, 750);
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, []);
  useEffect(() => { const back = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); }; window.addEventListener('keydown', back); return () => window.removeEventListener('keydown', back); }, []);
  function change(patch: Partial<Settings>) {
    const next = { ...cfg, ...patch }; setCfg(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void invoke('update_settings', { settings: next }).catch(fail); }, 180);
  }
  async function search(e: React.FormEvent) {
    e.preventDefault(); if (!query.trim()) return;
    const id = ++searchId.current; setSearching(true); setError(''); setSearched(false);
    try { const songs = await invoke<Song[]>('search_songs', { keyword: query }); if (id === searchId.current) { setResults(songs); setSearched(true); } }
    catch (e) { if (id === searchId.current) fail(e); }
    finally { if (id === searchId.current) setSearching(false); }
  }
  async function match(song: Song | null) {
    if (!currentKey || busy) return; setBusy(true); setError('');
    try { await invoke('set_song_match', { key: currentKey, song }); if (song) setTab('danmaku'); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function toggleOverlay() {
    setBusy(true); setError('');
    try {
      if (!overlay.granted) { await invoke('plugin:media|open_overlay_settings'); }
      else { await invoke('plugin:media|set_overlay', { enabled: !overlay.running }); setOverlay({ ...overlay, running: !overlay.running }); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  const waiting = !snapshot?.permissionGranted ? '授权后，跟随音乐遇见评论' : !np ? '在音乐 App 播放一首歌' : snapshot.loading ? '正在寻找这首歌的评论…' : snapshot.error ? '暂时没有匹配成功' : !snapshot.comments.length ? '这首歌还没有可用评论' : '';
  return <div className={`app-shell ${full ? 'is-full' : ''}`}>
    {!full && <header className="app-header"><a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('danmaku'); }}><span className="brand-mark"><Icon name="wave" size={20}/></span>listen<span>W</span>me</a><span className="header-note">音乐里的另一个世界</span></header>}
    {error && <div role="alert" className="error-banner">{error}<button aria-label="关闭提示" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
    <main className={tab === 'danmaku' ? 'main-view player-view' : 'main-view scroll-view'}>
      {tab === 'danmaku' && <>
        {!full && <section className="track-card"><div className={`record ${np?.isPlaying ? 'playing' : ''}`}><Icon name="music" size={25}/></div><div className="track-info"><p className="eyebrow">{np?.isPlaying ? '正在聆听' : np ? '播放已暂停' : '等待音乐'}</p><h1>{np?.title || '让评论，随音乐流动'}</h1><p>{np?.artist || '打开你常用的音乐 App 开始播放'}</p></div><span className={`live-dot ${np?.isPlaying ? 'active' : ''}`}/></section>}
        <section className={`stage-card ${full ? 'fullscreen-stage' : ''}`}>
          <div className="stage-toolbar"><span><span className="tiny-dot"/> LIVE COMMENTS</span><button aria-label={full ? '退出全屏' : '全屏弹幕'} onClick={() => setFull(!full)}><Icon name={full ? 'close' : 'expand'} size={19}/></button></div>
          <div className="danmaku-viewport">
            <Danmaku snapshot={snapshot} settings={cfg}/>
          {waiting && <div className="stage-empty"><div className="empty-symbol"><Icon name="wave" size={35}/></div><p>{waiting}</p>{!snapshot?.permissionGranted ? <button className="primary" onClick={() => void invoke('plugin:media|open_permission_settings').catch(fail)}>授权读取播放信息 <Icon name="arrow" size={15}/></button> : snapshot?.error ? <button className="secondary" onClick={() => void invoke('retry_match').catch(fail)}>重新匹配</button> : <span>每一首歌，都有一些共鸣</span>}</div>}
          </div>
          {!full && <div className="stage-footer"><span>{snapshot?.comments.length ? `${snapshot.comments.length} 条评论 · ${cfg.density} 条轨道` : '跟随播放进度同步'}</span><span>{formatTime(np?.position || 0)} / {formatTime(np?.duration || snapshot?.song?.duration || 0)}</span></div>}
        </section>
        {!full && <div className="match-summary"><div><p className="eyebrow">{snapshot?.manualMatch ? '已保存的匹配' : '自动匹配'}</p><p>{snapshot?.song ? `${snapshot.song.name} · ${snapshot.song.artists}` : '等待识别当前歌曲'}</p><span>{snapshot?.song?.album || '匹配不准确？可以手动选择歌曲版本'}</span></div><button aria-label="搜索匹配" onClick={() => { setQuery(np ? `${np.title} ${np.artist}` : ''); setTab('search'); }}><Icon name="arrow" size={19}/></button></div>}
      </>}
      {tab === 'search' && <>
        <div className="page-title"><p className="eyebrow">FIND YOUR SONG</p><h1>找到对的那首歌</h1><p>选择歌曲版本，让每一条评论都对上旋律。</p></div>
        <form className="search-form" onSubmit={search}><Icon name="search" size={20}/><input aria-label="搜索歌名或歌手" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索歌名、歌手"/><button disabled={searching || !query.trim()}>{searching ? '搜索中' : '搜索'}</button></form>
        <div className="context-card"><span className="eyebrow">正在匹配</span><strong>{np ? `${np.title} · ${np.artist}` : '请先播放歌曲，再保存匹配'}</strong>{snapshot?.manualMatch && <button className="text-button" disabled={busy} onClick={() => void match(null)}>恢复自动匹配</button>}</div>
        {searching && <div className="list-empty">正在搜索歌曲版本…</div>}
        {!searching && results.map(song => <article className="song-result" key={song.songId}><span className="result-icon"><Icon name="music" size={19}/></span><div><h2>{song.name}</h2><p>{song.artists}</p><span>{song.album} · {formatTime(song.duration)}</span></div><button disabled={!np || busy} className={snapshot?.song?.songId === song.songId ? 'selected' : ''} onClick={() => void match(song)}>{snapshot?.song?.songId === song.songId ? <Icon name="check" size={18}/> : '匹配'}</button></article>)}
        {!searching && !results.length && <div className="list-empty"><Icon name="search" size={32}/><p>{searched ? '没有找到歌曲，试试更短的关键词' : '搜索并选择正确版本'}</p><span>手动匹配会保存，下次播放自动使用</span></div>}
      </>}
      {tab === 'settings' && <>
        <div className="page-title"><p className="eyebrow">MAKE IT YOURS</p><h1>你的弹幕，你来调</h1><p>找到舒服的节奏，让共鸣刚刚好。</p></div>
        <section className="settings-card"><div className="setting-head"><span className="setting-icon"><Icon name="overlay"/></span><div><h2>跨应用悬浮弹幕</h2><p>{overlay.running ? '已开启，离开应用后显示' : '切到其他 App，评论也能跟着走'}</p></div><button className={`switch ${overlay.running ? 'on' : ''}`} role="switch" aria-label="跨应用悬浮弹幕" aria-checked={overlay.running} disabled={busy || !overlay.supported} onClick={() => void toggleOverlay()}><span/></button></div>{!overlay.granted && <button className="permission-link" onClick={() => void toggleOverlay()}>允许显示在其他应用上层 <Icon name="arrow" size={15}/></button>}<p className="setting-note">弹幕可触摸穿透；通知栏可暂停或关闭。</p></section>
        <section className="settings-card"><h2>弹幕外观</h2>
          <Slider label="字号" value={cfg.fontSize} min={12} max={32} unit="px" onChange={v => change({ fontSize: v })}/>
          <Slider label="穿屏时长" value={cfg.crossSeconds} min={4} max={20} unit="秒" onChange={v => change({ crossSeconds: v })}/>
          <Slider label="不透明度" value={Math.round(cfg.opacity * 100)} min={20} max={80} unit="%" onChange={v => change({ opacity: v / 100 })}/>
          <Slider label="轨道数量" value={cfg.density} min={2} max={12} unit="条" onChange={v => change({ density: v })}/>
        </section>
        <section className="settings-card permission-row"><div><h2>播放信息权限</h2><p>{snapshot?.permissionGranted ? '已授权通知使用权' : '需要通知使用权以识别歌曲'}</p></div><button className="secondary" onClick={() => void invoke('plugin:media|open_permission_settings').catch(fail)}>管理</button></section>
        <p className="app-version">listenWme · 把共鸣留在音乐里</p>
      </>}
    </main>
    {!full && <nav className="tab-bar" aria-label="主导航">{[['danmaku','wave','弹幕'],['search','search','搜索匹配'],['settings','settings','设置']].map(([id,icon,label]) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon name={icon}/><span>{label}</span></button>)}</nav>}
  </div>;
}
function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <label className="slider-row"><span>{label}<strong>{value}<small>{unit}</small></strong></span><input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}/></label>;
}
createRoot(document.getElementById('root')!).render(<App/>);
