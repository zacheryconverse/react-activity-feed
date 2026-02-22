/* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-identical-functions, sonarjs/cognitive-complexity */
// @ts-nocheck
import {
  useRef,
  useState,
  useCallback,
  useMemo,
  SyntheticEvent,
  ClipboardEvent,
  FormEvent,
  useEffect,
  useLayoutEffect,
} from 'react';
import axios from 'axios';
import _uniq from 'lodash/uniq';
import _difference from 'lodash/difference';
import _includes from 'lodash/includes';
import { find as linkifyFind } from 'linkifyjs';
import { useDebouncedCallback } from 'use-debounce';
import { BaseEmoji, EmojiData } from 'emoji-mart';
import { UploadState } from 'react-file-utils';
import { NewActivity, OGAPIResponse, StreamClient, UR } from 'getstream';
import { solver, scoringRules } from 'igc-xc-score';

import { DefaultAT, DefaultUT, useStreamContext } from '../../context';
import { StatusUpdateFormProps } from './StatusUpdateForm';
import { parseIgcFile, extractFlightStatistics, extractIgcCompetitionClass, FlightStatistics } from './igcParser';
import { extractFilesFromZip, hashIgcContent, inferImportFileType } from './importParsers';
import { buildPreviewFlightStats, chunkItemsForPayload } from './importShared';
import {
  generateRandomId,
  dataTransferItemsToFiles,
  dataTransferItemsHaveFiles,
  inputValueFromEvent,
} from '../../utils';
import { NetworkRequestTypes } from 'utils/errors';

type Og = {
  dismissed: boolean;
  scrapingActive: boolean;
  data?: OGAPIResponse;
};

export type FileUploadState = {
  file: File | Blob;
  id: string;
  state: UploadState;
  data?: FlightStatistics;
  dedupeStatus?: 'duplicate' | 'possible_duplicate' | 'ready' | null;
  duplicateExplanation?: string | null;
  errorMessage?: string;
  filePath?: string | null;
  fingerprint?: string | null;
  overridePossibleDuplicate?: boolean;
  url?: string;
};

export type ImageUploadState = FileUploadState & { previewUri?: string };

type OgState = { activeUrl: string; data: Record<string, Og>; order: string[] };

type ImagesState = { data: Record<string, ImageUploadState>; order: string[] };

type FilesState = { data: Record<string, FileUploadState>; order: string[] };

type IgcState = { data: Record<string, FileUploadState>; order: string[] };

type UseOgProps = { client: StreamClient; logErr: (e: Error | unknown, type: NetworkRequestTypes) => void };

type UseUploadProps = UseOgProps & {
  allowBulkImport?: boolean;
};

const defaultOgState = { activeUrl: '', data: {}, order: [] };
const defaultImageState = { data: {}, order: [] };
const defaultFileState = { data: {}, order: [] };
const defaultIgcState = { data: {}, order: [] };
const MAX_BATCH_IMPORT_ITEMS = 25;
const MAX_BATCH_IMPORT_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_PREVIEW_IMPORT_ITEMS = 200;
const MAX_PREVIEW_IMPORT_PAYLOAD_BYTES = 256 * 1024;

const useTextArea = () => {
  const [text, setText] = useState('');
  const [curser, setCurser] = useState<number | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>();

  const insertText = useCallback((insertedText: string) => {
    setText((prevText) => {
      const textareaElement = textInputRef.current;
      if (!textareaElement) {
        setCurser(null);
        return prevText + insertedText;
      }

      // Insert emoji at previous cursor position
      const { selectionStart, selectionEnd } = textareaElement;
      setCurser(selectionStart + insertedText.length);
      return prevText.slice(0, selectionStart) + insertedText + prevText.slice(selectionEnd);
    });
  }, []);

  const onSelectEmoji = useCallback((emoji: EmojiData) => insertText((emoji as BaseEmoji).native), []);

  useLayoutEffect(() => {
    // Update cursorPosition after insertText is fired
    const textareaElement = textInputRef.current;
    if (textareaElement && curser !== null) {
      textareaElement.selectionStart = curser;
      textareaElement.selectionEnd = curser;
    }
  }, [curser]);

  return { text, setText, insertText, onSelectEmoji, textInputRef };
};

