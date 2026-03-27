/* eslint-disable sonarjs/cognitive-complexity */
import React, { useState } from 'react';

import { formatTimeToAmPm } from './importShared';

export type ImportPreviewStatus = 'parsing' | 'comparing' | 'ready' | 'duplicate' | 'possible_duplicate' | 'error';

export type ImportPreviewSummary = {
  date?: string | Date | null;
  distanceKm?: number | null;
  duration?: string | null;
  freeDistanceKm?: number | null;
  landing?: string | null;
  routeDistanceKm?: number | null;
  score?: number | null;
  startTime?: string | null;
  takeoff?: string | null;
};

export type FlightImportPreviewItem = {
  fileName: string;
  id: string;
  status: ImportPreviewStatus;
  duplicateExplanation?: string | null;
  errorMessage?: string | null;
  filePath?: string | null;
  summary?: ImportPreviewSummary | null;
};

export type FlightImportPreviewProps = {
  items: FlightImportPreviewItem[];
  confirmDisabled?: boolean;
  confirmLabel?: string;
  onConfirm?: () => void;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  onTogglePossibleDuplicate?: (id: string) => void;
  /** Main panel title (default: Review import) */
  panelTitle?: string;
  possibleDuplicateOverrides?: Record<string, boolean>;
  /** Notice rendered after the flight list (e.g. bulk import hints) */
  postListNotice?: React.ReactNode;
  /** Short reassurance copy below the title */
  reassurance?: string | null;
  showConfirm?: boolean;
  /** Status line under the title (e.g. duplicate check progress or counts) */
  statusLine?: string | React.ReactNode | null;
  /** Visibility controls etc., rendered after the list inside the same card */
  visibilitySlot?: React.ReactNode;
};

const STATUS_LABELS: Record<ImportPreviewStatus, string> = {
  comparing: 'Comparing',
  duplicate: 'Duplicate',
  error: 'Error',
  parsing: 'Parsing',
  possible_duplicate: 'Possible duplicate',
  ready: 'Ready',
};

const normalizeLocationLabel = (value?: string | null) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed === 'First Fix' || trimmed === 'Last Fix') return null;
  return trimmed;
};

function formatDate(date: ImportPreviewSummary['date']) {
  if (!date) return null;
  if (typeof date === 'string') {
    const asDate = new Date(date);
    if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10);
    return date;
  }
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return null;
}

function formatSummary(summary?: ImportPreviewSummary | null) {
  if (!summary) return 'No parsed summary';
  const parts: string[] = [];
  const dateLabel = formatDate(summary.date);
  const timeFormatted = summary.startTime?.match(/^\d{1,2}:\d{2} [AP]M$/i)
    ? summary.startTime
    : formatTimeToAmPm(summary.startTime);
  const dateWithTime = dateLabel && timeFormatted ? `${dateLabel} · ${timeFormatted}` : dateLabel;
  const takeoffLabel = normalizeLocationLabel(summary.takeoff);
  const landingLabel = normalizeLocationLabel(summary.landing);
  const freeDistanceKm = Number.isFinite(summary.freeDistanceKm as number) ? Number(summary.freeDistanceKm) : null;
  let fallbackDistanceKm: number | null = null;
  if (Number.isFinite(summary.distanceKm as number)) {
    fallbackDistanceKm = Number(summary.distanceKm);
  } else if (Number.isFinite(summary.routeDistanceKm as number)) {
    fallbackDistanceKm = Number(summary.routeDistanceKm);
  }
  const score = Number.isFinite(summary.score as number) ? Number(summary.score) : null;

  if (dateWithTime) parts.push(dateWithTime);
  if (summary.duration) parts.push(summary.duration);
  if (freeDistanceKm !== null || fallbackDistanceKm !== null) {
    const km = freeDistanceKm ?? fallbackDistanceKm;
    if (km !== null) parts.push(`${km.toFixed(1)} km`);
  }
  if (score !== null) parts.push(`${score.toFixed(1)} pts`);
  if (takeoffLabel) parts.push(`TO: ${takeoffLabel}`);
  if (landingLabel) parts.push(`LD: ${landingLabel}`);
  return parts.length ? parts.join(' · ') : 'No parsed summary';
}

function displayImportFileLabel(fileName: string, filePath?: string | null) {
  if (filePath && filePath !== fileName) return filePath;
  return fileName || 'flight.igc';
}

