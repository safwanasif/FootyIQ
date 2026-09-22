"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowDownRight, ArrowUpRight, ArrowRight, Crosshair, Code2, Layers3, Loader2, Pin, RotateCcw, X } from "lucide-react";
import { checkHealth, getXgPrediction, type PredictionResponse } from "@/lib/api";
import ShotHistory from "./shot-history";
import ModelEvidence from "./model-evidence";

type Position = { x: number; y: number };
type Comparison = Position & PredictionResponse;
const PRESETS = [
  { name: "Central chance", x: 108, y: 40, detail: "A clear view of goal" },
  { name: "Tight angle", x: 110, y: 18, detail: "A narrow view of goal" },
  { name: "Long range", x: 90, y: 40, detail: "More distance to overcome" },
];
function geometry({ x, y }: Position) {
  const distance = Math.hypot(120 - x, 40 - y);
  let angle = Math.abs(Math.atan2(36 - y, 120 - x) - Math.atan2(44 - y, 120 - x));
  if (angle > Math.PI) angle = 2 * Math.PI - angle;
  return { distance, angle: angle * 180 / Math.PI };
}
function svgPoint({ x, y }: Position) { return { x: y * 10, y: (120 - x) * 10 }; }

export default function DashboardPage() {
  const [shot, setShot] = useState<Position>({ x: 108, y: 40 });
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [retry, setRetry] = useState(0);
  const dragging = useRef(false);
  const sequence = useRef(0);
  const { distance, angle } = geometry(shot);
  const marker = svgPoint(shot);
  const pinned = comparison ? svgPoint(comparison) : null;
  const ready = !loading && !!prediction && !error;

  useEffect(() => {
    const controller = new AbortController();
    async function poll() {
      try {
        await checkHealth(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
        if (!controller.signal.aborted) setStatus("online");
      } catch { if (!controller.signal.aborted) setStatus("offline"); }
    }
    void poll();
    const timer = setInterval(poll, 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;
    const timer = setTimeout(async () => {
      const point = geometry(shot);
      try {
        const result = await getXgPrediction(point.distance / 1.09361, point.angle,
          AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
        if (!controller.signal.aborted && current === sequence.current) setPrediction(result);
      } catch {
        if (!controller.signal.aborted && current === sequence.current) {
          setError("We couldn’t calculate this chance. Check the connection and try again.");
          setPrediction(null);
        }
      } finally { if (!controller.signal.aborted && current === sequence.current) setLoading(false); }
    }, 150);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [shot, retry]);

  function selectShot(position: Position) {
    ++sequence.current;
    setLoading(true);
    setPrediction(null);
    setError("");
    setShot({ x: position.x, y: position.y });
  }
  function movePointer(event: React.PointerEvent<SVGSVGElement>) {
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    // Includes viewBox padding and letterboxing, keeping the marker under the pointer.
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    selectShot({ x: Math.min(119.9, Math.max(60, 120 - point.y / 10)), y: Math.min(80, Math.max(0, point.x / 10)) });
  }
  function moveKeyboard(event: React.KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 5 : 1;
    const moves: Record<string, Position> = {
      ArrowUp: { x: Math.min(119.9, shot.x + step), y: shot.y },
      ArrowDown: { x: Math.max(60, shot.x - step), y: shot.y },
      ArrowLeft: { x: shot.x, y: Math.max(0, shot.y - step) },
      ArrowRight: { x: shot.x, y: Math.min(80, shot.y + step) },
    };
    if (moves[event.key]) { event.preventDefault(); selectShot(moves[event.key]); }
  }
  const delta = ready && comparison ? (prediction!.xg_probability - comparison.xg_probability) * 100 : null;

  return (
    <main id="main-content">
      <a href="#shot-lab" className="skip-link">Skip to shot analysis</a>
      <header className="site-header">
        <a className="brand" href="#main-content" aria-label="FootyIQ home"><span className="brand-icon"><Crosshair size={21} /></span>Footy<span>IQ</span></a>
        <nav aria-label="Main navigation"><a href="#shot-lab">Shot lab</a><a href="#history-title">Collection</a><a href="#model-title">The model</a></nav>
        <a className="source-link" aria-label="View source code on GitHub" href="https://github.com/safwanasif/FootyIQ" target="_blank" rel="noreferrer"><Code2 size={17} /><span>Source code</span></a>
      </header>

      <div className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <div><p className="eyebrow"><span /> Football, through the numbers</p><h1 id="page-title">Every shot tells a story.</h1><p className="intro-copy">Explore the space. Find the angle. See what makes a chance count.</p></div>
          <div className="intro-note"><Layers3 size={19} /><span>A football analytics project<br /><strong>Built on real shot data</strong></span></div>
        </section>

        <section id="shot-lab" className="lab" aria-label="Interactive shot analysis">
          <div className="pitch-panel">
            <div className="panel-heading"><div><p className="eyebrow">01 / Explore</p><h2>The shot lab</h2></div><span className="subtle-tag">Attacking half</span></div>
            <div className="pitch-wrap">
              <svg viewBox="-20 -30 840 650" className="pitch" role="group" tabIndex={0}
                aria-label="Interactive soccer pitch" aria-describedby="pitch-help"
                onKeyDown={moveKeyboard}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; movePointer(e); }}
                onPointerMove={(e) => { if (dragging.current) movePointer(e); }}
                onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
                onLostPointerCapture={() => { dragging.current = false; }}>
                <defs><pattern id="grass" width="800" height="120" patternUnits="userSpaceOnUse"><rect width="800" height="60" fill="#163b32" /><rect y="60" width="800" height="60" fill="#12352d" /></pattern></defs>
                <rect width="800" height="600" fill="url(#grass)" />
                <g fill="none" stroke="#8aad98" strokeWidth="1.8" opacity="0.65">
                  <rect width="800" height="600" /><rect x="180" width="440" height="180" />
                  <rect x="300" width="200" height="60" /><path d="M320 180 A100 100 0 0 0 480 180" />
                  <path d="M300 600 A100 100 0 0 1 500 600" /><circle cx="400" cy="120" r="3" fill="#8aad98" />
                  <path d="M360 0 V-16 H440 V0" strokeWidth="3" stroke="#e5ecdb" />
                </g>
                <polygon points={`${marker.x},${marker.y} 360,0 440,0`} fill="#d7f58c" opacity="0.10" />
                <path d={`M360 0 L${marker.x} ${marker.y} L440 0`} fill="none" stroke="#d7f58c" strokeDasharray="5 6" opacity="0.7" />
                {pinned && <g><circle cx={pinned.x} cy={pinned.y} r="12" fill="#12352d" stroke="#f3b479" strokeWidth="3" strokeDasharray="4 3" /><text x={pinned.x > 740 ? pinned.x - 20 : pinned.x + 20} y={Math.max(20, pinned.y - 15)} textAnchor={pinned.x > 740 ? "end" : "start"} fill="#f3b479" fontSize="16">Pinned</text></g>}
                <circle cx={marker.x} cy={marker.y} r="24" fill="#d7f58c" opacity="0.12" />
                <circle cx={marker.x} cy={marker.y} r="11" fill="#d7f58c" stroke="#10261f" strokeWidth="3" />
                <circle cx={marker.x} cy={marker.y} r="3" fill="#10261f" />
              </svg>
              <span className="pitch-direction">↑ Attacking direction</span>
            </div>
            <p id="pitch-help" className="pitch-help">Click or drag to place a shot. Keyboard: arrow keys; Shift for larger steps.</p>
            <div className="presets" aria-label="Example shot positions">{PRESETS.map((preset) => <button key={preset.name} className={shot.x === preset.x && shot.y === preset.y ? "preset selected" : "preset"} onClick={() => selectShot(preset)} aria-pressed={shot.x === preset.x && shot.y === preset.y}><span>{preset.name}<ArrowUpRight size={15} /></span><small>{preset.detail}</small></button>)}</div>
          </div>

          <section className="insight-panel" aria-labelledby="insight-title">
            <div className="panel-heading"><div><p className="eyebrow">02 / Understand</p><h2 id="insight-title">Chance quality</h2></div><span className={`connection ${status}`} title="API and database connection"><i />{status === "online" ? "Connected" : status === "offline" ? "Offline" : "Connecting"}</span></div>
            <div className="probability-block" aria-live="polite" aria-atomic="true">
              <p className="metric-label">Expected goals <span>/ xG</span></p>
              <div className="probability">{loading ? <Loader2 aria-label="Calculating" className="loading-ring" size={42} /> : prediction ? <>{(prediction.xg_probability * 100).toFixed(1)}<span>%</span></> : <span>Unavailable</span>}</div>
              <p className="chance-label">{loading ? "Reading the chance…" : prediction?.interpretation ?? "Prediction unavailable"}</p>
              <div className="probability-track" aria-hidden="true"><span style={{ width: ready ? `${prediction!.xg_probability * 100}%` : "0%" }} /></div>
              <div className="scale-labels"><span>Less likely</span><span>More likely</span></div>
            </div>
            <dl className="geometry"><div><dt>Distance to goal</dt><dd>{distance.toFixed(1)} <span>yd</span></dd></div><div><dt>View of goal</dt><dd>{angle.toFixed(1)}<span>°</span></dd></div></dl>
            {error ? <div className="error-note" role="alert"><p>{error}</p><button className="button secondary" onClick={() => { setLoading(true); setError(""); setRetry((n) => n + 1); }}><RotateCcw size={15} />Retry prediction</button></div> : <p className="explanation">{ready ? <>Roughly <strong>{Math.round(prediction!.xg_probability * 100)} in 100</strong> comparable chances would score according to this model.</> : "Move the marker to explore how distance and angle influence the prediction."} <a href="#model-title">How it works <ArrowRight size={12} /></a></p>}
            <div className="compare-area">
              {comparison ? <><div className="compare-heading"><span><Pin size={14} /> Pinned chance · {(comparison.xg_probability * 100).toFixed(1)}%</span><button className="icon-button" aria-label="Clear pinned comparison" onClick={() => setComparison(null)}><X size={17} /></button></div><p className="comparison-result">{delta === null ? "Calculating comparison…" : <>{delta >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}<strong>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</strong> percentage points</>}</p><button className="text-button" onClick={() => selectShot(comparison)}>Return to pinned position</button></> : <><p>What changes when you move wider?</p><button className="button secondary" disabled={!ready} onClick={() => setComparison({ ...shot, ...prediction! })}><Pin size={15} />Pin this chance to compare</button></>}
            </div>
          </section>
        </section>
        <ShotHistory shot={shot} canSave={ready} onSelect={selectShot} />
        <ModelEvidence />
        <footer className="site-footer"><span>FootyIQ <span className="footer-divider">/</span> Independent football analytics</span><a href="https://github.com/safwanasif/FootyIQ" target="_blank" rel="noreferrer">Explore the engineering <ArrowUpRight size={14} /></a></footer>
      </div>
    </main>
  );
}
