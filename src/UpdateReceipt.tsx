import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { UpdateCandidate, UpdateError, UpdateProgress } from "./api/updateApi";

export type UpdateReceiptState =
  | { status: "hidden" }
  | { status: "available"; candidate: UpdateCandidate }
  | { status: "applying"; candidate: UpdateCandidate; progress: UpdateProgress }
  | { status: "relaunching"; candidate: UpdateCandidate }
  | { status: "failed"; error: UpdateError; candidate?: UpdateCandidate };

type UpdateReceiptProps = {
  runningVersion: string;
  state: UpdateReceiptState;
  onLater: () => void;
  onApply: (candidate: UpdateCandidate) => void;
  onCheckAgain: () => void;
};

const byteFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, bytes)} B`;
  if (bytes < 1024 ** 2) return `${byteFormatter.format(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${byteFormatter.format(bytes / 1024 ** 2)} MB`;
  return `${byteFormatter.format(bytes / 1024 ** 3)} GB`;
}

function formatPublishedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(parsed);
}

function VersionHandoff({ runningVersion, candidateVersion }: { runningVersion: string; candidateVersion: string }): ReactElement {
  return <p className="update-version-handoff" aria-label={`現在のバージョン ${runningVersion} から ${candidateVersion} へ`}>
    <span className="update-version-current">v{runningVersion} 使用中</span>
    <span className="update-version-arrow" aria-hidden="true">→</span>
    <strong>v{candidateVersion}</strong>
  </p>;
}

function ReleaseNotes({ candidate, onClose }: { candidate: UpdateCandidate; onClose: () => void }): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  }, [onClose]);

  return <div className="update-notes-layer" role="dialog" aria-modal="false" aria-labelledby="update-notes-title" onKeyDown={handleKeyDown}>
    <div className="update-notes-header">
      <div>
        <span className="update-receipt-kicker">v{candidate.version}</span>
        <h2 id="update-notes-title" ref={headingRef} tabIndex={-1}>リリースノート</h2>
      </div>
      <button type="button" className="update-quiet-action" onClick={onClose} aria-label="リリースノートを閉じる">閉じる</button>
    </div>
    {candidate.publishedAt && <p className="update-published-at">公開日 {formatPublishedAt(candidate.publishedAt)}</p>}
    <div className="update-notes-copy">
      {candidate.notes?.split(/\r?\n/).map((paragraph, index) => paragraph.trim()
        ? <p key={index}>{paragraph}</p>
        : <span key={index} className="update-notes-break" aria-hidden="true" />)}
    </div>
  </div>;
}

function errorTitle(error: UpdateError): string {
  if (error.code === "check-failed") return "更新を確認できませんでした";
  if (error.code === "download-failed") return "更新をダウンロードできませんでした";
  if (error.code === "install-failed") return "更新をインストールできませんでした";
  return "アプリを再起動できませんでした";
}

export function UpdateReceipt({ runningVersion, state, onLater, onApply, onCheckAgain }: UpdateReceiptProps): ReactElement | null {
  const candidateId = state.status === "hidden" || state.status === "failed" ? undefined : state.candidate.id;
  const [notesOpen, setNotesOpen] = useState(false);
  const notesOriginRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setNotesOpen(false);
  }, [candidateId, state.status]);

  const closeNotes = useCallback(() => {
    setNotesOpen(false);
    window.queueMicrotask(() => notesOriginRef.current?.focus());
  }, [setNotesOpen]);

  if (state.status === "hidden") return null;

  const candidate = state.status === "failed" ? state.candidate : state.candidate;
  const isError = state.status === "failed";
  const announcement = state.status === "available"
    ? `アプリの更新 v${state.candidate.version} を利用できます`
    : state.status === "applying"
      ? state.progress.phase === "install" ? "更新をインストールしています" : "更新をダウンロードしています"
      : state.status === "relaunching"
        ? "更新をインストールしました。アプリを再起動しています"
        : errorTitle(state.error);

  let progressText: string | undefined;
  let progressPercent: number | undefined;
  if (state.status === "applying" && state.progress.phase === "download") {
    const received = formatBytes(state.progress.receivedBytes);
    if (state.progress.totalBytes && state.progress.totalBytes > 0) {
      progressPercent = Math.min(100, Math.max(0, (state.progress.receivedBytes / state.progress.totalBytes) * 100));
      progressText = `${received} / ${formatBytes(state.progress.totalBytes)}`;
    } else {
      progressText = state.progress.receivedBytes > 0 ? `${received} 受信済み（合計サイズを確認中）` : "合計サイズを確認中";
    }
  }

  return <>
    {notesOpen && candidate?.notes && <ReleaseNotes candidate={candidate} onClose={closeNotes} />}
    <aside
      className={`update-receipt update-receipt-${state.status}${isError ? " is-error" : ""}`}
      data-update-state={state.status === "failed" ? state.error.code : state.status}
      aria-label="アプリの更新"
      role={isError ? "alert" : undefined}
    >
      {!isError && <p className="sr-only" role="status" aria-live="polite">{announcement}</p>}

      {candidate && <VersionHandoff runningVersion={runningVersion} candidateVersion={candidate.version} />}

      {state.status === "available" && <>
        <p className="update-receipt-summary">新しいバージョンを利用できます。作業を続ける場合は後で更新できます。</p>
        <div className="update-receipt-actions">
          {state.candidate.notes && <button ref={notesOriginRef} type="button" className="update-notes-action" aria-expanded={notesOpen} onClick={() => setNotesOpen(true)}>リリースノート</button>}
          <button type="button" className="update-quiet-action" onClick={onLater}>後で</button>
          <button type="button" className="update-primary-action" onClick={() => onApply(state.candidate)}>更新して再起動</button>
        </div>
      </>}

      {state.status === "applying" && <div className="update-progress-stage">
        <span className="update-stage-label">{state.progress.phase === "install" ? "インストール中" : "ダウンロード中"}</span>
        {state.progress.phase === "download" && <>
          <span className="update-progress-copy">{progressText}</span>
          <div
            className={`update-progress-track${progressPercent === undefined ? " is-indeterminate" : ""}`}
            role="progressbar"
            aria-label="更新のダウンロード進捗"
            aria-valuemin={progressPercent === undefined ? undefined : 0}
            aria-valuemax={progressPercent === undefined ? undefined : 100}
            aria-valuenow={progressPercent === undefined ? undefined : Math.round(progressPercent)}
            aria-valuetext={progressText}
          >
            <span className="update-progress-fill" style={progressPercent === undefined ? undefined : { transform: `scaleX(${progressPercent / 100})` }} />
          </div>
        </>}
        {state.progress.phase === "install" && <p className="update-receipt-summary">検証済みの更新をインストールしています。このままお待ちください。</p>}
      </div>}

      {state.status === "relaunching" && <div className="update-progress-stage">
        <span className="update-stage-label">インストール完了</span>
        <p className="update-receipt-summary">アプリを再起動しています…</p>
      </div>}

      {state.status === "failed" && <>
        <strong className="update-error-title">{errorTitle(state.error)}</strong>
        <p className="update-error-detail">{state.error.message}</p>
        {state.error.code === "relaunch-failed" && <p className="update-manual-restart">更新はインストール済みの可能性があります。作業内容を確認してから、アプリを閉じて手動で起動し直してください。</p>}
        <div className="update-receipt-actions">
          {state.error.code === "download-failed" && candidate
            ? <button type="button" className="update-primary-action" onClick={() => onApply(candidate)}>更新をもう一度試す</button>
            : state.error.code !== "relaunch-failed" && <button type="button" className="update-primary-action" onClick={onCheckAgain}>もう一度確認</button>}
          <button type="button" className="update-quiet-action" onClick={onLater}>{state.error.code === "download-failed" ? "後で" : "閉じる"}</button>
        </div>
      </>}
    </aside>
  </>;
}
