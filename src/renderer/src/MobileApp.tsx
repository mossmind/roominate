import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { storage as platformStorage, asana as platformAsana } from './lib/platform'
import PrayerIcon from './assets/icons/prayer.svg?react'
import InsideIcon from './assets/icons/Pot.svg?react'
import OutsideIcon from './assets/icons/Outside.svg?react'
import UncatIcon from './assets/icons/uncat.svg?react'
import prayerVideo from './assets/Prayer Motion 1.mp4'
import prayerMusic from './assets/Prayer Motion Music 1.mp3'
import bgPhoto from './assets/bg.png'

// ── Types ──────────────────────────────────────────────────────────────────
interface Task { gid: string; name: string; due_on: string | null; notes: string; url: string }
type CategoryKey = 'factory' | 'creative' | null
interface ImageCard { id: string; url: string; x: number; y: number; w: number }

// ── Design tokens ──────────────────────────────────────────────────────────
const C = { main: '#606E4A', dark: '#1E1C26', light: '#FFFFFF' }
const FONT = "'Inter', system-ui, sans-serif"
const FONT_DISPLAY = "'Cormorant', Georgia, serif"

const CATEGORIES = {
  factory:  { label: 'Outside', emoji: '⚙️', color: C.dark, text: C.light },
  creative: { label: 'Inside',  emoji: '✦',  color: C.main, text: C.light },
} as const

const STAGES = [
  { id: 'prayer',     step: 1, label: 'Prayer',     sub: 'Open the Door', color: C.dark,  textColor: C.light, prompt: "Before anything else — invite God in. This isn't the backup plan, it's the first move.",                                   scripture: 'Behold, I stand at the door and knock.',                                  ref: 'Rev 3:20', q: 'What are you asking God to unveil through this project?',           reward: 'Door Unlocked'  },
  { id: 'revelation', step: 2, label: 'Revelation', sub: 'Mood Board',    color: C.main,  textColor: C.light, prompt: 'Vision before execution. Build your mood board — collect images, colors, textures that speak the truth this project must say.', scripture: 'The revelation of Jesus Christ, which God gave him to show his servants.', ref: 'Rev 1:1',  q: 'What does this project look, feel, and sound like?',                   reward: 'Vision Captured' },
  { id: 'action',     step: 3, label: 'Action',     sub: 'Walk Through',  color: C.dark,  textColor: C.light, prompt: 'God opens the door. You walk through. First brushstroke is obedience. Starting is worship.',                               scripture: 'I have set before you an open door, which no one is able to shut.',       ref: 'Rev 3:8',  q: 'What is the single next move? Do it now — that step is yours.',         reward: 'Action Taken'   },
  { id: 'surrender',  step: 4, label: 'Surrender',  sub: 'Open Hands',   color: C.light, textColor: C.dark,  prompt: 'The work is borrowed. Deliver it open-handed. The win is faithfulness, not flawlessness.',                                  scripture: 'Worthy are you, our Lord and God, to receive glory and honor and power.', ref: 'Rev 4:11', q: 'Can you release this — imperfect and complete — as an act of worship?',  reward: '🏆 Complete!'  },
]

const PROJECT_GID = '1208321640687989'
const DEFAULT_SECTION_GIDS = ['1208321358070311']
const IMG_DEFAULT_W = 140

// ── Helpers ────────────────────────────────────────────────────────────────
function daysLeft(due: string | null) { return due ? Math.ceil((new Date(due).getTime() - Date.now()) / 86400000) : null }
function urgLabel(due: string | null) { const d = daysLeft(due); if (d === null) return null; if (d < 0) return Math.abs(d) + 'd overdue'; if (d === 0) return 'Due today'; if (d <= 7) return d + 'd left'; return null }
function urgColor(due: string | null) { const d = daysLeft(due); return d !== null && d <= 3 ? '#e05c5c' : d !== null && d <= 7 ? '#d4956a' : C.main }
async function storageGet(key: string) { return platformStorage.get(key) }
async function storageSet(key: string, value: unknown) { await platformStorage.set(key, value as string) }
function haptic(style: ImpactStyle = ImpactStyle.Medium) { Haptics.impact({ style }).catch(() => {}) }

async function fetchAsanaTasks(sectionGids: string[]): Promise<Task[]> {
  const safe = Array.isArray(sectionGids) ? sectionGids : DEFAULT_SECTION_GIDS
  const pages = await Promise.all(safe.map(g => platformAsana.fetchTasks(g)))
  const seen = new Set<string>(); const tasks: Task[] = []
  for (const raw of pages) for (const t of raw) {
    if (t.completed || seen.has(t.gid)) continue
    seen.add(t.gid)
    tasks.push({ gid: t.gid, name: t.name || 'Untitled', due_on: t.due_on || null, notes: t.notes || '', url: t.permalink_url || `https://app.asana.com/0/0/${t.gid}` })
  }
  return tasks
}

