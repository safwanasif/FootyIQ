"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Check, ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { listShots, saveShot, shotExportUrl, type SavedShot } from "@/lib/api";

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
  const [message, setMessage] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedPosition, setSavedPosition] = useState("");
  const [revision, setRevision] = useState(0);
  const [collectionId, setCollectionId] = useState("");
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
        setCollectionId(result.collection_id);
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
    setMessage("");
    setSaveFailed(false);
    if (!pending.current || pending.current.x !== shot.x || pending.current.y !== shot.y) pending.current = { id: crypto.randomUUID(), x: shot.x, y: shot.y };
    try {
      const result = await saveShot(pending.current);
      setSavedPosition(`${result.x},${result.y}`);
      setMessage(`Saved ${result.distance_yards.toFixed(1)} yd chance at ${(result.xg_probability * 100).toFixed(1)}% xG.`);
      refresh(0);
    } catch (err) {
      setSaveFailed(true);
      setMessage(err instanceof Error ? err.message : "Save failed. Please retry.");
    } finally { saveLock.current = false; setSaving(false); }
  }
  function modelLabel(id: string) { return id === "legacy-unversioned" || !id ? "Legacy · model not recorded" : id; }
  function date(iso: string) { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

  return (
    <section className="history-section" aria-labelledby="history-title">
      <div className="section-heading"><div><p className="eyebrow">03 / Collect</p><h2 id="history-title">Your shot collection</h2><p>Saved for this browser. No account needed.</p></div><button className="button primary" disabled={!canSave || saving || savedPosition === positionKey} onClick={save}>{savedPosition === positionKey ? <Check size={16} /> : <Bookmark size={16} />}{saving ? "Saving…" : savedPosition === positionKey ? "Shot saved" : "Save current shot"}</button></div>
      {message && <p role={saveFailed ? "alert" : "status"} className={saveFailed ? "save-message failed" : "save-message"}>{message}</p>}
      <div className="history-card" aria-busy={loading}>
        <div className="collection-toolbar"><span>{loading ? "Loading collection…" : error ? "Connection interrupted" : `${rows.length} ${rows.length === 1 ? "chance" : "chances"} on this page`}</span><div><button className="icon-button" disabled={loading} onClick={() => refresh(0)} aria-label="Refresh collection"><RefreshCw size={16} /></button><a className="text-button export-button" href={shotExportUrl(offset)} aria-disabled={loading || !!error || rows.length === 0} onClick={(event) => { if (loading || !!error || rows.length === 0) event.preventDefault(); }}><Download size={15} />Export page</a></div></div>
        {loading ? <div className="history-placeholder" role="status"><RefreshCw className="loading-ring" size={22} /><p>Loading your saved chances…</p></div> : error ? <div className="history-placeholder"><p role="alert">{error}</p><button className="button secondary" onClick={() => refresh(offset)}>Try again</button></div> : rows.length === 0 ? <div className="history-placeholder"><span className="empty-icon"><Bookmark size={24} /></span><h3>A collection starts with one chance.</h3><p>Try a shot above, then save it to build your collection.</p></div> : <>
          <div className="desktop-history"><table><caption className="sr-only">Saved chances, newest first. Distances are in yards, angles in degrees.</caption><thead><tr>{["Saved", "Position (x, y)", "Distance", "Angle", "Expected goals", ""].map((heading) => <th key={heading} scope="col">{heading || <span className="sr-only">Action</span>}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={row.x === shot.x && row.y === shot.y ? "active-row" : ""}><td><time dateTime={row.created_at} title={new Date(row.created_at).toLocaleString()}>{date(row.created_at)}</time><small className="saved-model">{modelLabel(row.model_id)}</small></td><td className="numeric muted">{row.x.toFixed(1)}, {row.y.toFixed(1)}</td><td className="numeric">{row.distance_yards.toFixed(1)} <span className="muted">yd</span></td><td className="numeric">{row.angle_degrees.toFixed(1)}°</td><td><span className="table-xg">{(row.xg_probability * 100).toFixed(1)}%<span className="mini-track"><i style={{ width: `${row.xg_probability * 100}%` }} /></span></span></td><td><button className="text-button" aria-label={`Revisit shot at ${row.x.toFixed(1)}, ${row.y.toFixed(1)}`} onClick={() => onSelect({ x: row.x, y: row.y })}>Revisit <ArrowUpRight size={15} /></button></td></tr>)}</tbody></table></div>
          <ul className="mobile-history">{rows.map((row) => <li key={row.id}><div><span><time dateTime={row.created_at}>{date(row.created_at)}</time><small className="saved-model">{modelLabel(row.model_id)}</small></span><strong>{(row.xg_probability * 100).toFixed(1)}% <small>xG</small></strong></div><div><span>{row.distance_yards.toFixed(1)} yd · {row.angle_degrees.toFixed(1)}°</span><button className="text-button" aria-label={`Revisit shot at ${row.x.toFixed(1)}, ${row.y.toFixed(1)}`} onClick={() => onSelect({ x: row.x, y: row.y })}>Revisit <ArrowUpRight size={15} /></button></div></li>)}</ul>
        </>}
        <div className="collection-footer"><span>Page {offset / 10 + 1} <span className="muted">· Newest first</span></span><div><button className="icon-button" disabled={loading || offset === 0} onClick={() => refresh(Math.max(0, offset - 10))} aria-label="Newer shots"><ChevronLeft size={18} /></button><button className="icon-button" disabled={loading || !!error || !hasMore} onClick={() => refresh(offset + 10)} aria-label="Older shots"><ChevronRight size={18} /></button></div></div>
      </div>
      <details className="collection-details"><summary>About your browser collection</summary><p>A private cookie keeps your shots separate from other visitors. Clearing site cookies, letting the cookie expire, or changing browsers starts a new collection. The cookie lasts up to one year and renews when you return. Export your shots to keep a copy.</p>{collectionId && <><p>Your collection ID is used only for local imports of older shots. It cannot be used to sign in.</p><code>{collectionId}</code></>}</details>
    </section>
  );
}