const useOg = ({ client, logErr }: UseOgProps) => {
  const [og, setOg] = useState<OgState>(defaultOgState);
  const reqInProgress = useRef<Record<string, boolean>>({});

  const activeOg = og.data[og.activeUrl]?.data;

  const orderedOgStates = og.order.map((url) => og.data[url]).filter(Boolean);

  const isOgScraping = orderedOgStates.some((state) => state.scrapingActive);

  const availableOg = orderedOgStates.map((state) => state.data).filter(Boolean) as OGAPIResponse[];

  const resetOg = useCallback(() => setOg(defaultOgState), []);

  const setActiveOg = useCallback((url: string) => {
    if (url) {
      setOg((prevState) => {
        prevState.data[url].dismissed = false;
        return { ...prevState, activeUrl: url };
      });
    }
  }, []);

  const dismissOg = useCallback((e?: SyntheticEvent) => {
    e?.preventDefault();
    setOg((prevState) => {
      for (const url in prevState.data) {
        prevState.data[url].dismissed = true;
      }
      return { ...prevState, activeUrl: '' };
    });
  }, []);

  const handleOG = useCallback((text: string) => {
    const urls = _uniq(linkifyFind(text, 'url').map((info) => info.href));
    // removed delete ogs from state and add the new urls
    setOg((prevState) => {
      const newUrls = _difference(urls, prevState.order);
      const removedUrls = _difference(prevState.order, urls);

      if (!_includes(urls, prevState.activeUrl)) {
        prevState.activeUrl = '';
        for (const url of urls) {
          const og = prevState.data[url];
          if (og?.data && !og.dismissed) {
            prevState.activeUrl = url;
            break;
          }
        }
      }

      for (const url of removedUrls) {
        delete prevState.data[url];
      }

      for (const url of newUrls) {
        prevState.data[url] = { scrapingActive: true, dismissed: false };
      }

      return { ...prevState, order: urls };
    });
  }, []);

  const handleOgDebounced = useDebouncedCallback(handleOG, 750, { leading: true, trailing: true });

  useEffect(() => {
    og.order
      .filter((url) => !reqInProgress.current[url] && og.data[url].scrapingActive)
      .forEach(async (url) => {
        reqInProgress.current[url] = true;
        try {
          const resp = await client.og(url);
          resp.url = url;
          setOg((prevState) => {
            prevState.data[url] = { ...prevState.data[url], data: resp, scrapingActive: false, dismissed: false };
            prevState.activeUrl = prevState.activeUrl || url;
            return { ...prevState };
          });
        } catch (e) {
          console.warn(e);
          logErr(e, 'get-og');
          setOg((prevState) => {
            prevState.data[url] = { ...prevState.data[url], scrapingActive: false, dismissed: false };
            return { ...prevState };
          });
        }
        delete reqInProgress.current[url];
      });
  }, [og.order]);

  return {
    og,
    activeOg,
    setActiveOg,
    resetOg,
    availableOg,
    orderedOgStates,
    isOgScraping,
    handleOgDebounced,
    dismissOg,
    ogActiveUrl: og.activeUrl,
  };
};