export const FlightImportPreview = ({
  confirmDisabled = false,
  confirmLabel = 'Confirm import',
  items,
  onConfirm,
  onRemove,
  onRetry,
  onTogglePossibleDuplicate,
  possibleDuplicateOverrides = {},
  showConfirm = false,
  panelTitle = 'Review import',
  statusLine: statusLineProp,
  reassurance = null,
  postListNotice = null,
  visibilitySlot = null,
}: FlightImportPreviewProps) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  if (!items.length) return null;

  const isComparing = items.some((i) => i.status === 'comparing');
  const fallbackStatusLine = isComparing
    ? `Comparing ${items.length} flight${items.length !== 1 ? 's' : ''} with your logbook…`
    : null;
  const statusLine = statusLineProp !== undefined ? statusLineProp : fallbackStatusLine;

  return (
    <div className="raf-flight-import-preview">
      <div className="raf-flight-import-preview__header">
        <div className="raf-flight-import-preview__title">{panelTitle}</div>
      </div>

      {reassurance ? <p className="raf-flight-import-preview__reassurance">{reassurance}</p> : null}

      {statusLine != null && statusLine !== '' ? (
        <div className="raf-flight-import-preview__progress" role="status">
          {typeof statusLine === 'string' || typeof statusLine === 'number' ? (
            <span className="raf-flight-import-preview__status-bit raf-flight-import-preview__status-bit--ok">
              {statusLine}
            </span>
          ) : (
            statusLine
          )}
        </div>
      ) : null}

      <ol className="raf-flight-import-preview__list">
        {items.map((item) => {
          const isExpanded = Boolean(expandedRows[item.id]);
          const hasDetails = Boolean(item.errorMessage || item.duplicateExplanation);
          const canShowDetails =
            (item.status === 'duplicate' || item.status === 'possible_duplicate' || item.status === 'error') &&
            hasDetails;
          const isPossible = item.status === 'possible_duplicate';
          const isParsing = item.status === 'parsing';
          const isComparingItem = item.status === 'comparing';
          const isError = item.status === 'error';

          return (
            <li
              key={item.id}
              className={`raf-flight-import-preview__item raf-flight-import-preview__item--${item.status}`}
            >
              <div className="raf-flight-import-preview__row-head">
                <div className="raf-flight-import-preview__name">
                  {displayImportFileLabel(item.fileName, item.filePath)}
                </div>
                <div className="raf-flight-import-preview__status">
                  {(isParsing || isComparingItem) && (
                    <span className="raf-flight-import-preview__spinner" aria-hidden="true" />
                  )}
                  <span
                    className={`raf-flight-import-preview__status-tag raf-flight-import-preview__status-tag--${item.status}`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
              </div>
              <div className="raf-flight-import-preview__meta-summary">{formatSummary(item.summary)}</div>

              <div className="raf-flight-import-preview__actions">
                {isPossible && onTogglePossibleDuplicate && (
                  <button
                    type="button"
                    className="raf-flight-import-preview__action"
                    onClick={() => onTogglePossibleDuplicate(item.id)}
                  >
                    {possibleDuplicateOverrides[item.id] ? 'Skip this possible duplicate' : 'Import anyway'}
                  </button>
                )}
                {canShowDetails && (
                  <button
                    type="button"
                    className="raf-flight-import-preview__action"
                    onClick={() => setExpandedRows((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  >
                    {isExpanded ? 'Hide details' : 'View details'}
                  </button>
                )}
                {isError && onRetry && (
                  <button type="button" className="raf-flight-import-preview__action" onClick={() => onRetry(item.id)}>
                    Retry
                  </button>
                )}
                {onRemove && !isParsing && !isComparingItem && (
                  <button
                    type="button"
                    className="raf-flight-import-preview__action raf-flight-import-preview__action--danger"
                    onClick={() => onRemove(item.id)}
                  >
                    Remove
                  </button>
                )}
              </div>

              {isExpanded && canShowDetails && (
                <div className="raf-flight-import-preview__details">
                  {item.errorMessage && <div>{item.errorMessage}</div>}
                  {item.duplicateExplanation && <div>{item.duplicateExplanation}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {postListNotice ? <div className="raf-flight-import-preview__post-list">{postListNotice}</div> : null}

      {visibilitySlot ? <div className="raf-flight-import-preview__visibility-slot">{visibilitySlot}</div> : null}

      {showConfirm && onConfirm && (
        <div className="raf-flight-import-preview__footer">
          <button
            type="button"
            className="raf-flight-import-preview__confirm"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
};
