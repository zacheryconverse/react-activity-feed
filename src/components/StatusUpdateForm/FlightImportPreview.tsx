import React, { useMemo, useState } from 'react';
import { LoadingIndicator } from 'react-file-utils';

export type ImportPreviewStatus = 'parsing' | 'ready' | 'duplicate' | 'possible_duplicate' | 'error';

export type ImportPreviewSummary = {
  date?: string | Date | null;
  distanceKm?: number | null;
  duration?: string | null;
  landing?: string | null;
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
  const takeoffLabel = normalizeLocationLabel(summary.takeoff);
  const landingLabel = normalizeLocationLabel(summary.landing);
  if (dateLabel) parts.push(dateLabel);
  if (summary.duration) parts.push(summary.duration);
  if (Number.isFinite(summary.distanceKm as number)) {
    parts.push(`${Number(summary.distanceKm).toFixed(1)} km`);
  }
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

  return (
    <div className="raf-flight-import-preview">
      <div className="raf-flight-import-preview__header">
        <div className="raf-flight-import-preview__title">Flight import preview</div>
        <div className="raf-flight-import-preview__counts">
          <span>Will upload: {counts.willUpload}</span>
          <span>Duplicates: {counts.duplicates}</span>
          <span>Possible duplicates: {counts.possibleDuplicates}</span>
          <span>Errors: {counts.errors}</span>
        </div>
      </div>

      <ol className="raf-flight-import-preview__list">
        {items.map((item) => {
          const isExpanded = Boolean(expandedRows[item.id]);
          const hasDetails = Boolean(item.errorMessage || item.duplicateExplanation);
          const canShowDetails =
            (item.status === 'duplicate' || item.status === 'possible_duplicate' || item.status === 'error') &&
            hasDetails;
          const isPossible = item.status === 'possible_duplicate';
          const isParsing = item.status === 'parsing';
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
                  {isParsing && (
                    <span className="raf-flight-import-preview__spinner">
                      <LoadingIndicator />
                    </span>
                  )}
                  <span
                    className={`raf-flight-import-preview__status-tag raf-flight-import-preview__status-tag--${item.status}`}
                  >
                    {STATUS_LABELS[item.status]}
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
                {onRemove && !isParsing && (
                  <button type="button" className="raf-flight-import-preview__action" onClick={() => onRemove(item.id)}>
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