const useUpload = ({ client, logErr, allowBulkImport = false }: UseUploadProps) => {
  const [images, setImages] = useState<ImagesState>(defaultImageState);
  const [files, setFiles] = useState<FilesState>(defaultFileState);
  const [igcs, setIgcs] = useState<IgcState>(defaultIgcState);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const reqInProgress = useRef<Record<string, boolean>>({});

  const orderedImages = images.order.map((id) => images.data[id]);

  const uploadedImages = orderedImages.filter((upload) => upload.url);

  const orderedFiles = files.order.map((id) => files.data[id]);

  const uploadedFiles = orderedFiles.filter((upload) => upload.url);

  const orderedIgcs = igcs.order.map((id) => igcs.data[id]);

  const uploadedIgcs = orderedIgcs.filter((upload) => upload && upload.state === 'finished' && upload.data);

  const igcsPreviewItems = orderedIgcs.reduce((acc, upload) => {
    if (!upload) return acc;
    const stats = upload.data;
    const firstPoint = stats?.points?.[0];
    const lastPoint = stats?.points?.[stats.points.length - 1];
    let status: 'parsing' | 'ready' | 'duplicate' | 'possible_duplicate' | 'error' = 'parsing';
    if (upload.state === 'failed') status = 'error';
    if (upload.state === 'finished' && stats) status = 'ready';
    if (upload.dedupeStatus === 'duplicate') status = 'duplicate';
    if (upload.dedupeStatus === 'possible_duplicate') status = 'possible_duplicate';
    const freeDistanceKm = Number.isFinite(stats?.freeDistance as number) ? Number(stats?.freeDistance) : null;
    const routeDistanceKm = Number.isFinite(stats?.routeDistance as number) ? Number(stats?.routeDistance) : null;

    acc[upload.id] = {
      id: upload.id,
      fileName: (upload.file as File)?.name || 'flight.igc',
      filePath: upload.filePath || null,
      status,
      summary: stats
        ? {
            freeDistanceKm,
            routeDistanceKm,
            date: stats.date || null,
            distanceKm: freeDistanceKm !== null ? freeDistanceKm : routeDistanceKm,
            duration: stats.flightDuration || null,
            landing: lastPoint?.label || null,
            score: Number.isFinite(stats.score as number) ? Number(stats.score) : null,
            takeoff: firstPoint?.label || null,
          }
        : null,
      errorMessage: upload.errorMessage || null,
      duplicateExplanation: upload.duplicateExplanation || null,
    };
    return acc;
  }, {});

  const flightImportOrder = [...igcs.order];
  const flightImportPreviewItems = flightImportOrder.map((id) => igcsPreviewItems[id]).filter(Boolean);
  const possibleDuplicateOverrides = flightImportOrder.reduce((acc, id) => {
    const item = igcs.data[id];
    if (item?.overridePossibleDuplicate) acc[id] = true;
    return acc;
  }, {});

  const resetUpload = useCallback(() => {
    setImages(defaultImageState);
    setFiles(defaultFileState);
    setIgcs(defaultIgcState);
    setSourceError(null);
  }, []);

  const uploadNewImage = useCallback((file: File | Blob) => {
    const id = generateRandomId();
    setImages(({ order, data }) => {
      data[id] = { id, file, state: 'uploading' };
      return { data: { ...data }, order: [...order, id] };
    });

    if (FileReader) {
      // TODO: Possibly use URL.createObjectURL instead. However, then we need
      // to release the previews when not used anymore though.
      const reader = new FileReader();
      reader.onload = (event) => {
        const previewUri = event.target?.result as string;
        if (!previewUri) return;
        setImages((prevState) => {
          if (!prevState.data[id]) return prevState;
          prevState.data[id].previewUri = previewUri;
          return { ...prevState, data: { ...prevState.data } };
        });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const uploadNewFile = useCallback((file: File) => {
    const id = generateRandomId();
    setFiles(({ order, data }) => {
      data[id] = { id, file, state: 'uploading' };
      return { data: { ...data }, order: [...order, id] };
    });
  }, []);

  const uploadNewIgc = useCallback(
    async (file, sourcePath = null) => {
      const id = generateRandomId();
      setIgcs(({ data, order }) => {
        data[id] = { id, file, filePath: sourcePath || file?.name || null, state: 'uploading' };
        return { data: { ...data }, order: [...order, id] };
      });

      try {
        let igcContent = await file.text();

        if (!igcContent || typeof igcContent !== 'string') {
          throw new Error('Invalid IGC file content');
        }

        let igcData = parseIgcFile(igcContent);

        if (!igcData) {
          igcContent = reformatIgcContent(igcContent);
          igcData = parseIgcFile(igcContent);

          if (!igcData) {
            throw new Error('Failed to parse IGC file');
          }

          file = new File([igcContent], file.name, {
            type: file.type,
          });
        }

        const competitionClass = extractIgcCompetitionClass(igcContent);
        const result = solver(igcData, scoringRules.XContest).next().value;
        // console.log('result', result);
        const flightStats = extractFlightStatistics(result, {
          competitionClass,
        });
        const igcHash = await hashIgcContent(igcContent);
        const url = await client.files.upload(file);
        console.log('Flight Statistics:', flightStats);
        // Retrieve the current user ID from your client context
        const userId = client.currentUser?.id;
        if (!userId) throw new Error('User ID not available');

        setIgcs((prevState) => {
          prevState.data[id] = {
            ...prevState.data[id],
            url: url.file,
            state: 'finished',
            data: flightStats,
            fingerprint: igcHash,
            errorMessage: undefined,
          };
          return { ...prevState };
        });

        setUploadError(null);
      } catch (error) {
        console.error('Error uploading IGC file:', error.message);

        const errorMessage = error.message.includes('Invalid IGC file content')
          ? 'The uploaded file does not contain valid IGC content. Please ensure the file follows the IGC format.'
          : error.message.includes('Failed to parse IGC file')
          ? 'The IGC file could not be parsed. Please check the file for any formatting errors or unsupported headers.'
          : 'An unexpected error occurred while uploading the IGC file. Please try again.';

        setUploadError(errorMessage);
        logErr(new Error(errorMessage), 'upload-igc');
        setIgcs((prevState) => {
          prevState.data[id].state = 'failed';
          prevState.data[id].errorMessage = errorMessage;
          return { ...prevState };
        });
      }
    },
    [client, logErr],
  );

  const reformatIgcContent = (content) => {
    const lines = content.split('\n');
    const reformattedLines = lines.map((line) => {
      if (line.startsWith('HFDTEDATE:')) {
        return line.replace('HFDTEDATE:', 'HFDTE');
      }
      if (line.startsWith('HSCCLCOMPETITION CLASS:')) {
        return line.replace('HSCCLCOMPETITION CLASS:', 'HFCCLCOMPETITIONCLASS:');
      }
      // Handle other reformatting cases here
      return line;
    });

    return reformattedLines.join('\n');
  };

  const expandZipSource = useCallback(
    async (zipFile) => {
      const extractedFiles = await extractFilesFromZip(zipFile);
      if (!extractedFiles.length) {
        throw new Error(`ZIP ${zipFile.name} contains no supported .igc files`);
      }

      for (let i = 0; i < extractedFiles.length; i += 1) {
        const extracted = extractedFiles[i];
        if (extracted.inferredType === 'igc') {
          await uploadNewIgc(extracted.file, extracted.path);
        }
      }
    },
    [uploadNewIgc],
  );

  const uploadImage = useCallback(async (id: string, img: ImageUploadState) => {
    setImages((prevState) => {
      if (!prevState.data[id]) return prevState;
      prevState.data[id].state = 'uploading';
      return { ...prevState };
    });

    try {
      const { file: url } = await client.images.upload(img.file as File);
      setImages((prevState) => {
        if (!prevState.data[id]) return prevState;
        prevState.data[id].url = url;
        prevState.data[id].state = 'finished';
        return { ...prevState };
      });
    } catch (e) {
      console.warn(e);
      setImages((prevState) => {
        if (!prevState.data[id]) return prevState;
        logErr(e, 'upload-image');
        prevState.data[id].state = 'failed';
        return { ...prevState };
      });
    }
  }, []);

  const uploadFile = useCallback(async (id: string, file: FileUploadState) => {
    setFiles((prevState) => {
      if (!prevState.data[id]) return prevState;
      prevState.data[id].state = 'uploading';
      return { ...prevState, data: { ...prevState.data } };
    });

    try {
      const { file: url } = await client.files.upload(file.file as File);
      setFiles((prevState) => {
        if (!prevState.data[id]) return prevState;
        prevState.data[id].url = url;
        prevState.data[id].state = 'finished';
        return { ...prevState, data: { ...prevState.data } };
      });
    } catch (e) {
      console.warn(e);
      setFiles((prevState) => {
        if (!prevState.data[id]) return prevState;
        logErr(e, 'upload-file');
        prevState.data[id].state = 'failed';
        return { ...prevState, data: { ...prevState.data } };
      });
    }
  }, []);

  const uploadIgc = useCallback(async (id, igc) => {
    // eslint-disable-next-line sonarjs/no-identical-functions
    setIgcs((prevState) => {
      if (!prevState.data[id]) return prevState;
      prevState.data[id].state = 'uploading';
      return { ...prevState };
    });

    try {
      const { file: url } = await client.files.upload(igc.file);
      // eslint-disable-next-line sonarjs/no-identical-functions
      setIgcs((prevState) => {
        if (!prevState.data[id]) return prevState;
        prevState.data[id].url = url;
        prevState.data[id].state = 'finished';
        prevState.data[id].errorMessage = undefined;
        return { ...prevState };
      });
    } catch (e) {
      console.warn(e);
      setIgcs((prevState) => {
        if (!prevState.data[id]) return prevState;
        logErr(e, 'upload-igc');
        prevState.data[id].state = 'failed';
        prevState.data[id].errorMessage = 'Failed to upload IGC file. Please retry.';
        return { ...prevState };
      });
    }
  }, []);

  const uploadNewFiles = useCallback(
    async (files) => {
      const fileList = Array.isArray(files) ? files : Array.from(files || []);
      setSourceError(null);

      for (let i = 0; i < fileList.length; i += 1) {
        const file = fileList[i];
        if (file.type.startsWith('image/')) {
          uploadNewImage(file);
          continue;
        }

        const inferredType = inferImportFileType(file.name || '');
        const isCsvFile = String(file?.name || '')
          .toLowerCase()
          .endsWith('.csv');
        const isDirectoryUpload = Boolean(file?.webkitRelativePath);
        const sourcePath = file?.webkitRelativePath || file?.name || null;

        try {
          if (allowBulkImport && isCsvFile) {
            setSourceError('CSV import is no longer supported. Use .igc or .zip flight files.');
            continue;
          }
          if (allowBulkImport && isDirectoryUpload && !inferredType) {
            setSourceError(`Skipping unsupported folder file: ${file.name}. Only .igc and .zip are supported.`);
            continue;
          }
          if (!allowBulkImport && inferredType === 'zip') {
            setSourceError('Bulk ZIP import moved to Flight Log. Use Profile > Flight Log > Import flights.');
            continue;
          }
          if (!allowBulkImport && inferredType === 'igc' && igcs.order.length >= 1) {
            setSourceError('Only one IGC can be attached to a post.');
            continue;
          }

          if (inferredType === 'igc') {
            await uploadNewIgc(file, sourcePath);
          } else if (inferredType === 'zip') {
            await expandZipSource(file);
          } else if (file instanceof File) {
            uploadNewFile(file);
          }
        } catch (error) {
          const message = error?.message || `Failed processing file ${file.name}`;
          setSourceError(message);
          logErr(new Error(message), 'upload-file');
        }
      }
    },
    [allowBulkImport, igcs.order.length, uploadNewImage, uploadNewIgc, expandZipSource, uploadNewFile, logErr],
  );

  const removeImage = useCallback((id: string) => {
    setImages((prevState) => {
      prevState.order = prevState.order.filter((oid) => id !== oid);
      delete prevState.data[id];
      return { ...prevState };
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    // eslint-disable-next-line sonarjs/no-identical-functions
    setFiles((prevState) => {
      prevState.order = prevState.order.filter((oid) => id !== oid);
      delete prevState.data[id];
      return { ...prevState };
    });
  }, []);

  const removeIgc = useCallback((id: string) => {
    // eslint-disable-next-line sonarjs/no-identical-functions
    setIgcs((prevState) => {
      prevState.order = prevState.order.filter((oid) => id !== oid);
      delete prevState.data[id];
      return { ...prevState };
    });
  }, []);

  const removeImportItems = useCallback((ids: string[] = []) => {
    if (!ids.length) return;
    const idSet = new Set(ids.map((id) => String(id)));

    setIgcs((prevState) => {
      const next = {
        data: { ...prevState.data },
        order: prevState.order.filter((id) => !idSet.has(String(id))),
      };
      prevState.order.forEach((id) => {
        if (idSet.has(String(id))) {
          delete next.data[id];
        }
      });
      return next;
    });
  }, []);

  const applyImportClassifications = useCallback((results = []) => {
    const byId = new Map(
      results.filter((result) => result && result.localId).map((result) => [String(result.localId), result]),
    );

    if (!byId.size) return;

    setIgcs((prevState) => {
      const next = {
        data: { ...prevState.data },
        order: [...prevState.order],
      };
      prevState.order.forEach((id) => {
        const classification = byId.get(String(id));
        if (!classification || !next.data[id]) return;
        const mappedStatus =
          classification.classification === 'duplicate'
            ? 'duplicate'
            : classification.classification === 'possible_duplicate'
            ? 'possible_duplicate'
            : 'ready';
        next.data[id] = {
          ...next.data[id],
          dedupeStatus: mappedStatus,
          duplicateExplanation: classification.explanation || null,
        };
      });
      return next;
    });
  }, []);

  const togglePossibleDuplicateOverride = useCallback((id: string) => {
    setIgcs((prevState) => {
      if (!prevState.data[id]) return prevState;
      prevState.data[id].overridePossibleDuplicate = !prevState.data[id].overridePossibleDuplicate;
      return { ...prevState };
    });
  }, []);

  useEffect(() => {
    images.order
      .filter((id) => !reqInProgress.current[id] && images.data[id].state === 'uploading')
      .forEach(async (id) => {
        reqInProgress.current[id] = true;
        await uploadImage(id, images.data[id]);
        delete reqInProgress.current[id];
      });
  }, [images.order]);

  useEffect(() => {
    files.order
      .filter((id) => !reqInProgress.current[id] && files.data[id].state === 'uploading')
      .forEach(async (id) => {
        reqInProgress.current[id] = true;
        await uploadFile(id, files.data[id]);
        delete reqInProgress.current[id];
      });
  }, [files.order]);

  return {
    images,
    files,
    igcs,
    orderedImages,
    orderedFiles,
    orderedIgcs,
    igcsPreviewItems,
    flightImportOrder,
    flightImportPreviewItems,
    possibleDuplicateOverrides,
    uploadedImages,
    uploadedFiles,
    uploadedIgcs,
    resetUpload,
    uploadNewFiles,
    uploadFile,
    uploadImage,
    uploadIgc,
    uploadNewIgc,
    removeFile,
    removeImage,
    removeIgc,
    removeImportItems,
    applyImportClassifications,
    togglePossibleDuplicateOverride,
    uploadError,
    sourceError,
  };
};

export function useStatusUpdateForm<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
>({
  activityVerb,
  feedGroup,
  modifyActivityData,
  doRequest,
  userId,
  allowBulkImport = false,
  onSuccess,
}: { activityVerb: string; feedGroup: string } & Pick<
  StatusUpdateFormProps<AT>,
  'allowBulkImport' | 'doRequest' | 'modifyActivityData' | 'onSuccess' | 'userId'
>) {
  const [submitting, setSubmitting] = useState(false);

  const appCtx = useStreamContext<UT, AT, CT, RT, CRT, PT>();
  const client = appCtx.client as StreamClient<UT, AT, CT, RT, CRT, PT>;
  const userData = (appCtx.user?.data || {}) as UT;
  const logErr: UseOgProps['logErr'] = useCallback(
    (e, type) => appCtx.errorHandler(e, type, { userId, feedGroup }),
    [],
  );

  const { text, setText, insertText, onSelectEmoji, textInputRef } = useTextArea();

  const { resetOg, setActiveOg, ogActiveUrl, activeOg, dismissOg, availableOg, isOgScraping, handleOgDebounced } =
    useOg({ client: client as StreamClient, logErr });

  const {
    images,
    files,
    igcs,
    orderedImages,
    orderedFiles,
    orderedIgcs,
    igcsPreviewItems,
    flightImportOrder,
    flightImportPreviewItems,
    possibleDuplicateOverrides,
    uploadedImages,
    uploadedFiles,
    uploadedIgcs,
    resetUpload,
    uploadNewFiles,
    uploadFile,
    uploadImage,
    uploadIgc,
    // uploadNewIgc,
    removeFile,
    removeImage,
    removeIgc,
    removeImportItems,
    applyImportClassifications,
    togglePossibleDuplicateOverride,
    uploadError,
    sourceError,
  } = useUpload({ client: client as StreamClient, logErr, allowBulkImport });
  const [previewingImports, setPreviewingImports] = useState(false);
  const [importingFlights, setImportingFlights] = useState(false);
  const [flightImportSummary, setFlightImportSummary] = useState<{
    counts?: {
      duplicateSkipped?: number;
      errors?: number;
      imported?: number;
      possibleSkipped?: number;
    };
    sessionId?: string | null;
  } | null>(null);
  const [previewImportError, setPreviewImportError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastPreviewSignatureRef = useRef<string>('');

  const previewCandidates = useMemo(() => {
    const candidates = [];
    orderedIgcs.forEach((igc) => {
      if (!igc || igc.state !== 'finished' || !igc.data) return;
      candidates.push({
        localId: igc.id,
        type: 'igc',
        igcHash: igc.fingerprint || null,
        ingestMethod: igc?.data?.ingestMethod || igc?.data?.ingest_method || null,
        flightStats: igc.data,
      });
    });
    return candidates;
  }, [orderedIgcs]);

  const previewRequestItems = useMemo(
    () =>
      previewCandidates.map((item) => ({
        ...item,
        flightStats: buildPreviewFlightStats(item.flightStats || {}, {
          includeFirstPointFallback: true,
          maxPreviewPoints: 2,
        }),
      })),
    [previewCandidates],
  );

  const previewSignature = useMemo(
    () =>
      JSON.stringify(
        previewRequestItems.map((item) => ({
          localId: item.localId,
          type: item.type,
          igcHash: item.igcHash || null,
          date: item?.flightStats?.date || item?.flightStats?.flight_date || null,
          routeDistance: item?.flightStats?.routeDistance || item?.flightStats?.route_distance_km || null,
        })),
      ),
    [previewRequestItems],
  );

  const resetState = useCallback(() => {
    setText('');
    setSubmitting(false);
    setFlightImportSummary(null);
    setPreviewImportError(null);
    setSubmitError(null);
    resetOg();
    resetUpload();
  }, []);

  useEffect(() => {
    const activeUserId = client.currentUser?.id;
    if (!appCtx.baseUrl || !activeUserId) return;
    if (!previewRequestItems.length) {
      lastPreviewSignatureRef.current = '';
      setPreviewingImports(false);
      setPreviewImportError(null);
      return;
    }
    if (previewSignature === lastPreviewSignatureRef.current) return;
    lastPreviewSignatureRef.current = previewSignature;

    let cancelled = false;
    setPreviewingImports(true);

    const runPreview = async () => {
      try {
        const chunks = chunkItemsForPayload(previewRequestItems, {
          maxItems: MAX_PREVIEW_IMPORT_ITEMS,
          maxPayloadBytes: MAX_PREVIEW_IMPORT_PAYLOAD_BYTES,
        });

        const aggregatedItems = [];
        for (const chunk of chunks) {
          const response = await axios.post(`${appCtx.baseUrl}/auth/flight-import/preview`, {
            userId: activeUserId,
            items: chunk,
          });
          aggregatedItems.push(...(response.data?.items || []));
        }
        if (cancelled) return;
        setPreviewImportError(null);
        applyImportClassifications(aggregatedItems);
      } catch (error) {
        if (!cancelled) {
          const statusCode = error?.response?.status;
          const isPayloadError =
            statusCode === 413 || /too large/i.test(String(error?.message || error?.response?.data?.error || ''));
          setPreviewImportError(
            isPayloadError
              ? 'Preview request is too large. Remove some files/rows and retry.'
              : 'Unable to run duplicate checks right now. Confirm import is disabled until preview succeeds.',
          );
          console.warn('Unable to preview flight import dedupe:', error?.message || error);
        }
      } finally {
        if (!cancelled) setPreviewingImports(false);
      }
    };

    runPreview();

    return () => {
      cancelled = true;
    };
  }, [appCtx.baseUrl, client.currentUser?.id, previewSignature, applyImportClassifications]);

  const hasBulkImportMode = allowBulkImport && orderedIgcs.length > 1;
  const importableFlightItemCount = flightImportPreviewItems.filter((item) => {
    if (item.status === 'ready') return true;
    if (item.status === 'possible_duplicate') {
      return Boolean(possibleDuplicateOverrides[item.id]);
    }
    return false;
  }).length;
  const showFlightImportConfirm =
    hasBulkImportMode && flightImportPreviewItems.length > 0 && importableFlightItemCount > 0;
  const confirmFlightImportDisabled =
    importingFlights || previewingImports || importableFlightItemCount === 0 || Boolean(previewImportError);

  const confirmFlightImport = useCallback(async () => {
    const activeUserId = client.currentUser?.id;
    if (!appCtx.baseUrl || !activeUserId) return;
    if (previewImportError) return;

    setImportingFlights(true);
    setFlightImportSummary(null);

    try {
      const payloadItems = [];

      for (const igc of orderedIgcs) {
        if (!igc || igc.state !== 'finished' || !igc.data) continue;
        if (igc.dedupeStatus === 'duplicate') continue;
        if (igc.dedupeStatus === 'possible_duplicate' && !igc.overridePossibleDuplicate) {
          continue;
        }
        const igcContent = await igc.file.text();
        payloadItems.push({
          localId: igc.id,
          type: 'igc',
          fileName: (igc.file as File)?.name || 'flight.igc',
          filePath: igc.filePath || null,
          activityIgcUrl: igc.url || null,
          igcHash: igc.fingerprint || null,
          igcContent,
          flightStats: {
            ...igc.data,
            ingestMethod: hasBulkImportMode ? 'bulk_igc' : 'manual_igc',
          },
        });
      }

      if (!payloadItems.length) {
        setImportingFlights(false);
        return;
      }

      const forcePossibleDuplicateIds = Object.keys(possibleDuplicateOverrides || {}).filter(
        (id) => possibleDuplicateOverrides[id],
      );

      const chunks = chunkItemsForPayload(payloadItems, {
        maxItems: MAX_BATCH_IMPORT_ITEMS,
        maxPayloadBytes: MAX_BATCH_IMPORT_PAYLOAD_BYTES,
      });
      const aggregate = {
        counts: {
          duplicateSkipped: 0,
          errors: 0,
          imported: 0,
          possibleSkipped: 0,
        },
        items: [],
        sessionId: null,
      };

      for (const chunk of chunks) {
        const chunkIds = new Set(chunk.map((item) => String(item.localId)));
        const chunkForceIds = forcePossibleDuplicateIds.filter((id) => chunkIds.has(String(id)));
        const response = await axios.post(`${appCtx.baseUrl}/auth/flight-import/batch`, {
          bulk: hasBulkImportMode || chunks.length > 1,
          forcePossibleDuplicateIds: chunkForceIds,
          items: chunk,
          sessionId: aggregate.sessionId,
          source: hasBulkImportMode ? 'bulk_manual' : 'manual_single',
          userId: activeUserId,
        });

        const responseItems = response.data?.items || [];
        const responseCounts = response.data?.counts || {};
        aggregate.items.push(...responseItems);
        aggregate.counts.imported += Number(responseCounts.imported || 0);
        aggregate.counts.duplicateSkipped += Number(responseCounts.duplicateSkipped || 0);
        aggregate.counts.possibleSkipped += Number(responseCounts.possibleSkipped || 0);
        aggregate.counts.errors += Number(responseCounts.errors || 0);
        if (!aggregate.sessionId && response.data?.sessionId) {
          aggregate.sessionId = response.data.sessionId;
        }
      }

      const resultItems = aggregate.items;
      const importedIds = resultItems.filter((item) => item.status === 'imported').map((item) => String(item.localId));

      if (importedIds.length) {
        removeImportItems(importedIds);
      }

      const classifications = resultItems
        .filter((item) => item.status !== 'imported')
        .map((item) => ({
          localId: item.localId,
          classification:
            item.status === 'duplicate_skipped'
              ? 'duplicate'
              : item.status === 'possible_skipped'
              ? 'possible_duplicate'
              : 'new',
          explanation: item.explanation || item.message || null,
        }));
      if (classifications.length) {
        applyImportClassifications(classifications);
      }

      setFlightImportSummary({
        counts: aggregate.counts,
        sessionId: aggregate.sessionId || null,
      });
    } catch (error) {
      console.error('Bulk flight import failed:', error?.message || error);
      setFlightImportSummary({
        counts: {
          imported: 0,
          errors: 1,
        },
      });
    } finally {
      setImportingFlights(false);
    }
  }, [
    appCtx.baseUrl,
    client.currentUser?.id,
    orderedIgcs,
    possibleDuplicateOverrides,
    hasBulkImportMode,
    previewImportError,
    removeImportItems,
    applyImportClassifications,
  ]);

  const object = () => {
    for (const igc of orderedIgcs) {
      if (igc.url) return igc.url;
    }

    for (const image of orderedImages) {
      if (image.url) return image.url;
    }
    return text.trim();
  };

  const canSubmit = () =>
    (() => {
      const hasSingleIgcReady =
        orderedIgcs.length === 1 &&
        Boolean(orderedIgcs[0]) &&
        orderedIgcs[0].state !== 'uploading' &&
        Boolean(orderedIgcs[0].data);
      const hasObject = Boolean(object()) || hasSingleIgcReady;
      const previewGate = !previewingImports || hasSingleIgcReady;

      return (
        !submitting &&
        hasObject &&
        orderedIgcs.length <= 1 &&
        orderedImages.every((upload) => upload.state !== 'uploading') &&
        orderedFiles.every((upload) => upload.state !== 'uploading') &&
        orderedIgcs.every((upload) => {
          if (upload.state === 'uploading' || !upload.data) return false;
          if (!upload.dedupeStatus) {
            return false;
          }
          if (upload.dedupeStatus === 'duplicate') {
            return true;
          }
          if (upload.dedupeStatus === 'possible_duplicate' && !upload.overridePossibleDuplicate) {
            return false;
          }
          return true;
        }) &&
        !isOgScraping &&
        previewGate &&
        !previewImportError &&
        !uploadError &&
        !sourceError
      );
    })();

  const addActivity = async () => {
    let flightId;
    let uploadedIgcUrl: string | null = null;
    // for (const igc of uploadedIgcs) {
    if (uploadedIgcs.length === 1) {
      const igc = uploadedIgcs[0];
      const formData = new FormData();
      formData.append('file', igc.file);
      formData.append('userId', client.currentUser?.id);
      formData.append('flightStats', JSON.stringify(igc.data));
      formData.append('localId', String(igc.id));
      if (igc.overridePossibleDuplicate) {
        formData.append('forcePossibleDuplicate', 'true');
      }

      if (!appCtx.baseUrl) {
        console.error(
          'API endpoint (baseUrl) is not configured. Please ensure the StreamApp component is provided with a baseUrl prop.',
        );
        throw new Error(
          'API endpoint (baseUrl) is not configured. Please ensure the StreamApp component is provided with a baseUrl prop.',
        );
      }

      const response = await axios.post(`${appCtx.baseUrl}/auth/upload-igc`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!response?.data?.duplicate) {
        flightId = response.data.flightId;
        uploadedIgcUrl = response.data?.igcFileUrl || null;
      }
    }

    const fallbackObject =
      uploadedIgcUrl || object() || (uploadedIgcs.length === 1 ? `igc:${uploadedIgcs[0].id}` : text.trim());
    const igcAttachments = uploadedIgcs
      .map((igc, index) => ({
        data: igc.data,
        url: igc.url || (index === 0 ? uploadedIgcUrl : null),
      }))
      .filter((attachment) => attachment.url && attachment.data) as { data: FlightStatistics; url: string }[];

    const activity: NewActivity<AT> = {
      actor: client.currentUser?.ref() as string,
      object: fallbackObject,
      verb: activityVerb,
      text: text.trim(),
      ...(flightId && { flightId }),
      attachments: {
        og: activeOg,
        images: uploadedImages.map((image) => image.url).filter(Boolean) as string[],
        files: uploadedFiles.map((upload) => ({
          // url will never actually be empty string because uploadedFiles
          // filters those out.
          url: upload.url as string,
          name: (upload.file as File).name,
          mimeType: upload.file.type,
        })),
        igc: igcAttachments,
      },
    };

    const modifiedActivity = modifyActivityData ? modifyActivityData(activity) : activity;
    if (doRequest) {
      return await doRequest(modifiedActivity);
    } else {
      return await client.feed(feedGroup, userId).addActivity(modifiedActivity);
    }
  };

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSubmitError(null);
      setSubmitting(true);
      // console.log('Submitting text:', text);
      const response = await addActivity();
      resetState();
      if (onSuccess) onSuccess(response);
    } catch (e) {
      setSubmitting(false);
      const message =
        (e as any)?.response?.data?.error ||
        (e as any)?.response?.data?.explanation ||
        (e as any)?.response?.data?.message ||
        (e as any)?.message ||
        'Unable to submit post';
      setSubmitError(String(message));
      logErr(e, 'add-activity');
    }
  };

  const onChange = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    const text = inputValueFromEvent(event, true);
    if (text === null || text === undefined) return;
    setText(text);
    handleOgDebounced(text);
  }, []);

  const onPaste = useCallback(async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const { items } = event.clipboardData;
    if (!dataTransferItemsHaveFiles(items)) return;

    event.preventDefault();
    // Get a promise for the plain text in case no files are
    // found. This needs to be done here because chrome cleans
    // up the DataTransferItems after resolving of a promise.
    let plainTextPromise: Promise<string> | undefined;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'string' && item.type === 'text/plain') {
        plainTextPromise = new Promise((resolve) => item.getAsString(resolve));
        break;
      }
    }

    const fileLikes = await dataTransferItemsToFiles(items);
    if (fileLikes.length) {
      uploadNewFiles(fileLikes);
      return;
    }
    // fallback to regular text paste
    if (plainTextPromise) {
      const s = await plainTextPromise;
      insertText(s);
    }
  }, []);

  // const onPaste = useCallback(
  //   async (event: ClipboardEvent<HTMLTextAreaElement>) => {
  //     const TEXT_PLAIN = 'text/plain';
  //     const { items, files } = event.clipboardData;
  //     const pastedText = (event.clipboardData || window.clipboardData).getData('text');

  //     console.log('event.clipboardData', event.clipboardData);
  //     console.log('types:', event.clipboardData.types);
  //     console.log('files:', files);
  //     console.log('items:::', items);
  //     console.log('event.clipboardData JSON', JSON.stringify(event.clipboardData));
  //     console.log('window.clipboardData', window.clipboardData);
  //     console.log('pastedText', pastedText);
  //     console.log('dataTransferItemsHaveFiles(items)', dataTransferItemsHaveFiles(items));

  //     // Try accessing all clipboard data types
  //     event.clipboardData.types.forEach((type) => {
  //       console.log(`Type: ${type}`);
  //       const data = event.clipboardData.getData(type);
  //       console.log(`Data for type ${type}:`, data);
  //     });

  //     setTimeout(() => {
  //       const delayedText = (event.clipboardData || window.clipboardData).getData('text');
  //       console.log('Delayed pastedText:', delayedText);
  //     }, 100); // Delay by 100 milliseconds

  //     // Handle the case where the clipboard data is not present immediately
  //     if (dataTransferItemsHaveFiles(items) || !pastedText) {
  //       // Attempt to handle as a file or fallback to custom text extraction
  //       for (let i = 0; i < items.length; i++) {
  //         const item = items[i];
  //         if (item.kind === 'file' && item.type === '') {
  //           // Handle file-like clipboard data, e.g., read it as text
  //           const file = item.getAsFile();
  //           if (file) {
  //             const textContent = await file.text();
  //             console.log('Extracted text from file:', textContent);
  //             const igcData = parseIgcFile(textContent);
  //             if (igcData) {
  //               event.preventDefault();
  //               const igcBlob = new Blob([textContent], { type: TEXT_PLAIN });
  //               const igcFile = new File([igcBlob], 'pasted-flight.igc', { type: TEXT_PLAIN });
  //               await uploadNewIgc(igcFile);
  //             } else {
  //               insertText(textContent); // Handle as regular text
  //             }
  //           }
  //         }
  //       }
  //       return;
  //     }
  //     // if (pastedText) {
  //     if (!dataTransferItemsHaveFiles(items)) {
  //       const igcData = parseIgcFile(pastedText);
  //       if (igcData) {
  //         event.preventDefault();
  //         // Get a promise for the plain text in case no files are
  //         // found. This needs to be done here because chrome cleans
  //         // up the DataTransferItems after resolving of a promise.
  //         const igcBlob = new Blob([pastedText], { type: TEXT_PLAIN });
  //         const igcFile = new File([igcBlob], 'pasted-flight.igc', { type: TEXT_PLAIN });
  //         await uploadNewIgc(igcFile);
  //         return;
  //         // } IF PASTEDTEXT
  //       }

  //       let plainTextPromise: Promise<string> | undefined;
  //       for (let i = 0; i < items.length; i += 1) {
  //         const item = items[i];
  //         console.log(`Item ${i}: kind = ${item.kind}, type = ${item.type}`);
  //         if (item.kind === 'string' && item.type === TEXT_PLAIN) {
  //           plainTextPromise = new Promise((resolve) => item.getAsString(resolve));
  //           break;
  //         }
  //       }

  //       const fileLikes = await dataTransferItemsToFiles(items);
  //       if (fileLikes.length) {
  //         console.log('Files found in clipboard:', fileLikes);
  //         uploadNewFiles(fileLikes);
  //         return;
  //       }

  //       // Fallback to regular text paste if it's not an IGC file or other file type
  //       if (plainTextPromise) {
  //         const s = await plainTextPromise;
  //         console.log('Plain text promise resolved s:', s);
  //         insertText(s);
  //       } // IF not using PASTEDTEXT include this
  //     }
  //   },
  //   [uploadNewFiles, uploadNewIgc, insertText, parseIgcFile],
  // );

  // const onPaste = useCallback(
  //   async (event: ClipboardEvent<HTMLTextAreaElement>) => {
  //     // Check if Clipboard API is supported
  //     if (!navigator.clipboard) {
  //       console.warn('Clipboard API not supported');
  //       return;
  //     }

  //     // Prevent the default paste behavior
  //     event.preventDefault();

  //     try {
  //       // Read text from the clipboard using the Clipboard API
  //       const pastedText = await navigator.clipboard.readText();

  //       console.log('Pasted text:', pastedText);

  //       if (pastedText) {
  //         const igcData = parseIgcFile(pastedText);
  //         if (igcData) {
  //           // Handle the IGC data
  //           const igcBlob = new Blob([pastedText], { type: 'text/plain' });
  //           const igcFile = new File([igcBlob], 'pasted-flight.igc', { type: 'text/plain' });
  //           await uploadNewIgc(igcFile);
  //         } else {
  //           // Handle as regular text
  //           insertText(pastedText);
  //         }
  //       } else {
  //         console.warn('No text detected in clipboard');
  //       }
  //     } catch (err) {
  //       console.error('Failed to read clipboard contents:', err);
  //     }
  //   },
  //   [uploadNewIgc, insertText, parseIgcFile],
  // );

  return {
    userData,
    textInputRef,
    text,
    submitting,
    previewingImports,
    previewImportError,
    importingFlights,
    flightImportSummary,
    files,
    images,
    igcs,
    orderedIgcs,
    igcsPreviewItems,
    flightImportOrder,
    flightImportPreviewItems,
    possibleDuplicateOverrides,
    hasBulkImportMode,
    showFlightImportConfirm,
    confirmFlightImportDisabled,
    activeOg,
    availableOg,
    isOgScraping,
    ogActiveUrl,
    onSubmitForm,
    onSelectEmoji,
    insertText,
    onChange,
    dismissOg,
    setActiveOg,
    canSubmit,
    confirmFlightImport,
    uploadNewFiles,
    uploadFile,
    uploadImage,
    uploadIgc,
    removeFile,
    removeImage,
    removeIgc,
    removeImportItems,
    togglePossibleDuplicateOverride,
    onPaste,
    uploadError,
    sourceError,
    submitError,
  };
}
