import { useState, useEffect, useRef } from "react";
import { storage as platformStorage, asana as platformAsana, ai as platformAI, files as platformFiles, isElectron, type AsanaComment, type AsanaTaskDetails } from './lib/platform';
import bgPhoto from './assets/bg2.png';
import PrayerIcon from './assets/icons/prayer.svg?react';
import InsideIcon from './assets/icons/Pot.svg?react';
import OutsideIcon from './assets/icons/Outside.svg?react';
import UncatIcon from './assets/icons/uncat.svg?react';
import MossIcon from './assets/icons/moss.svg?react';
import Sqig1Icon from './assets/icons/Sqig1.svg?react';
import CacIcon from './assets/icons/Cac.svg?react';
import CanIcon from './assets/icons/Can.svg?react';
import InsideRawIcon from './assets/icons/Inside.svg?react';
import LanIcon from './assets/icons/Lan.svg?react';
import LifIcon from './assets/icons/Lif.svg?react';
import MumIcon from './assets/icons/Mum.svg?react';
import Sqig2Icon from './assets/icons/Sqig2.svg?react';
import prayerMusic from './assets/Prayer Motion Music 1.mp3';
import PrayBird1 from './assets/PrayIcon/SVG/Bird1.svg?react';
import PrayBird2 from './assets/PrayIcon/SVG/Bird2.svg?react';
import PrayBird3 from './assets/PrayIcon/SVG/Bird3.svg?react';
import PrayStar1 from './assets/PrayIcon/SVG/Star1.svg?react';
import PrayStar2 from './assets/PrayIcon/SVG/Star2.svg?react';
import PrayStar3 from './assets/PrayIcon/SVG/Star3.svg?react';
import PraySwirl from './assets/PrayIcon/SVG/Swirl.svg?react';

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
      fetchComments: (taskGid: string) => Promise<AsanaComment[]>
      setCompleted: (taskGid: string, completed: boolean) => Promise<void>
      addComment: (taskGid: string, text: string) => Promise<AsanaComment>
      fetchTaskDetails: (taskGid: string) => Promise<AsanaTaskDetails>
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
// Sections that hold quick, time-sensitive approvals — always synced and surfaced
// in a banner above the board regardless of what's checked in Settings.
const QUICK_APPROVAL_SECTIONS: Record<string, string> = {
  "1208321358070309": "To-Do Tagg",
  "1208537148351508": "Art Direction Review",
};

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
// One rounded, friendly sans-serif family for the whole app — headings and body
// alike lean on weight (not a second, sharper display face) for hierarchy, which
// keeps the overall voice calmer and less busy.
const FONT = "'Poppins', system-ui, sans-serif";
const FONT_DISPLAY = "'Poppins', system-ui, sans-serif";
const b = (w = 2, col = C.brown) => `${w}px solid ${col}`;

// Board tokens — the light, restrained-neo-brutalist surface used by the
// main board (header, columns, cards, sidebars). Kept separate from `C`
// (which stays dark/moody for Mind Map, Prayer Field and the stage flow)
// so this redesign doesn't repaint those intentionally atmospheric screens.
// Values are CSS custom properties (see the :root / [data-theme="dark"] rules in
// the global <style> block) so every component using T.* is theme-aware for free.
const T = {
  canvas:       "var(--canvas)",       // warm off-white app canvas
  surface:      "var(--surface)",      // card / panel fill
  surfaceMuted: "var(--surface-muted)",// quiet fill for completed items, recessed panels
  ink:          "var(--ink)",          // primary text — near-black warm ink
  inkMuted:     "var(--ink-muted)",    // secondary text
  border:       "var(--border)",       // soft default border — a warm tint, not ink; definition comes from fills/shadows, not hard lines
  borderMuted:  "var(--border-muted)", // even softer divider line
  outside:      "var(--outside)",      // Outside/factory accent — warm terracotta (fills/icons only — not text-safe)
  inside:       "var(--inside)",       // Inside/creative accent — deep forest green
  uncat:        "var(--uncat)",        // Uncategorized accent — warm stone
  urgent:       "var(--urgent)",       // overdue / due today (text-safe)
  soon:         "var(--soon)",         // due within a week (text-safe)
  focus:        "var(--focus)",        // keyboard focus ring — distinct from all category colors
  radius:       10,    // crisp, structural corners — cards, panels, modals, inputs.
                        // Small on purpose: rounded enough to feel friendly, sharp enough
                        // to read as built, not a generic soft/pill SaaS surface.
  radiusSm:     8,     // buttons/inputs — a confident small rounded rect, not a pill
  slotHeight:   142, // uniform ProjectCard / column-slot height
  // Neo-brutalist elevation — a flat, offset "hard" shadow in the ink color (near-
  // black in light mode, pale cream in dark mode) instead of a soft blur. Paired
  // with a crisp T.border, this is what gives structural surfaces their built,
  // confident feel. Reserved for primary cards/buttons/modals — not everything,
  // so it still reads as hierarchy rather than noise.
  shadowSm: "var(--shadow-sm)",
  shadow:   "var(--shadow-md)",
  shadowLg: "var(--shadow-lg)",
};
const tb = (w = 2, col: string = T.border) => `${w}px solid ${col}`;
// Alpha-tinted color — works with the CSS-variable T.* tokens (a hex-alpha suffix
// like `${T.inside}1f` can't be appended to a var() reference).
const tint = (col: string, pct: number) => `color-mix(in srgb, ${col} ${pct}%, transparent)`;

// Type scale — five confident steps used for anything this design pass touches
// (page/section titles, card titles, labels, body, captions). Existing micro-
// tweaked font sizes elsewhere in the file are left alone rather than churned
// for no visual gain.
const FS = { caption: 11, label: 12, body: 14, title: 20, display: 28 };
// Moss green + water blue accents for the shared background animation (Needs Your
// Approval and the prayer lock) — fixed brand colors, not theme tokens, so they
// read the same in light and dark mode.
const MOSS = "#98C683";
const MOSS_BLUE = "#4F8FA6";

const CATEGORIES = {
  factory:  { label: "Outside", emoji: "⚙️", color: T.outside, text: T.ink },
  creative: { label: "Inside",  emoji: "✦",  color: T.inside,  text: T.ink },
} as const;

type CategoryKey = keyof typeof CATEGORIES | null;

