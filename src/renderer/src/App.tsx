import { useState, useEffect, useRef, Fragment } from "react";
import { storage as platformStorage, asana as platformAsana, ai as platformAI } from './lib/platform';
import prayerVideo from './assets/Prayer Motion 1.mp4';
import bgPhoto from './assets/bg2.png';
import PrayerIcon from './assets/icons/prayer.svg?react';
import InsideIcon from './assets/icons/Pot.svg?react';
import OutsideIcon from './assets/icons/Outside.svg?react';
import UncatIcon from './assets/icons/uncat.svg?react';
import MossIcon from './assets/icons/moss.svg?react';
import Sqig1Icon from './assets/icons/Sqig1.svg?react';
import prayerMusic from './assets/Prayer Motion Music 1.mp3';

// ── Types ──────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    storage: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown) => Promise<boolean>
      delete: (key: string) => Promise<boolean>
    }
    asana: {
      fetchTasks: (sectionGid: string) => Promise<AsanaApiTask[]>
      fetchSections: (projectGid: string) => Promise<{ gid: string; name: string }[]>
    }
  }
}

interface AsanaApiTask {
  gid: string
  name: string
  due_on: string | null
  notes: string
  permalink_url: string
  completed: boolean
}

// ── Config ─────────────────────────────────────────────────────────────────
const PROJECT_GID = "1208321640687989";
const DEFAULT_SECTION_GIDS = ["1208321358070311"]; // "David is designing - approved by David"

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  main:     "#657946",  // primary green
  dark:     "#242329",  // darkest
  mid:      "#454449",  // mid-dark
  light:    "#FFFFFF",
  // aliases kept so existing references compile
  blue:     "#657946",
  green:    "#657946",
  peach:    "#F4EDEA",  // off-white/cream
  coral:    "#EF9982",  // accent/secondary
  brown:    "#242329",
  white:    "#FFFFFF",
  card:     "#F4EDEA",
  surface:  "#F4EDEA",
  factory:  "#242329",
  creative: "#657946",
};
const FONT = "'Bricolage Grotesque', system-ui, sans-serif";
const FONT_DISPLAY = "'Cormorant', Georgia, serif";
const b = (w = 2, col = C.brown) => `${w}px solid ${col}`;

const CATEGORIES = {
  factory:  { label: "Outside", emoji: "⚙️", color: C.coral,    text: C.brown },
  creative: { label: "Inside",  emoji: "✦",  color: C.creative, text: C.brown },
} as const;

type CategoryKey = keyof typeof CATEGORIES | null;

const STAGES = [
  { id: "prayer",     step: 1, emoji: "🙏", label: "Prayer",     sub: "Open the Door",  color: C.dark,   textColor: C.light, locked: false, prompt: "Before anything else — invite God in. This isn't the backup plan, it's the first move.", scripture: "Behold, I stand at the door and knock.", ref: "Rev 3:20", q: "What are you asking God to unveil through this project?", reward: "Door Unlocked" },
  { id: "revelation", step: 2, emoji: "✨", label: "Revelation", sub: "Mood Board",     color: C.main,   textColor: C.light, locked: true,  prompt: "Vision before execution. Build your mood board — collect images, colors, textures that speak the truth this project must say.", scripture: "The revelation of Jesus Christ, which God gave him to show his servants.", ref: "Rev 1:1", q: "What does this project look, feel, and sound like?", reward: "Vision Captured" },
  { id: "action",     step: 3, emoji: "🚪", label: "Action",     sub: "Walk Through",  color: C.dark,   textColor: C.light, locked: true,  prompt: "God opens the door. You walk through. First brushstroke is obedience. Starting is worship.", scripture: "I have set before you an open door, which no one is able to shut.", ref: "Rev 3:8", q: "What is the single next move? Do it now — that step is yours.", reward: "Action Taken" },
];

// ── Timed Session ──────────────────────────────────────────────────────────
// Total session = actual time from startedAt until end of due date.
// Distributed as Prayer 10% / Revelation 30% / Action 60%
function getSessionDurations(startedAt: number, due_on: string | null): [number, number, number] {
  const dueTs = due_on ? new Date(due_on + 'T23:59:59').getTime() : null;
  const total = dueTs ? Math.max(dueTs - startedAt, 60) : 7 * 86400 * 1000; // fallback: 7 days
  return [Math.round(total / 1000 * 0.1), Math.round(total / 1000 * 0.3), Math.round(total / 1000 * 0.6)];
}

function daysLabel(secs: number) {
  const s = Math.max(secs, 0);
  const d = s / 86400;
  if (d >= 1) return `${Math.round(d)}d`;
  const h = s / 3600;
  if (h >= 1) return `${Math.round(h)}h`;
  return `${Math.round(s / 60)}m`;
}

interface Session { startedAt: number; pausedAt?: number }

function getSessionState(session: Session, due_on: string | null, now = Date.now()): { stageIndex: number; remainingSecs: number; done: boolean; paused: boolean } {
  const effectiveNow = session.pausedAt ?? now;
  const durations = getSessionDurations(session.startedAt, due_on);
  const elapsed = Math.floor((effectiveNow - session.startedAt) / 1000);
  let acc = 0;
  for (let i = 0; i < durations.length; i++) {
    acc += durations[i];
    if (elapsed < acc) return { stageIndex: i, remainingSecs: acc - elapsed, done: false, paused: !!session.pausedAt };
  }
  return { stageIndex: durations.length - 1, remainingSecs: 0, done: true, paused: !!session.pausedAt };
}

interface Task {
  gid: string
  name: string
  due_on: string | null
  notes: string
  url: string
}

interface TodoItem {
  id: string
  asanaGid?: string  // set when sourced from Asana
  title: string
  notes: string
  done: boolean
  createdAt: number
}

// ── Helpers ────────────────────────────────────────────────────────────────
function daysLeft(due: string | null) { return due ? Math.ceil((new Date(due).getTime() - Date.now()) / 86400000) : null; }
function urgLabel(due: string | null) { const d = daysLeft(due); if (d === null) return null; if (d < 0) return Math.abs(d) + "d overdue"; if (d === 0) return "Due today"; if (d <= 7) return d + "d left"; return null; }
function urgColor(due: string | null) { const d = daysLeft(due); return d !== null && d <= 3 ? C.coral : d !== null && d <= 7 ? "#d4956a" : C.green; }

// storage helpers
async function storageGet(key: string): Promise<string | null> {
  const v = await platformStorage.get(key);
  return v as string | null;
}
async function storageSet(key: string, value: string): Promise<void> {
  await platformStorage.set(key, value);
}

async function fetchAsanaTasks(sectionGids: string[]): Promise<Task[]> {
  const safeGids = Array.isArray(sectionGids) ? sectionGids : DEFAULT_SECTION_GIDS;
  const pages = await Promise.all(safeGids.map(gid => platformAsana.fetchTasks(gid)));
  const seen = new Set<string>();
  const tasks: Task[] = [];
  for (const raw of pages) {
    for (const t of raw) {
      if (t.completed || seen.has(t.gid)) continue;
      seen.add(t.gid);
      tasks.push({
        gid: t.gid,
        name: t.name || "Untitled",
        due_on: t.due_on || null,
        notes: t.notes || "",
        url: t.permalink_url || `https://app.asana.com/0/0/${t.gid}`,
      });
    }
  }
  return tasks;
}

