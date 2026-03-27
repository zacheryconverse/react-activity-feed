import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { StatusUpdateForm } from './StatusUpdateForm';
import { I18n } from 'emoji-mart';
import { EmojiPicker } from '../EmojiPicker';
import { useStatusUpdateForm } from './useStatusUpdateForm';

const customTextareaPlaceholder = 'Custom placeholder';
const Textarea = jest.fn(() => <textarea placeholder={customTextareaPlaceholder} />);

jest.mock('./useStatusUpdateForm', () => ({
  useStatusUpdateForm: jest.fn(),
}));

jest.mock('../EmojiPicker', () => {
  return {
    ...jest.requireActual('../EmojiPicker'),
    EmojiPicker: jest.fn(() => null),
  };
});

const mockedUseStatusUpdateForm = useStatusUpdateForm as jest.MockedFunction<typeof useStatusUpdateForm>;

const buildMockState = (overrides = {}) => {
  const duplicateUpload = {
    data: { date: '2026-03-22' },
    dedupeStatus: 'duplicate',
    file: new File(['igc'], 'flight.igc', { type: 'text/plain' }),
    filePath: null,
    id: 'igc-1',
    state: 'finished',
  };

  return {
    activeOg: null,
    availableOg: [],
    canSubmit: jest.fn(() => true),
    confirmFlightImport: jest.fn(),
    confirmFlightImportDisabled: false,
    dismissOg: jest.fn(),
    displayFlightImportPreviewItems: [
      {
        fileName: 'flight.igc',
        id: 'igc-1',
        status: 'duplicate',
        summary: { date: '2026-03-22' },
      },
    ],
    files: { data: {}, order: [] },
    flightImportOrder: ['igc-1'],
    flightImportPreviewItems: [
      {
        fileName: 'flight.igc',
        id: 'igc-1',
        status: 'duplicate',
        summary: { date: '2026-03-22' },
      },
    ],
    flightImportSummary: null,
    flightVisibility: 'public',
    hasBulkImportMode: false,
    igcs: { data: { 'igc-1': duplicateUpload }, order: ['igc-1'] },
    igcsPreviewItems: [],
    images: { data: {}, order: [] },
    importingFlights: false,
    insertText: jest.fn(),
    isOgScraping: false,
    ogActiveUrl: '',
    onChange: jest.fn(),
    onPaste: jest.fn(),
    onSelectEmoji: jest.fn(),
    onSubmitForm: jest.fn((event) => event?.preventDefault?.()),
    orderedIgcs: [duplicateUpload],
    possibleDuplicateOverrides: {},
    previewImportError: null,
    previewingImports: false,
    removeFile: jest.fn(),
    removeIgc: jest.fn(),
    removeImportItems: jest.fn(),
    removeImage: jest.fn(),
    setActiveOg: jest.fn(),
    setFlightVisibility: jest.fn(),
    showFlightImportConfirm: false,
    sourceError: null,
    submitting: false,
    submitError: null,
    text: '',
    textInputRef: { current: null },
    togglePossibleDuplicateOverride: jest.fn(),
    uploadError: null,
    uploadFile: jest.fn(),
    uploadIgc: jest.fn(),
    uploadImage: jest.fn(),
    uploadNewFiles: jest.fn(),
    userData: { name: 'Test Pilot' },
    ...overrides,
  } as unknown as ReturnType<typeof useStatusUpdateForm>;
};

describe('StatusUpdateForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseStatusUpdateForm.mockReturnValue(buildMockState());
  });

  it('passes i18n prop to EmojiPicker', () => {
    const emojiI18n: Partial<I18n> = {
      search: 'Custom Search String',
      // @ts-ignore
      categories: { recent: 'Recent Emojis' },
    };

    render(<StatusUpdateForm emojiI18n={emojiI18n} />);
    expect(EmojiPicker).toHaveBeenCalledWith(expect.objectContaining({ i18n: emojiI18n }), {});
  });

  it('renders default Textarea', () => {
    const { getByRole } = render(<StatusUpdateForm />);
    expect(getByRole('textbox')).toHaveProperty('placeholder', 'Type your post...');
  });

  it('renders custom Textarea', () => {
    const { getByRole } = render(<StatusUpdateForm Textarea={Textarea} />);
    expect(getByRole('textbox')).toHaveProperty('placeholder', customTextareaPlaceholder);
  });

  it('disables private visibility for a duplicate IGC and resets duplicate private state to public', () => {
    const setFlightVisibility = jest.fn();
    mockedUseStatusUpdateForm.mockReturnValue(
      buildMockState({
        flightVisibility: 'private',
        setFlightVisibility,
      }),
    );

    render(<StatusUpdateForm showFlightVisibilityToggle />);

    expect(setFlightVisibility).toHaveBeenCalledWith('public');
    expect(screen.getByRole('radio', { name: 'Private flight unavailable for duplicate uploads' })).toBeDisabled();
    expect(screen.getByText('Unavailable for duplicates')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Duplicate flights can still be posted publicly, but private duplicate uploads are disabled because they do not create a new logbook entry or change your stats.',
      ),
    ).toBeInTheDocument();
  });
});