// ── useSwipe ───────────────────────────────────────────────────────────────
function useSwipe(onLeft: () => void, onRight: () => void, minDist = 55) {
  const x0 = useRef(0); const y0 = useRef(0)
  return {
    onTouchStart: (e: React.TouchEvent) => { x0.current = e.touches[0].clientX; y0.current = e.touches[0].clientY },
    onTouchEnd:   (e: React.TouchEvent) => {
      const dx = x0.current - e.changedTouches[0].clientX
      const dy = Math.abs(y0.current - e.changedTouches[0].clientY)
      if (Math.abs(dx) > minDist && Math.abs(dx) > dy * 1.4) { haptic(ImpactStyle.Light); dx > 0 ? onLeft() : onRight() }
    },
  }
}

// ── Stage Icon ─────────────────────────────────────────────────────────────
function StageIcon({ stage, size }: { stage: typeof STAGES[number]; size: number }) {
  if (stage.id === 'prayer') return <PrayerIcon width={size} height={size} style={{ display: 'block' }} />
  const em = stage.id === 'revelation' ? '✨' : stage.id === 'action' ? '🚪' : '🏳️'
  return <span style={{ fontSize: size, lineHeight: 1 }}>{em}</span>
}

// ── Prayer Lock ────────────────────────────────────────────────────────────
function MobilePrayerLock({ onUnlock }: { onUnlock: () => void }) {
  const [seconds, setSeconds] = useState(30)
  const [muted, setMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isDone = seconds <= 0

  useEffect(() => {
    const audio = new Audio(prayerMusic); audio.loop = true; audio.volume = 0.7
    audio.play().catch(() => {}); audioRef.current = audio
    return () => { audio.pause(); audio.src = '' }
  }, [])

  useEffect(() => {
    if (isDone) return
    const t = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds, isDone])

  const r = 28; const circ = 2 * Math.PI * r; const offset = circ * (1 - seconds / 30)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, overflow: 'hidden' }}>
      <video src={prayerVideo} autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(30,28,38,0.55)' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '0 36px', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ animation: 'fadeInUp 0.6s ease' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 80, fontWeight: 600, color: C.light, lineHeight: 1, marginBottom: 16 }}>Prayer</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 400, color: C.light, lineHeight: 1.7, marginBottom: 8, fontStyle: 'italic' }}>"Commit your work to the LORD, and your plans will be established."</div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>Proverbs 16:3</div>
          {!isDone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ position: 'relative', width: 68, height: 68 }}>
                <svg width={68} height={68} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={34} cy={34} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={4} />
                  <circle cx={34} cy={34} r={r} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={4} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s linear' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 20, fontWeight: 900, color: C.light }}>{seconds}</div>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>seconds of stillness</div>
            </div>
          ) : (
            <button onClick={onUnlock} style={{ alignSelf: 'flex-start', background: C.light, color: C.dark, border: 'none', borderRadius: 14, padding: '16px 40px', fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: 'pointer', animation: 'popIn 0.4s cubic-bezier(.34,1.56,.64,1)', minHeight: 44 }}>
              Begin Work →
            </button>
          )}
        </div>
      </div>
      <button onClick={() => { const a = audioRef.current; if (!a) return; a.muted = !a.muted; setMuted(m => !m) }}
        style={{ position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', right: 24, zIndex: 2, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 14px', fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', minHeight: 44 }}>
        {muted ? '♪ Unmute' : '♪ Mute'}
      </button>
    </div>
  )
}

