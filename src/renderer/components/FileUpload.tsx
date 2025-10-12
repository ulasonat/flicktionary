import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SessionData, VocabularyWord } from '../types';

interface FileUploadProps {
  onFilesUploaded: (data: SessionData) => void;
  onStartSession: () => void;
  sessionData: SessionData | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFilesUploaded, 
  onStartSession, 
  sessionData 
}) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [subtitleContent, setSubtitleContent] = useState<string>('');
  const [vocabularyWords, setVocabularyWords] = useState<VocabularyWord[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'error' | 'success'>('info');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [useGeminiApi, setUseGeminiApi] = useState(false);
  const [autoGenerateEnabled, setAutoGenerateEnabled] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [geminiVisited, setGeminiVisited] = useState(false);
  const [isFetchingSubtitles, setIsFetchingSubtitles] = useState(false);
  const videoFileRef = useRef<string>('');
  const autoRunActiveRef = useRef(false);
  const autoRunCompletedRef = useRef(false);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showMessage = (
    msg: string,
    type: 'info' | 'error' | 'success' = 'info',
    durationMs: number | null = 3000
  ) => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }

    setMessage(msg);
    setMessageType(type);

    if (durationMs && durationMs > 0) {
      messageTimeoutRef.current = setTimeout(() => {
        setMessage('');
        messageTimeoutRef.current = null;
      }, durationMs);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadConfiguration = async () => {
      try {
        const [savedKey, savedPreference, savedAutoGenerate] = await Promise.all([
          window.electronAPI.getApiKey(),
          window.electronAPI.getGeminiApiPreference(),
          window.electronAPI.getAutoGeneratePreference()
        ]);

        if (!isMounted) {
          return;
        }

        if (savedKey) {
          setApiKey(savedKey);
        }

        const geminiEnabled = typeof savedPreference === 'boolean' ? savedPreference : false;
        setUseGeminiApi(geminiEnabled);
        setAutoGenerateEnabled(Boolean(geminiEnabled && savedAutoGenerate));
      } catch (error) {
        console.error('Failed to load saved configuration:', error);
      }
    };

    loadConfiguration();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromSession = async () => {
      if (!sessionData) {
        return;
      }

      setVideoFile(sessionData.videoFile);
      setSubtitleFile(sessionData.subtitleFile);
      setVocabularyWords(sessionData.vocabularyWords);
      videoFileRef.current = sessionData.videoFilePath;
      autoRunCompletedRef.current = sessionData.vocabularyWords.length > 0;

      try {
        const text = await sessionData.subtitleFile.text();
        if (!cancelled) {
          setSubtitleContent(text);
        }
      } catch (error) {
        console.error('Failed to reload subtitle content:', error);
      }
    };

    hydrateFromSession();

    return () => {
      cancelled = true;
    };
  }, [sessionData]);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const arrayBuffer = await file.arrayBuffer();
      const filePath = await window.electronAPI.getFilePath(arrayBuffer, file.name);
      videoFileRef.current = filePath;
      setGeminiVisited(false);
      autoRunCompletedRef.current = false;
      updateSessionData(file, subtitleFile, vocabularyWords);
    }
  };

  const handleSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSubtitleFile(file);
      const content = await file.text();
      setSubtitleContent(content);
      setGeminiVisited(false);
      autoRunCompletedRef.current = false;
      updateSessionData(videoFile, file, vocabularyWords);
    }
  };

  const buildAutoSubtitleFile = (content: string) => {
    const baseName = videoFile ? videoFile.name.replace(/\.[^.]+$/, '') : 'auto-subtitles';
    const safeName = baseName.replace(/[^a-z0-9\-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'auto-subtitles';
    return new File([content], `${safeName}.srt`, { type: 'text/plain' });
  };

  const attemptLocalSubtitleExtraction = async (): Promise<string | null> => {
    if (!videoFile) {
      return null;
    }

    try {
      const result = await window.electronAPI.extractSubtitles(videoFileRef.current);

      if (result.success && result.content) {
        const subtitleBlob = new Blob([result.content], { type: 'text/plain' });
        const subtitleFile = new File([subtitleBlob], 'extracted-subtitles.srt', {
          type: 'text/plain'
        });

        setSubtitleFile(subtitleFile);
        setSubtitleContent(result.content);
        setGeminiVisited(false);
        updateSessionData(videoFile, subtitleFile, vocabularyWords);
        return result.content;
      }
    } catch (error) {
      console.error('Local subtitle extraction failed:', error);
    }

    return null;
  };

  const handleGetSubtitles = async (
    options?: { silent?: boolean }
  ): Promise<string | null> => {
    if (!videoFile) {
      if (!options?.silent) {
        showMessage('Please upload a video file first', 'error');
      }
      return null;
    }

    setIsFetchingSubtitles(true);
    if (!options?.silent) {
      showMessage('Fetching subtitles...', 'info', 0);
    }

    let fallbackAttempted = false;

    try {
      const response = await window.electronAPI.fetchSubtitles(videoFile.name);

      if (response.success && response.subtitle) {
        const baseName = response.metadata?.title
          ? response.metadata.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
          : videoFile.name.replace(/\.[^.]+$/, '');

        const fileName = `${baseName || 'subtitles'}.srt`;
        const subtitleBlob = new Blob([response.subtitle], { type: 'text/plain' });
        const subtitleFile = new File([subtitleBlob], fileName, {
          type: 'text/plain'
        });

        setSubtitleFile(subtitleFile);
        setSubtitleContent(response.subtitle);
        setGeminiVisited(false);
        autoRunCompletedRef.current = false;
        updateSessionData(videoFile, subtitleFile, vocabularyWords);
        if (!options?.silent) {
          showMessage('Subtitles downloaded successfully!', 'success');
        }
        return response.subtitle;
      }

      const errorMessage = response.error ? `: ${response.error}` : '';
      if (!options?.silent) {
        showMessage(`Remote subtitle search failed${errorMessage}. Trying embedded tracks...`, 'error', 5000);
      }

      fallbackAttempted = true;
      const fallbackContent = await attemptLocalSubtitleExtraction();
      if (!fallbackContent) {
        throw new Error(response.error || 'No subtitles available');
      }
      autoRunCompletedRef.current = false;
      if (!options?.silent) {
        showMessage('Subtitles extracted from video track.', 'success');
      }
      return fallbackContent;
    } catch (error: any) {
      console.error('Subtitle fetch failed:', error);
      const detail = error?.message || 'Unable to fetch subtitles';
      let fallbackContent: string | null = null;
      if (!fallbackAttempted) {
        fallbackContent = await attemptLocalSubtitleExtraction();
      }

      if (fallbackContent) {
        autoRunCompletedRef.current = false;
        if (!options?.silent) {
          showMessage('Subtitles extracted from video track.', 'success');
        }
        return fallbackContent;
      }
      showMessage(detail, 'error', 5000);
      return null;
    } finally {
      setIsFetchingSubtitles(false);
    }
  };

  const handleOpenGeminiPortal = async () => {
    if (!subtitleFile || !subtitleContent) {
      showMessage('Please provide subtitles before continuing', 'error');
      return;
    }

    try {
      const promptText = await loadPrompt();
      const fullText = `${promptText}\n\n${subtitleContent}`;
      await navigator.clipboard.writeText(fullText);
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal('https://gemini.google.com/app');
      } else {
        window.open('https://gemini.google.com/app', '_blank');
      }
      setGeminiVisited(true);
      showMessage('Prompt copied. Paste Gemini output when ready.', 'success');
    } catch (error) {
      console.error('Failed to open Gemini portal:', error);
      showMessage('Failed to open Gemini portal', 'error');
    }
  };

  const sanitiseJson = (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      return trimmed
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    }
    return trimmed;
  };

  const parseVocabulary = (raw: string): VocabularyWord[] => {
    const jsonString = sanitiseJson(raw);
    const parsed = JSON.parse(jsonString);

    if (!Array.isArray(parsed)) {
      throw new Error('Gemini response did not return an array of vocabulary items');
    }

    return parsed;
  };

  const getSubtitleFromState = () => {
    if (subtitleFile && subtitleContent) {
      return subtitleContent;
    }
    return null;
  };

  useEffect(() => {
    if (!autoGenerateEnabled || !useGeminiApi) {
      return;
    }

    if (!videoFile || autoRunCompletedRef.current) {
      return;
    }

    if (autoRunActiveRef.current || isFetchingSubtitles || isGenerating) {
      return;
    }

    if (!apiKey.trim()) {
      return;
    }

    autoRunActiveRef.current = true;

    (async () => {
      try {
        let subtitleText = getSubtitleFromState();

        if (!subtitleText) {
          subtitleText = await handleGetSubtitles({ silent: true });
        }

        if (!subtitleText) {
          autoRunCompletedRef.current = true;
          return;
        }

        if (vocabularyWords.length > 0) {
          autoRunCompletedRef.current = true;
          return;
        }

        const success = await handleFetchFromGeminiApi(subtitleText, { silent: true });
        if (!success) {
          autoRunCompletedRef.current = true;
        }
      } finally {
        autoRunActiveRef.current = false;
      }
    })();
  }, [autoGenerateEnabled, useGeminiApi, videoFile, subtitleFile, subtitleContent, vocabularyWords.length, apiKey, isFetchingSubtitles, isGenerating]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const words = parseVocabulary(text);
      setVocabularyWords(words);
      updateSessionData(videoFile, subtitleFile, words);
      showMessage(`Loaded ${words.length} vocabulary items from clipboard`, 'success');
      autoRunCompletedRef.current = true;
    } catch (error: any) {
      console.error('Clipboard parse failed:', error);
      const detail = error?.message || 'Clipboard did not contain valid JSON';
      showMessage(detail, 'error');
    }
  };

  const handleFetchFromGeminiApi = async (
    subtitleOverride?: string,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!videoFile) {
      showMessage('Upload both a video and subtitles first', 'error');
      return false;
    }

    let subtitleInputFile = subtitleFile;
    let effectiveSubtitle = subtitleOverride ?? subtitleContent;

    if (!subtitleInputFile && effectiveSubtitle) {
      subtitleInputFile = buildAutoSubtitleFile(effectiveSubtitle);
      setSubtitleFile(subtitleInputFile);
      setSubtitleContent(effectiveSubtitle);
      setGeminiVisited(false);
    }

    if (!effectiveSubtitle) {
      showMessage('Subtitle content not available yet. Please re-upload the subtitle file.', 'error');
      return false;
    }

    if (!subtitleInputFile) {
      showMessage('Subtitle file missing. Please fetch subtitles again.', 'error');
      return false;
    }

    const keyToUse = apiKey.trim();

    if (!keyToUse) {
      setIsSettingsOpen(true);
      setApiKeyInput((current) => current || apiKey);
      showMessage('Add your Gemini API key to continue', 'error');
      return false;
    }

    autoRunCompletedRef.current = false;
    setIsGenerating(true);

    try {
      const promptText = await loadPrompt();
      const fullPrompt = `${promptText}\n\n${effectiveSubtitle}`;

      if (!options?.silent) {
        showMessage('Contacting Gemini...', 'info', 0);
      }

      try {
        await navigator.clipboard.writeText(fullPrompt);
      } catch (clipboardError) {
        console.warn('Clipboard copy failed:', clipboardError);
      }

      const genAI = new GoogleGenerativeAI(keyToUse);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
      const result = await model.generateContent(fullPrompt);
      const text = result.response.text();

      const words = parseVocabulary(text);
      setVocabularyWords(words);
      updateSessionData(videoFile, subtitleInputFile, words);
      if (!options?.silent) {
        showMessage(`Generated ${words.length} vocabulary items!`, 'success');
      }
      autoRunCompletedRef.current = true;
      return true;
    } catch (error: any) {
      console.error('Gemini request failed:', error);
      const detail = error?.response?.error?.message
        || error?.message
        || (typeof error === 'string' ? error : 'Unknown Gemini error');
      showMessage(`Gemini error: ${detail}`, 'error', 5000);
      autoRunCompletedRef.current = false;
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const loadPrompt = async (): Promise<string> => {
    try {
      const result = await window.electronAPI.readFile('prompt.txt');
      if (result.success && result.content) {
        return result.content;
      }
    } catch {
      // Ignore and fall back to default prompt
    }
    return `Your task is to act as an expert linguist and cultural analyst. I will provide you with a full transcript of movie subtitles. You must perform a comprehensive analysis of this entire transcript to identify and explain all language elements that would be difficult for a proficient (C1-level) non-native English speaker, particularly one whose native language is Turkish, to understand...`;
  };

  const handleSaveApiKey = async () => {
    const trimmedKey = apiKeyInput.trim();

    if (!trimmedKey) {
      showMessage('Please enter a valid API key', 'error');
      return;
    }

    try {
      await window.electronAPI.saveApiKey(trimmedKey);
      setApiKey(trimmedKey);
      setApiKeyInput(trimmedKey);
      showMessage('Gemini API key saved', 'success');
    } catch (error: any) {
      console.error('Failed to save API key:', error);
      const errorMessage = error?.message || 'Failed to store API key';
      showMessage(errorMessage, 'error');
    }
  };

  const handleToggleGeminiApi = async (enabled: boolean) => {
    try {
      await window.electronAPI.setGeminiApiPreference(enabled);
      setUseGeminiApi(enabled);
      showMessage(`Gemini API ${enabled ? 'enabled' : 'disabled'}`, 'success');
      if (!enabled && autoGenerateEnabled) {
        await window.electronAPI.setAutoGeneratePreference(false);
        setAutoGenerateEnabled(false);
        autoRunCompletedRef.current = false;
      }
    } catch (error) {
      console.error('Failed to update Gemini preference:', error);
      showMessage('Failed to update Gemini API preference', 'error');
    }
  };

  const handleToggleAutoGenerate = async (enabled: boolean) => {
    if (enabled && !useGeminiApi) {
      showMessage('Enable Gemini API in Flicktionary first', 'error');
      return;
    }

    if (enabled && !apiKey.trim()) {
      showMessage('Save your Gemini API key before enabling auto generation', 'error');
      return;
    }

    try {
      await window.electronAPI.setAutoGeneratePreference(enabled);
      setAutoGenerateEnabled(enabled);
      autoRunCompletedRef.current = false;
      showMessage(`Auto generate ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
      console.error('Failed to update auto-generate preference:', error);
      showMessage('Failed to update auto-generate preference', 'error');
    }
  };

  const handleOpenSettings = () => {
    setApiKeyInput((current) => current || apiKey);
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  const updateSessionData = (
    video: File | null, 
    subtitle: File | null, 
    words: VocabularyWord[]
  ) => {
    if (video && subtitle && words.length > 0) {
      onFilesUploaded({
        videoFile: video,
        subtitleFile: subtitle,
        videoFilePath: videoFileRef.current,
        vocabularyWords: words
      });
      autoRunCompletedRef.current = true;
    }
  };

  const isReady = Boolean(videoFile && subtitleFile && vocabularyWords.length > 0);

  return (
    <div className="file-upload-container">
      <button 
        className="settings-launcher"
        onClick={handleOpenSettings}
        aria-label="Open settings"
      >
        ⚙️
      </button>

      {isSettingsOpen && (
        <div className="settings-modal" role="dialog" aria-modal="true">
          <div className="settings-content">
            <div className="settings-header">
              <h2>Settings</h2>
              <button
                className="settings-close"
                onClick={handleCloseSettings}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div className="settings-section">
              <label htmlFor="api-key-input">Gemini API Key</label>
              <input
                id="api-key-input"
                type="text"
                placeholder="Enter your Gemini API key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <div className="settings-actions">
                <button onClick={handleSaveApiKey}>Save Key</button>
              </div>
            </div>

            <div className="settings-section">
              <div className="toggle-row">
                <label htmlFor="gemini-api-toggle">Use Gemini API in Flicktionary</label>
                <input
                  id="gemini-api-toggle"
                  type="checkbox"
                  checked={useGeminiApi}
                  onChange={(e) => handleToggleGeminiApi(e.target.checked)}
                />
              </div>
              <p>
                When enabled, Flicktionary can call Gemini 2.5 Pro directly with your prompt. 
                You can still launch the Gemini web app at any time.
              </p>
            </div>

            <div className={`settings-section ${!useGeminiApi ? 'settings-section--disabled' : ''}`}>
              <div className={`toggle-row ${!useGeminiApi ? 'disabled' : ''}`}>
                <label htmlFor="auto-generate-toggle">Auto fetch & generate vocabulary</label>
                <input
                  id="auto-generate-toggle"
                  type="checkbox"
                  checked={autoGenerateEnabled}
                  disabled={!useGeminiApi}
                  onChange={(e) => handleToggleAutoGenerate(e.target.checked)}
                />
              </div>
              <p className={!useGeminiApi ? 'toggle-helper disabled' : 'toggle-helper'}>
                Automatically fetch subtitles and request Gemini as soon as a video is selected.
              </p>
            </div>
          </div>
        </div>
      )}

      <img 
        src="./png/flicktionary_text.png" 
        alt="Flicktionary" 
        className="app-logo"
      />
      
      {message && (
        <div className={`message message-${messageType}`}>
          {message}
        </div>
      )}

      <div className="upload-section">
        <div className="upload-item">
          <label>Video File (.mp4, .mkv, .avi, .mov, etc.)</label>
          <input 
            type="file" 
            accept="video/*,.mkv" 
            onChange={handleVideoUpload}
          />
          {videoFile && <span className="file-name">✓ {videoFile.name}</span>}
        </div>

        <div className="upload-item">
          <label>Subtitle File (.srt)</label>
          <div className="subtitle-controls">
            <input 
              type="file" 
              accept=".srt" 
              onChange={handleSubtitleUpload}
            />
            <button 
              onClick={() => { void handleGetSubtitles(); }} 
              className="extract-button"
              disabled={!videoFile || isFetchingSubtitles}
            >
              {isFetchingSubtitles ? 'Fetching…' : 'Get Online'}
            </button>
          </div>
          {subtitleFile && <span className="file-name">✓ {subtitleFile.name}</span>}
        </div>

        <div className="upload-item">
          <label>Vocabulary JSON</label>
          <div className="vocabulary-controls">
            <button
              onClick={handleOpenGeminiPortal}
              className="vocab-button"
              disabled={!subtitleFile || isGenerating || isFetchingSubtitles}
            >
              Go to Gemini
            </button>
            {useGeminiApi && (
              <button
                onClick={() => { void handleFetchFromGeminiApi(); }}
                className="vocab-button generate"
                disabled={!subtitleFile || !videoFile || isGenerating || isFetchingSubtitles}
              >
                {isGenerating ? '⏳ Contacting Gemini...' : 'Get from Gemini API'}
              </button>
            )}
          </div>

          {(geminiVisited || vocabularyWords.length > 0) && (
            <button
              onClick={handlePasteFromClipboard}
              className="vocab-button tertiary"
              disabled={isGenerating || isFetchingSubtitles}
            >
              📋 Paste from Clipboard
            </button>
          )}

          {vocabularyWords.length > 0 && (
            <span className="file-name">✓ {vocabularyWords.length} words loaded</span>
          )}
        </div>

        {(isGenerating || isFetchingSubtitles) && (
          <div className="loading-bar">
            <div className="loading-fill"></div>
          </div>
        )}
      </div>

      <button 
        className={`start-button ${isReady ? 'ready' : 'disabled'}`}
        onClick={onStartSession}
        disabled={!isReady}
      >
        Start Session
      </button>
    </div>
  );
};

export default FileUpload;
