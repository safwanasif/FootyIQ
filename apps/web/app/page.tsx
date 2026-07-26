/**
 * ============================================================================
 * FootyIQ Web — Main Dashboard (page.tsx)
 * ============================================================================
 * PURPOSE:
 *   Split-screen xG command console:
 *     LEFT:  Interactive SVG pitch (attacking half, StatsBomb coords 60-120
 *            x / 0-80 y). Click or drag to drop a shot marker.
 *     RIGHT: Live telemetry — distance, angle, xG probability badge, and
 *            interpretation — sourced from services/api's predict-proxy.
 *
 * GEOMETRY NOTE:
 *   distance_to_goal / shot_angle formulas here intentionally mirror
 *   services/ml/etl.py's compute_distance_to_goal() / compute_shot_angle()
 *   so the marker position and displayed telemetry are self-consistent.
 *   The BACKEND remains the source of truth for the actual xG prediction —
 *   these client-side values are for instant visual feedback only.
 *
 * ERROR HANDLING NOTE:
 *   React class-based Error Boundaries only catch errors thrown during
 *   render — they do NOT catch errors from async fetch() calls in event
 *   handlers or effects. Gateway-offline handling here is therefore done
 *   via explicit `apiError` state (the correct pattern for async failures),
 *   with a lightweight render-time ErrorBoundary layered on top as
 *   defense-in-depth against unexpected render crashes.
 * ============================================================================
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import { Activity, Wifi, WifiOff, Loader2, Crosshair, AlertTriangle } from "lucide-react";
import { checkHealth, getXgPrediction, ApiError, type PredictionResponse } from "@/lib/api";

// ============================================================================
// GEOMETRY CONSTANTS (mirrors services/ml/etl.py)
// ============================================================================
const GOAL_CENTER = { x: 120, y: 40 };
const GOAL_POST_1 = { x: 120, y: 36 };
const GOAL_POST_2 = { x: 120, y: 44 };
const YARDS_PER_METER = 1.09361;

// SVG viewBox: 4:3 ratio representing pitch width (80yd) x attacking depth (60yd)
const VB_WIDTH = 800;
const VB_HEIGHT = 600;

type PitchCoord = { x: number; y: number }; // StatsBomb units (x:60-120, y:0-80)

// ----------------------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------------------
function computeDistanceToGoal(x: number, y: number): number {
  return Math.sqrt((GOAL_CENTER.x - x) ** 2 + (GOAL_CENTER.y - y) ** 2);
}

function computeShotAngle(x: number, y: number): number {
  const v1 = Math.atan2(GOAL_POST_1.y - y, GOAL_POST_1.x - x);
  const v2 = Math.atan2(GOAL_POST_2.y - y, GOAL_POST_2.x - x);
  let angle = Math.abs(v1 - v2);
  if (angle > Math.PI) angle = 2 * Math.PI - angle;
  return (angle * 180) / Math.PI;
}

function pitchToSvg(pitch: PitchCoord): { x: number; y: number } {
  return {
    x: (pitch.y / 80) * VB_WIDTH,
    y: VB_HEIGHT - ((pitch.x - 60) / 60) * VB_HEIGHT,
  };
}

function svgToPitch(svgX: number, svgY: number): PitchCoord {
  const y = (svgX / VB_WIDTH) * 80;
  const x = 60 + ((VB_HEIGHT - svgY) / VB_HEIGHT) * 60;
  return {
    x: Math.min(120, Math.max(60, x)),
    y: Math.min(80, Math.max(0, y)),
  };
}

// ----------------------------------------------------------------------------
// Interpretation -> color mapping (mirrors services/ml/app.py thresholds)
// ----------------------------------------------------------------------------
function interpretationStyles(interpretation: string): { text: string; badge: string; glow: boolean } {
  switch (interpretation) {
    case "High quality chance":
      return { text: "text-emerald-400", badge: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300", glow: true };
    case "Good chance":
      return { text: "text-emerald-300", badge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", glow: false };
    case "Moderate probability effort":
      return { text: "text-amber-400", badge: "bg-amber-500/10 border-amber-500/30 text-amber-300", glow: false };
    default:
      return { text: "text-slate-400", badge: "bg-slate-500/10 border-slate-500/30 text-slate-400", glow: false };
  }
}

// ============================================================================
// LIGHTWEIGHT RENDER-TIME ERROR BOUNDARY (defense-in-depth)
// ============================================================================
class RenderErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
>{ 
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="font-mono text-sm">A rendering error occurred. Refresh to recover.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

// Need React import for the class component above (JSX runtime handles
// the rest, but React.Component requires the named import explicitly).


// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function DashboardPage() {
  const [shot, setShot] = useState<PitchCoord>({ x: 108, y: 40 }); // default: top of the box
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<"checking" | "online" | "offline">("checking");

  const isDragging = useRef(false);
  const requestSeq = useRef(0); // guards against out-of-order fetch responses

  // --------------------------------------------------------------------------
  // HEALTH POLLING — live system status indicator in the nav bar
  // --------------------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();

    const poll = async () => {
      try {
        await checkHealth(controller.signal);
        setGatewayStatus("online");
      } catch {
        setGatewayStatus("offline");
      }
    };

    poll();
    const interval = setInterval(poll, 10_000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  // --------------------------------------------------------------------------
  // PREDICTION FETCH — triggered whenever the shot marker moves
  // --------------------------------------------------------------------------
  const fetchPrediction = useCallback(async (coord: PitchCoord) => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    setApiError(null);

    const distanceYards = computeDistanceToGoal(coord.x, coord.y);
    const angleDegrees = computeShotAngle(coord.x, coord.y);
    const distanceMeters = distanceYards / YARDS_PER_METER;

    try {
      const result = await getXgPrediction(distanceMeters, angleDegrees);
      // Ignore stale responses from superseded rapid clicks/drags
      if (seq === requestSeq.current) {
        setPrediction(result);
      }
    } catch (err) {
      if (seq === requestSeq.current) {
        const message = err instanceof ApiError ? err.message : "Unexpected error contacting the Gateway.";
        setApiError(message);
        setPrediction(null);
      }
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional:
    fetchPrediction(shot);
  }, [shot, fetchPrediction]);

  // --------------------------------------------------------------------------
  // PITCH CLICK / DRAG HANDLING
  // --------------------------------------------------------------------------
  const updateShotFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = VB_WIDTH / rect.width;
    const scaleY = VB_HEIGHT / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;
    setShot(svgToPitch(svgX, svgY));
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = true;
    updateShotFromEvent(e);
  };
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging.current) updateShotFromEvent(e);
  };
  const stopDragging = () => {
    isDragging.current = false;
  };

  const markerSvg = pitchToSvg(shot);
  const post1Svg = pitchToSvg(GOAL_POST_1);
  const post2Svg = pitchToSvg(GOAL_POST_2);
  const styles = prediction ? interpretationStyles(prediction.interpretation) : null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ==================================================================
          TOP NAVIGATION — live system health indicator
      ================================================================== */}
      <header className="border-b border-slate-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-emerald-400" />
            <span className="font-mono text-lg font-semibold tracking-tight">FootyIQ</span>
            <span className="ml-2 font-mono text-xs text-slate-500">xG Analytics Console</span>
          </div>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs ${
              gatewayStatus === "online"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : gatewayStatus === "offline"
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-slate-700 bg-slate-800/40 text-slate-400"
            }`}
          >
            {gatewayStatus === "online" && <Wifi className="h-3.5 w-3.5" />}
            {gatewayStatus === "offline" && <WifiOff className="h-3.5 w-3.5" />}
            {gatewayStatus === "checking" && <Activity className="h-3.5 w-3.5 animate-pulse" />}
            {gatewayStatus === "online"
              ? "GATEWAY ONLINE"
              : gatewayStatus === "offline"
              ? "GATEWAY OFFLINE"
              : "CHECKING..."}
          </div>
        </div>
      </header>

      <RenderErrorBoundary>
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 md:grid-cols-2">
          {/* ================================================================
              LEFT: INTERACTIVE SVG PITCH
          ================================================================ */}
          <section className="rounded-xl border border-slate-800 bg-zinc-900/40 p-4 backdrop-blur-sm">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-500">
              Attacking Half — Click or Drag to Place Shot
            </h2>
            <svg
              viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
              className="w-full cursor-crosshair rounded-lg border border-slate-800 bg-emerald-950/20"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDragging}
              onMouseLeave={stopDragging}
            >
              {/* Pitch boundary */}
              <rect x={0} y={0} width={VB_WIDTH} height={VB_HEIGHT} fill="none" stroke="#1e293b" strokeWidth={2} />

              {/* Penalty box (18-yard box): statsbomb x 102-120, y 18-62 */}
              <rect
                x={(18 / 80) * VB_WIDTH}
                y={0}
                width={((62 - 18) / 80) * VB_WIDTH}
                height={((102 - 60) / 60) * VB_HEIGHT}
                fill="none"
                stroke="#334155"
                strokeWidth={1.5}
              />

              {/* Six-yard box: statsbomb x 114-120, y 30-50 */}
              <rect
                x={(30 / 80) * VB_WIDTH}
                y={0}
                width={((50 - 30) / 80) * VB_WIDTH}
                height={((114 - 60) / 60) * VB_HEIGHT}
                fill="none"
                stroke="#334155"
                strokeWidth={1.5}
              />

              {/* Goal mouth */}
              <line x1={post1Svg.x} y1={post1Svg.y} x2={post2Svg.x} y2={post2Svg.y} stroke="#10b981" strokeWidth={4} />

              {/* Angle visualization: shot marker -> each goalpost */}
              <line x1={markerSvg.x} y1={markerSvg.y} x2={post1Svg.x} y2={post1Svg.y} stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
              <line x1={markerSvg.x} y1={markerSvg.y} x2={post2Svg.x} y2={post2Svg.y} stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />

              {/* Shot marker */}
              <circle cx={markerSvg.x} cy={markerSvg.y} r={9} fill="#10b981" fillOpacity={0.25} stroke="#10b981" strokeWidth={2} />
              <circle cx={markerSvg.x} cy={markerSvg.y} r={3} fill="#10b981" />
            </svg>
          </section>

          {/* ================================================================
              RIGHT: TELEMETRY CARD
          ================================================================ */}
          <section className="rounded-xl border border-slate-800 bg-zinc-900/40 p-6 backdrop-blur-sm">
            <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-slate-500">
              Shot Telemetry
            </h2>

            {apiError ? (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <p className="font-mono text-sm font-semibold text-red-300">503 Service Unavailable</p>
                  <p className="mt-1 font-mono text-xs text-red-400/80">{apiError}</p>
                  <p className="mt-2 font-mono text-xs text-slate-500">
                    Confirm the Express Gateway container is running on :3001.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Distance */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="font-mono text-sm text-slate-400">Distance</span>
                  <span className="font-mono text-lg text-zinc-100">
                    {computeDistanceToGoal(shot.x, shot.y).toFixed(2)} <span className="text-slate-500">yd</span>
                  </span>
                </div>

                {/* Angle */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="font-mono text-sm text-slate-400">Shot Angle</span>
                  <span className="font-mono text-lg text-zinc-100">
                    {computeShotAngle(shot.x, shot.y).toFixed(2)} <span className="text-slate-500">deg</span>
                  </span>
                </div>

                {/* xG Probability */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="font-mono text-sm text-slate-400">Expected Goals (xG)</span>
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                  ) : prediction ? (
                    <span
                      className={`rounded-full border px-3 py-1 font-mono text-lg font-semibold ${styles?.badge} ${
                        styles?.glow ? "shadow-emerald-glow" : ""
                      }`}
                    >
                      {(prediction.xg_probability * 100).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="font-mono text-sm text-slate-600">—</span>
                  )}
                </div>

                {/* Interpretation */}
                <div className="pt-1">
                  <span className="font-mono text-sm text-slate-400">Interpretation</span>
                  <p className={`mt-1 font-mono text-base font-medium ${styles?.text ?? "text-slate-500"}`}>
                    {isLoading ? "Calculating..." : prediction?.interpretation ?? "Awaiting shot placement..."}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </RenderErrorBoundary>
    </main>
  );
}