// ── Mobile Settings Sheet ──────────────────────────────────────────────────
function MobileSettings({ onClose, onSaved }: { onClose: () => void; onSaved: (gids: string[]) => void }) {
  const [pat, setPat] = useState(''); const [sections, setSections] = useState<{ gid: string; name: string }[]>([])
  const [selectedGids, setSelectedGids] = useState<string[]>(DEFAULT_SECTION_GIDS)
  const [loading, setLoading] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    storageGet('asana_pat').then(v => { if (v) setPat(v as string) })
    storageGet('asana_section_gids').then(v => { if (v) try { const p = typeof v === 'string' ? JSON.parse(v) : v; if (Array.isArray(p)) setSelectedGids(p) } catch (_) {} })
  }, [])

  async function loadSections() {
    setLoading(true); setError(null)
    try { setSections(await platformAsana.fetchSections(PROJECT_GID)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  async function save() {
    await storageSet('asana_pat', pat.trim()); await storageSet('asana_section_gids', JSON.stringify(selectedGids))
    haptic(); setSaved(true); onSaved(selectedGids)
    setTimeout(() => { setSaved(false); onClose() }, 1200)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(30,28,38,0.6)' }} />
      <div style={{ background: '#1a1824', borderRadius: '20px 20px 0 0', padding: '0 24px', paddingBottom: 'env(safe-area-inset-bottom)', maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)', animation: 'slideUp 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: C.light, marginBottom: 20 }}>Settings</div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Asana Personal Access Token</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input type="password" value={pat} onChange={e => setPat(e.target.value)} placeholder="Paste your PAT…"
            style={{ flex: 1, fontFamily: FONT, fontSize: 14, border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 14px', outline: 'none', background: 'rgba(255,255,255,0.07)', color: C.light, minHeight: 44 }} />
          <button onClick={loadSections} style={{ background: C.main, color: C.light, border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>{loading ? '…' : 'Load'}</button>
        </div>
        {error && <div style={{ fontFamily: FONT, fontSize: 12, color: '#e05c5c', marginBottom: 12 }}>{error}</div>}
        {sections.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>Sections to sync</div>
            {sections.map(sec => {
              const checked = selectedGids.includes(sec.gid)
              return (
                <label key={sec.gid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => setSelectedGids(p => p.includes(sec.gid) ? p.filter(g => g !== sec.gid) : [...p, sec.gid])} style={{ width: 20, height: 20, accentColor: C.main, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 14, color: C.light }}>{sec.name}</span>
                </label>
              )
            })}
          </div>
        )}
        <button onClick={save} style={{ width: '100%', background: saved ? C.main : C.light, color: saved ? C.light : C.dark, border: 'none', borderRadius: 14, padding: '16px 0', fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16, minHeight: 44 }}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Touch Mood Board ───────────────────────────────────────────────────────
function MobileMoodBoard({ taskGid }: { taskGid: string }) {
  const KEY = 'moodboard_' + taskGid
  const [images, setImages] = useState<ImageCard[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; tx: number; ty: number; ox: number; oy: number } | null>(null)
  const imagesRef = useRef<ImageCard[]>([])
  imagesRef.current = images

  useEffect(() => {
    storageGet(KEY).then(v => {
      if (v) try { setImages(JSON.parse(v as string)) } catch (_) {}
      setLoaded(true)
    })
  }, [KEY])

  const persist = useCallback(async (imgs: ImageCard[]) => {
    await storageSet(KEY, JSON.stringify(imgs))
  }, [KEY])

  function addImage() {
    if (!urlInput.trim()) return
    const canvas = canvasRef.current
    const existing = imagesRef.current
    // Stagger position so images don't stack
    const col = existing.length % 2; const row = Math.floor(existing.length / 2)
    const x = 16 + col * (IMG_DEFAULT_W + 12)
    const y = 16 + row * (IMG_DEFAULT_W + 40)
    const next = [...existing, { id: Date.now().toString(), url: urlInput.trim(), x, y, w: IMG_DEFAULT_W }]
    setImages(next); persist(next)
    setUrlInput(''); setShowInput(false)
    _ = canvas // suppress unused warning
  }

  function removeImage(id: string) {
    haptic(ImpactStyle.Heavy)
    const next = imagesRef.current.filter(i => i.id !== id)
    setImages(next); persist(next)
  }

  // Touch drag handlers
  function onImgTouchStart(e: React.TouchEvent, img: ImageCard) {
    e.stopPropagation()
    const t = e.touches[0]
    dragRef.current = { id: img.id, tx: t.clientX, ty: t.clientY, ox: img.x, oy: img.y }
  }

  function onCanvasTouchMove(e: React.TouchEvent) {
    if (!dragRef.current) return
    e.preventDefault()
    const t = e.touches[0]
    const dx = t.clientX - dragRef.current.tx; const dy = t.clientY - dragRef.current.ty
    const newX = Math.max(0, dragRef.current.ox + dx); const newY = Math.max(0, dragRef.current.oy + dy)
    setImages(prev => prev.map(img => img.id === dragRef.current!.id ? { ...img, x: newX, y: newY } : img))
  }

  function onCanvasTouchEnd() {
    if (!dragRef.current) return
    persist(imagesRef.current)
    dragRef.current = null
  }

  if (!loaded) return null

  // Calculate canvas minimum height from image positions
  const canvasH = Math.max(400, ...images.map(i => i.y + IMG_DEFAULT_W + 60))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid rgba(30,28,38,0.08)', flexShrink: 0, background: 'rgba(255,255,255,0.97)' }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 500, color: C.dark, flex: 1 }}>Mood Board</div>
        <button onClick={() => { setShowInput(v => !v); haptic(ImpactStyle.Light) }}
          style={{ background: C.main, border: 'none', borderRadius: 10, padding: '10px 16px', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.light, cursor: 'pointer', minHeight: 44 }}>+ Add</button>
      </div>

      {showInput && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(30,28,38,0.08)', flexShrink: 0 }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addImage()} placeholder="Paste image URL…" autoFocus
            style={{ flex: 1, fontFamily: FONT, fontSize: 14, border: '1.5px solid rgba(30,28,38,0.2)', borderRadius: 10, padding: '12px 14px', outline: 'none', background: 'rgba(255,255,255,0.9)', color: C.dark, minHeight: 44 }} />
          <button onClick={addImage} style={{ background: C.dark, color: C.light, border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>Add</button>
        </div>
      )}

      {/* Draggable canvas */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'rgba(255,255,255,0.95)' }}>
        <div ref={canvasRef} onTouchMove={onCanvasTouchMove} onTouchEnd={onCanvasTouchEnd}
          style={{ position: 'relative', width: '100%', minHeight: canvasH, backgroundImage: 'radial-gradient(circle, rgba(30,28,38,0.06) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>

          {images.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.3, pointerEvents: 'none' }}>
              <div style={{ fontSize: 44 }}>🖼</div>
              <div style={{ fontFamily: FONT, fontSize: 13, color: C.dark }}>Add images to build your vision</div>
            </div>
          )}

          {images.map(img => (
            <div key={img.id} onTouchStart={e => onImgTouchStart(e, img)}
              style={{ position: 'absolute', left: img.x, top: img.y, width: img.w, background: C.light, borderRadius: 4, padding: '4px 4px 20px', boxShadow: '3px 4px 12px rgba(30,28,38,0.2)', touchAction: 'none', userSelect: 'none' }}>
              <img src={img.url} alt="" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 2, pointerEvents: 'none' }}
                onError={e => { (e.target as HTMLImageElement).style.minHeight = '80px'; (e.target as HTMLImageElement).style.background = '#eee' }} />
              <button onPointerDown={e => { e.stopPropagation(); removeImage(img.id) }}
                style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: '#e05c5c', border: `2px solid ${C.light}`, color: C.light, fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Mobile Project Detail ──────────────────────────────────────────────────
function MobileProjectDetail({ task, category, onCategoryChange, onBack }: { task: Task; category: CategoryKey; onCategoryChange: (c: CategoryKey) => void; onBack: () => void }) {
  const KEY = 'workflow_' + task.gid; const MORNING_KEY = 'morning_prayer_' + task.gid
  const [notes, setNotes]   = useState<Record<string, string>>({})
  const [done, setDone]     = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const [viewingIdx, setViewingIdx]       = useState(0)
  const [slideDir, setSlideDir]           = useState<'next' | 'prev' | null>(null)
  const [slideKey, setSlideKey]           = useState(0)
  const [showMorningLock, setShowMorningLock] = useState(false)
  const [celebrate, setCelebrate]         = useState<typeof STAGES[number] | null>(null)
  const initialViewSet = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    storageGet(KEY).then(v => {
      if (v) try { const d = JSON.parse(v as string); if (d.notes) setNotes(d.notes); if (d.done) setDone(d.done) } catch (_) {}
      setLoaded(true)
    })
    storageGet(MORNING_KEY).then(v => {
      const today = new Date().toISOString().slice(0, 10)
      setShowMorningLock(!v || (v as string) !== today)
    })
  }, [KEY, MORNING_KEY])

  useEffect(() => {
    if (!loaded || initialViewSet.current) return
    initialViewSet.current = true
    const first = STAGES.findIndex(s => !done[s.id])
    setViewingIdx(first === -1 ? STAGES.length : first)
  }, [loaded]) // eslint-disable-line

  async function persist(n: Record<string, string>, d: Record<string, boolean>) {
    await storageSet(KEY, JSON.stringify({ notes: n, done: d }))
  }

  function setNote(id: string, val: string) {
    const n = { ...notes, [id]: val }; setNotes(n); persist(n, done)
  }

  function navigate(idx: number) {
    if (idx === viewingIdx) return
    setSlideDir(idx > viewingIdx ? 'next' : 'prev')
    setSlideKey(k => k + 1)
    setViewingIdx(idx)
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function completeStage(id: string) {
    haptic(ImpactStyle.Medium)
    const newDone = { ...done, [id]: true }
    setDone(newDone); persist(notes, newDone)
    const idx = STAGES.findIndex(s => s.id === id)
    setCelebrate(STAGES[idx])
    setTimeout(() => { setCelebrate(null); navigate(idx + 1 < STAGES.length ? idx + 1 : STAGES.length) }, 1600)
  }

  async function handleMorningUnlock() {
    await storageSet(MORNING_KEY, new Date().toISOString().slice(0, 10))
    setShowMorningLock(false)
  }

  const allDone = STAGES.every(s => done[s.id])
  const stage   = viewingIdx < STAGES.length ? STAGES[viewingIdx] : null
  const isLocked  = stage ? viewingIdx > 0 && !done[STAGES[viewingIdx - 1].id] : false
  const isDone    = stage ? !!done[stage.id] : false
  const isActive  = stage ? !done[stage.id] && (viewingIdx === 0 || !!done[STAGES[viewingIdx - 1].id]) : false
  const isRevelation = stage?.id === 'revelation'

  // Swipe: left = next stage, right = prev stage
  const swipe = useSwipe(
    () => { const next = Math.min(viewingIdx + 1, STAGES.length - 1); if (next !== viewingIdx && (next === 0 || done[STAGES[next - 1].id])) navigate(next) },
    () => { const prev = Math.max(viewingIdx - 1, 0); if (prev !== viewingIdx) navigate(prev) },
  )

  const slideAnim = slideDir === 'next' ? 'slideInRight 0.28s ease' : slideDir === 'prev' ? 'slideInLeft 0.28s ease' : 'none'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'rgba(255,255,255,0.97)' }}>
      {showMorningLock && <MobilePrayerLock onUnlock={handleMorningUnlock} />}

      {celebrate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: celebrate.color, borderRadius: 24, padding: '28px 40px', textAlign: 'center', animation: 'popIn 0.4s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ marginBottom: 8 }}><StageIcon stage={celebrate} size={52} /></div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: celebrate.textColor }}>{celebrate.reward}!</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: C.dark, paddingTop: 'env(safe-area-inset-top)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.light, cursor: 'pointer', minHeight: 44 }}>← Back</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, color: C.light, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</div>
            {task.due_on && <div style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{task.due_on}</div>}
          </div>
          <button onClick={() => setShowMorningLock(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
            <PrayerIcon width={18} height={18} />
          </button>
        </div>
        {/* Stage strip */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '8px 24px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {STAGES.map((s, i) => {
            const unlocked = i === 0 || !!done[STAGES[i - 1].id]
            const viewing  = i === viewingIdx
            return (
              <button key={s.id} onClick={() => { if (unlocked) { haptic(ImpactStyle.Light); navigate(i) } }}
                style={{ background: 'transparent', border: 'none', cursor: unlocked ? 'pointer' : 'default', opacity: viewing ? 1 : unlocked ? 0.35 : 0.12, transition: 'opacity 0.2s', padding: '4px 8px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <StageIcon stage={s} size={26} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Content — swipeable */}
      <div ref={contentRef} {...(isRevelation ? {} : swipe)}
        style={{ flex: 1, overflowY: isRevelation ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
        <div key={slideKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: slideAnim }}>
          {allDone && viewingIdx >= STAGES.length ? (
            <div style={{ padding: '48px 28px', textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 36, fontWeight: 600, color: C.dark, marginBottom: 8 }}>Faithfully Finished.</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 400, color: C.dark, opacity: 0.5, fontStyle: 'italic', marginBottom: 32 }}>Well done. The work is offered up.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {STAGES.map((s, i) => (
                  <button key={s.id} onClick={() => navigate(i)} style={{ background: 'rgba(30,28,38,0.05)', border: '1.5px solid rgba(30,28,38,0.1)', borderRadius: 12, padding: '14px 20px', fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.dark, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
                    <StageIcon stage={s} size={20} /><span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : stage?.id === 'revelation' ? (
            <MobileMoodBoard taskGid={task.gid} />
          ) : stage ? (
            <div style={{ padding: '28px 24px 120px' }}>
              {isLocked ? (
                <div style={{ fontFamily: FONT, fontSize: 14, color: C.dark, opacity: 0.4, fontStyle: 'italic', marginTop: 20 }}>Complete the previous stage to unlock.</div>
              ) : (
                <>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 36, fontWeight: 600, color: C.dark, marginBottom: 4 }}>{stage.label}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: C.dark, opacity: 0.3, marginBottom: 18 }}>Step {stage.step} of {STAGES.length} — {stage.sub}</div>
                  <div style={{ width: 32, height: 3, background: stage.color, borderRadius: 99, marginBottom: 18 }} />
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 400, color: C.dark, lineHeight: 1.85, marginBottom: 10 }}>{stage.prompt}</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontStyle: 'italic', color: C.dark, opacity: 0.4, marginBottom: 22 }}>"{stage.scripture}" — {stage.ref}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: stage.color, marginBottom: 8 }}>{stage.q}</div>
                  <textarea value={notes[stage.id] || ''} onChange={e => setNote(stage.id, e.target.value)} placeholder="Write your thoughts here…" disabled={isDone}
                    style={{ width: '100%', minHeight: 140, fontFamily: FONT, fontSize: 15, color: C.dark, background: isDone ? 'rgba(0,0,0,0.02)' : C.light, border: `1.5px solid ${isDone ? 'rgba(30,28,38,0.08)' : 'rgba(30,28,38,0.15)'}`, borderRadius: 12, padding: '14px 16px', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.7, display: 'block' }} />
                  {isDone && (
                    <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(96,110,74,0.1)', borderRadius: 20, padding: '8px 16px' }}>
                      <span style={{ color: C.main, fontSize: 14 }}>✓</span>
                      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.main }}>{stage.reward}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Complete bar */}
      {loaded && stage && isActive && !showMorningLock && (
        <div style={{ flexShrink: 0, background: stage.color, padding: '14px 24px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' } as React.CSSProperties}>
          <button onClick={() => completeStage(stage.id)}
            style={{ width: '100%', background: 'rgba(255,255,255,0.2)', color: stage.textColor, border: '2px solid rgba(255,255,255,0.35)', borderRadius: 14, padding: '16px 0', fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
            {stage.step === STAGES.length ? '🏆 Complete & Surrender' : `Complete ${stage.label} →`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Mobile Factory Detail ──────────────────────────────────────────────────
function MobileFactoryDetail({ task, category, onCategoryChange, onBack }: { task: Task; category: CategoryKey; onCategoryChange: (c: CategoryKey) => void; onBack: () => void }) {
  const ul = urgLabel(task.due_on); const uc = urgColor(task.due_on)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'rgba(255,255,255,0.97)' }}>
      <div style={{ background: C.dark, paddingTop: 'env(safe-area-inset-top)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.light, cursor: 'pointer', minHeight: 44 }}>← Back</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, color: C.light, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</div>
            {ul && <div style={{ fontFamily: FONT, fontSize: 11, color: uc, marginTop: 2 }}>{ul}</div>}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {category === 'creative' ? (
          <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <InsideIcon width={32} height={32} />
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: C.dark }}>Inside Task</div>
            </div>
            {task.notes
              ? <div style={{ fontFamily: FONT, fontSize: 14, color: C.dark, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{task.notes}</div>
              : <div style={{ fontFamily: FONT, fontSize: 13, color: C.dark, opacity: 0.5, fontStyle: 'italic' }}>No description in Asana yet.</div>
            }
            <button onClick={() => window.open(task.url, '_blank', 'noopener,noreferrer')} style={{ marginTop: 24, background: C.dark, color: C.light, border: 'none', borderRadius: 12, padding: '14px 0', width: '100%', fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>Open in Asana ↗</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 8 }}>
            <UncatIcon width={64} height={64} style={{ color: C.dark, opacity: 0.4, marginBottom: 16 }} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: C.dark, marginBottom: 10, textAlign: 'center' }}>Uncategorized</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: C.dark, opacity: 0.6, lineHeight: 1.7, marginBottom: 28, textAlign: 'center' }}>
              Mark as Inside to view the Asana description, or Outside to run it through the creative process.
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {(['creative', 'factory'] as CategoryKey[]).map(cat => {
                const cfg = cat ? CATEGORIES[cat] : null; const active = category === cat
                return (
                  <button key={cat ?? 'none'} onClick={() => { haptic(ImpactStyle.Light); onCategoryChange(cat) }}
                    style={{ flex: 1, background: active ? (cfg ? cfg.color : 'rgba(30,28,38,0.1)') : 'rgba(30,28,38,0.06)', border: `1.5px solid ${active ? 'transparent' : 'rgba(30,28,38,0.12)'}`, borderRadius: 14, padding: '16px 8px', cursor: 'pointer', minHeight: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: active ? 1 : 0.6 }}>
                    {cat === 'creative' ? <InsideIcon width={40} height={40} /> : <OutsideIcon width={40} height={40} />}
                    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: active ? (cfg ? cfg.text : C.dark) : C.dark }}>{cfg ? cfg.label : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Mobile Project Card ────────────────────────────────────────────────────
function MobileProjectCard({ task, progress: _progress, category, onOpen, onCategoryChange }: { task: Task; progress: number; category: CategoryKey; onOpen: (t: Task) => void; onCategoryChange: (c: CategoryKey) => void }) {
  const due = task.due_on ? new Date(task.due_on + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
  function toggle(cat: 'creative' | 'factory', e: React.MouseEvent) {
    e.stopPropagation(); haptic(ImpactStyle.Light); onCategoryChange(category === cat ? null : cat)
  }
  return (
    <div onClick={() => { haptic(ImpactStyle.Light); onOpen(task) }}
      style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 16, overflow: 'hidden', marginBottom: 12, border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 16px rgba(30,28,38,0.3)', cursor: 'pointer', minHeight: 72 }}>
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, color: C.light, lineHeight: 1.3 }}>{task.name}</div>
        {due && <div style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{due}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 14px', flexShrink: 0 }}>
        <button onClick={e => toggle('creative', e)} title="Inside"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: category === 'creative' ? C.light : 'rgba(255,255,255,0.25)' }}>
          <InsideIcon width={40} height={40} />
        </button>
        <button onClick={e => toggle('factory', e)} title="Outside"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: category === 'factory' ? C.light : 'rgba(255,255,255,0.25)' }}>
          <OutsideIcon width={40} height={40} />
        </button>
      </div>
    </div>
  )
}

// ── Mobile Home Screen ─────────────────────────────────────────────────────
function MobileHomeScreen({ tasks, progresses, categories, onOpen, onCategoryChange, onSync, syncing, syncMsg, onSettings, onPrayer }: {
  tasks: Task[]; progresses: Record<string, number>; categories: Record<string, CategoryKey>
  onOpen: (t: Task) => void; onCategoryChange: (gid: string, c: CategoryKey) => void; onSync: () => void; syncing: boolean; syncMsg: string | null; onSettings: () => void; onPrayer: () => void
}) {
  const listRef   = useRef<HTMLDivElement>(null)
  const pullStart = useRef(0); const isPulling = useRef(false)
  const [pullDist, setPullDist] = useState(0)

  function onListTouchStart(e: React.TouchEvent) {
    if ((listRef.current?.scrollTop ?? 1) === 0) { pullStart.current = e.touches[0].clientY; isPulling.current = true }
  }
  function onListTouchMove(e: React.TouchEvent) {
    if (!isPulling.current) return
    const dy = e.touches[0].clientY - pullStart.current
    if (dy > 0) setPullDist(Math.min(dy * 0.5, 60))
  }
  function onListTouchEnd() {
    if (isPulling.current && pullDist > 40) { haptic(); onSync() }
    isPulling.current = false; setPullDist(0)
  }

  const inProgress = tasks.filter(t => (progresses[t.gid] || 0) > 0 && (progresses[t.gid] || 0) < STAGES.length)
  const notStarted = tasks.filter(t => !progresses[t.gid])
  const completed  = tasks.filter(t => (progresses[t.gid] || 0) >= STAGES.length)

  function renderGroup(label: string, list: Task[]) {
    if (!list.length) return null
    return (
      <div key={label} style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 500, color: C.light, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{label}</span><span style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>({list.length})</span>
        </div>
        {list.map(t => <MobileProjectCard key={t.gid} task={t} progress={progresses[t.gid] || 0} category={categories[t.gid] || null} onOpen={onOpen} onCategoryChange={c => onCategoryChange(t.gid, c)} />)}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{ background: 'rgba(30,28,38,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', paddingTop: 'env(safe-area-inset-top)', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 600, color: C.light, flex: 1 }}>MossMind</div>
          {syncMsg && <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: syncMsg.startsWith('✓') ? C.main : '#e05c5c' }}>{syncMsg}</div>}
          <button onClick={onSync} disabled={syncing} style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 14px', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.light, cursor: syncing ? 'not-allowed' : 'pointer', minHeight: 44 }}>{syncing ? '…' : '↻'}</button>
          <button onClick={onPrayer} style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 }}><PrayerIcon width={18} height={18} /></button>
          <button onClick={onSettings} style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 12px', fontFamily: FONT, fontSize: 15, color: C.light, cursor: 'pointer', minHeight: 44 }}>⚙</button>
        </div>
        {/* Pull-to-refresh indicator */}
        {pullDist > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', height: pullDist, alignItems: 'center', overflow: 'hidden', transition: 'height 0.1s' }}>
            <div style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', animation: pullDist > 40 ? 'spin 0.6s linear infinite' : 'none' }}>↻</div>
          </div>
        )}
      </div>

      {/* List */}
      <div ref={listRef} onTouchStart={onListTouchStart} onTouchMove={onListTouchMove} onTouchEnd={onListTouchEnd}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', opacity: 0.6 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 500, color: C.light, marginBottom: 8 }}>No tasks yet</div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: C.light, opacity: 0.6 }}>Add your Asana token in Settings, then tap Sync</div>
          </div>
        ) : (
          <>{renderGroup('In Progress', inProgress)}{renderGroup('Ready to Start', notStarted)}{renderGroup('Completed', completed)}</>
        )}
      </div>
    </div>
  )
}

// ── Main Mobile App ────────────────────────────────────────────────────────
export default function MobileApp() {
  const [tasks, setTasks]       = useState<Task[]>([])
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState<string | null>(null)
  const [progresses, setProgresses] = useState<Record<string, number>>({})
  const [categories, setCategories] = useState<Record<string, CategoryKey>>({})
  const [showSettings, setShowSettings] = useState(false)
  const [showPrayer, setShowPrayer]     = useState(false)
  const [sectionGids, setSectionGids]   = useState<string[]>(DEFAULT_SECTION_GIDS)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (hasFetched.current) return; hasFetched.current = true
    storageGet('asana_section_gids').then(v => {
      let gids = DEFAULT_SECTION_GIDS
      if (v) try { const p = typeof v === 'string' ? JSON.parse(v) : v; if (Array.isArray(p)) gids = p } catch (_) {}
      setSectionGids(gids); syncTasks(gids)
    })
  }, [])

  async function syncTasks(gids = sectionGids) {
    setSyncing(true); setSyncMsg(null)
    try {
      const fetched = await fetchAsanaTasks(gids); setTasks(fetched)
      const progs: Record<string, number> = {}; const cats: Record<string, CategoryKey> = {}
      await Promise.all(fetched.map(async t => {
        const v = await storageGet('workflow_' + t.gid)
        if (v) try { const d = JSON.parse(v as string); if (d.done) progs[t.gid] = Object.values(d.done).filter(Boolean).length } catch (_) {}
        const cat = await storageGet('category_' + t.gid)
        if (cat) cats[t.gid] = cat as CategoryKey
      }))
      setProgresses(progs); setCategories(cats); setSyncMsg('✓ Synced')
    } catch (e) { setSyncMsg(e instanceof Error ? e.message : 'Sync failed') }
    setSyncing(false); setTimeout(() => setSyncMsg(null), 3000)
  }

  async function updateCategory(gid: string, cat: CategoryKey) {
    setCategories(prev => ({ ...prev, [gid]: cat }))
    await storageSet('category_' + gid, cat ?? '')
  }

  function handleBack() { setOpenTask(null); syncTasks() }

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: FONT, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(30,28,38,0.52) 0%,rgba(30,28,38,0.52) 100%),url(${bgPhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
        {showPrayer    && <MobilePrayerLock onUnlock={() => setShowPrayer(false)} />}
        {showSettings  && <MobileSettings onClose={() => setShowSettings(false)} onSaved={gids => { setSectionGids(gids); syncTasks(gids) }} />}
        {openTask ? (
          categories[openTask.gid] === 'factory'
            ? <MobileProjectDetail task={openTask} category={categories[openTask.gid] || null} onCategoryChange={c => updateCategory(openTask.gid, c)} onBack={handleBack} />
            : <MobileFactoryDetail task={openTask} category={categories[openTask.gid] || null} onCategoryChange={c => updateCategory(openTask.gid, c)} onBack={handleBack} />
        ) : (
          <MobileHomeScreen tasks={tasks} progresses={progresses} categories={categories} onOpen={setOpenTask}
            onCategoryChange={(gid, c) => updateCategory(gid, c)}
            onSync={() => syncTasks()} syncing={syncing} syncMsg={syncMsg} onSettings={() => setShowSettings(true)} onPrayer={() => setShowPrayer(true)} />
        )}
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing:border-box; -webkit-font-smoothing:antialiased; -webkit-tap-highlight-color:transparent; }
        body { margin:0; overflow:hidden; }
        ::-webkit-scrollbar { display:none; }
        @keyframes fadeInUp   { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn      { from { transform:scale(0.5); opacity:0; }       to { transform:scale(1); opacity:1; } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(36px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideInLeft  { from { opacity:0; transform:translateX(-36px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideUp    { from { transform:translateY(100%); } to { transform:translateY(0); } }
        @keyframes spin       { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>
    </div>
  )
}

// suppress unused import warning for canvas ref
declare const _: unknown
