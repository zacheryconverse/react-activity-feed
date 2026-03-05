/* eslint-disable sonarjs/cognitive-complexity */
import React, { useMemo, useState } from 'react';

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
  possibleDuplicateOverrides?: Record<string, boolean>;
  showConfirm?: boolean;
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
}: FlightImportPreviewProps) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    const next = {
      duplicates: 0,
      errors: 0,
      possibleDuplicates: 0,
      willUpload: 0,
    };

    items.forEach((item) => {
      if (item.status === 'ready') {
        next.willUpload += 1;
      } else if (item.status === 'comparing') {
        // not counted until dedupe returns
      } else if (item.status === 'duplicate') {
        next.duplicates += 1;
      } else if (item.status === 'possible_duplicate') {
        next.possibleDuplicates += 1;
        if (possibleDuplicateOverrides[item.id]) next.willUpload += 1;
      } else if (item.status === 'error') {
        next.errors += 1;
      }
    });

    return next;
  }, [items, possibleDuplicateOverrides]);

  if (!items.length) return null;

  const isComparing = items.some((i) => i.status === 'comparing');
  const comparisonComplete = !isComparing && !items.some((i) => i.status === 'parsing');

  return (
    <div className="raf-flight-import-preview">
      <div className="raf-flight-import-preview__header">
        <div className="raf-flight-import-preview__title">Flight import preview</div>
      </div>

      <p className="raf-flight-import-preview__reassurance">
        We compare each flight with your logbook so you never get duplicate entries. Duplicates are skipped
        automatically.
      </p>

      {comparisonComplete && (
        <div className="raf-flight-import-preview__summary">
          <span className="raf-flight-import-preview__summary-primary">
            Importing: {counts.willUpload} new {counts.willUpload === 1 ? 'flight' : 'flights'}
          </span>
          {counts.duplicates > 0 && (
            <span className="raf-flight-import-preview__summary-skipped">
              {counts.duplicates} duplicate{counts.duplicates !== 1 ? 's' : ''} skipped (already in logbook)
            </span>
          )}
          {counts.possibleDuplicates > 0 && (
            <span>
              {counts.possibleDuplicates} possible duplicate{counts.possibleDuplicates !== 1 ? 's' : ''}
            </span>
          )}
          {counts.errors > 0 && (
            <span>
              {counts.errors} error{counts.errors !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {isComparing && (
        <p className="raf-flight-import-preview__progress" role="status">
          Comparing {items.length} flight{items.length !== 1 ? 's' : ''} with your logbook…
        </p>
      )}

      {comparisonComplete && (
        <p className="raf-flight-import-preview__success" role="status">
          ✓ Compared with your logbook
        </p>
      )}

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
              <div className="raf-flight-import-preview__row">
                <div className="raf-flight-import-preview__meta">
                  <div className="raf-flight-import-preview__name">{item.fileName}</div>
                  {item.filePath && item.filePath !== item.fileName && (
                    <div className="raf-flight-import-preview__path">{item.filePath}</div>
                  )}
                  <div className="raf-flight-import-preview__summary">{formatSummary(item.summary)}</div>
                </div>
                <div className="raf-flight-import-preview__status">
                  {(isParsing || isComparingItem) && (
                    <span className="raf-flight-import-preview__spinner" aria-hidden="true" />
                  )}
                  <span
                    className={`raf-flight-import-preview__status-tag raf-flight-import-preview__status-tag--${item.status}`}
                  >
                    {STATUS_LABELS[item.status]}
                    {item.status === 'duplicate' && (
                      <span className="raf-flight-import-preview__status-hint"> - skipped</span>
                    )}
                  </span>
                </div>
              </div>

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