interface Task {
  gid: string
  name: string
  due_on: string | null
  notes: string
  url: string
  sectionGid?: string
  completed?: boolean  // only ever true for a task marked done in-app this session — a
                        // synced task is never completed (the sync itself excludes those)
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
function urgColorLight(due: string | null) { const d = daysLeft(due); return d !== null && d <= 7 ? (d <= 3 ? T.urgent : T.soon) : T.inkMuted; }

// storage helpers
async function storageGet(key: string): Promise<string | null> {
  const v = await platformStorage.get(key);
  return v as string | null;
}
async function storageSet(key: string, value: string): Promise<void> {
  await platformStorage.set(key, value);
}

async function fetchAsanaTasks(sectionGids: string[]): Promise<Task[]> {
  const selected = Array.isArray(sectionGids) ? sectionGids : DEFAULT_SECTION_GIDS;
  // Quick-approval sections are always included, even if not checked in Settings.
  const safeGids = Array.from(new Set([...selected, ...Object.keys(QUICK_APPROVAL_SECTIONS)]));
  const pages = await Promise.all(safeGids.map(async gid => ({ gid, raw: await platformAsana.fetchTasks(gid) })));
  const seen = new Set<string>();
  const tasks: Task[] = [];
  for (const { gid: sectionGid, raw } of pages) {
    for (const t of raw) {
      if (t.completed || seen.has(t.gid)) continue;
      seen.add(t.gid);
      tasks.push({
        gid: t.gid,
        name: t.name || "Untitled",
        due_on: t.due_on || null,
        notes: t.notes || "",
        url: t.permalink_url || `https://app.asana.com/0/0/${t.gid}`,
        sectionGid,
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
    if (isElectron) {
      await storageSet("asana_pat", pat.trim());
      await storageSet("anthropic_key", anthropicKey.trim());
    }
    await storageSet("asana_section_gids", JSON.stringify(selectedGids));
    await storageSet("quick_task_section_gid", quickTaskGid);
    setSaved(true);
    onSaved(selectedGids, quickTaskGid);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(34,32,29,0.55)" }}>
      <div style={{ background: T.surface, border: tb(2.5), boxShadow: T.shadowLg, borderRadius: T.radius, padding: "36px 40px", width: 500, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ fontFamily: FONT, fontSize: FS.display, fontWeight: 900, color: T.ink, marginBottom: 20, paddingBottom: 16, borderBottom: tb(2) }}>Settings</div>

        <div style={{ fontFamily: FONT, fontSize: FS.caption, fontWeight: 900, color: T.inside, letterSpacing: 1.5, marginBottom: 10 }}>CONNECTION</div>
        {isElectron ? (
          <>
            <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: T.inkMuted, textTransform: "none", letterSpacing: 1, marginBottom: 6 }}>Asana Personal Access Token</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input type="password" value={pat} onChange={e => setPat(e.target.value)} placeholder="1/…"
                style={{ flex: 1, fontFamily: FONT, fontSize: 13, border: tb(2), borderRadius: T.radiusSm, padding: "10px 14px", outline: "none", background: T.surfaceMuted, color: T.ink, boxSizing: "border-box" }} />
              <button onClick={loadSections} disabled={!pat.trim() || loadingSections} className="btn-primary"
                style={{ background: T.inside, color: T.surface, borderRadius: T.radiusSm, padding: "10px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: pat.trim() ? "pointer" : "not-allowed", opacity: pat.trim() ? 1 : 0.5, flexShrink: 0 }}>
                {loadingSections ? "Loading…" : "Load Sections"}
              </button>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: T.inkMuted, textTransform: "none", letterSpacing: 1, marginBottom: 6 }}>Anthropic API Key (for AI mind maps)</div>
            <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-…"
              style={{ width: "100%", fontFamily: FONT, fontSize: 13, border: tb(2), borderRadius: T.radiusSm, padding: "10px 14px", outline: "none", background: T.surfaceMuted, color: T.ink, boxSizing: "border-box", marginBottom: 20 }} />
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button onClick={loadSections} disabled={loadingSections} className="btn-primary"
              style={{ background: T.inside, color: T.surface, borderRadius: T.radiusSm, padding: "10px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
              {loadingSections ? "Loading…" : "Load Sections"}
            </button>
          </div>
        )}

        <div style={{ borderTop: tb(1.5, T.borderMuted), margin: "4px 0 16px" }} />
        <div style={{ fontFamily: FONT, fontSize: FS.caption, fontWeight: 900, color: T.inside, letterSpacing: 1.5, marginBottom: 8 }}>
          SECTIONS TO SYNC ({selectedGids.length} selected)
        </div>

        {sectionError && <div style={{ fontFamily: FONT, fontSize: 12, color: T.urgent, marginBottom: 10 }}>{sectionError}</div>}

        {sections.length === 0 && (
          <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted, marginBottom: 16, fontStyle: "italic" }}>
            Enter your token and click "Load Sections" to pick which sections to sync.
          </div>
        )}

        {sections.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {sections.map(sec => {
              const checked = selectedGids.includes(sec.gid);
              return (
                <label key={sec.gid} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: T.radiusSm, background: checked ? tint(T.inside, 14) : T.surfaceMuted, border: "none", transition: "all 0.15s" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSection(sec.gid)} style={{ width: 16, height: 16, accentColor: T.inside, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: checked ? 700 : 500, color: T.ink }}>{sec.name}</span>
                </label>
              );
            })}
          </div>
        )}

        {sections.length > 0 && (
          <>
            <div style={{ borderTop: tb(1.5, T.borderMuted), margin: "4px 0 16px" }} />
            <div style={{ fontFamily: FONT, fontSize: FS.caption, fontWeight: 900, color: T.inside, letterSpacing: 1.5, marginBottom: 8 }}>QUICK TASKS SECTION</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: T.radiusSm, background: !quickTaskGid ? tint(T.inside, 14) : T.surfaceMuted, border: "none" }}>
                <input type="radio" checked={!quickTaskGid} onChange={() => setQuickTaskGid("")} style={{ accentColor: T.inside }} />
                <span style={{ fontFamily: FONT, fontSize: 13, color: T.ink }}>None</span>
              </label>
              {sections.map(sec => (
                <label key={sec.gid} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: T.radiusSm, background: quickTaskGid === sec.gid ? tint(T.inside, 14) : T.surfaceMuted, border: "none" }}>
                  <input type="radio" checked={quickTaskGid === sec.gid} onChange={() => setQuickTaskGid(sec.gid)} style={{ accentColor: T.inside }} />
                  <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: quickTaskGid === sec.gid ? 700 : 500, color: T.ink }}>{sec.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ borderTop: tb(2), margin: "20px 0 20px" }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} className="btn-primary" style={{ flex: 1, background: T.inside, color: T.surface, borderRadius: T.radiusSm, padding: "12px 0", fontFamily: FONT, fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
            {saved ? "✓ Saved!" : "Save"}
          </button>
          <button onClick={onClose} className="btn-secondary" style={{ background: T.surfaceMuted, borderRadius: T.radiusSm, padding: "12px 20px", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: T.inkMuted, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Category Toggle ────────────────────────────────────────────────────────
const CATEGORY_TOGGLE_LABEL: Record<string, string> = { factory: "Outside", creative: "Inside", none: "Incoming" };
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
        const label = CATEGORY_TOGGLE_LABEL[cat ?? "none"];
        const activeColor = cat === "creative" ? T.inside : cat === "factory" ? T.outside : T.uncat;
        return (
          <button key={cat ?? "none"} onClick={e => { e.stopPropagation(); onChange(cat); }} title={`Move to ${label}`} aria-label={`Move to ${label}`} aria-pressed={active}
            style={{ background: active ? `color-mix(in srgb, ${activeColor} 12%, transparent)` : "transparent", border: "none", borderRadius: T.radiusSm, padding: small ? "7px 7px" : "5px 9px", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", color: active ? activeColor : T.inkMuted }}>
            {cat === "creative" ? <InsideIcon width={sz} height={sz} /> : cat === "factory" ? <OutsideIcon width={sz} height={sz} /> : <UncatIcon width={sz} height={sz} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Mind Map ──────────────────────────────────────────────────────────────
type MindNodeType = 'central' | 'vibe' | 'person' | 'visual' | 'nextstep' | 'thought'
interface MindNode { id: string; type: 'text' | 'image'; nodeType?: MindNodeType; icon?: string; filePath?: string; fileName?: string; fileExt?: string; x: number; y: number; w: number; h?: number; text: string; url: string; color?: string }

const ICON_MAP: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  prayer: PrayerIcon, pot: InsideIcon, outside: OutsideIcon, uncat: UncatIcon,
  moss: MossIcon, sqig1: Sqig1Icon, sqig2: Sqig2Icon,
  cac: CacIcon, can: CanIcon, inside: InsideRawIcon,
  lan: LanIcon, lif: LifIcon, mum: MumIcon,
}
interface MindEdge { id: string; from: string; to: string }

const NODE_TYPE_STYLES: Record<MindNodeType, { bg: string; label: string; prefix: string; italic?: boolean }> = {
  central:  { bg: '#657946', label: '',          prefix: ''  },
  vibe:     { bg: '#8A9E6A', label: 'Vibe',      prefix: '✦' },
  person:   { bg: '#C4956A', label: 'Person',    prefix: '◉' },
  visual:   { bg: '#8B7BA8', label: 'Visual',    prefix: '▢' },
  nextstep: { bg: '#B85C4A', label: 'Next Step', prefix: '→' },
  thought:  { bg: '#5B7FA8', label: 'Thought',   prefix: '·' },
}

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
  const [resizing, setResizing] = useState<{ id: string; startW: number; startX: number } | null>(null);
  const [resizingH, setResizingH] = useState<{ id: string; startH: number; startY: number } | null>(null);
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

  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addFileNode() {
    const result = await platformFiles.open()
    if (result) {
      const id = Date.now().toString()
      const isImage = !!result.dataUrl
      const n: MindNode = isImage
        ? { id, type: 'image', x: 80 + Math.random() * 280, y: 80 + Math.random() * 180, w: 200, text: result.fileName, url: result.dataUrl!, filePath: result.filePath, fileName: result.fileName, fileExt: result.ext }
        : { id, type: 'text', x: 80 + Math.random() * 280, y: 80 + Math.random() * 180, w: 180, text: '', url: '', filePath: result.filePath, fileName: result.fileName, fileExt: result.ext }
      const u = [...nodes, n]; setNodes(u); save(u, edges);
    } else {
      fileInputRef.current?.click()
    }
  }

  function handleWebFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const imageExts = ['jpg','jpeg','png','gif','webp','svg']
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const id = Date.now().toString()
      const n: MindNode = imageExts.includes(ext)
        ? { id, type: 'image', x: 80 + Math.random() * 280, y: 80 + Math.random() * 180, w: 200, text: file.name, url: dataUrl, fileName: file.name, fileExt: ext }
        : { id, type: 'text', x: 80 + Math.random() * 280, y: 80 + Math.random() * 180, w: 180, text: '', url: dataUrl, fileName: file.name, fileExt: ext }
      const u = [...nodes, n]; setNodes(u); save(u, edges);
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function addIconNode(iconKey: string) {
    const id = Date.now().toString();
    const n: MindNode = { id, type: 'text', icon: iconKey, x: 80 + Math.random() * 320, y: 80 + Math.random() * 200, w: 90, text: '', url: '', color: C.mid };
    const u = [...nodes, n]; setNodes(u); save(u, edges);
  }

  function addTextNode(nodeType?: MindNodeType) {
    const id = Date.now().toString();
    const style = nodeType ? NODE_TYPE_STYLES[nodeType] : null;
    const n: MindNode = { id, type: 'text', nodeType, x: 60 + Math.random() * 300, y: 60 + Math.random() * 200, w: nodeType === 'nextstep' ? 220 : 160, text: '', url: '', color: style?.bg };
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
      const VALID_NODE_TYPES = new Set<string>(['central', 'vibe', 'person', 'visual', 'nextstep', 'thought']);
      let n = (result.nodes as MindNode[]).map(nd => {
        const raw = (nd.nodeType as string | undefined)?.toLowerCase().replace(/[_\s-]/g, '') ?? '';
        const nodeType = VALID_NODE_TYPES.has(raw) ? raw as MindNodeType : undefined;
        const ntStyle = nodeType ? NODE_TYPE_STYLES[nodeType] : null;
        return { ...nd, nodeType, color: ntStyle ? ntStyle.bg : (nd.color ?? C.mid) };
      });
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
        const scale = Math.min(scaleX, 1); // scale to fit width, never scale up
        const scaledW = contentW * scale;
        const offsetX = (cw - scaledW) / 2 - minX * scale;
        const offsetY = pad - minY * scale; // anchor to top with padding
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
    if (dragging) {
      const scroll = canvasRef.current ? { x: canvasRef.current.scrollLeft, y: canvasRef.current.scrollTop } : { x: 0, y: 0 };
      setNodes(prev => prev.map(n => n.id === dragging.id ? { ...n, x: dragging.ox + (e.clientX - scroll.x) - dragging.mx, y: dragging.oy + (e.clientY - scroll.y) - dragging.my } : n));
    }
    if (resizing) {
      const newW = Math.max(120, resizing.startW + e.clientX - resizing.startX);
      setNodes(prev => prev.map(n => n.id === resizing.id ? { ...n, w: newW } : n));
    }
    if (resizingH) {
      const newH = Math.max(60, resizingH.startH + e.clientY - resizingH.startY);
      setNodes(prev => prev.map(n => n.id === resizingH.id ? { ...n, h: newH } : n));
    }
  }

  function onMU() {
    if (dragging) { save(nodes, edges); setDragging(null); }
    if (resizing) { save(nodes, edges); setResizing(null); }
    if (resizingH) { save(nodes, edges); setResizingH(null); }
  }

  function nc(node: MindNode): [number, number] {
    const h = nodeHeights.current[node.id] || (node.type === 'image' ? 180 : 80);
    return [node.x + node.w / 2, node.y + h / 2];
  }

  const edgeSvg = (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <filter id="wavy-line" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.065" numOctaves="3" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
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
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.inkMuted} strokeWidth={2} filter="url(#wavy-line)" />
            <circle cx={mx} cy={my} r={7} fill={T.surface} stroke={T.inkMuted} strokeWidth={1} style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={() => removeEdge(edge.id)} />
            <text x={mx} y={my + 4} textAnchor="middle" fill={T.inkMuted} fontSize={10} style={{ pointerEvents: 'none' }}>×</text>
          </g>
        );
      })}
    </svg>
  );

  const nextStepNode = nodes.find(n => n.nodeType === 'nextstep' && n.text.trim())

  const nodeEls = nodes.map(node => {
    const isFirst = connecting === node.id;
    const ntStyle = node.nodeType ? NODE_TYPE_STYLES[node.nodeType] : null;
    const cardColor = node.color || (ntStyle?.bg) || C.mid;
    const isNextStep = node.nodeType === 'nextstep';
    const isCentral = node.nodeType === 'central';
    const hasLabel = ntStyle && ntStyle.label;
    return (
      <div key={node.id}
        ref={el => { if (el) nodeHeights.current[node.id] = el.offsetHeight; }}
        className="mind-node"
        style={{ position: 'absolute', left: node.x, top: node.y, width: node.w, zIndex: dragging?.id === node.id ? 100 : 1 }}
        onClick={() => { if (connectMode) handleNodeClick(node.id); }}>

        {node.icon && ICON_MAP[node.icon] ? (() => {
          const IconComp = ICON_MAP[node.icon];
          return (
            <div onMouseDown={e => onMD(e, node.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, cursor: connectMode ? 'crosshair' : 'grab', color: T.ink }}>
              <IconComp width={node.w - 8} height={node.w - 8} style={{ display: 'block' }} />
            </div>
          );
        })() : (
        <div style={{ background: T.surface, borderRadius: T.radius, border: isFirst ? `2.5px solid ${T.focus}` : 'none', boxShadow: isFirst ? `0 0 0 3px ${tint(T.focus, 20)}` : isCentral ? T.shadowLg : isNextStep ? T.shadow : T.shadowSm, transition: 'border-color 0.15s, box-shadow 0.15s', overflow: 'hidden' }}>
          {/* Accent bar + drag handle */}
          <div onMouseDown={e => onMD(e, node.id)}
            style={{ height: isCentral ? 8 : 6, background: cardColor, cursor: connectMode ? 'crosshair' : 'grab', flexShrink: 0 }} />
          {hasLabel && (
            <div onMouseDown={e => onMD(e, node.id)} style={{ padding: '6px 10px 0', cursor: connectMode ? 'crosshair' : 'grab' }}>
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 900, color: T.ink, letterSpacing: 0.8 }}>{ntStyle.prefix} {ntStyle.label}</span>
            </div>
          )}

          {node.fileName && node.type !== 'image' ? (
            // Non-image file (PDF, doc, etc.) — local path (Electron) or dataUrl (web)
            <div onMouseDown={e => e.stopPropagation()} style={{ padding: '12px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>
                  {node.fileExt === 'pdf' ? '📄' : ['mp4','mov','avi'].includes(node.fileExt ?? '') ? '🎬' : ['mp3','wav','aac'].includes(node.fileExt ?? '') ? '🎵' : ['doc','docx'].includes(node.fileExt ?? '') ? '📝' : '📁'}
                </span>
                <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: T.ink, wordBreak: 'break-all', lineHeight: 1.35 }}>{node.fileName}</div>
              </div>
              <button onMouseDown={e => e.stopPropagation()}
                onClick={() => node.filePath ? platformFiles.openPath(node.filePath) : window.open(node.url, '_blank')}
                style={{ background: T.surfaceMuted, border: "none", borderRadius: T.radiusSm, padding: '5px 0', fontFamily: FONT, fontSize: 10, fontWeight: 700, color: T.ink, cursor: 'pointer', width: '100%' }}>
                Open ↗
              </button>
            </div>
          ) : node.type === 'image' ? (
            <div style={{ padding: '6px 6px 6px', position: 'relative' }}>
              <img src={node.url} alt="" style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none', opacity: 0.9 }} onError={e => { (e.target as HTMLImageElement).style.minHeight = '60px'; (e.target as HTMLImageElement).style.background = T.surfaceMuted; }} />
              {node.filePath && (
                <button onMouseDown={e => e.stopPropagation()} onClick={() => platformFiles.openPath(node.filePath!)}
                  style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(34,32,29,0.65)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: T.radiusSm, padding: '3px 8px', fontFamily: FONT, fontSize: 9, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer' }}>
                  Open ↗
                </button>
              )}
              {editingId === node.id
                ? <input autoFocus value={node.text} onChange={e => updateNode(node.id, { text: e.target.value })} onBlur={() => setEditingId(null)} onKeyDown={e => e.key === 'Enter' && setEditingId(null)} onMouseDown={e => e.stopPropagation()} style={{ width: '100%', marginTop: 6, fontFamily: FONT, fontSize: 11, background: 'transparent', border: 'none', borderBottom: `1px solid ${T.borderMuted}`, outline: 'none', color: T.inkMuted, boxSizing: 'border-box' }} />
                : <div onMouseDown={e => { e.stopPropagation(); setEditingId(node.id); }} style={{ marginTop: 6, fontFamily: FONT, fontSize: 11, color: node.text ? T.inkMuted : T.borderMuted, cursor: 'text', minHeight: 14 }}>{node.text || 'caption…'}</div>}
            </div>
          ) : (
            <div style={{ padding: '10px 10px 8px' }}>
              <textarea value={node.text} onChange={e => updateNode(node.id, { text: e.target.value })} placeholder={node.nodeType === 'vibe' ? 'describe the feeling…' : node.nodeType === 'person' ? 'who is this for…' : node.nodeType === 'visual' ? 'color, imagery, texture…' : node.nodeType === 'nextstep' ? 'the one next move…' : 'type here…'}
                onMouseDown={e => e.stopPropagation()}
                style={{ width: '100%', height: node.h ? node.h - 30 : 52, minHeight: isCentral ? 36 : node.nodeType === 'nextstep' ? 44 : 52, fontFamily: FONT, fontSize: isCentral ? 16 : node.nodeType === 'nextstep' ? 14 : 12, fontWeight: isCentral ? 700 : node.nodeType === 'nextstep' ? 800 : 500, fontStyle: node.nodeType === 'vibe' ? 'italic' : 'normal', background: 'transparent', border: 'none', outline: 'none', color: T.ink, resize: 'none', lineHeight: 1.5, boxSizing: 'border-box', display: 'block', cursor: 'text', padding: 0, textAlign: isCentral ? 'center' : 'left' }} />
              <div onMouseDown={e => e.stopPropagation()} style={{ marginTop: 6, position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setColorPickerNode(colorPickerNode === node.id ? null : node.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer' }}>
                  <div style={{ width: 18, height: 18, background: cardColor, borderRadius: '50%', border: "none", boxShadow: T.shadowSm, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 9, color: T.inkMuted }}>▾</span>
                </button>
                {colorPickerNode === node.id && (
                  <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 500, background: T.surface, border: tb(2), borderRadius: 8, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: 4, boxShadow: T.shadowLg }}>
                    {MIND_COLORS.map(col => (
                      <div key={col} onClick={() => { updateNode(node.id, { color: col }); setColorPickerNode(null); }}
                        style={{ width: 14, height: 14, background: col, border: `2px solid ${cardColor === col ? T.ink : 'transparent'}`, cursor: 'pointer', borderRadius: '50%' }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        )}
        {/* Width resize handle */}
        <div onMouseDown={e => { e.stopPropagation(); setResizing({ id: node.id, startW: node.w, startX: e.clientX }); }}
          className="node-resize"
          style={{ position: 'absolute', top: 0, right: -6, width: 12, height: '100%', cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}>
          <div style={{ width: 3, height: 24, background: T.inkMuted, borderRadius: 2 }} />
        </div>
        {/* Height resize handle */}
        <div onMouseDown={e => { e.stopPropagation(); setResizingH({ id: node.id, startH: node.h || nodeHeights.current[node.id] || 80, startY: e.clientY }); }}
          className="node-resize"
          style={{ position: 'absolute', bottom: -6, left: 0, width: '100%', height: 12, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}>
          <div style={{ width: 24, height: 3, background: T.inkMuted, borderRadius: 2 }} />
        </div>
        <button onMouseDown={e => { e.stopPropagation(); removeNode(node.id); }} title="Delete node" aria-label="Delete node"
          className="node-delete"
          style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: T.surface, border: "none", boxShadow: T.shadowSm, color: T.ink, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, opacity: 0, transition: 'opacity 0.15s' }}>×</button>
      </div>
    );
  });

  const toolbar = (
    <div style={{ border: "none", borderBottom: tb(2), background: T.surface, flexShrink: 0, position: "relative", zIndex: 1 }}>
      <div style={{ padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Node type chips */}
        {(['vibe', 'person', 'visual', 'nextstep', 'thought'] as MindNodeType[]).map(nt => {
          const s = NODE_TYPE_STYLES[nt]
          return (
            <button key={nt} onClick={() => addTextNode(nt)} title={`Add a ${s.label} note`}
              style={{ background: s.bg, color: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 20, padding: '5px 13px', fontFamily: FONT, fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.3, transition: 'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              {s.label}
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* + menu */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowAddMenu(v => !v)} title="Add other node" aria-label="Add other node" aria-expanded={showAddMenu}
            style={{ background: showAddMenu ? T.ink : T.surfaceMuted, color: showAddMenu ? T.surface : T.ink, border: "none", borderRadius: 20, width: 30, height: 28, fontFamily: FONT, fontSize: 16, fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>
            +
          </button>
          {showAddMenu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: T.surface, border: tb(2), borderRadius: 10, padding: '4px 0', zIndex: 100, minWidth: 130, boxShadow: T.shadowLg }}>
              {[
                { label: 'Note', action: () => { addTextNode(); setShowAddMenu(false) } },
                { label: 'Icon', action: () => { setShowIconPicker(v => !v); setShowImgInput(false); setShowAddMenu(false) } },
                { label: 'Image URL', action: () => { setShowImgInput(v => !v); setShowIconPicker(false); setShowAddMenu(false) } },
                { label: 'File', action: () => { addFileNode(); setShowAddMenu(false) } },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', padding: '8px 16px', fontFamily: FONT, fontSize: 11, fontWeight: 600, color: T.ink, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.surfaceMuted)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" onChange={handleWebFileSelect} style={{ display: 'none' }} />

        {/* Link toggle */}
        <button onClick={() => { setConnectMode(v => !v); setConnecting(null); setShowAddMenu(false) }} title="Draw a connection between two nodes" aria-pressed={connectMode}
          style={{ background: connectMode ? T.ink : T.surfaceMuted, color: connectMode ? T.surface : T.ink, border: "none", borderRadius: 20, padding: '5px 12px', fontFamily: FONT, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          {connectMode ? (connecting ? '→ pick 2nd' : '→ pick 1st') : '⤢ Link'}
        </button>

        {/* AI generate */}
        <button onClick={generate} disabled={generating} title="Generate mind map nodes from the project brief"
          style={{ background: generating ? T.surfaceMuted : T.inside, color: generating ? T.inkMuted : T.surface, border: 'none', borderRadius: 20, padding: '5px 14px', fontFamily: FONT, fontSize: 10, fontWeight: 700, cursor: generating ? 'default' : 'pointer', transition: 'opacity 0.15s' }}>
          {generating ? 'Generating…' : '✦ AI'}
        </button>
      </div>

      {/* Icon picker */}
      {showIconPicker && (
        <div style={{ padding: '8px 12px 10px', border: "none", display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(ICON_MAP).map(([key, IconComp]) => (
            <button key={key} onClick={() => { addIconNode(key); setShowIconPicker(false); }} title={key} aria-label={`Add ${key} icon`}
              style={{ width: 34, height: 34, background: T.surfaceMuted, border: "none", borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ink, padding: 0, transition: 'background 0.12s' }}
              onMouseEnter={e => (e.currentTarget.style.background = tint(T.ink, 12))}
              onMouseLeave={e => (e.currentTarget.style.background = T.surfaceMuted)}>
              <IconComp width={18} height={18} />
            </button>
          ))}
        </div>
      )}

      {/* Image URL input */}
      {showImgInput && (
        <div style={{ padding: '6px 12px 8px', border: "none", display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addImageNode()} placeholder="Paste image URL…" autoFocus
            style={{ fontFamily: FONT, fontSize: 11, background: T.surfaceMuted, border: tb(1.5), borderRadius: 6, padding: '5px 10px', outline: 'none', color: T.ink, flex: 1 }} />
          <button onClick={addImageNode} style={{ background: T.inside, color: T.surface, border: 'none', borderRadius: 6, padding: '5px 12px', fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button onClick={() => { setShowImgInput(false); setUrlInput(''); }} title="Cancel" aria-label="Cancel" style={{ background: 'transparent', color: T.inkMuted, border: 'none', fontSize: 14, cursor: 'pointer', padding: '0 2px' }}>✕</button>
        </div>
      )}

      {genError && <div style={{ padding: '0 12px 6px', fontFamily: FONT, fontSize: 10, color: T.urgent }}>{genError}</div>}
    </div>
  );

  const canvas = (
    <div ref={canvasRef} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} className="board-canvas"
      style={{ flex: 1, position: 'relative', overflow: 'auto', userSelect: 'none', cursor: connectMode ? 'crosshair' : 'default', minHeight: fullscreen ? undefined : 420 }}>
      <div style={{ position: 'relative', minWidth: 2400, minHeight: 2000 }}>
      {edgeSvg}
      {loaded && nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 14 }}>
          <div style={{ fontFamily: FONT, fontSize: 13, color: T.inkMuted }}>Get it out of your head — vibes, people, next step</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['vibe', 'person', 'nextstep'] as MindNodeType[]).map(nt => (
              <div key={nt} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: T.inkMuted, padding: '3px 8px', borderRadius: 12, background: T.surfaceMuted }}>
                {NODE_TYPE_STYLES[nt].prefix} {NODE_TYPE_STYLES[nt].label}
              </div>
            ))}
          </div>
        </div>
      )}
      {nodeEls}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: fullscreen ? 1 : undefined, border: fullscreen ? "none" : tb(2), boxShadow: fullscreen ? 'none' : T.shadow, borderRadius: fullscreen ? 0 : T.radius, overflow: fullscreen ? 'visible' : 'hidden', marginTop: fullscreen ? 0 : 16 }}>
      {toolbar}
      {nextStepNode && (
        <div style={{ background: NODE_TYPE_STYLES.nextstep.bg, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, flexShrink: 0 }}>NEXT STEP</span>
          <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 800, color: C.white, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextStepNode.text}</span>
        </div>
      )}
      {canvas}
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
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, overflow: "hidden", background: "linear-gradient(150deg, #12151c 0%, #1a212b 50%, #14171d 100%)" }}>
      {/* Same organic moss-green animation as the Needs Your Approval background —
          soft blobs drifting and breathing on independent, uneven cycles */}
      <div className="prayer-moss-blob prayer-moss-blob--a" />
      <div className="prayer-moss-blob prayer-moss-blob--b" />
      <div className="prayer-moss-blob prayer-moss-blob--c" />
      <div className="prayer-moss-blob prayer-moss-blob--d" />
      {/* Vignette so the left-aligned text stays readable */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(15,14,18,0.8) 0%, rgba(15,14,18,0.45) 40%, rgba(15,14,18,0.15) 72%, rgba(15,14,18,0.05) 100%)" }} />

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
              style={{ background: T.surface, color: T.ink, border: "none", borderRadius: T.radius, padding: "16px 52px", fontFamily: FONT, fontSize: 15, fontWeight: 900, cursor: "pointer", animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1)", boxShadow: "0 4px 18px rgba(0,0,0,0.3)" }}>
              Begin Work →
            </button>
          )}
        </div>
      </div>
      {/* Mute button */}
      <button
        onClick={() => { const a = audioRef.current; if (!a) return; a.muted = !a.muted; setMuted(m => !m); }}
        title={muted ? "Unmute prayer music" : "Mute prayer music"}
        style={{ position: "absolute", bottom: 24, right: 24, zIndex: 2, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: T.radiusSm, padding: "8px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", cursor: "pointer" }}>
        {muted ? "♪ Unmute" : "♪ Mute"}
      </button>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        /* Reuses the mossDriftA-D keyframes defined in the main app stylesheet — same
           moss-green (#98c683) motion as the Needs Your Approval background, just
           recolored/sized here for a full-screen dark backdrop instead of a card. */
        .prayer-moss-blob { position: absolute; border-radius: 50%; filter: blur(70px); mix-blend-mode: screen; will-change: transform, opacity; }
        .prayer-moss-blob--a {
          top: -12%; right: -8%; width: 62vw; height: 62vw;
          background: radial-gradient(circle, color-mix(in srgb, ${MOSS} 75%, white 25%) 0%, transparent 68%);
          animation: mossDriftA 27s cubic-bezier(0.37, 0, 0.63, 1) infinite;
        }
        .prayer-moss-blob--b {
          bottom: -18%; right: 6%; width: 46vw; height: 46vw;
          background: radial-gradient(circle, color-mix(in srgb, ${MOSS} 55%, ${MOSS_BLUE} 45%) 0%, transparent 70%);
          animation: mossDriftB 34s ease-in-out infinite;
          animation-delay: -11s;
        }
        .prayer-moss-blob--c {
          top: 30%; right: 22%; width: 34vw; height: 34vw;
          background: radial-gradient(circle, ${MOSS} 0%, transparent 72%);
          animation: mossDriftC 21s ease-in-out infinite;
          animation-delay: -6s;
        }
        .prayer-moss-blob--d {
          bottom: 4%; left: -6%; width: 30vw; height: 30vw;
          background: radial-gradient(circle, color-mix(in srgb, ${MOSS_BLUE} 65%, ${MOSS} 35%) 0%, transparent 70%);
          animation: mossDriftD 24s ease-in-out infinite;
          animation-delay: -14s;
        }
      `}</style>
    </div>
  );
}

// ── Task Detail ───────────────────────────────────────────────────────────
// Every task opens here — just a Brief (Asana description + comments) and a Mind Map.
function TaskDetail({ task, category, onCategoryChange, onBack, onToggleComplete }: { task: Task; category: CategoryKey; onCategoryChange: (c: CategoryKey) => void; onBack: () => void; onToggleComplete: (completed: boolean) => Promise<void> }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"brief" | "mindmap">("brief");
  const [comments, setComments] = useState<AsanaComment[] | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [details, setDetails] = useState<AsanaTaskDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [togglingSubtask, setTogglingSubtask] = useState<string | null>(null);
  const uc = urgColorLight(task.due_on); const ul = urgLabel(task.due_on);
  // A task created with "+ Create" only exists locally (gid "local_...") until Asana
  // task creation is supported — comments/completion can't be pushed anywhere for it.
  const isAsanaTask = !task.gid.startsWith("local_");

  useEffect(() => {
    if (!isAsanaTask) { setComments([]); return; }
    setComments(null); setCommentsError(null);
    platformAsana.fetchComments(task.gid).then(setComments).catch(e => setCommentsError(e instanceof Error ? e.message : String(e)));
  }, [task.gid]);

  useEffect(() => {
    if (!isAsanaTask) { setDetails(null); return; }
    setDetails(null); setDetailsError(null);
    platformAsana.fetchTaskDetails(task.gid).then(setDetails).catch(e => setDetailsError(e instanceof Error ? e.message : String(e)));
  }, [task.gid]);

  async function handleToggleSubtask(subGid: string, completed: boolean) {
    setTogglingSubtask(subGid);
    setDetails(d => d ? { ...d, subtasks: d.subtasks.map(s => s.gid === subGid ? { ...s, completed } : s) } : d);
    try {
      await platformAsana.setCompleted(subGid, completed);
    } catch (e) {
      setDetails(d => d ? { ...d, subtasks: d.subtasks.map(s => s.gid === subGid ? { ...s, completed: !completed } : s) } : d);
      setDetailsError(e instanceof Error ? e.message : String(e));
    }
    setTogglingSubtask(null);
  }

  async function handleToggleComplete() {
    setCompleting(true); setCompleteError(null);
    try { await onToggleComplete(!task.completed); }
    catch (e) { setCompleteError(e instanceof Error ? e.message : String(e)); }
    setCompleting(false);
  }

  async function handlePostComment() {
    const text = replyText.trim();
    if (!text) return;
    setPosting(true); setPostError(null);
    try {
      const comment = await platformAsana.addComment(task.gid, text);
      setComments(prev => [...(prev ?? []), comment]);
      setReplyText("");
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    }
    setPosting(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: T.surface, border: "none", borderBottom: tb(2), padding: isMobile ? "10px 12px" : "14px 24px", flexShrink: 0, display: "flex", alignItems: "center", gap: isMobile ? 8 : 16, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
        <button onClick={onBack} className="btn-secondary" style={{ background: T.surfaceMuted, borderRadius: T.radiusSm, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: T.ink, cursor: "pointer", flexShrink: 0 }}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: isMobile ? 18 : 24, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: task.completed ? "line-through" : "none" }}>{task.name}</div>
            {category === "factory" && <OutsideIcon width={16} height={16} style={{ flexShrink: 0, color: T.outside }} />}
            {category === "creative" && <InsideIcon width={16} height={16} style={{ flexShrink: 0, color: T.inside }} />}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 2, alignItems: "center" }}>
            {task.completed && <div style={{ color: T.inside, background: tint(T.inside, 14), borderRadius: T.radiusSm, padding: "1px 8px", fontFamily: FONT, fontSize: 9, fontWeight: 800 }}>✓ Completed in Asana</div>}
            {task.due_on && <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: T.inkMuted }}>{task.due_on}</div>}
            {ul && <div style={{ color: uc, background: tint(uc, 14), borderRadius: T.radiusSm, padding: "1px 8px", fontFamily: FONT, fontSize: 9, fontWeight: 800 }}>{ul}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <CategoryToggle value={category} onChange={onCategoryChange} size="small" />
          {isAsanaTask && (
            <button onClick={handleToggleComplete} disabled={completing} title={task.completed ? "Reopen in Asana" : "Mark complete in Asana"}
              className={task.completed ? "btn-secondary" : "btn-primary"}
              style={{ background: task.completed ? T.surfaceMuted : T.inside, color: task.completed ? T.inkMuted : T.surface, borderRadius: T.radiusSm, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: completing ? "default" : "pointer", opacity: completing ? 0.6 : 1, flexShrink: 0 }}>
              {completing ? "…" : task.completed ? "↩ Reopen" : "✓ Mark Complete"}
            </button>
          )}
          {task.url && <button onClick={() => window.open(task.url, "_blank", "noopener,noreferrer")} className="btn-secondary" style={{ background: T.surfaceMuted, color: T.ink, borderRadius: T.radiusSm, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{isMobile ? "↗" : "Asana ↗"}</button>}
        </div>
        {completeError && <div style={{ flexBasis: "100%", fontFamily: FONT, fontSize: 11, color: T.urgent }}>⚠ {completeError}</div>}
      </div>

      {/* Brief / Mind Map switcher */}
      <div style={{ background: T.surface, padding: "10px 20px", display: "flex", gap: 8, flexShrink: 0 }}>
        {(["brief", "mindmap"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
            style={{ background: tab === t ? T.ink : T.surfaceMuted, color: tab === t ? T.surface : T.inkMuted, border: "none", borderRadius: T.radiusSm, padding: "6px 16px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            {t === "brief" ? "Brief" : "Mind Map"}
          </button>
        ))}
      </div>

      {tab === "brief" ? (
        <div className="board-canvas" style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: isMobile ? "24px 16px" : "40px 56px", maxWidth: 680, margin: "0 auto" }}>
            <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: T.inkMuted, letterSpacing: 1, marginBottom: 10 }}>DESCRIPTION</div>
            {task.notes ? (
              <div style={{ fontFamily: FONT, fontSize: 14, color: T.ink, lineHeight: 1.8, whiteSpace: "pre-wrap", marginBottom: 36 }}>{task.notes}</div>
            ) : (
              <div style={{ fontFamily: FONT, fontSize: 13, color: T.inkMuted, fontStyle: "italic", marginBottom: 36 }}>No description in Asana yet.</div>
            )}

            {isAsanaTask && (details?.assignee || (details?.customFields.length ?? 0) > 0) && (
              <>
                <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: T.inkMuted, letterSpacing: 1, marginBottom: 10 }}>DETAILS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 36 }}>
                  {details?.assignee && (
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: T.inkMuted, minWidth: 120, flexShrink: 0 }}>Assignee</div>
                      <div style={{ fontFamily: FONT, fontSize: 13, color: T.ink, fontWeight: 600 }}>{details.assignee}</div>
                    </div>
                  )}
                  {details?.customFields.map(f => (
                    <div key={f.gid} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: T.inkMuted, minWidth: 120, flexShrink: 0 }}>{f.name}</div>
                      {/^https?:\/\//.test(f.displayValue) ? (
                        <a href={f.displayValue} target="_blank" rel="noopener noreferrer" style={{ fontFamily: FONT, fontSize: 13, color: T.focus, fontWeight: 600, wordBreak: "break-all" }}>{f.displayValue} ↗</a>
                      ) : (
                        <div style={{ fontFamily: FONT, fontSize: 13, color: T.ink, fontWeight: 600 }}>{f.displayValue}</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {isAsanaTask && details && details.subtasks.length > 0 && (
              <>
                <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: T.inkMuted, letterSpacing: 1, marginBottom: 10 }}>
                  SUBTASKS ({details.subtasks.filter(s => !s.completed).length}/{details.subtasks.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 36 }}>
                  {details.subtasks.map(s => (
                    <div key={s.gid} style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: tb(1.5), borderRadius: T.radiusSm, padding: "9px 12px" }}>
                      <button onClick={() => handleToggleSubtask(s.gid, !s.completed)} disabled={togglingSubtask === s.gid}
                        title={s.completed ? "Mark not done" : "Mark done"} aria-label={s.completed ? "Mark not done" : "Mark done"}
                        style={{ width: 18, height: 18, borderRadius: 3, flexShrink: 0, border: tb(1.5, s.completed ? T.inside : T.inkMuted), background: s.completed ? T.inside : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                        {s.completed && <span style={{ color: T.surface, fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                      </button>
                      <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 500, color: s.completed ? T.inkMuted : T.ink, textDecoration: s.completed ? "line-through" : "none", flex: 1, minWidth: 0 }}>{s.name}</div>
                      {s.due_on && <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: T.inkMuted, flexShrink: 0 }}>{s.due_on}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {isAsanaTask && detailsError && <div style={{ fontFamily: FONT, fontSize: 12, color: T.urgent, marginBottom: 20 }}>⚠ {detailsError}</div>}

            <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: T.inkMuted, letterSpacing: 1, marginBottom: 10 }}>
              COMMENTS{comments && comments.length > 0 ? ` (${comments.length})` : ""}
            </div>
            {commentsError ? (
              <div style={{ fontFamily: FONT, fontSize: 12, color: T.urgent }}>⚠ {commentsError}</div>
            ) : comments === null ? (
              <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted }}>Loading comments…</div>
            ) : comments.length === 0 ? (
              <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted, fontStyle: "italic" }}>No comments yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {comments.map(c => (
                  <div key={c.gid} style={{ background: T.surface, border: tb(1.5), boxShadow: T.shadowSm, borderRadius: T.radiusSm, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: T.ink }}>{c.author || "Someone"}</div>
                      <div style={{ fontFamily: FONT, fontSize: 10, color: T.inkMuted, flexShrink: 0 }}>{new Date(c.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 13, color: T.ink, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{c.text}</div>
                  </div>
                ))}
              </div>
            )}

            {isAsanaTask && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePostComment(); }}
                  placeholder="Add a comment — it's posted to this task in Asana…"
                  style={{ width: "100%", minHeight: 64, fontFamily: FONT, fontSize: 13, color: T.ink, background: T.surface, border: tb(1.5), borderRadius: T.radiusSm, padding: "10px 12px", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={handlePostComment} disabled={!replyText.trim() || posting} className={replyText.trim() ? "btn-primary" : "btn-secondary"}
                    style={{ background: replyText.trim() ? T.inside : T.surfaceMuted, color: replyText.trim() ? T.surface : T.inkMuted, borderRadius: T.radiusSm, padding: "8px 18px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: replyText.trim() && !posting ? "pointer" : "default", opacity: posting ? 0.6 : 1 }}>
                    {posting ? "Posting…" : "Post Comment"}
                  </button>
                  {postError && <div style={{ fontFamily: FONT, fontSize: 11, color: T.urgent }}>⚠ {postError}</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <MindMap taskGid={task.gid} taskName={task.name} taskNotes={task.notes} fullscreen />
      )}
    </div>
  );
}

// ── Project Card ───────────────────────────────────────────────────────────
function ProjectCard({ task, category, onOpen, onCategoryChange, onDragStart, onDragEnd }: { task: Task; category: CategoryKey; onOpen: (t: Task) => void; onCategoryChange: (c: CategoryKey) => void; onDragStart?: () => void; onDragEnd?: () => void }) {
  const due = task.due_on ? new Date(task.due_on + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const ul = urgLabel(task.due_on);
  const uc = urgColorLight(task.due_on);
  return (
    <div className="board-card slot-card" role="button" tabIndex={0} draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.gid); onDragStart?.(); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(task); } }}
      style={{ background: T.surface, border: tb(2), borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden", cursor: "grab", display: "flex", flexDirection: "column", width: "100%", height: T.slotHeight, transition: "transform 0.15s ease, box-shadow 0.15s ease" }}>
      <div style={{ padding: "16px 16px 14px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 700, color: T.ink, lineHeight: 1.3, textAlign: "left", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.name}</div>
        <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {due && <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: T.inkMuted, whiteSpace: "nowrap" }}>{due}</div>}
            {ul && (
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: uc, background: tint(uc, 14), borderRadius: T.radiusSm, padding: "1px 6px", whiteSpace: "nowrap" }}>{ul}</div>
            )}
          </div>
          <CategoryToggle value={category} onChange={onCategoryChange} size="small" />
        </div>
      </div>
    </div>
  );
}

// ── Todo Card ─────────────────────────────────────────────────────────────
function TodoCard({ item, onOpen, onToggle, onClose }: { item: TodoItem; onOpen?: () => void; onToggle: (e: React.MouseEvent) => void; onClose: (e: React.MouseEvent) => void }) {
  return (
    <div className={onOpen ? "board-card" : undefined} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen}
      onKeyDown={e => { if (onOpen && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
      style={{ background: item.done ? T.surfaceMuted : T.surface, border: item.done ? "none" : tb(1.5), boxShadow: item.done ? "none" : T.shadowSm, borderRadius: T.radiusSm, cursor: onOpen ? "pointer" : "default", transition: "box-shadow 0.15s, background 0.15s" }}>
      <div style={{ padding: "9px 10px", display: "flex", alignItems: "flex-start", gap: 9 }}>
        <button onClick={onToggle} title={item.done ? "Mark not done" : "Mark done"} aria-label={item.done ? "Mark not done" : "Mark done"}
          style={{ width: 18, height: 18, borderRadius: 3, flexShrink: 0, marginTop: 2, border: tb(1.5, item.done ? T.inside : T.inkMuted), background: item.done ? T.inside : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", padding: 0 }}>
          {item.done && <span style={{ color: T.surface, fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
        </button>
        <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 500, color: item.done ? T.inkMuted : T.ink, textDecoration: item.done ? "line-through" : "none", flex: 1, minWidth: 0, wordBreak: "break-word" }}>
          {item.title}
        </div>
        <button onClick={onClose} title="Delete this task" aria-label="Delete this task"
          style={{ background: "transparent", border: "none", color: T.inkMuted, fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = T.urgent)}
          onMouseLeave={e => (e.currentTarget.style.color = T.inkMuted)}>✕</button>
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
      <div style={{ background: T.surface, border: "none", borderBottom: tb(2), padding: "14px 24px", flexShrink: 0, display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 1 }}>
        <button onClick={onBack} title="Back to Quick Tasks" className="btn-secondary" style={{ background: T.surfaceMuted, borderRadius: T.radiusSm, padding: "6px 14px", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: T.ink, cursor: "pointer" }}>← Back</button>
        <input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => title.trim() && onUpdate({ title: title.trim() })} onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          style={{ flex: 1, fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: T.ink, background: "transparent", border: "none", outline: "none", minWidth: 0 }} />
        <button onClick={() => onUpdate({ done: !item.done })} className={item.done ? "btn-secondary" : "btn-primary"}
          style={{ background: item.done ? T.surfaceMuted : T.inside, color: item.done ? T.ink : T.surface, borderRadius: T.radiusSm, padding: "6px 16px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          {item.done ? "↩ Reopen" : "✓ Done"}
        </button>
        <button onClick={() => { onDelete(); onBack(); }} title="Delete this task" className="btn-secondary"
          style={{ background: T.surfaceMuted, color: T.inkMuted, borderRadius: T.radiusSm, padding: "6px 14px", fontFamily: FONT, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
          Delete
        </button>
      </div>
      <div className="board-canvas" style={{ flex: 1, overflowY: "auto", padding: "48px 64px" }}>
        <textarea value={notes} onChange={e => { setNotes(e.target.value); onUpdate({ notes: e.target.value }); }}
          placeholder="Add notes…"
          style={{ width: "100%", maxWidth: 560, minHeight: 200, fontFamily: FONT, fontSize: 14, color: T.ink, background: T.surface, border: tb(2), boxShadow: T.shadowSm, borderRadius: T.radius, padding: "14px 16px", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.8, display: "block" }} />
      </div>
    </div>
  );
}

// ── Create Project Modal ───────────────────────────────────────────────────
function CreateProjectModal({ onClose, onCreate, initialCategory = null }: { onClose: () => void; onCreate: (task: Task, cat: CategoryKey) => void; initialCategory?: CategoryKey }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cat, setCat] = useState<CategoryKey>(initialCategory);

  function handleCreate() {
    if (!name.trim()) return;
    const task: Task = {
      gid: "local_" + Date.now(),
      name: name.trim(),
      due_on: null,
      notes: description.trim(),
      url: "",
    };
    onCreate(task, cat);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(34,32,29,0.55)" }} onClick={onClose}>
      <div style={{ background: T.surface, border: tb(2.5), boxShadow: T.shadowLg, borderRadius: T.radius, width: 480, maxWidth: "90vw", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: T.surfaceMuted, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: T.ink }}>New Project</div>
          <button onClick={onClose} title="Close" aria-label="Close" style={{ background: "none", border: "none", color: T.inkMuted, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: T.inkMuted, letterSpacing: 1.2 }}>PROJECT NAME</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} placeholder="Name your project…"
              style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 500, color: T.ink, background: T.surfaceMuted, border: tb(2), borderRadius: T.radiusSm, padding: "10px 14px", outline: "none", width: "100%", boxSizing: "border-box" }} />
          </div>

          {/* Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: T.inkMuted, letterSpacing: 1.2 }}>DESCRIPTION</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this project about…"
              style={{ fontFamily: FONT, fontSize: 13, color: T.ink, background: T.surfaceMuted, border: tb(2), borderRadius: T.radiusSm, padding: "10px 14px", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 90, lineHeight: 1.7 }} />
          </div>

          {/* Category */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: T.inkMuted, letterSpacing: 1.2 }}>CATEGORY</label>
            <div style={{ display: "flex", gap: 10 }}>
              {([["factory", "Outside", T.outside], ["creative", "Inside", T.inside], [null, "Incoming", T.uncat]] as [CategoryKey, string, string][]).map(([key, label, color]) => {
                const isSelected = cat === key;
                return (
                  <button key={String(key)} onClick={() => setCat(key)} aria-pressed={isSelected}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 10px", background: isSelected ? tint(color, 16) : T.surfaceMuted, border: "none", boxShadow: isSelected ? `inset 0 0 0 2px ${color}` : "none", borderRadius: T.radiusSm, cursor: "pointer", transition: "box-shadow 0.15s, background 0.15s" }}>
                    <div style={{ color: isSelected ? color : T.inkMuted, display: "flex" }}>
                      {key === "factory" ? <OutsideIcon width={28} height={28} /> : key === "creative" ? <InsideIcon width={28} height={28} /> : <UncatIcon width={28} height={28} />}
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: isSelected ? T.ink : T.inkMuted }}>{label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} className="btn-secondary" style={{ background: T.surfaceMuted, color: T.inkMuted, borderRadius: T.radiusSm, padding: "10px 20px", fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleCreate} disabled={!name.trim()} className={name.trim() ? "btn-primary" : "btn-secondary"}
            style={{ background: name.trim() ? T.inside : T.surfaceMuted, color: name.trim() ? T.surface : T.inkMuted, borderRadius: T.radiusSm, padding: "10px 24px", fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: name.trim() ? "pointer" : "default", transition: "background 0.15s" }}>
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mobile detection ──────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [projects, setProjects]     = useState<Task[]>([]);
  const [openTask, setOpenTask]     = useState<Task | null>(null);
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState<string | null>(null);
  const [categories, setCategories] = useState<Record<string, CategoryKey>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showPrayer, setShowPrayer] = useState(false);
  const [sectionGids, setSectionGids] = useState<string[]>(DEFAULT_SECTION_GIDS);
  const [quickTaskSectionGid, setQuickTaskSectionGid] = useState<string>("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [openTodoId, setOpenTodoId] = useState<string | null>(null);
  const [newTodoText, setNewTodoText] = useState("");
  const [todosPanelOpen, setTodosPanelOpen] = useState(true);
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false);
  const [dragGid, setDragGid] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<CategoryKey | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [createCategory, setCreateCategory] = useState<CategoryKey>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const hasFetched = useRef(false);
  const syncInFlight = useRef(false);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'create' | 'tasks' | 'prayer' | null>(null);
  const [mobileCreateName, setMobileCreateName] = useState('');

  useEffect(() => {
    storageGet("theme").then(v => { if (v === "dark" || v === "light") setTheme(v); }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    storageSet("theme", next).catch(() => {});
  }

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      Promise.all([
        storageGet("mossmind_tasks").catch(() => null),
        storageGet("mossmind_categories").catch(() => null),
        storageGet("asana_section_gids").catch(() => null),
        storageGet("mossmind_todos").catch(() => null),
        storageGet("quick_task_section_gid").catch(() => null),
      ]).then(([tasksRes, catsRes, sectionsRes, todosRes, quickGidRes]) => {
        if (catsRes) { try { setCategories(JSON.parse(catsRes)); } catch (_) {} }
        if (sectionsRes) { try { const parsed = typeof sectionsRes === "string" ? JSON.parse(sectionsRes) : sectionsRes; if (Array.isArray(parsed)) setSectionGids(parsed); } catch (_) {} }
        if (todosRes) { try { setTodos(JSON.parse(todosRes)); } catch (_) {} }
        if (quickGidRes) setQuickTaskSectionGid(quickGidRes as string);
        if (tasksRes) {
          try {
            const c = JSON.parse(tasksRes);
            if (Date.now() - c.ts < 30 * 60 * 1000 && c.projects?.length) { setProjects(c.projects); if (quickGidRes) syncQuickTasks(quickGidRes as string); return; }
          } catch (_) {}
        }
        // No cached tasks yet — prompt to sync
        setSyncMsg("↑ Add your Asana token in ⚙ Settings, then hit Sync");
      });
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => { syncTasks(); }, 60000);
    return () => clearInterval(id);
  }, [sectionGids, quickTaskSectionGid]);

  async function createProject(task: Task, cat: CategoryKey) {
    const updated = [task, ...projects];
    setProjects(updated);
    await storageSet("mossmind_tasks", JSON.stringify({ projects: updated, ts: Date.now() }));
    if (cat) {
      const updatedCats = { ...categories, [task.gid]: cat };
      setCategories(updatedCats);
      await storageSet("mossmind_categories", JSON.stringify(updatedCats));
    }
  }

  async function updateCategory(gid: string, cat: CategoryKey) {
    const updated = { ...categories, [gid]: cat };
    setCategories(updated);
    try { await storageSet("mossmind_categories", JSON.stringify(updated)); } catch (_) {}
  }

  // Marks a task complete/reopened both locally and in Asana itself. Optimistic —
  // reverts and rethrows on failure so the caller can surface the error.
  async function setTaskCompleted(gid: string, completed: boolean) {
    const prevProjects = projects;
    const updated = projects.map(p => p.gid === gid ? { ...p, completed } : p);
    setProjects(updated);
    await storageSet("mossmind_tasks", JSON.stringify({ projects: updated, ts: Date.now() }));
    try {
      await platformAsana.setCompleted(gid, completed);
    } catch (e) {
      setProjects(prevProjects);
      await storageSet("mossmind_tasks", JSON.stringify({ projects: prevProjects, ts: Date.now() }));
      throw e;
    }
  }

  function handleBack() { setOpenTask(null); }

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
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true); setSyncMsg(null);
    const gids = Array.isArray(overrideGids) && overrideGids.length > 0
      ? overrideGids
      : Array.isArray(sectionGids) && sectionGids.length > 0
        ? sectionGids
        : DEFAULT_SECTION_GIDS;
    try {
      const tasks = await fetchAsanaTasks(gids);
      if (tasks.length > 0) {
        setProjects(tasks);
        await storageSet("mossmind_tasks", JSON.stringify({ projects: tasks, ts: Date.now() }));
        setSyncMsg("✓ Synced " + tasks.length + " tasks");
      } else {
        setSyncMsg("⚠ No incomplete tasks found in that section");
      }
    } catch (e) {
      setSyncMsg("⚠ " + (e instanceof Error ? e.message.slice(0, 80) : String(e)));
    }
    syncQuickTasks();
    syncInFlight.current = false;
    setSyncing(false); setTimeout(() => setSyncMsg(null), 5000);
  }

  function byDueDate(a: Task, b: Task) {
    if (!a.due_on && !b.due_on) return 0;
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return a.due_on.localeCompare(b.due_on);
  }
  const openProjects     = projects.filter(p => !p.completed);
  const allOutside       = openProjects.filter(p => categories[p.gid] === "factory").sort(byDueDate);
  const allInside        = openProjects.filter(p => categories[p.gid] === "creative").sort(byDueDate);
  const allUncategorized = openProjects.filter(p => !categories[p.gid]).sort(byDueDate);
  const quickApprovals   = openProjects.filter(p => p.sectionGid && QUICK_APPROVAL_SECTIONS[p.sectionGid]).sort(byDueDate);
  const hasUrgentApproval = quickApprovals.some(p => { const d = daysLeft(p.due_on); return d !== null && d <= 3; });

  const EMPTY_SLOTS = 2;
  function renderColumn(icon: React.ReactNode, label: string, items: Task[], targetCat: CategoryKey, accentColor: string) {
    const isOver = dragGid !== null && dragOverCat === targetCat;
    return (
      <div
        style={{ display: "flex", flexDirection: "column", width: 256, flexShrink: 0, borderRadius: T.radius, outline: isOver ? `2px solid ${accentColor}` : "2px solid transparent", outlineOffset: 4, transition: "outline-color 0.15s" }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverCat(targetCat); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCat(undefined); }}
        onDrop={e => { e.preventDefault(); const gid = e.dataTransfer.getData("text/plain"); if (gid) updateCategory(gid, targetCat); setDragGid(null); setDragOverCat(undefined); }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, paddingBottom: 12, borderBottom: `2.5px solid ${accentColor}` }}>
          {icon}
          <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: T.ink, flex: 1 }}>{label}</div>
          <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: accentColor, background: tint(accentColor, 16), border: "none", borderRadius: 999, padding: "3px 11px", minWidth: 20, textAlign: "center" }}>{items.length}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 100, flex: 1, paddingTop: 16 }}>
          {items.map(p => <ProjectCard key={p.gid} task={p} category={categories[p.gid] || null} onOpen={t => setOpenTask(t)} onCategoryChange={cat => updateCategory(p.gid, cat)} onDragStart={() => setDragGid(p.gid)} onDragEnd={() => { setDragGid(null); setDragOverCat(undefined); }} />)}
          {Array.from({ length: EMPTY_SLOTS }).map((_, i) => {
            const active = isOver && i === 0;
            return (
              <button key={i} onClick={() => { setCreateCategory(targetCat); setShowCreate(true); }}
                className={active ? "slot-empty--active" : undefined}
                style={{ '--slot-accent': accentColor, height: T.slotHeight, flexShrink: 0, border: `2px dashed ${active ? accentColor : T.borderMuted}`, borderRadius: T.radius, background: T.surfaceMuted, transition: "border-color 0.15s, background 0.15s", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 0 } as React.CSSProperties}
                onMouseEnter={e => (e.currentTarget.style.background = tint(accentColor, 10))}
                onMouseLeave={e => (e.currentTarget.style.background = T.surfaceMuted)}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${T.inkMuted}`, color: T.inkMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1, flexShrink: 0 }}>+</span>
                <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: T.inkMuted }}>Add a task</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="board-canvas" style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: FONT, overflow: "hidden" }}>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onSaved={(gids, quickGid) => { setSectionGids(gids); setQuickTaskSectionGid(quickGid); syncTasks(gids); syncQuickTasks(quickGid); }} />}
      {showPrayer && <MorningPrayerLock onUnlock={() => setShowPrayer(false)} />}
      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={createProject} initialCategory={createCategory} />}

      {/* Title bar */}
      <div style={{ background: T.surface, borderBottom: tb(2), padding: "0 12px", display: "flex", alignItems: "center", gap: isMobile ? 8 : 16, height: 54, flexShrink: 0, minWidth: 0, overflow: "hidden", position: "relative", zIndex: 1 }}>
        {/* Traffic light spacer on Mac — skip on mobile */}
        {!isMobile && <div style={{ width: 60, flexShrink: 0 }} />}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, minWidth: 0 }}>
          <MossIcon width={isMobile ? 28 : 42} height={isMobile ? 28 : 42} style={{ color: T.inside, flexShrink: 0 }} />
          {!isMobile && <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 600, color: T.ink, letterSpacing: 0 }}>MossMind</div>}
        </div>
        {!isMobile && <button onClick={() => { setCreateCategory(null); setShowCreate(true); }} className="btn-primary" style={{ background: T.inside, borderRadius: T.radiusSm, padding: "7px 16px", fontFamily: FONT, fontSize: 12, fontWeight: 800, color: T.surface, cursor: "pointer", letterSpacing: 0.3, flexShrink: 0 }}>+ Create</button>}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {syncMsg && !isMobile && <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: syncMsg.startsWith("✓") ? T.inside : T.urgent }}>{syncMsg}</div>}
          <button onClick={() => syncTasks()} disabled={syncing} title="Sync tasks from Asana" aria-label="Sync tasks from Asana" className="btn-secondary" style={{ background: T.surfaceMuted, borderRadius: T.radiusSm, padding: isMobile ? "10px" : "6px 14px", fontFamily: FONT, fontSize: isMobile ? 16 : 12, fontWeight: 800, color: T.ink, cursor: syncing ? "not-allowed" : "pointer", lineHeight: 1, opacity: syncing ? 0.5 : 1 }}>{syncing ? "…" : "↻"}{!isMobile && (syncing ? " Syncing" : " Sync")}</button>
          <button onClick={toggleTheme} title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} className="btn-secondary" style={{ background: T.surfaceMuted, borderRadius: T.radiusSm, padding: isMobile ? "10px" : "6px 12px", fontFamily: FONT, fontSize: 13, color: T.ink, cursor: "pointer", lineHeight: 1 }}>{theme === "light" ? "☾" : "☀"}</button>
          <button onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings" className="btn-secondary" style={{ background: T.surfaceMuted, borderRadius: T.radiusSm, padding: isMobile ? "10px" : "6px 12px", fontFamily: FONT, fontSize: 13, color: T.ink, cursor: "pointer", lineHeight: 1 }}>⚙</button>
        </div>
      </div>

      {/* Pinned approvals reminder — shown on every page except the board itself, which already has the full banner. Same moss animation as that banner. */}
      {(openTask || openTodoId) && quickApprovals.length > 0 && (
        <div style={{ position: "relative", overflow: "hidden", flexShrink: 0, borderBottom: tb(2) }}>
          <div className={`moss-bg${hasUrgentApproval ? " moss-bg--urgent" : ""}`}>
            <div className="moss-blob moss-blob--a" />
            <div className="moss-blob moss-blob--b" />
            <div className="moss-blob moss-blob--c" />
            <div className="moss-blob moss-blob--d" />
          </div>
          <div style={{ position: "relative", zIndex: 1, padding: "7px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>⚡</span>
            <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}>
              {quickApprovals.length} task{quickApprovals.length === 1 ? "" : "s"} waiting on your approval
            </div>
            <button onClick={() => { setOpenTask(null); setOpenTodoId(null); }} className="btn-primary"
              style={{ background: T.inside, color: T.surface, borderRadius: T.radiusSm, padding: "4px 12px", fontFamily: FONT, fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
              View →
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {isMobile && !openTask && !openTodoId ? (
          <>
            {/* ── Mobile: individual left tabs ── */}
            <div style={{ width: 56, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", paddingTop: 16, gap: 10, zIndex: 10 }}>
              {(["create", "tasks", "prayer"] as const).map(tab => {
                const active = mobileTab === tab;
                return (
                  <button key={tab} onClick={() => setMobileTab(p => p === tab ? null : tab)} title={tab === "create" ? "New project" : tab === "tasks" ? "Quick Tasks" : "Prayer"}
                    style={{ width: 52, height: 58, background: active ? T.ink : T.surfaceMuted, border: "none", boxShadow: active ? T.shadowSm : "none", borderRadius: `${T.radius}px 0 0 ${T.radius}px`, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: active ? T.surface : T.inkMuted, transition: "background 0.15s, color 0.15s" }}>
                    {tab === "prayer" ? <PrayerIcon width={18} height={18} /> : tab === "create" ? <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> : <span style={{ fontSize: 14 }}>☑</span>}
                    <span style={{ fontFamily: FONT, fontSize: 8, fontWeight: 800, letterSpacing: 0.4 }}>{tab === "create" ? "Create" : tab === "tasks" ? "Tasks" : "Prayer"}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Mobile: panel + cards ── */}
            <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
              {/* Sliding panel */}
              <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 5, pointerEvents: mobileTab ? "auto" : "none" }}>
                <div style={{ position: "absolute", inset: 0, background: T.canvas, transform: mobileTab ? "translateX(0)" : "translateX(100%)", transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  {/* Panel header */}
                  <div style={{ background: T.surface, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: T.shadowSm, flexShrink: 0, position: "relative", zIndex: 1 }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: T.ink }}>
                      {mobileTab === "create" ? "New Project" : mobileTab === "tasks" ? "Quick Tasks" : "Prayer"}
                    </div>
                    <button onClick={() => setMobileTab(null)} title="Close" aria-label="Close" style={{ background: "none", border: "none", color: T.inkMuted, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>
                  </div>

                  {/* Create panel */}
                  {mobileTab === "create" && (
                    <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                      <input autoFocus value={mobileCreateName} onChange={e => setMobileCreateName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && mobileCreateName.trim()) { createProject({ gid: "local_" + Date.now(), name: mobileCreateName.trim(), due_on: null, notes: "", url: "" }, null); setMobileCreateName(""); setMobileTab(null); } }}
                        placeholder="Project name…"
                        style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 500, color: T.ink, background: T.surfaceMuted, border: tb(2), borderRadius: T.radiusSm, padding: "12px 14px", outline: "none", width: "100%", boxSizing: "border-box" }} />
                      <button onClick={() => { if (!mobileCreateName.trim()) return; createProject({ gid: "local_" + Date.now(), name: mobileCreateName.trim(), due_on: null, notes: "", url: "" }, null); setMobileCreateName(""); setMobileTab(null); }} disabled={!mobileCreateName.trim()}
                        className={mobileCreateName.trim() ? "btn-primary" : "btn-secondary"}
                        style={{ background: mobileCreateName.trim() ? T.inside : T.surfaceMuted, color: mobileCreateName.trim() ? T.surface : T.inkMuted, borderRadius: T.radiusSm, padding: "12px 0", fontFamily: FONT, fontSize: 13, fontWeight: 800, cursor: mobileCreateName.trim() ? "pointer" : "default", width: "100%" }}>
                        Create Project
                      </button>
                    </div>
                  )}

                  {/* Tasks panel */}
                  {mobileTab === "tasks" && (
                    <>
                      <div style={{ padding: "16px 20px", flexShrink: 0 }}>
                        <form onSubmit={e => { e.preventDefault(); addTodo(); }} style={{ display: "flex", gap: 8 }}>
                          <input value={newTodoText} onChange={e => setNewTodoText(e.target.value)} placeholder="Add a task…"
                            style={{ flex: 1, fontFamily: FONT, fontSize: 13, color: T.ink, background: T.surfaceMuted, border: tb(1.5), borderRadius: T.radiusSm, padding: "9px 12px", outline: "none", minWidth: 0 }} />
                          <button type="submit" title="Add task" aria-label="Add task" className="btn-primary" style={{ background: T.inside, color: T.surface, borderRadius: T.radiusSm, padding: "9px 14px", fontFamily: FONT, fontSize: 16, fontWeight: 900, cursor: "pointer", flexShrink: 0 }}>+</button>
                        </form>
                      </div>
                      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {todos.filter(t => !t.done).map(t => (
                          <TodoCard key={t.id} item={t} onToggle={e => { e.stopPropagation(); updateTodo(t.id, { done: true }); }} onClose={e => { e.stopPropagation(); deleteTodo(t.id); }} />
                        ))}
                        {todos.filter(t => t.done).length > 0 && (
                          <>
                            <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: T.inkMuted, letterSpacing: 1.5, paddingTop: 10, paddingBottom: 2 }}>DONE</div>
                            {todos.filter(t => t.done).map(t => (
                              <TodoCard key={t.id} item={t} onToggle={e => { e.stopPropagation(); updateTodo(t.id, { done: false }); }} onClose={e => { e.stopPropagation(); deleteTodo(t.id); }} />
                            ))}
                          </>
                        )}
                        {todos.length === 0 && <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted, textAlign: "center", paddingTop: 32 }}>No tasks yet</div>}
                      </div>
                    </>
                  )}

                  {/* Prayer panel */}
                  {mobileTab === "prayer" && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 28px", textAlign: "center", gap: 24, flex: 1 }}>
                      <PrayerIcon width={52} height={52} style={{ color: T.ink, opacity: 0.8 }} />
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600, color: T.ink, lineHeight: 1.3 }}>Open the Door</div>
                      <div style={{ width: 32, height: 2, background: T.inside }} />
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontStyle: "italic", color: T.inkMuted, lineHeight: 1.7 }}>
                        "Behold, I stand at the door and knock."
                        <div style={{ fontFamily: FONT, fontSize: 11, fontStyle: "normal", fontWeight: 700, marginTop: 4 }}>Rev 3:20</div>
                      </div>
                      <button onClick={() => { setMobileTab(null); setShowPrayer(true); }} className="btn-primary"
                        style={{ background: T.inside, color: T.surface, borderRadius: T.radiusSm, padding: "14px 0", fontFamily: FONT, fontSize: 14, fontWeight: 800, cursor: "pointer", width: "100%", marginTop: 8 }}>
                        Begin Prayer →
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Cards column — single column, grouped by category so the same
                  Outside/Inside/Incoming buckets from the desktop board are still
                  visible at a glance instead of one undifferentiated chronological list. */}
              <div style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20 }}>
                {projects.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🌿</div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 500, color: T.ink }}>No tasks yet</div>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted, marginTop: 8 }}>Add your Asana token in ⚙ Settings, then Sync</div>
                  </div>
                ) : (
                  [
                    { label: "Outside", items: allOutside, color: T.outside, icon: <OutsideIcon width={18} height={18} /> },
                    { label: "Inside", items: allInside, color: T.inside, icon: <InsideIcon width={18} height={18} /> },
                    { label: "Incoming", items: allUncategorized, color: T.uncat, icon: <UncatIcon width={18} height={18} /> },
                  ].map(({ label, items, color, icon }) => items.length === 0 ? null : (
                    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6, borderBottom: `2.5px solid ${color}` }}>
                        <span style={{ color, display: "flex" }}>{icon}</span>
                        <div style={{ fontFamily: FONT, fontSize: FS.body, fontWeight: 800, color: T.ink, flex: 1 }}>{label}</div>
                        <div style={{ fontFamily: FONT, fontSize: FS.caption, fontWeight: 800, color, background: tint(color, 16), borderRadius: 999, padding: "2px 9px", minWidth: 18, textAlign: "center" }}>{items.length}</div>
                      </div>
                      {items.map(p => (
                        <ProjectCard key={p.gid} task={p} category={categories[p.gid] || null} onOpen={t => setOpenTask(t)} onCategoryChange={cat => updateCategory(p.gid, cat)} />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Projects panel — visible when a project is open */}
            {openTask && (
              <div style={{ border: "none", borderRight: tb(2), backgroundColor: T.surfaceMuted, display: "flex", flexDirection: "column", flexShrink: 0, width: projectsPanelOpen ? 280 : 40, transition: "width 0.2s ease", overflow: "hidden", position: "relative", zIndex: 1 }}>
                {projectsPanelOpen ? (
                  <>
                    <div style={{ padding: "16px 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600, color: T.ink }}>Projects</div>
                      <button onClick={() => setProjectsPanelOpen(false)} title="Collapse" aria-label="Collapse projects panel" style={{ background: "none", border: "none", color: T.inkMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px" }}>‹</button>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 0" }}>
                      {[{ label: "Outside", items: allOutside, color: T.outside, icon: <OutsideIcon width={18} height={18} /> }, { label: "Inside", items: allInside, color: T.inside, icon: <InsideIcon width={18} height={18} /> }].map(({ label, items, color, icon }) => (
                        items.length === 0 ? null : (
                          <div key={label} style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 8px", color: T.inkMuted }}>
                              {icon}
                              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600, color: T.ink, letterSpacing: 0 }}>{label}</div>
                            </div>
                            {items.map(p => {
                              const isCurrent = openTask.gid === p.gid;
                              return (
                                <button key={p.gid} onClick={() => setOpenTask(p)}
                                  style={{ width: "calc(100% - 20px)", margin: "0 10px 10px", background: T.surface, border: tb(isCurrent ? 2.5 : 1.5, isCurrent ? T.ink : T.border), boxShadow: T.shadowSm, borderRadius: T.radiusSm, padding: 0, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", overflow: "hidden", transition: "box-shadow 0.15s, border-color 0.15s" }}>
                                  <div style={{ height: 5, background: color, flexShrink: 0 }} />
                                  <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                                    <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: T.ink, lineHeight: 1.35 }}>{p.name}</div>
                                    {p.due_on && <div style={{ fontFamily: FONT, fontSize: 10, color: urgColorLight(p.due_on), fontWeight: 600 }}>{p.due_on}</div>}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )
                      ))}
                      {allOutside.length === 0 && allInside.length === 0 && (
                        <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted, textAlign: "center", paddingTop: 24 }}>No categorized projects</div>
                      )}
                    </div>
                  </>
                ) : (
                  <button onClick={() => setProjectsPanelOpen(true)} title="Expand projects panel" aria-label="Expand projects panel"
                    style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, gap: 8, color: T.inkMuted }}>
                    <span style={{ fontSize: 16 }}>›</span>
                    <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: T.inkMuted, writingMode: "vertical-rl", letterSpacing: 1.5 }}>PROJECTS</div>
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
                  <TaskDetail task={openTask} category={categories[openTask.gid] || null} onCategoryChange={cat => updateCategory(openTask.gid, cat)} onBack={handleBack}
                    onToggleComplete={async completed => { await setTaskCompleted(openTask.gid, completed); setOpenTask(t => t ? { ...t, completed } : t); }} />
                );
                return (
                  <div style={{ padding: "32px 48px", minHeight: "100%" }}>
                    {!projects.length ? (
                      <div style={{ textAlign: "center", padding: "80px 40px" }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
                        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 500, color: T.ink }}>No tasks yet</div>
                        <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted, marginTop: 8 }}>Add your Asana Personal Access Token in ⚙ Settings, then hit Sync</div>
                      </div>
                    ) : (
                      <>
                        {quickApprovals.length > 0 && (
                          // maxWidth matches the 3 columns below: 256px each + 28px gaps (256*3 + 28*2)
                          <div style={{ position: "relative", overflow: "hidden", border: tb(2), boxShadow: T.shadow, borderRadius: T.radius, padding: "16px 20px 20px", marginBottom: 32, maxWidth: 824, marginLeft: "auto", marginRight: "auto" }}>
                            <div className={`moss-bg${hasUrgentApproval ? " moss-bg--urgent" : ""}`}>
                              <div className="moss-blob moss-blob--a" />
                              <div className="moss-blob moss-blob--b" />
                              <div className="moss-blob moss-blob--c" />
                              <div className="moss-blob moss-blob--d" />
                            </div>
                            <div style={{ position: "relative", zIndex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                <span style={{ fontSize: 20, lineHeight: 1 }}>⚡</span>
                                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: T.ink, flex: 1 }}>Needs Your Approval</div>
                                <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: T.surface, background: T.soon, borderRadius: 10, padding: "2px 10px", minWidth: 22, textAlign: "center" }}>{quickApprovals.length}</div>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                                {quickApprovals.map(p => (
                                  <div key={p.gid} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                                    <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: T.soon, letterSpacing: 0.5, textTransform: "uppercase" }}>{QUICK_APPROVAL_SECTIONS[p.sectionGid!]}</div>
                                    <ProjectCard task={p} category={categories[p.gid] || null} onOpen={t => setOpenTask(t)} onCategoryChange={cat => updateCategory(p.gid, cat)} onDragStart={() => setDragGid(p.gid)} onDragEnd={() => { setDragGid(null); setDragOverCat(undefined); }} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
                            {renderColumn(<OutsideIcon width={34} height={34} style={{ color: T.outside, flexShrink: 0 }} />, "Outside", allOutside, "factory", T.outside)}
                            {renderColumn(<InsideIcon width={34} height={34} style={{ color: T.inside, flexShrink: 0 }} />, "Inside", allInside, "creative", T.inside)}
                            {renderColumn(<UncatIcon width={34} height={34} style={{ color: T.uncat, flexShrink: 0 }} />, "Incoming", allUncategorized, null, T.uncat)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Todo panel — always visible on home screen */}
            {!openTask && !openTodoId && (
              <div style={{ border: "none", borderLeft: tb(2), backgroundColor: T.surfaceMuted, display: "flex", flexDirection: "column", flexShrink: 0, width: todosPanelOpen ? 272 : 40, transition: "width 0.2s ease", overflow: "hidden", position: "relative", zIndex: 1 }}>
                {todosPanelOpen ? (
                  <>
                    <div style={{ padding: "20px 16px 14px", display: "flex", flexDirection: "column", gap: 12, background: T.surfaceMuted }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: T.ink }}>Quick Tasks</div>
                        <button onClick={() => setTodosPanelOpen(false)} title="Collapse" aria-label="Collapse Quick Tasks panel" style={{ background: "none", border: "none", color: T.inkMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px" }}>‹</button>
                      </div>
                      <form onSubmit={e => { e.preventDefault(); addTodo(); }} style={{ display: "flex", gap: 8 }}>
                        <input value={newTodoText} onChange={e => setNewTodoText(e.target.value)} placeholder="Add a task…"
                          style={{ flex: 1, fontFamily: FONT, fontSize: 12, color: T.ink, background: T.surface, border: tb(1.5), boxShadow: T.shadowSm, borderRadius: T.radiusSm, padding: "7px 10px", outline: "none", minWidth: 0 }} />
                        <button type="submit" title="Add task" aria-label="Add task" className="btn-primary" style={{ background: T.inside, color: T.surface, borderRadius: T.radiusSm, padding: "7px 12px", fontFamily: FONT, fontSize: 14, fontWeight: 900, cursor: "pointer", flexShrink: 0 }}>+</button>
                      </form>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {todos.filter(t => !t.done).map(t => (
                        <TodoCard key={t.id} item={t} onToggle={e => { e.stopPropagation(); updateTodo(t.id, { done: true }); }} onClose={e => { e.stopPropagation(); deleteTodo(t.id); }} />
                      ))}
                      {todos.filter(t => t.done).length > 0 && (
                        <>
                          <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: T.inkMuted, letterSpacing: 1.5, paddingTop: 12, paddingBottom: 2 }}>DONE</div>
                          {todos.filter(t => t.done).map(t => (
                            <TodoCard key={t.id} item={t} onToggle={e => { e.stopPropagation(); updateTodo(t.id, { done: false }); }} onClose={e => { e.stopPropagation(); deleteTodo(t.id); }} />
                          ))}
                        </>
                      )}
                      {todos.length === 0 && (
                        <div style={{ fontFamily: FONT, fontSize: 12, color: T.inkMuted, textAlign: "center", paddingTop: 32 }}>No tasks yet</div>
                      )}
                    </div>
                  </>
                ) : (
                  <button onClick={() => setTodosPanelOpen(true)} title="Expand Quick Tasks" aria-label="Expand Quick Tasks panel"
                    style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, gap: 8, color: T.inkMuted }}>
                    <span style={{ fontSize: 16 }}>‹</span>
                    <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: T.inkMuted, writingMode: "vertical-rl", letterSpacing: 1.5 }}>QUICK TASKS</div>
                    {todos.filter(t => !t.done).length > 0 && (
                      <div style={{ background: T.inside, color: T.surface, borderRadius: 10, padding: "2px 6px", fontFamily: FONT, fontSize: 10, fontWeight: 800, writingMode: "vertical-rl" }}>
                        {todos.filter(t => !t.done).length}
                      </div>
                    )}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Prayer FAB — desktop only. One soft, single radiating circle — deep
          green core fading smoothly through pale green to nothing, grainy,
          slowly breathing/expanding outward. No rings, no icon, no edge. */}
      {!isMobile && (
        <div style={{ position: "fixed", bottom: -24, right: -24, width: 160, height: 160, zIndex: 50, pointerEvents: "none" }}>
          <div className="prayer-fab-orb" />
          <button onClick={() => setShowPrayer(true)} title="Morning Prayer" aria-label="Morning Prayer" className="prayer-fab-btn"
            style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 56, height: 56, borderRadius: "50%", cursor: "pointer", padding: 0, background: "transparent", pointerEvents: "auto" }}>
          </button>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500&display=swap');
        :root {
          --canvas: #EDEAE3;
          --surface: #FBF9F6;
          --surface-muted: #E4E0D6;
          --ink: #211D18;
          --ink-muted: #6B5F4F;
          --border: #24211B;
          --border-muted: #DDD7C9;
          --outside: #C4703F;
          --inside: #3A754A;
          --uncat: #74664F;
          --urgent: #B04432;
          --soon: #8A6222;
          --focus: #3A6C99;
          /* Neo-brutalist "hard" shadow — flat, offset, no blur, in the ink color.
             Using var(--ink) means it auto-flips from a dark offset in light mode
             to a pale cream offset in dark mode, with zero extra rules. */
          --shadow-sm: 2px 2px 0 var(--ink);
          --shadow-md: 4px 4px 0 var(--ink);
          --shadow-lg: 6px 6px 0 var(--ink);
          --moss-blend: multiply;
        }
        [data-theme="dark"] {
          --canvas: #1E1B18;
          --surface: #29251F;
          --surface-muted: #17150F;
          --ink: #F0EBE3;
          --ink-muted: #A79C8E;
          --border: #D8CFC0;
          --border-muted: #3A342C;
          --outside: #D6875A;
          --inside: #8FBB70;
          --uncat: #B3A98F;
          --urgent: #E2836C;
          --soon: #D9A244;
          --focus: #6FA0D9;
          --shadow-sm: 2px 2px 0 var(--ink);
          --shadow-md: 4px 4px 0 var(--ink);
          --shadow-lg: 6px 6px 0 var(--ink);
          --moss-blend: screen;
        }
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
        body { margin: 0; overflow: hidden; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: rgba(140,130,110,0.4); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        .glass-card {
          position: relative;
        }
        .graph-bg {
          background-color: #242329;
          background-image: linear-gradient(rgba(36,35,41,0.75), rgba(36,35,41,0.75)), url(${bgPhoto});
          background-size: auto, 40%;
          background-position: center, center;
          background-repeat: no-repeat, repeat;
          background-attachment: local, local;
        }
        /* Light board canvas — main dashboard, sidebars, Quick Tasks. A faint dot
           grid is the only texture left; everything else is a flat, crisp surface. */
        .board-canvas {
          background-color: ${T.canvas};
          background-image: radial-gradient(${T.borderMuted} 1px, transparent 1px);
          background-size: 22px 22px;
        }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        [style*="-webkit-app-region: drag"] { -webkit-app-region: drag; }
        .mind-node:hover .node-delete { opacity: 1 !important; }
        .mind-node:hover .node-resize { opacity: 1 !important; }
        /* Visible keyboard focus everywhere on the board — never rely on hover alone. */
        button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
          outline: 2px solid ${T.focus};
          outline-offset: 2px;
        }
        .board-card:hover { box-shadow: ${T.shadowLg} !important; transform: translateY(-2px); }
        .board-card:focus-visible { transform: translateY(-2px); }

        /* ── Button system ──────────────────────────────────────────────────
           Two tiers, so the eye can tell "the thing to do next" from "an
           option that's also here" without reading every label. Primary gets
           a crisp border + hard offset shadow that visibly presses flat on
           click (the shadow "catches up" to the button); secondary gets the
           border only, no shadow, so it stays quiet next to a primary action. */
        .btn-primary, .btn-secondary {
          border-radius: ${T.radiusSm}px;
          transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.15s;
        }
        .btn-primary {
          border: ${tb(2)};
          box-shadow: ${T.shadowSm};
        }
        .btn-primary:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: ${T.shadow}; }
        .btn-primary:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: none; }
        .btn-secondary {
          border: ${tb(1.5)};
        }
        .btn-secondary:hover:not(:disabled) { background: ${tint(T.ink, 8)}; }
        .btn-secondary:active:not(:disabled) { transform: translate(1px, 1px); }
        .btn-primary:disabled, .btn-secondary:disabled { cursor: default; transform: none !important; }
        /* Card lands in its column slot with a little bounce — plays on every mount,
           including when a card is re-categorized into a new column. */
        @keyframes slotIn { from { transform: scale(0.82); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .slot-card { animation: slotIn 0.32s cubic-bezier(.34,1.56,.64,1); }
        @keyframes slotPulse { 0%, 100% { border-color: var(--slot-accent); } 50% { border-color: ${T.borderMuted}; } }
        .slot-empty--active { animation: slotPulse 1s ease-in-out infinite; }

        /* "Needs Your Approval" background — soft, overlapping moss-green blobs that
           drift and breathe at their own uneven pace, like light moving across moss.
           When something on the list is actually due soon, every blob speeds up so
           the whole background gets visibly more alive without ever "flashing". */
        .moss-bg {
          position: absolute; inset: 0; overflow: hidden;
          background: color-mix(in srgb, ${MOSS} 14%, ${T.surface} 86%);
        }
        .moss-blob { position: absolute; border-radius: 50%; filter: blur(28px); mix-blend-mode: var(--moss-blend); will-change: transform, opacity; }
        .moss-blob--a {
          top: -35%; left: -12%; width: 62%; height: 175%;
          background: radial-gradient(circle, color-mix(in srgb, ${MOSS} 75%, white 25%) 0%, transparent 70%);
          animation: mossDriftA 24s cubic-bezier(0.37,0,0.63,1) infinite;
        }
        .moss-blob--b {
          bottom: -42%; right: -10%; width: 54%; height: 165%;
          background: radial-gradient(circle, color-mix(in srgb, ${MOSS} 55%, ${MOSS_BLUE} 45%) 0%, transparent 72%);
          animation: mossDriftB 31s ease-in-out infinite; animation-delay: -9s;
        }
        .moss-blob--c {
          top: 8%; right: 18%; width: 38%; height: 135%;
          background: radial-gradient(circle, ${MOSS} 0%, transparent 68%);
          animation: mossDriftC 18s ease-in-out infinite; animation-delay: -4s;
        }
        .moss-blob--d {
          bottom: -22%; left: 22%; width: 34%; height: 125%;
          background: radial-gradient(circle, color-mix(in srgb, ${MOSS_BLUE} 65%, ${MOSS} 35%) 0%, transparent 70%);
          animation: mossDriftD 27s ease-in-out infinite; animation-delay: -14s;
        }
        .moss-bg--urgent .moss-blob--a { animation-duration: 9s; }
        .moss-bg--urgent .moss-blob--b { animation-duration: 12s; }
        .moss-bg--urgent .moss-blob--c { animation-duration: 7s; }
        .moss-bg--urgent .moss-blob--d { animation-duration: 10s; }
        @keyframes mossDriftA {
          0%   { transform: translate(0%, 0%) scale(1) rotate(0deg); opacity: 0.5; }
          19%  { transform: translate(7%, 9%) scale(1.14) rotate(4deg); opacity: 0.68; }
          46%  { transform: translate(-6%, 4%) scale(0.9) rotate(-3deg); opacity: 0.38; }
          71%  { transform: translate(9%, -7%) scale(1.08) rotate(2deg); opacity: 0.6; }
          100% { transform: translate(0%, 0%) scale(1) rotate(0deg); opacity: 0.5; }
        }
        @keyframes mossDriftB {
          0%   { transform: translate(0%, 0%) scale(1) rotate(0deg); opacity: 0.4; }
          27%  { transform: translate(-9%, -6%) scale(1.2) rotate(-5deg); opacity: 0.58; }
          55%  { transform: translate(5%, 8%) scale(0.86) rotate(3deg); opacity: 0.3; }
          82%  { transform: translate(-6%, -3%) scale(1.1) rotate(-2deg); opacity: 0.5; }
          100% { transform: translate(0%, 0%) scale(1) rotate(0deg); opacity: 0.4; }
        }
        @keyframes mossDriftC {
          0%   { transform: translate(0%, 0%) scale(1); opacity: 0.32; }
          15%  { transform: translate(6%, -8%) scale(1.16); opacity: 0.5; }
          51%  { transform: translate(-8%, 5%) scale(0.9); opacity: 0.24; }
          80%  { transform: translate(4%, 9%) scale(1.12); opacity: 0.44; }
          100% { transform: translate(0%, 0%) scale(1); opacity: 0.32; }
        }
        @keyframes mossDriftD {
          0%   { transform: translate(0%, 0%) scale(1); opacity: 0.35; }
          24%  { transform: translate(-7%, 6%) scale(1.1); opacity: 0.5; }
          60%  { transform: translate(8%, -5%) scale(0.88); opacity: 0.26; }
          88%  { transform: translate(-4%, -8%) scale(1.14); opacity: 0.46; }
          100% { transform: translate(0%, 0%) scale(1); opacity: 0.35; }
        }

        /* ── Prayer FAB — a single soft radiating orb ─────────────────────────
           Modeled on a reference clip of one smooth green circle breathing
           outward: a deep green core fading evenly through pale green to
           nothing, no separate rings or particles, grainy rather than clean. */
        .prayer-fab-btn {
          border: none;
          position: relative;
        }
        .prayer-fab-orb {
          position: absolute; top: 50%; left: 50%; width: 150px; height: 150px;
          transform: translate(-50%, -50%);
          pointer-events: none;
          background: radial-gradient(circle, ${T.inside} 0%, ${MOSS} 34%, color-mix(in srgb, ${MOSS} 45%, transparent) 56%, transparent 78%);
          filter: blur(2px);
          animation: prayerOrbBreathe 5s ease-in-out infinite;
        }
        /* Heavy grain for a lofi, unpolished feel — masked so the texture fades
           out with the same soft edge as the glow itself. */
        .prayer-fab-orb::after {
          content: "";
          position: absolute; inset: -14px;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
          background-size: 70px 70px;
          mix-blend-mode: overlay;
          opacity: 0.8;
          -webkit-mask-image: radial-gradient(circle, black 0%, black 30%, transparent 70%);
          mask-image: radial-gradient(circle, black 0%, black 30%, transparent 70%);
          pointer-events: none;
        }
        @keyframes prayerOrbBreathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
          50%      { transform: translate(-50%, -50%) scale(1.18); opacity: 1; }
        }

        /* Respect the OS-level "reduce motion" preference — everything animated
           in this file (card mount bounce, empty-slot pulse, moss blobs, modal
           pop-in, prayer fade-ins) collapses to an instant, static state. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