// ── Settings Panel ─────────────────────────────────────────────────────────
function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: (sectionGids: string[], quickGid: string) => void }) {
  const [pat, setPat] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [sections, setSections] = useState<{ gid: string; name: string }[]>([]);
  const [selectedGids, setSelectedGids] = useState<string[]>(DEFAULT_SECTION_GIDS);
  const [quickTaskGid, setQuickTaskGid] = useState("");
  const [loadingSections, setLoadingSections] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  useEffect(() => {
    storageGet("asana_pat").then(v => { if (v) setPat(v); });
    storageGet("anthropic_key").then(v => { if (v) setAnthropicKey(v); });
    storageGet("asana_section_gids").then(v => { if (v) try { const parsed = typeof v === "string" ? JSON.parse(v) : v; if (Array.isArray(parsed)) setSelectedGids(parsed); } catch (_) {} });
    storageGet("quick_task_section_gid").then(v => { if (v) setQuickTaskGid(v as string); });
  }, []);

  async function loadSections() {
    setLoadingSections(true); setSectionError(null);
    try {
      const secs = await platformAsana.fetchSections(PROJECT_GID);
      setSections(secs);
    } catch (e) {
      setSectionError(e instanceof Error ? e.message : "Failed to load sections");
    }
    setLoadingSections(false);
  }

  function toggleSection(gid: string) {
    setSelectedGids(prev => prev.includes(gid) ? prev.filter(g => g !== gid) : [...prev, gid]);
  }

  async function save() {
    await storageSet("asana_pat", pat.trim());
    await storageSet("anthropic_key", anthropicKey.trim());
    await storageSet("asana_section_gids", JSON.stringify(selectedGids));
    await storageSet("quick_task_section_gid", quickTaskGid);
    setSaved(true);
    onSaved(selectedGids, quickTaskGid);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(36,35,41,0.5)", backdropFilter: "blur(4px)" }}>
      <div style={{ background: C.peach, border: b(3, C.brown), borderRadius: 24, padding: "36px 40px", width: 500, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 900, color: C.brown, marginBottom: 6 }}>Settings</div>

        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.brown, opacity: 0.5, textTransform: "none", letterSpacing: 1, marginBottom: 6 }}>Asana Personal Access Token</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input type="password" value={pat} onChange={e => setPat(e.target.value)} placeholder="1/…"
            style={{ flex: 1, fontFamily: FONT, fontSize: 13, border: b(2), borderRadius: 10, padding: "10px 14px", outline: "none", background: C.white, color: C.brown, boxSizing: "border-box" }} />
          <button onClick={loadSections} disabled={!pat.trim() || loadingSections}
            style={{ background: C.blue, color: C.white, border: b(2, C.brown), borderRadius: 10, padding: "10px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: pat.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}>
            {loadingSections ? "Loading…" : "Load Sections"}
          </button>
        </div>

        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.brown, opacity: 0.5, textTransform: "none", letterSpacing: 1, marginBottom: 6 }}>Anthropic API Key (for AI mind maps)</div>
        <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-…"
          style={{ width: "100%", fontFamily: FONT, fontSize: 13, border: b(2), borderRadius: 10, padding: "10px 14px", outline: "none", background: C.white, color: C.brown, boxSizing: "border-box", marginBottom: 20 }} />

        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.brown, opacity: 0.5, textTransform: "none", letterSpacing: 1, marginBottom: 8 }}>
          Sections to sync ({selectedGids.length} selected)
        </div>

        {sectionError && <div style={{ fontFamily: FONT, fontSize: 12, color: C.coral, marginBottom: 10 }}>{sectionError}</div>}

        {sections.length === 0 && (
          <div style={{ fontFamily: FONT, fontSize: 12, color: C.brown, opacity: 0.5, marginBottom: 16, fontStyle: "italic" }}>
            Enter your token and click "Load Sections" to pick which sections to sync.
          </div>
        )}

        {sections.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {sections.map(sec => {
              const checked = selectedGids.includes(sec.gid);
              return (
                <label key={sec.gid} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 10, background: checked ? "rgba(101,121,70,0.18)" : "rgba(36,35,41,0.06)", border: b(1.5, checked ? C.blue : "rgba(36,35,41,0.15)"), transition: "all 0.15s" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSection(sec.gid)} style={{ width: 16, height: 16, accentColor: C.blue, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: checked ? 700 : 500, color: C.brown }}>{sec.name}</span>
                </label>
              );
            })}
          </div>
        )}

        {sections.length > 0 && (
          <>
            <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.brown, opacity: 0.5, letterSpacing: 1, marginBottom: 8 }}>Quick Tasks Section</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 10, background: !quickTaskGid ? "rgba(101,121,70,0.18)" : "rgba(36,35,41,0.06)", border: b(1.5, !quickTaskGid ? C.blue : "rgba(36,35,41,0.15)") }}>
                <input type="radio" checked={!quickTaskGid} onChange={() => setQuickTaskGid("")} style={{ accentColor: C.blue }} />
                <span style={{ fontFamily: FONT, fontSize: 13, color: C.brown }}>None</span>
              </label>
              {sections.map(sec => (
                <label key={sec.gid} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 10, background: quickTaskGid === sec.gid ? "rgba(101,121,70,0.18)" : "rgba(36,35,41,0.06)", border: b(1.5, quickTaskGid === sec.gid ? C.blue : "rgba(36,35,41,0.15)") }}>
                  <input type="radio" checked={quickTaskGid === sec.gid} onChange={() => setQuickTaskGid(sec.gid)} style={{ accentColor: C.blue }} />
                  <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: quickTaskGid === sec.gid ? 700 : 500, color: C.brown }}>{sec.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} style={{ flex: 1, background: C.brown, color: C.white, border: b(2, C.brown), borderRadius: 10, padding: "12px 0", fontFamily: FONT, fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
            {saved ? "✓ Saved!" : "Save"}
          </button>
          <button onClick={onClose} style={{ background: "transparent", border: b(2, C.brown), borderRadius: 10, padding: "12px 20px", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.brown, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Category Toggle ────────────────────────────────────────────────────────
function CategoryToggle({ value, onChange, size = "normal" }: { value: CategoryKey; onChange: (v: CategoryKey) => void; size?: "normal" | "small" }) {
  const small = size === "small";
  const base = small ? 16 : 22;
  const big = base;
  // factory/creative ordered so selected is first (left); uncat always last (right)
  const catPair: CategoryKey[] = value === "factory" ? ["factory", "creative"] : value === "creative" ? ["creative", "factory"] : ["factory", "creative"];
  const ordered: CategoryKey[] = [...catPair, null];
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {ordered.map(cat => {
        const active = value === cat;
        const sz = active ? big : base;
        return (
          <button key={cat ?? "none"} onClick={e => { e.stopPropagation(); onChange(cat); }}
            style={{ background: "transparent", border: "none", padding: small ? "2px 4px" : "4px 8px", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", color: C.white, opacity: active ? 1 : 0.6 }}>
            {cat === "creative" ? <InsideIcon width={sz} height={sz} /> : cat === "factory" ? <OutsideIcon width={sz} height={sz} /> : <UncatIcon width={sz} height={sz} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Mind Map ──────────────────────────────────────────────────────────────
interface MindNode { id: string; type: 'text' | 'image'; x: number; y: number; w: number; text: string; url: string; color?: string }
interface MindEdge { id: string; from: string; to: string }

function MindMap({ taskGid, taskName = '', taskNotes = '', fullscreen = false }: { taskGid: string; taskName?: string; taskNotes?: string; fullscreen?: boolean }) {
  const KEY = "mindmap_" + taskGid;
  const [nodes, setNodes] = useState<MindNode[]>([]);
  const [edges, setEdges] = useState<MindEdge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [showImgInput, setShowImgInput] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [colorPickerNode, setColorPickerNode] = useState<string | null>(null);
  const nodeHeights = useRef<Record<string, number>>({});

  const MIND_COLORS = [
    C.dark, C.mid, "#2E3B2F", "#3D5A3E",
    C.main, "#8A9E6A", "#7B6557", "#C4956A",
    C.coral, "#B85C4A", "#8B7BA8", "#5B7FA8",
  ];
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    storageGet(KEY).then(r => {
      if (r) try { const d = JSON.parse(r); setNodes(d.nodes || []); setEdges(d.edges || []); } catch (_) {}
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [taskGid]);

  async function save(n: MindNode[], e: MindEdge[]) { try { await storageSet(KEY, JSON.stringify({ nodes: n, edges: e })); } catch (_) {} }

  function addTextNode() {
    const id = Date.now().toString();
    const n: MindNode = { id, type: 'text', x: 60 + Math.random() * 300, y: 60 + Math.random() * 200, w: 160, text: '', url: '' };
    const u = [...nodes, n]; setNodes(u); save(u, edges); setEditingId(id);
  }

  function addImageNode() {
    if (!urlInput.trim()) return;
    const id = Date.now().toString();
    const n: MindNode = { id, type: 'image', x: 60 + Math.random() * 300, y: 60 + Math.random() * 200, w: 180, text: '', url: urlInput.trim() };
    const u = [...nodes, n]; setNodes(u); save(u, edges); setUrlInput(''); setShowImgInput(false);
  }

  function updateNode(id: string, p: Partial<MindNode>) { const u = nodes.map(n => n.id === id ? { ...n, ...p } : n); setNodes(u); save(u, edges); }
  function removeNode(id: string) { const u = nodes.filter(n => n.id !== id); const e = edges.filter(e => e.from !== id && e.to !== id); setNodes(u); setEdges(e); save(u, e); }
  function removeEdge(id: string) { const e = edges.filter(e => e.id !== id); setEdges(e); save(nodes, e); }
  function bringToFront(id: string) { const found = nodes.find(n => n.id === id); if (!found) return; setNodes([...nodes.filter(n => n.id !== id), found]); }

  async function generate() {
    setGenerating(true); setGenError(null);
    try {
      const result = await platformAI.generateMindMap(taskNotes ?? '', taskName ?? '');
      if (!result || !Array.isArray(result.nodes) || !Array.isArray(result.edges)) {
        throw new Error('Unexpected response shape from AI');
      }
      let n = result.nodes as MindNode[];
      const e = result.edges as MindEdge[];
      // Scale and center the layout to fit the visible canvas
      if (n.length > 0 && canvasRef.current) {
        const cw = canvasRef.current.offsetWidth;
        const ch = canvasRef.current.offsetHeight;
        const pad = 60;
        const minX = Math.min(...n.map(nd => nd.x));
        const maxX = Math.max(...n.map(nd => nd.x + nd.w));
        const minY = Math.min(...n.map(nd => nd.y));
        const maxY = Math.max(...n.map(nd => nd.y + 80));
        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const scaleX = contentW > 0 ? (cw - pad * 2) / contentW : 1;
        const scaleY = contentH > 0 ? (ch - pad * 2) / contentH : 1;
        const scale = Math.min(scaleX, scaleY, 1); // never scale up, only down
        const scaledW = contentW * scale;
        const scaledH = contentH * scale;
        const offsetX = (cw - scaledW) / 2 - minX * scale;
        const offsetY = (ch - scaledH) / 2 - minY * scale;
        n = n.map(nd => ({ ...nd, x: nd.x * scale + offsetX, y: nd.y * scale + offsetY, w: nd.w * scale }));
      }
      setNodes(n); setEdges(e);
      await save(n, e);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    }
    setGenerating(false);
  }

  function handleNodeClick(id: string) {
    if (!connectMode) return;
    if (!connecting) { setConnecting(id); return; }
    if (connecting === id) { setConnecting(null); return; }
    const exists = edges.some(e => (e.from === connecting && e.to === id) || (e.from === id && e.to === connecting));
    if (!exists) { const e = [...edges, { id: Date.now().toString(), from: connecting, to: id }]; setEdges(e); save(nodes, e); }
    setConnecting(null); setConnectMode(false);
  }

  function onMD(e: React.MouseEvent, id: string) {
    if (connectMode) return;
    e.preventDefault(); bringToFront(id);
    const node = nodes.find(n => n.id === id)!;
    const scroll = canvasRef.current ? { x: canvasRef.current.scrollLeft, y: canvasRef.current.scrollTop } : { x: 0, y: 0 };
    setDragging({ id, ox: node.x, oy: node.y, mx: e.clientX - scroll.x, my: e.clientY - scroll.y });
  }

  function onMM(e: React.MouseEvent) {
    if (!dragging) return;
    const scroll = canvasRef.current ? { x: canvasRef.current.scrollLeft, y: canvasRef.current.scrollTop } : { x: 0, y: 0 };
    setNodes(prev => prev.map(n => n.id === dragging.id ? { ...n, x: dragging.ox + (e.clientX - scroll.x) - dragging.mx, y: dragging.oy + (e.clientY - scroll.y) - dragging.my } : n));
  }

  function onMU() { if (dragging) { save(nodes, edges); setDragging(null); } }

  function nc(node: MindNode): [number, number] {
    const h = nodeHeights.current[node.id] || (node.type === 'image' ? 180 : 80);
    return [node.x + node.w / 2, node.y + h / 2];
  }

  const edgeSvg = (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <filter id="wavy-line" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="turbulence" baseFrequency="0.008" numOctaves="2" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="32" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      {edges.map(edge => {
        const fn = nodes.find(n => n.id === edge.from);
        const tn = nodes.find(n => n.id === edge.to);
        if (!fn || !tn) return null;
        const [x1, y1] = nc(fn); const [x2, y2] = nc(tn);
        const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
        return (
          <g key={edge.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.4)" strokeWidth={2.5} filter="url(#wavy-line)" />
            <circle cx={mx} cy={my} r={7} fill={C.dark} stroke="rgba(255,255,255,0.4)" strokeWidth={1} style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={() => removeEdge(edge.id)} />
            <text x={mx} y={my + 4} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={10} style={{ pointerEvents: 'none' }}>×</text>
          </g>
        );
      })}
    </svg>
  );

  const nodeEls = nodes.map(node => {
    const isFirst = connecting === node.id;
    return (
      <div key={node.id}
        ref={el => { if (el) nodeHeights.current[node.id] = el.offsetHeight; }}
        style={{ position: 'absolute', left: node.x, top: node.y, width: node.w, zIndex: dragging?.id === node.id ? 100 : 1 }}
        onClick={() => { if (connectMode) handleNodeClick(node.id); }}>
        <div style={{ background: isFirst ? 'rgba(239,153,130,0.12)' : (node.color || C.mid), border: `1.5px solid ${isFirst ? C.coral : 'rgba(255,255,255,0.45)'}`, boxShadow: isFirst ? `0 0 0 2px ${C.coral}` : '2px 2px 0 rgba(0,0,0,0.3)', transition: 'border-color 0.15s' }}>
          {/* Drag handle */}
          <div onMouseDown={e => onMD(e, node.id)} style={{ height: 10, cursor: connectMode ? 'crosshair' : 'grab', background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 14, height: 1.5, background: 'rgba(255,255,255,0.25)', borderRadius: 1 }} />)}
          </div>
          {node.type === 'image' ? (
            <div style={{ padding: '4px 4px 8px' }}>
              <img src={node.url} alt="" style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} onError={e => { (e.target as HTMLImageElement).style.minHeight = '60px'; (e.target as HTMLImageElement).style.background = 'rgba(255,255,255,0.05)'; }} />
              {editingId === node.id
                ? <input autoFocus value={node.text} onChange={e => updateNode(node.id, { text: e.target.value })} onBlur={() => setEditingId(null)} onKeyDown={e => e.key === 'Enter' && setEditingId(null)} onMouseDown={e => e.stopPropagation()} style={{ width: '100%', marginTop: 6, fontFamily: 'monospace', fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.3)', outline: 'none', color: C.peach, boxSizing: 'border-box' }} />
                : <div onMouseDown={e => { e.stopPropagation(); setEditingId(node.id); }} style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, color: node.text ? C.peach : 'rgba(255,255,255,0.25)', cursor: 'text', minHeight: 14 }}>{node.text || 'caption…'}</div>}
            </div>
          ) : (
            <div style={{ padding: '5px 8px 4px' }}>
              <textarea value={node.text} onChange={e => updateNode(node.id, { text: e.target.value })} placeholder="type here…"
                onMouseDown={e => e.stopPropagation()}
                style={{ width: '100%', minHeight: 36, fontFamily: 'monospace', fontSize: 11, background: 'transparent', border: 'none', outline: 'none', color: C.peach, resize: 'vertical', lineHeight: 1.4, boxSizing: 'border-box', display: 'block', cursor: 'text' }} />
              <div onMouseDown={e => e.stopPropagation()} style={{ marginTop: 3, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
                <button onClick={() => setColorPickerNode(colorPickerNode === node.id ? null : node.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer' }}>
                  <div style={{ width: 10, height: 10, background: node.color || C.mid, border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>▾</span>
                </button>
                {colorPickerNode === node.id && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 500, background: '#2a2830', border: '1px solid rgba(255,255,255,0.2)', padding: 5, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, marginTop: 3, boxShadow: '0 6px 20px rgba(0,0,0,0.6)' }}>
                    {MIND_COLORS.map(col => (
                      <div key={col} onClick={() => { updateNode(node.id, { color: col }); setColorPickerNode(null); }}
                        style={{ width: 14, height: 14, background: col, border: `1.5px solid ${(node.color || C.mid) === col ? C.white : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer' }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <button onMouseDown={e => { e.stopPropagation(); removeNode(node.id); }} style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: C.coral, border: '1.5px solid rgba(255,255,255,0.4)', color: C.white, fontSize: 10, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>×</button>
      </div>
    );
  });

  const toolbar = (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, background: C.mid, flexWrap: 'wrap' }}>
      <button onClick={addTextNode} style={{ background: 'rgba(255,255,255,0.08)', color: C.peach, border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 0, padding: '5px 12px', fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Note</button>
      <button onClick={() => setShowImgInput(v => !v)} style={{ background: showImgInput ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)', color: C.peach, border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 0, padding: '5px 12px', fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Image</button>
      <button onClick={() => { setConnectMode(v => !v); setConnecting(null); }} style={{ background: connectMode ? C.coral : 'rgba(255,255,255,0.08)', color: C.white, border: `1.5px solid ${connectMode ? C.coral : 'rgba(255,255,255,0.3)'}`, borderRadius: 0, padding: '5px 12px', fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
        {connectMode ? (connecting ? '→ click 2nd node' : '→ click 1st node') : '⤢ Connect'}
      </button>
      <div style={{ flex: 1 }} />
      <button onClick={generate} disabled={generating} style={{ background: generating ? 'rgba(101,121,70,0.4)' : C.main, color: C.white, border: `1.5px solid ${C.main}`, borderRadius: 0, padding: '5px 14px', fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.7 : 1, letterSpacing: 0.3 }}>
        {generating ? 'Generating…' : '✦ AI Generate'}
      </button>
      {genError && <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.coral, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={genError}>{genError}</span>}
      {showImgInput && (
        <>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addImageNode()} placeholder="Paste image URL…" autoFocus style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 0, padding: '5px 10px', outline: 'none', color: C.peach, width: 200 }} />
          <button onClick={addImageNode} style={{ background: C.main, color: C.white, border: 'none', borderRadius: 0, padding: '5px 12px', fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button onClick={() => { setShowImgInput(false); setUrlInput(''); }} style={{ background: 'transparent', color: 'rgba(255,255,255,0.4)', border: 'none', fontSize: 13, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </>
      )}
    </div>
  );

  const canvas = (
    <div ref={canvasRef} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}
      style={{ flex: 1, position: 'relative', backgroundColor: C.dark, backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '24px 24px', overflow: 'auto', userSelect: 'none', cursor: connectMode ? 'crosshair' : 'default', minHeight: fullscreen ? undefined : 420 }}>
      <div style={{ position: 'relative', minWidth: 2400, minHeight: 2000 }}>
      {edgeSvg}
      {loaded && nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.18)' }}>Add notes and images — connect ideas freely</div>
        </div>
      )}
      {nodeEls}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: fullscreen ? 1 : undefined, border: fullscreen ? 'none' : '1.5px solid rgba(255,255,255,0.15)', marginTop: fullscreen ? 0 : 16 }}>
      {toolbar}
      {canvas}
    </div>
  );
}

// ── Stage Icon helper ──────────────────────────────────────────────────────
function StageIcon({ stage, size }: { stage: typeof STAGES[number]; size: number }) {
  if (stage.id === "prayer") return <PrayerIcon width={size} height={size} style={{ display: "block" }} />;
  if (stage.id === "revelation") return <Sqig1Icon width={size} height={size} style={{ display: "block" }} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{stage.emoji}</span>;
}

// ── Stage Panel ────────────────────────────────────────────────────────────
function StagePanel({ stage, isActive, isUnlocked, isDone, note, onNote, onComplete, taskGid, taskName = '', taskNotes = '' }: {
  stage: typeof STAGES[number]; isActive: boolean; isUnlocked: boolean; isDone: boolean;
  note: string; onNote: (v: string) => void; onComplete: () => void; taskGid: string;
  taskName?: string; taskNotes?: string;
}) {
  const locked = !isUnlocked;
  return (
    <div style={{ border: b(2.5, isActive ? C.brown : "rgba(36,35,41,0.2)"), borderRadius: 18, overflow: "hidden", opacity: locked ? 0.45 : 1, transition: "opacity 0.4s, transform 0.4s", transform: isActive ? "scale(1)" : "scale(0.98)" }}>
      <div style={{ background: locked ? "rgba(36,35,41,0.3)" : stage.color, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32, lineHeight: 1 }}>{locked ? "🔒" : <StageIcon stage={stage} size={32} />}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: locked ? "#999" : stage.textColor, opacity: 0.7, textTransform: "none", letterSpacing: 0.5 }}>Stage {stage.step} of {STAGES.length}</div>
            {isDone && <div style={{ background: "rgba(255,255,255,0.3)", borderRadius: 20, padding: "1px 8px", fontFamily: FONT, fontSize: 9, fontWeight: 800, color: stage.textColor }}>✓ {stage.reward}</div>}
            {locked && <div style={{ background: "rgba(0,0,0,0.1)", borderRadius: 20, padding: "1px 8px", fontFamily: FONT, fontSize: 9, fontWeight: 800, color: "#666" }}>LOCKED</div>}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 900, color: locked ? "#999" : stage.textColor, lineHeight: 1.1, marginTop: 2 }}>{stage.label} <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>— {stage.sub}</span></div>
        </div>
      </div>
      {!locked && (
        <>
          <div style={{ background: "rgba(255,255,255,0.6)", padding: "14px 20px", borderBottom: b(1.5, "rgba(36,35,41,0.1)") }}>
            <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.brown, lineHeight: 1.7, marginBottom: 10 }}>{stage.prompt}</div>
            <div style={{ fontFamily: FONT, fontSize: 11, fontStyle: "italic", color: C.brown, opacity: 0.6, lineHeight: 1.5 }}>"{stage.scripture}" — {stage.ref}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.85)", padding: "14px 20px" }}>
            <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.brown, opacity: 0.5, textTransform: "none", letterSpacing: 1, marginBottom: 6 }}>{stage.q}</div>
            <textarea value={note || ""} onChange={e => onNote(e.target.value)} placeholder="Write your thoughts here…" disabled={isDone}
              style={{ width: "100%", minHeight: 80, fontFamily: FONT, fontSize: 13, color: C.brown, background: isDone ? "rgba(0,0,0,0.04)" : C.white, border: b(2, "rgba(36,35,41,0.25)"), borderRadius: 10, padding: "10px 12px", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.7 }} />
            {stage.id === "revelation" && <MindMap taskGid={taskGid} taskName={taskName} taskNotes={taskNotes} />}
            {!isDone && isActive && (
              <button onClick={onComplete} style={{ marginTop: 12, width: "100%", background: stage.color, color: stage.textColor, border: b(2.5, C.brown), borderRadius: 12, padding: "14px 0", fontFamily: FONT, fontSize: 13, fontWeight: 900, cursor: "pointer", letterSpacing: 0.5 }}>
                {stage.step === STAGES.length ? "🏆 Complete Action" : `Complete ${stage.label} → Unlock ${STAGES[stage.step].label} →`}
              </button>
            )}
            {isDone && <div style={{ marginTop: 10, textAlign: "center", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: C.green, opacity: 0.8 }}>✓ {stage.reward}</div>}
          </div>
        </>
      )}
      {locked && (
        <div style={{ background: "rgba(200,200,200,0.3)", padding: "20px", textAlign: "center" }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#888" }}>Complete the previous stage to unlock</div>
        </div>
      )}
    </div>
  );
}

// ── Factory Detail ─────────────────────────────────────────────────────────
function FactoryDetail({ task, category, onCategoryChange, onBack }: { task: Task; category: CategoryKey; onCategoryChange: (c: CategoryKey) => void; onBack: () => void }) {
  const uc = urgColor(task.due_on); const ul = urgLabel(task.due_on); const dl = daysLeft(task.due_on);
  const catCfg = category ? CATEGORIES[category] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: C.brown, borderBottom: b(2, C.brown), padding: "14px 24px", flexShrink: 0, display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onBack} style={{ background: C.peach, border: b(2, C.white), borderRadius: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: C.brown, cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 600, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</div>
            {category === "factory" && <OutsideIcon width={20} height={20} style={{ flexShrink: 0, color: C.white, opacity: 0.75 }} />}
            {category === "creative" && <InsideIcon width={20} height={20} style={{ flexShrink: 0, color: C.white, opacity: 0.75 }} />}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
            {task.due_on && <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{task.due_on}</div>}
            {ul && <div style={{ background: uc, border: b(1.5, C.white), borderRadius: 20, padding: "1px 8px", fontFamily: FONT, fontSize: 9, fontWeight: 800, color: dl !== null && dl <= 0 ? C.white : C.brown }}>{ul}</div>}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}><CategoryToggle value={category} onChange={onCategoryChange} size="normal" /></div>
        <button onClick={() => window.open(task.url, "_blank", "noopener,noreferrer")} style={{ background: "rgba(255,255,255,0.1)", color: C.white, border: b(2, "rgba(255,255,255,0.3)"), borderRadius: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>Asana ↗</button>
      </div>
      <div className="graph-bg" style={{ flex: 1, overflowY: "auto", padding: 40 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {category === "creative" ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <InsideIcon width={36} height={36} style={{ color: C.peach }} />
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: C.peach }}>Inside Task</div>
              </div>
              {task.notes
                ? <div style={{ fontFamily: FONT, fontSize: 14, color: C.peach, lineHeight: 1.8, whiteSpace: "pre-wrap", opacity: 0.85 }}>{task.notes}</div>
                : <div style={{ fontFamily: FONT, fontSize: 13, color: C.peach, opacity: 0.4, fontStyle: "italic" }}>No description in Asana yet.</div>
              }
              <button onClick={() => window.open(task.url, "_blank", "noopener,noreferrer")} style={{ marginTop: 28, background: C.main, color: C.white, border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Open in Asana ↗</button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><UncatIcon width={64} height={64} style={{ color: C.peach, opacity: 0.3 }} /></div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 600, color: C.peach, marginBottom: 10, textAlign: "center" }}>Uncategorized</div>
              <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.peach, opacity: 0.5, lineHeight: 1.7, marginBottom: 24, textAlign: "center" }}>
                Mark this task as Inside to view its description, or Outside to run it through the creative process.
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => window.open(task.url, "_blank", "noopener,noreferrer")} style={{ background: C.main, color: C.white, border: "none", borderRadius: 12, padding: "14px 32px", fontFamily: FONT, fontSize: 14, fontWeight: 900, cursor: "pointer" }}>Open in Asana ↗</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Morning Prayer Lock ─────────────────────────────────────────────────────
const FALLBACK_PRAYER = { prompt: "Commit your work to the LORD, and your plans will be established.", scripture: "Commit your work to the LORD, and your plans will be established.", ref: "Proverbs 16:3" };

function MorningPrayerLock({ task, onUnlock }: { task?: Task; onUnlock: (note: string) => void }) {
  const [seconds, setSeconds] = useState(30);
  const [muted, setMuted] = useState(false);
  const [prayerContent, setPrayerContent] = useState<{ prompt: string; scripture: string; ref: string } | null>(null);
  const [prayerLoading, setPrayerLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isDone = seconds <= 0;

  useEffect(() => {
    const audio = new Audio(prayerMusic);
    audio.loop = true;
    audio.volume = 0.7;
    audio.play().catch(() => {});
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  useEffect(() => {
    if (!task?.name) return;
    setPrayerLoading(true);
    platformAI.generatePrayer(task.name, task.notes ?? '').then(result => {
      setPrayerContent(result ?? FALLBACK_PRAYER);
      setPrayerLoading(false);
    }).catch(() => {
      setPrayerContent(FALLBACK_PRAYER);
      setPrayerLoading(false);
    });
  }, [task?.gid]);

  useEffect(() => {
    if (isDone) return;
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, isDone]);

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - seconds / 30);

  const displayed = prayerContent ?? FALLBACK_PRAYER;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, overflow: "hidden" }}>
      {/* Full-screen video */}
      <video
        src={prayerVideo}
        autoPlay
        loop
        muted
        playsInline
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "right center" }}
      />
      {/* Dark scrim so text stays readable */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(36,35,41,0.55)" }} />

      {/* Left-aligned content */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", height: "100%", padding: "40px 40px 60px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: 520, width: "100%", animation: "fadeInUp 0.6s ease" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 96, fontWeight: 600, color: C.white, marginBottom: 16, lineHeight: 1 }}>Prayer</div>

          {task?.name && (
            <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 16 }}>
              {task.name}
            </div>
          )}

          {prayerLoading ? (
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: "rgba(255,255,255,0.35)", marginBottom: 40, lineHeight: 1.7 }}>
              Preparing your prayer…
            </div>
          ) : (
            <div style={{ animation: "fadeInUp 0.5s ease", marginBottom: 8 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 400, color: C.white, textAlign: "left", lineHeight: 1.8, marginBottom: 14 }}>
                "{displayed.prompt}"
              </div>
              <div style={{ width: 36, height: 2, background: "rgba(255,255,255,0.3)", marginBottom: 14 }} />
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 400, color: "rgba(255,255,255,0.75)", textAlign: "left", lineHeight: 1.7, marginBottom: 6 }}>
                "{displayed.scripture}"
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", letterSpacing: 0.5, marginBottom: 36 }}>
                {displayed.ref}
              </div>
            </div>
          )}

          {!isDone ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <div style={{ position: "relative", width: 76, height: 76 }}>
                <svg width={76} height={76} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={38} cy={38} r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={5} />
                  <circle cx={38} cy={38} r={radius} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={5} strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: "stroke-dashoffset 1s linear" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 22, fontWeight: 900, color: C.white }}>{seconds}</div>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "none", letterSpacing: 0.5 }}>seconds of stillness</div>
            </div>
          ) : (
            <button onClick={() => onUnlock("")}
              style={{ background: C.white, color: C.dark, border: "none", borderRadius: 14, padding: "16px 52px", fontFamily: FONT, fontSize: 15, fontWeight: 900, cursor: "pointer", animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
              Begin Work →
            </button>
          )}
        </div>
      </div>
      {/* Mute button */}
      <button
        onClick={() => { const a = audioRef.current; if (!a) return; a.muted = !a.muted; setMuted(m => !m); }}
        style={{ position: "absolute", bottom: 24, right: 24, zIndex: 2, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "8px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
        {muted ? "♪ Unmute" : "♪ Mute"}
      </button>
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

// ── Project Detail ─────────────────────────────────────────────────────────
function ProjectDetail({ task, category, onCategoryChange, onBack, session, onStartSession, onTogglePause, onReset }: { task: Task; category: CategoryKey; onCategoryChange: (c: CategoryKey) => void; onBack: () => void; session?: Session; onStartSession?: () => void; onTogglePause?: () => void; onReset?: () => void }) {
  const KEY = "workflow_" + task.gid;
  const MORNING_KEY = "morning_prayer_" + task.gid;
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [celebrate, setCelebrate] = useState<typeof STAGES[number] | null>(null);
  const [showMorningLock, setShowMorningLock] = useState(false);
  const [viewingStageIdx, setViewingStageIdx] = useState(0);
  const [showDescription, setShowDescription] = useState(false);
  const initialViewSet = useRef(false);
  const [sessionNow, setSessionNow] = useState(Date.now());
  useEffect(() => {
    if (!session || session.pausedAt) return;
    const id = setInterval(() => setSessionNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [session]);
  const sessionState = session ? getSessionState(session, task.due_on, sessionNow) : null;

  useEffect(() => {
    initialViewSet.current = false;
    storageGet(KEY).then(async r => {
      let loadedDone: Record<string, boolean> = {};
      if (r) { try { const d = JSON.parse(r); setNotes(d.notes || {}); loadedDone = d.done || {}; setDone(loadedDone); } catch (_) {} }
      setLoaded(true);
      if (!initialViewSet.current) {
        initialViewSet.current = true;
        const activeIdx = STAGES.findIndex((s, i) => { const pd = i === 0 || !!loadedDone[STAGES[i - 1].id]; return pd && !loadedDone[s.id]; });
        setViewingStageIdx(activeIdx >= 0 ? activeIdx : STAGES.length);
      }
      const today = new Date().toISOString().split("T")[0];
      try { const last = await storageGet(MORNING_KEY); if (last !== today) setShowMorningLock(true); } catch (_) { setShowMorningLock(true); }
    }).catch(() => setLoaded(true));
  }, [task.gid]);

  async function save(n: Record<string, string>, d: Record<string, boolean>) { try { await storageSet(KEY, JSON.stringify({ notes: n, done: d })); } catch (_) {} }
  function setNote(id: string, val: string) { const n = { ...notes, [id]: val }; setNotes(n); save(n, done); }
  function handleReset() { setNotes({}); setDone({}); save({}, {}); onReset?.(); }
  function completeStage(id: string) {
    const d = { ...done, [id]: true }; setDone(d); save(notes, d);
    const stage = STAGES.find(s => s.id === id)!;
    setCelebrate(stage);
    setTimeout(() => {
      setCelebrate(null);
      setViewingStageIdx(stage.step < STAGES.length ? stage.step : STAGES.length);
    }, 2000);
  }

  async function handleMorningUnlock(prayerNote: string) {
    const today = new Date().toISOString().split("T")[0];
    await storageSet(MORNING_KEY, today);
    if (prayerNote.trim() && !done["prayer"]) {
      setNote("prayer", prayerNote.trim());
    }
    setShowMorningLock(false);
  }

  const doneCount = STAGES.filter(s => done[s.id]).length;
  const activeStage = loaded ? STAGES.find((s, i) => { const prevDone = i === 0 || !!done[STAGES[i - 1].id]; return prevDone && !done[s.id]; }) : undefined;
  const uc = urgColor(task.due_on); const ul = urgLabel(task.due_on); const dl = daysLeft(task.due_on);
  const catCfg = category ? CATEGORIES[category] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {showMorningLock && <MorningPrayerLock task={task} onUnlock={handleMorningUnlock} />}
      {celebrate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: celebrate.color, border: b(3, C.brown), borderRadius: 24, padding: "32px 48px", textAlign: "center", animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1)" }}>
            <div style={{ fontSize: 56 }}><StageIcon stage={celebrate} size={56} /></div>
            <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 900, color: celebrate.textColor, marginTop: 8 }}>{celebrate.reward}!</div>
            {celebrate.step < STAGES.length && <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: celebrate.textColor, opacity: 0.8, marginTop: 4 }}>{STAGES[celebrate.step].label} unlocked →</div>}
          </div>
        </div>
      )}
      <div style={{ height: 4, background: catCfg ? catCfg.color : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
      <div style={{ background: C.brown, borderBottom: b(2, C.brown), padding: "14px 24px", flexShrink: 0, display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onBack} style={{ background: C.peach, border: b(2, C.white), borderRadius: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: C.brown, cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 900, color: C.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.name}</div>
            {category === "factory" && <OutsideIcon width={20} height={20} style={{ flexShrink: 0, color: C.white, opacity: 0.75 }} />}
            {category === "creative" && <InsideIcon width={20} height={20} style={{ flexShrink: 0, color: C.white, opacity: 0.75 }} />}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
            {task.due_on && <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{task.due_on}</div>}
            {ul && <div style={{ background: uc, border: b(1.5, C.white), borderRadius: 20, padding: "1px 8px", fontFamily: FONT, fontSize: 9, fontWeight: 800, color: dl !== null && dl <= 0 ? C.white : C.brown }}>{ul}</div>}
          </div>
        </div>
        <button onClick={() => { if (window.confirm("Reset the creative process? All notes and progress will be cleared.")) handleReset(); }} style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)", border: b(2, "rgba(255,255,255,0.2)"), borderRadius: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>↺ Reset</button>
        <button onClick={() => window.open(task.url, "_blank", "noopener,noreferrer")} style={{ background: "rgba(255,255,255,0.1)", color: C.white, border: b(2, "rgba(255,255,255,0.3)"), borderRadius: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>Asana ↗</button>
      </div>
      {/* Timed Session Banner */}
      <div style={{ background: "rgba(20,18,28,0.9)", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, minHeight: 52 }}>
        {sessionState ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ color: C.white, display: "flex", alignItems: "center" }}>
                <StageIcon stage={STAGES[sessionState.stageIndex]} size={22} />
              </div>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5, marginBottom: 1 }}>
                  {sessionState.done ? "Session Complete" : `Stage ${sessionState.stageIndex + 1} of ${STAGES.length} — ${sessionState.paused ? "Paused" : "Active"}`}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 900, color: C.white }}>
                  {sessionState.done ? "All stages complete" : STAGES[sessionState.stageIndex].label}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {!sessionState.done && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>next stage in</div>
                  <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 900, color: sessionState.paused ? "rgba(255,255,255,0.4)" : C.white, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{daysLabel(sessionState.remainingSecs)}</div>
                </div>
              )}
              {sessionState.done
                ? <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: C.main }}>✓ Process Complete</div>
                : <button onClick={onTogglePause} style={{ background: sessionState.paused ? C.main : "rgba(255,255,255,0.1)", color: C.white, border: "none", borderRadius: 8, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    {sessionState.paused ? "▶ Resume" : "⏸ Pause"}
                  </button>
              }
            </div>
          </>
        ) : (
          <>
            {(() => { const [p, r, a] = getSessionDurations(Date.now(), task.due_on); return (
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>
                {task.due_on ? `Timed session: Prayer (${daysLabel(p)}) → Revelation (${daysLabel(r)}) → Action (${daysLabel(a)})` : 'No due date — set one in Asana to scale the session'}
              </div>
            ); })()}
            {onStartSession && (
              <button onClick={onStartSession} style={{ background: C.main, color: C.white, border: "none", borderRadius: 10, padding: "8px 22px", fontFamily: FONT, fontSize: 13, fontWeight: 900, cursor: "pointer", flexShrink: 0, letterSpacing: 0.3 }}>
                ▶ Start
              </button>
            )}
          </>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Step indicators — always visible */}
        <div style={{ background: C.mid, borderBottom: `1px solid rgba(255,255,255,0.08)`, padding: "14px 0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {STAGES.slice(0, 2).map((s, i) => {
            const isViewing = !showDescription && i === viewingStageIdx;
            return (
              <Fragment key={s.id}>
                {i > 0 && <div style={{ width: 36, height: 2, background: "rgba(255,255,255,0.12)" }} />}
                <button onClick={() => { setShowDescription(false); setViewingStageIdx(i); }}
                  style={{ padding: 0, background: "transparent", border: "none", cursor: "pointer", opacity: isViewing ? 1 : 0.35, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center", color: C.white }}>
                  <StageIcon stage={s} size={28} />
                </button>
              </Fragment>
            );
          })}
          <div style={{ width: 36, height: 2, background: "rgba(255,255,255,0.12)" }} />
          <button onClick={() => setShowDescription(v => !v)}
            style={{ padding: "4px 10px", background: showDescription ? "rgba(255,255,255,0.15)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", opacity: showDescription ? 1 : 0.35, transition: "opacity 0.2s", fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.white, letterSpacing: 0.3 }}>
            Brief
          </button>
        </div>

        {/* Content area */}
        {showDescription ? (
          <div className="graph-bg" style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "52px 64px", maxWidth: 620, margin: "0 auto" }}>
              <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 900, color: C.peach, marginBottom: 32, lineHeight: 1.3 }}>{task.name}</div>
              <div style={{ width: 40, height: 3, background: C.main, borderRadius: 99, marginBottom: 32 }} />
              {task.notes ? (
                <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 400, color: C.peach, lineHeight: 1.9, whiteSpace: "pre-wrap", opacity: 0.8 }}>{task.notes}</div>
              ) : (
                <div style={{ fontFamily: FONT, fontSize: 14, color: C.peach, opacity: 0.3 }}>No description added in Asana yet.</div>
              )}
              {task.due_on && (
                <div style={{ marginTop: 40, display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 18px" }}>
                  <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: C.peach, opacity: 0.4, letterSpacing: 1.5 }}>Due</span>
                  <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: urgColor(task.due_on) }}>{task.due_on}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Revelation = fullscreen mood board */}
            {loaded && viewingStageIdx === 1 ? (
              <MindMap taskGid={task.gid} taskName={task.name} taskNotes={task.notes} fullscreen />
            ) : (
              <div className="graph-bg" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                {!loaded ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT, fontSize: 14, color: C.peach, opacity: 0.3 }}>Loading…</div>
                ) : viewingStageIdx >= STAGES.length ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 48, textAlign: "center" }}>
                    <div style={{ fontSize: 64, marginBottom: 20 }}>🏆</div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 600, color: C.peach, marginBottom: 8 }}>Faithfully Finished.</div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 400, color: C.peach, opacity: 0.5, lineHeight: 1.7, marginBottom: 28 }}>Well done. The work is offered up.</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                      {STAGES.map((s, i) => (
                        <button key={s.id} onClick={() => setViewingStageIdx(i)} style={{ background: "rgba(255,255,255,0.06)", border: b(1.5, "rgba(255,255,255,0.12)"), borderRadius: 10, padding: "8px 16px", fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.peach, cursor: "pointer", opacity: 0.6 }}>
                          <StageIcon stage={s} size={14} /> {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (() => {
                  const stage = STAGES[viewingStageIdx];
                  if (stage.id === "prayer") return (
                    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
                      {/* Left: text content */}
                      <div style={{ flex: 1, padding: "52px 56px", overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ color: C.peach, marginBottom: 16 }}><StageIcon stage={stage} size={44} /></div>
                        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 600, color: C.peach, marginBottom: 4 }}>{stage.label}</div>
                        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 500, color: C.peach, opacity: 0.3, letterSpacing: 0.5, marginBottom: 24 }}>Step {stage.step} of {STAGES.length} — {stage.sub}</div>
                        <div style={{ width: 40, height: 3, background: C.coral, borderRadius: 99, marginBottom: 28 }} />
                        <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 500, color: C.peach, lineHeight: 1.8, marginBottom: 24, opacity: 0.8 }}>{stage.prompt}</div>
                        <div style={{ fontFamily: FONT, fontSize: 11, fontStyle: "italic", color: C.peach, opacity: 0.4, lineHeight: 1.6, marginBottom: 20 }}>"{stage.scripture}" — {stage.ref}</div>
                        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: C.coral, letterSpacing: 1.5 }}>{stage.q}</div>
                      </div>
                      {/* Right: full-height textarea */}
                      <textarea value={notes[stage.id] || ""} onChange={e => setNote(stage.id, e.target.value)} placeholder="Write your thoughts here…"
                        style={{ width: "55%", minWidth: 320, height: "100%", fontFamily: "monospace", fontSize: 14, color: C.peach, background: "rgba(36,35,41,0.9)", backgroundImage: "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "28px 28px", border: "none", borderLeft: `1.5px solid rgba(255,255,255,0.15)`, borderRadius: 0, padding: "52px 32px", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.7 }} />
                    </div>
                  );
                  return (
                    <div style={{ padding: "52px 64px", maxWidth: 620, margin: "0 auto" }}>
                      <div style={{ color: C.peach, marginBottom: 16 }}><StageIcon stage={stage} size={44} /></div>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 600, color: C.peach, marginBottom: 4 }}>{stage.label}</div>
                      <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 500, color: C.peach, opacity: 0.3, letterSpacing: 0.5, marginBottom: 24 }}>Step {stage.step} of {STAGES.length} — {stage.sub}</div>
                      <div style={{ width: 40, height: 3, background: stage.id === "revelation" ? C.main : C.coral, borderRadius: 99, marginBottom: 28 }} />
                      <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: C.coral, textTransform: "none", letterSpacing: 1.5, marginBottom: 10 }}>{stage.q}</div>
                      <textarea value={notes[stage.id] || ""} onChange={e => setNote(stage.id, e.target.value)} placeholder="Write your thoughts here…"
                        style={{ width: "100%", maxWidth: 500, minHeight: 160, fontFamily: "monospace", fontSize: 14, color: C.peach, background: "rgba(36,35,41,0.9)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)", backgroundSize: "20px 20px", border: `1.5px solid rgba(255,255,255,0.85)`, borderRadius: 0, padding: "14px 16px", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.7, display: "block" }} />
                    </div>
                  );
                })()}
              </div>
            )}
            {loaded && activeStage && STAGES.indexOf(activeStage) === viewingStageIdx && !showMorningLock && (
              <div style={{ flexShrink: 0, background: activeStage.color, borderTop: b(2.5, C.brown), padding: "14px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: activeStage.textColor, opacity: 0.65, textTransform: "none", letterSpacing: 0.5, marginBottom: 2 }}>Current Stage</div>
                  <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 900, color: activeStage.textColor, display: "flex", alignItems: "center", gap: 6 }}><StageIcon stage={activeStage} size={15} /> {activeStage.label} <span style={{ fontWeight: 600, fontSize: 12, opacity: 0.7 }}>— {activeStage.sub}</span></div>
                </div>
                <button onClick={() => completeStage(activeStage.id)}
                  style={{ flexShrink: 0, background: "rgba(255,255,255,0.2)", color: activeStage.textColor, border: b(2, activeStage.textColor === C.white ? "rgba(255,255,255,0.5)" : "rgba(36,35,41,0.4)"), borderRadius: 12, padding: "12px 28px", fontFamily: FONT, fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
                  {activeStage.step === STAGES.length ? "🏆 Complete Action" : `Complete ${activeStage.label} →`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}

// ── Project Card ───────────────────────────────────────────────────────────
function ProjectCard({ task, progress: _progress, category, onOpen, onCategoryChange, session, onDragStart, onDragEnd }: { task: Task; progress: number; category: CategoryKey; onOpen: (t: Task) => void; onCategoryChange: (c: CategoryKey) => void; session?: Session; onDragStart?: () => void; onDragEnd?: () => void }) {
  const [hov, setHov] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, [session]);
  const sessionState = (session && category === "factory") ? getSessionState(session, task.due_on, nowMs) : null;
  const catCfg = category ? CATEGORIES[category] : null;
  const due = task.due_on ? new Date(task.due_on + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  return (
    <div className="glass-card" draggable onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.gid); onDragStart?.(); }} onDragEnd={onDragEnd} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={() => onOpen(task)}
      style={{ background: C.dark, border: "1px solid rgba(255,255,255,0.25)", borderRadius: 0, overflow: "hidden", cursor: "grab", display: "flex", flexDirection: "column", width: "100%", minHeight: 220, transform: hov ? "translateY(-4px) scale(1.01)" : "translateY(0) scale(1)", transition: "transform 0.18s cubic-bezier(.34,1.56,.64,1), box-shadow 0.18s, background 0.18s", boxShadow: hov ? "0 20px 40px rgba(36,35,41,0.55)" : "0 4px 16px rgba(36,35,41,0.3)" }}>
      <div style={{ height: 6, background: catCfg ? catCfg.color : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
      <div style={{ padding: "14px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
          <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 600, color: C.peach, lineHeight: 1.4, textAlign: "left" }}>{task.name}</div>
        </div>
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {due
            ? <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}><span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>Due: </span>{due}</div>
            : <div />}
          <CategoryToggle value={category} onChange={onCategoryChange} size="small" />
        </div>
        {sessionState && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.peach }}>
              <StageIcon stage={STAGES[sessionState.stageIndex]} size={13} />
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: sessionState.paused ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.65)" }}>
                {sessionState.done ? "Complete" : sessionState.paused ? `${STAGES[sessionState.stageIndex].label} ⏸` : STAGES[sessionState.stageIndex].label}
              </div>
            </div>
            {!sessionState.done && (
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 900, color: C.peach, fontVariantNumeric: "tabular-nums", letterSpacing: 0.5 }}>
                {daysLabel(sessionState.remainingSecs)}
              </div>
            )}
            {sessionState.done && <div style={{ fontSize: 11, color: C.main, fontWeight: 900 }}>✓</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Todo Card ─────────────────────────────────────────────────────────────
function TodoCard({ item, onOpen, onToggle, onClose }: { item: TodoItem; onOpen?: () => void; onToggle: (e: React.MouseEvent) => void; onClose: (e: React.MouseEvent) => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onOpen}
      style={{ background: C.dark, border: "1px solid rgba(255,255,255,0.25)", borderRadius: 0, cursor: "default", transition: "background 0.15s" }}>
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div onClick={onToggle}
          style={{ width: 18, height: 18, borderRadius: 0, flexShrink: 0, marginTop: 2, border: `1.5px solid ${item.done ? C.main : "rgba(255,255,255,0.4)"}`, background: item.done ? C.main : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s" }}>
          {item.done && <span style={{ color: C.white, fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 500, color: C.peach, textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.35 : 1, flex: 1, minWidth: 0, wordBreak: "break-word" }}>
          {item.title}
        </div>
        <button onClick={onClose}
          style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = C.white)}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>✕</button>
      </div>
    </div>
  );
}

// ── Todo Detail ────────────────────────────────────────────────────────────
function TodoDetail({ item, onUpdate, onDelete, onBack }: { item: TodoItem; onUpdate: (u: Partial<TodoItem>) => void; onDelete: () => void; onBack: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  // keep local state in sync if item updates from outside
  useEffect(() => { setTitle(item.title); setNotes(item.notes); }, [item.id]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: C.mid, borderBottom: `1px solid rgba(255,255,255,0.08)`, padding: "14px 24px", flexShrink: 0, display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: C.peach, cursor: "pointer" }}>← Back</button>
        <input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => title.trim() && onUpdate({ title: title.trim() })} onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          style={{ flex: 1, fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: C.peach, background: "transparent", border: "none", outline: "none", minWidth: 0 }} />
        <button onClick={() => onUpdate({ done: !item.done })}
          style={{ background: item.done ? "rgba(255,255,255,0.08)" : C.main, color: C.white, border: "none", borderRadius: 10, padding: "6px 16px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          {item.done ? "↩ Reopen" : "✓ Done"}
        </button>
        <button onClick={() => { onDelete(); onBack(); }}
          style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.15)`, color: "rgba(255,255,255,0.4)", borderRadius: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
          Delete
        </button>
      </div>
      <div className="graph-bg" style={{ flex: 1, overflowY: "auto", padding: "48px 64px" }}>
        <textarea value={notes} onChange={e => { setNotes(e.target.value); onUpdate({ notes: e.target.value }); }}
          placeholder="Add notes…"
          style={{ width: "100%", maxWidth: 560, minHeight: 200, fontFamily: FONT, fontSize: 14, color: C.peach, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.8, display: "block" }} />
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [projects, setProjects]     = useState<Task[]>([]);
  const [openTask, setOpenTask]     = useState<Task | null>(null);
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState<string | null>(null);
  const [progresses, setProgresses] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Record<string, CategoryKey>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showPrayer, setShowPrayer] = useState(false);
  const [sectionGids, setSectionGids] = useState<string[]>(DEFAULT_SECTION_GIDS);
  const [quickTaskSectionGid, setQuickTaskSectionGid] = useState<string>("");
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [openTodoId, setOpenTodoId] = useState<string | null>(null);
  const [newTodoText, setNewTodoText] = useState("");
  const [todosPanelOpen, setTodosPanelOpen] = useState(true);
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false);
  const [dragGid, setDragGid] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<CategoryKey | undefined>(undefined);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      Promise.all([
        storageGet("mossmind_tasks").catch(() => null),
        storageGet("mossmind_categories").catch(() => null),
        storageGet("asana_section_gids").catch(() => null),
        storageGet("mossmind_sessions").catch(() => null),
        storageGet("mossmind_todos").catch(() => null),
        storageGet("quick_task_section_gid").catch(() => null),
      ]).then(([tasksRes, catsRes, sectionsRes, sessionsRes, todosRes, quickGidRes]) => {
        if (catsRes) { try { setCategories(JSON.parse(catsRes)); } catch (_) {} }
        if (sectionsRes) { try { const parsed = typeof sectionsRes === "string" ? JSON.parse(sectionsRes) : sectionsRes; if (Array.isArray(parsed)) setSectionGids(parsed); } catch (_) {} }
        if (sessionsRes) { try { setSessions(JSON.parse(sessionsRes)); } catch (_) {} }
        if (todosRes) { try { setTodos(JSON.parse(todosRes)); } catch (_) {} }
        if (quickGidRes) setQuickTaskSectionGid(quickGidRes as string);
        if (tasksRes) {
          try {
            const c = JSON.parse(tasksRes);
            if (Date.now() - c.ts < 30 * 60 * 1000 && c.projects?.length) { setProjects(c.projects); loadProgresses(c.projects); if (quickGidRes) syncQuickTasks(quickGidRes as string); return; }
          } catch (_) {}
        }
        // No cached tasks yet — prompt to sync
        setSyncMsg("↑ Add your Asana token in ⚙ Settings, then hit Sync");
      });
    }
  }, []);

  async function loadProgresses(tasks: Task[]) {
    const p: Record<string, number> = {};
    await Promise.all(tasks.map(async t => {
      try { const r = await storageGet("workflow_" + t.gid); if (r) { const d = JSON.parse(r); p[t.gid] = STAGES.filter(s => d.done && d.done[s.id]).length; } else { p[t.gid] = 0; } } catch (_) { p[t.gid] = 0; }
    }));
    setProgresses(p);
  }

  async function updateCategory(gid: string, cat: CategoryKey) {
    const updated = { ...categories, [gid]: cat };
    setCategories(updated);
    try { await storageSet("mossmind_categories", JSON.stringify(updated)); } catch (_) {}
  }

  function handleBack() { setOpenTask(null); loadProgresses(projects); }

  async function startSession(gid: string) {
    const updated = { ...sessions, [gid]: { startedAt: Date.now() } };
    setSessions(updated);
    try { await storageSet('mossmind_sessions', JSON.stringify(updated)); } catch (_) {}
  }

  async function resetSession(gid: string) {
    const updated = { ...sessions };
    delete updated[gid];
    setSessions(updated);
    try { await storageSet('mossmind_sessions', JSON.stringify(updated)); } catch (_) {}
    try { await storageSet('workflow_' + gid, JSON.stringify({ notes: {}, done: {} })); } catch (_) {}
  }

  async function togglePauseSession(gid: string) {
    const s = sessions[gid]; if (!s) return;
    const updated = s.pausedAt
      ? { ...sessions, [gid]: { startedAt: s.startedAt + (Date.now() - s.pausedAt) } }
      : { ...sessions, [gid]: { ...s, pausedAt: Date.now() } };
    setSessions(updated);
    try { await storageSet('mossmind_sessions', JSON.stringify(updated)); } catch (_) {}
  }

  async function saveTodos(updated: TodoItem[]) { setTodos(updated); try { await storageSet("mossmind_todos", JSON.stringify(updated)); } catch (_) {} }
  async function addTodo() {
    if (!newTodoText.trim()) return;
    const item: TodoItem = { id: Date.now().toString(), title: newTodoText.trim(), notes: "", done: false, createdAt: Date.now() };
    setNewTodoText(""); saveTodos([item, ...todos]);
  }
  async function updateTodo(id: string, updates: Partial<TodoItem>) { saveTodos(todos.map(t => t.id === id ? { ...t, ...updates } : t)); }
  async function deleteTodo(id: string) { saveTodos(todos.filter(t => t.id !== id)); }

  async function syncQuickTasks(gid?: string) {
    const sectionGid = gid ?? quickTaskSectionGid;
    if (!sectionGid) return;
    try {
      const asanaTasks = await platformAsana.fetchTasks(sectionGid);
      const incoming: TodoItem[] = asanaTasks
        .filter(t => !t.completed)
        .map(t => ({
          id: t.gid,
          asanaGid: t.gid,
          title: t.name,
          notes: t.notes ?? "",
          done: false,
          createdAt: Date.now(),
        }));
      setTodos(prev => {
        // keep local-only todos, replace/add Asana-sourced ones
        const localOnly = prev.filter(t => !t.asanaGid);
        const merged = [...incoming, ...localOnly];
        storageSet("mossmind_todos", JSON.stringify(merged)).catch(() => {});
        return merged;
      });
    } catch (_) {}
  }

  async function syncTasks(overrideGids?: string[]) {
    setSyncing(true); setSyncMsg(null);
    const gids = Array.isArray(overrideGids) && overrideGids.length > 0
      ? overrideGids
      : Array.isArray(sectionGids) && sectionGids.length > 0
        ? sectionGids
        : DEFAULT_SECTION_GIDS;
    try {
      const tasks = await fetchAsanaTasks(gids);
      if (tasks.length > 0) {
        setProjects(tasks); loadProgresses(tasks);
        await storageSet("mossmind_tasks", JSON.stringify({ projects: tasks, ts: Date.now() }));
        setSyncMsg("✓ Synced " + tasks.length + " tasks");
      } else {
        setSyncMsg("⚠ No incomplete tasks found in that section");
      }
    } catch (e) {
      setSyncMsg("⚠ " + (e instanceof Error ? e.message.slice(0, 80) : String(e)));
    }
    syncQuickTasks();
    setSyncing(false); setTimeout(() => setSyncMsg(null), 5000);
  }

  function byDueDate(a: Task, b: Task) {
    if (!a.due_on && !b.due_on) return 0;
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return a.due_on.localeCompare(b.due_on);
  }
  const allOutside       = projects.filter(p => categories[p.gid] === "factory").sort(byDueDate);
  const allInside        = projects.filter(p => categories[p.gid] === "creative").sort(byDueDate);
  const allUncategorized = projects.filter(p => !categories[p.gid]).sort(byDueDate);

  function renderColumn(icon: React.ReactNode, label: string, items: Task[], targetCat: CategoryKey, muted = false) {
    const isOver = dragGid !== null && dragOverCat === targetCat;
    return (
      <div
        style={{ display: "flex", flexDirection: "column", width: 240, flexShrink: 0, borderRadius: 4, outline: isOver ? `2px solid ${C.coral}` : "2px solid transparent", transition: "outline 0.15s" }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverCat(targetCat); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCat(undefined); }}
        onDrop={e => { e.preventDefault(); const gid = e.dataTransfer.getData("text/plain"); if (gid) updateCategory(gid, targetCat); setDragGid(null); setDragOverCat(undefined); }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, opacity: muted ? 0.5 : 1 }}>
          {icon}
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: C.peach }}>{label}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, minHeight: 100, flex: 1 }}>
          {items.length === 0
            ? <div style={{ border: `2px dashed ${isOver ? C.coral : "rgba(255,255,255,0.2)"}`, borderRadius: 4, height: 100, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.15s" }}>
                <span style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Drop here</span>
              </div>
            : items.map(p => <ProjectCard key={p.gid} task={p} progress={progresses[p.gid] || 0} category={categories[p.gid] || null} onOpen={t => setOpenTask(t)} onCategoryChange={cat => updateCategory(p.gid, cat)} session={sessions[p.gid]} onDragStart={() => setDragGid(p.gid)} onDragEnd={() => { setDragGid(null); setDragOverCat(undefined); }} />)
          }
        </div>
      </div>
    );
  }

  return (
    <div className="graph-bg" style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: FONT, overflow: "hidden" }}>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onSaved={(gids, quickGid) => { setSectionGids(gids); setQuickTaskSectionGid(quickGid); syncTasks(gids); syncQuickTasks(quickGid); }} />}
      {showPrayer && <MorningPrayerLock onUnlock={() => setShowPrayer(false)} />}

      {/* Title bar */}
      <div style={{ background: C.mid, borderBottom: `1px solid rgba(255,255,255,0.08)`, padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 54, flexShrink: 0 }}>
        {/* Traffic light spacer on Mac */}
        <div style={{ width: 60, flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <MossIcon width={42} height={42} style={{ color: C.main, flexShrink: 0 }} />
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 600, color: C.peach, letterSpacing: 0 }}>MossMind</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {syncMsg && <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: syncMsg.startsWith("✓") ? C.green : C.coral }}>{syncMsg}</div>}
          <button onClick={syncTasks} disabled={syncing} style={{ background: "rgba(255,255,255,0.15)", border: b(2, "rgba(255,255,255,0.3)"), borderRadius: 8, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: C.peach, cursor: syncing ? "not-allowed" : "pointer" }}>{syncing ? "Syncing…" : "↻ Sync"}</button>
<button onClick={() => setShowSettings(true)} style={{ background: "rgba(255,255,255,0.1)", border: b(2, "rgba(255,255,255,0.2)"), borderRadius: 8, padding: "6px 12px", fontFamily: FONT, fontSize: 13, color: C.peach, cursor: "pointer" }}>⚙</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Projects panel — visible when a project is open */}
        {openTask && (
          <div style={{ borderRight: "1px solid rgba(255,255,255,0.08)", backgroundColor: C.dark, display: "flex", flexDirection: "column", flexShrink: 0, width: projectsPanelOpen ? 280 : 40, transition: "width 0.2s ease", overflow: "hidden" }}>
            {projectsPanelOpen ? (
              <>
                <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600, color: C.peach }}>Projects</div>
                  <button onClick={() => setProjectsPanelOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}>‹</button>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 0" }}>
                  {[{ label: "Outside", items: allOutside, color: C.coral, icon: <OutsideIcon width={18} height={18} /> }, { label: "Inside", items: allInside, color: C.main, icon: <InsideIcon width={18} height={18} /> }].map(({ label, items, color, icon }) => (
                    items.length === 0 ? null : (
                      <div key={label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 8px", color: "rgba(255,255,255,0.55)" }}>
                          {icon}
                          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: 0 }}>{label}</div>
                        </div>
                        {items.map(p => {
                          const isCurrent = openTask.gid === p.gid;
                          return (
                            <button key={p.gid} onClick={() => setOpenTask(p)}
                              style={{ width: "calc(100% - 20px)", margin: "0 10px 10px", background: isCurrent ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${isCurrent ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 0, padding: 0, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", overflow: "hidden", transition: "background 0.15s, border-color 0.15s", boxShadow: isCurrent ? "0 4px 16px rgba(0,0,0,0.3)" : "none" }}>
                              <div style={{ height: 5, background: color, flexShrink: 0 }} />
                              <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                                <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? C.peach : "rgba(255,255,255,0.6)", lineHeight: 1.35 }}>{p.name}</div>
                                {p.due_on && <div style={{ fontFamily: FONT, fontSize: 10, color: urgColor(p.due_on), fontWeight: 600 }}>{p.due_on}</div>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )
                  ))}
                  {allOutside.length === 0 && allInside.length === 0 && (
                    <div style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingTop: 24 }}>No categorized projects</div>
                  )}
                </div>
              </>
            ) : (
              <button onClick={() => setProjectsPanelOpen(true)}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, gap: 8, color: "rgba(255,255,255,0.3)" }}>
                <span style={{ fontSize: 16 }}>›</span>
                <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.2)", writingMode: "vertical-rl", letterSpacing: 1.5 }}>PROJECTS</div>
              </button>
            )}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
          {(() => {
            const openTodo = openTodoId ? todos.find(t => t.id === openTodoId) ?? null : null;
            if (openTodo) return (
              <TodoDetail item={openTodo} onUpdate={u => updateTodo(openTodo.id, u)} onDelete={() => deleteTodo(openTodo.id)} onBack={() => setOpenTodoId(null)} />
            );
            if (openTask) return (
              categories[openTask.gid] === "factory"
                ? <ProjectDetail task={openTask} category={categories[openTask.gid] || null} onCategoryChange={cat => updateCategory(openTask.gid, cat)} onBack={handleBack} session={sessions[openTask.gid]} onStartSession={() => startSession(openTask.gid)} onTogglePause={() => togglePauseSession(openTask.gid)} onReset={() => resetSession(openTask.gid)} />
                : <FactoryDetail task={openTask} category={categories[openTask.gid] || null} onCategoryChange={cat => updateCategory(openTask.gid, cat)} onBack={handleBack} />
            );
            return (
              <div style={{ padding: "36px 48px", minHeight: "100%" }}>
                {!projects.length ? (
                  <div style={{ textAlign: "center", padding: "80px 40px", opacity: 0.6 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 500, color: C.peach }}>No tasks yet</div>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: C.peach, marginTop: 8, opacity: 0.7 }}>Add your Asana Personal Access Token in ⚙ Settings, then hit Sync</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                      {renderColumn(<OutsideIcon width={44} height={44} style={{ color: C.peach, flexShrink: 0 }} />, "Outside", allOutside, "factory")}
                      {renderColumn(<InsideIcon width={44} height={44} style={{ color: C.peach, flexShrink: 0 }} />, "Inside", allInside, "creative")}
                      {renderColumn(<UncatIcon width={44} height={44} style={{ color: C.peach, flexShrink: 0 }} />, "Uncategorized", allUncategorized, null, true)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Todo panel — always visible on home screen */}
        {!openTask && !openTodoId && (
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.08)", backgroundColor: C.dark, backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "24px 24px", display: "flex", flexDirection: "column", flexShrink: 0, width: todosPanelOpen ? 260 : 40, transition: "width 0.2s ease", overflow: "hidden" }}>
            {todosPanelOpen ? (
              <>
                <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 12, background: C.dark }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: C.peach }}>Quick Tasks</div>
                    <button onClick={() => setTodosPanelOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}>‹</button>
                  </div>
                  <form onSubmit={e => { e.preventDefault(); addTodo(); }} style={{ display: "flex", gap: 8 }}>
                    <input value={newTodoText} onChange={e => setNewTodoText(e.target.value)} placeholder="Add a task…"
                      style={{ flex: 1, fontFamily: "monospace", fontSize: 12, color: C.peach, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, padding: "7px 10px", outline: "none", minWidth: 0 }} />
                    <button type="submit" style={{ background: C.main, color: C.white, border: "none", borderRadius: 0, padding: "7px 12px", fontFamily: FONT, fontSize: 14, fontWeight: 900, cursor: "pointer", flexShrink: 0 }}>+</button>
                  </form>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {todos.filter(t => !t.done).map(t => (
                    <TodoCard key={t.id} item={t} onToggle={e => { e.stopPropagation(); updateTodo(t.id, { done: true }); }} onClose={e => { e.stopPropagation(); deleteTodo(t.id); }} />
                  ))}
                  {todos.filter(t => t.done).length > 0 && (
                    <>
                      <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.2)", letterSpacing: 1.5, paddingTop: 12, paddingBottom: 2 }}>DONE</div>
                      {todos.filter(t => t.done).map(t => (
                        <TodoCard key={t.id} item={t} onToggle={e => { e.stopPropagation(); updateTodo(t.id, { done: false }); }} onClose={e => { e.stopPropagation(); deleteTodo(t.id); }} />
                      ))}
                    </>
                  )}
                  {todos.length === 0 && (
                    <div style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingTop: 32 }}>No tasks yet</div>
                  )}
                </div>
              </>
            ) : (
              <button onClick={() => setTodosPanelOpen(true)}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, gap: 8, color: "rgba(255,255,255,0.3)" }}>
                <span style={{ fontSize: 16 }}>‹</span>
                <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.2)", writingMode: "vertical-rl", letterSpacing: 1.5 }}>QUICK TASKS</div>
                {todos.filter(t => !t.done).length > 0 && (
                  <div style={{ background: C.main, color: C.white, borderRadius: 10, padding: "2px 6px", fontFamily: FONT, fontSize: 10, fontWeight: 800, writingMode: "vertical-rl" }}>
                    {todos.filter(t => !t.done).length}
                  </div>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Prayer FAB */}
      <button onClick={() => setShowPrayer(true)} style={{ position: "fixed", bottom: 28, right: 28, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, zIndex: 50 }}>
        <PrayerIcon width={44} height={44} />
      </button>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Cormorant:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap');
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
        body { margin: 0; overflow: hidden; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        .glass-card {
          position: relative;
        }
        .glass-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: 0.06;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.68' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 160px 160px;
        }
        .graph-bg {
          background-color: #242329;
          background-image: linear-gradient(rgba(36,35,41,0.75), rgba(36,35,41,0.75)), url(${bgPhoto});
          background-size: auto, 40%;
          background-position: center, center;
          background-repeat: no-repeat, repeat;
          background-attachment: local, local;
        }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        [style*="-webkit-app-region: drag"] { -webkit-app-region: drag; }
      `}</style>
    </div>
  );
}
