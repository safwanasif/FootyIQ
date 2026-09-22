"use client";

import { useEffect, useRef, useState } from "react";
import { listShots, saveShot, type SavedShot } from "@/lib/api";

export default function ShotHistory({ shot, canSave, onSelect }: {
  shot: { x: number; y: number };
  canSave: boolean;
  onSelect: (shot: { x: number; y: number }) => void;
}) {
  const [rows, setRows] = useState<SavedShot[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedPosition, setSavedPosition] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = useRef<{ id: string; x: number; y: number } | null>(null);
  const saveLock = useRef(false);
  const positionKey = `${shot.x},${shot.y}`;

  useEffect(() => {
    const controller = new AbortController();
    listShots(offset, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.shots);
        setHasMore(result.has_more);
        setError("");
      })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [offset, revision]);

  function refresh(nextOffset: number) {
    setLoading(true);
    setError("");
    setOffset(nextOffset);
    setRevision((value) => value + 1);
  }

  async function save() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setSaveMessage("");
    if (!pending.current || pending.current.x !== shot.x || pending.current.y !== shot.y) {
      pending.current = { id: crypto.randomUUID(), ...shot };
    }
    try {
      const result = await saveShot(pending.current);
      setSavedPosition(`${result.x},${result.y}`);
      setSaveMessage(`Saved shot at (${result.x.toFixed(1)}, ${result.y.toFixed(1)}) — ${(result.xg_probability * 100).toFixed(2)}% xG.`);
      refresh(0);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Save failed. Please retry.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const buttonClass = "rounded-md border border-slate-600 px-3 py-2 text-sm text-zinc-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <section className="mx-auto max-w-6xl px-6 pb-8" aria-labelledby="history-title">
      <div className="rounded-xl border border-slate-800 bg-zinc-900/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="history-title" className="font-mono text-lg">Saved shots</h2>
            <p className="mt-1 text-sm text-slate-400">Save a chance, then select it below to revisit its position.</p>
          </div>
          <button className={buttonClass} disabled={!canSave || saving || savedPosition === positionKey} onClick={save}>
            {saving ? "Saving…" : savedPosition === positionKey ? "Shot saved" : "Save current shot"}
          </button>
        </div>
        <p role="status" className="mt-3 text-sm text-emerald-300">{saveMessage}</p>
        <div aria-busy={loading} className="mt-4">
          {loading ? <p role="status" className="text-slate-400">Loading history…</p> : error ? (
            <p role="alert" className="text-red-300">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-slate-400">No saved shots on this page. Place a shot on the pitch and save your first chance.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Saved shots, newest first. Distances in yards; angles in degrees.</caption>
                <thead className="text-slate-400"><tr>
                  {['Saved', 'Position (x, y)', 'Distance', 'Angle', 'xG', 'Action'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-2 py-3 font-medium">{heading}</th>)}
                </tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-2 py-3"><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time></td>
                    <td className="px-2 py-3">{row.x.toFixed(1)}, {row.y.toFixed(1)}</td>
                    <td className="whitespace-nowrap px-2 py-3">{row.distance_yards.toFixed(2)} yd</td>
                    <td className="px-2 py-3">{row.angle_degrees.toFixed(2)}°</td>
                    <td className="px-2 py-3 text-emerald-300" title={row.interpretation}>{(row.xg_probability * 100).toFixed(2)}%</td>
                    <td className="px-2 py-3"><button className={buttonClass} aria-label={`Revisit shot at ${row.x.toFixed(1)}, ${row.y.toFixed(1)}`} onClick={() => onSelect({ x: row.x, y: row.y })}>Revisit</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className={buttonClass} disabled={loading} onClick={() => refresh(0)}>Refresh</button>
            <button className={buttonClass} disabled={loading || offset === 0} onClick={() => refresh(Math.max(0, offset - 10))}>Newer</button>
            <button className={buttonClass} disabled={loading || !!error || !hasMore} onClick={() => refresh(offset + 10)}>Older</button>
            <span className="text-sm text-slate-500">Page {offset / 10 + 1}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
