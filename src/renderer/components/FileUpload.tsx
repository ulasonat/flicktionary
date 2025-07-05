import React, { useState, useRef } from 'react';
import { SessionData, VocabularyWord } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'error' | 'success'>('info');
  const videoFileRef = useRef<string>('');

  const showMessage = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      // Create temporary file path for subtitle extraction
      const arrayBuffer = await file.arrayBuffer();
      const filePath = await window.electronAPI.getFilePath(arrayBuffer);
      videoFileRef.current = filePath;
      updateSessionData(file, subtitleFile, vocabularyWords);
    }
  };

  const handleSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSubtitleFile(file);
      const content = await file.text();
      setSubtitleContent(content);
      updateSessionData(videoFile, file, vocabularyWords);
    }
  };

  const handleExtractSubtitles = async () => {
    if (!videoFile) {
      showMessage('Please upload a video file first', 'error');
      return;
    }

    showMessage('Extracting subtitles from video...', 'info');
    
    try {
      const result = await window.electronAPI.extractSubtitles(videoFileRef.current);
      
      if (result.success) {
        // Create a subtitle file from extracted content
        const subtitleBlob = new Blob([result.content], { type: 'text/plain' });
        const subtitleFile = new File([subtitleBlob], 'extracted-subtitles.srt', {
          type: 'text/plain'
        });
        
        setSubtitleFile(subtitleFile);
        setSubtitleContent(result.content);
        updateSessionData(videoFile, subtitleFile, vocabularyWords);
        showMessage('Subtitles extracted successfully!', 'success');
      } else {
        showMessage('No subtitles found in video or extraction failed', 'error');
      }
    } catch (error) {
      showMessage('Failed to extract subtitles', 'error');
    }
  };

  const handlePasteJSON = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const words = JSON.parse(text);
      setVocabularyWords(words);
      updateSessionData(videoFile, subtitleFile, words);
      showMessage('Vocabulary loaded from clipboard!', 'success');
    } catch (error) {
      showMessage('Invalid JSON in clipboard', 'error');
    }
  };

  const loadPrompt = async (): Promise<string> => {
    try {
      const response = await fetch('./prompt.txt');
      return await response.text();
    } catch (error) {
      // Fallback prompt if file not found
      return `Your task is to act as an expert linguist and cultural analyst. I will provide you with a full transcript of movie subtitles. You must perform a comprehensive analysis of this entire transcript to identify and explain all language elements that would be difficult for a proficient (C1-level) non-native English speaker, particularly one whose native language is Turkish, to understand...`;
    }
  };

  const handleGenerateVocabulary = async () => {
    if (!subtitleContent) {
      showMessage('Please upload or extract subtitles first', 'error');
      return;
    }

    // Check for existing API key
    const savedApiKey = await window.electronAPI.getApiKey();
    
    if (!savedApiKey) {
      setShowApiKeyInput(true);
      return;
    }

    generateVocabularyWithKey(savedApiKey);
  };

  const handleApiKeySubmit = async () => {
    if (!apiKey.trim()) {
      showMessage('Please enter an API key', 'error');
      return;
    }

    await window.electronAPI.saveApiKey(apiKey);
    setShowApiKeyInput(false);
    generateVocabularyWithKey(apiKey);
  };

  const generateVocabularyWithKey = async (key: string) => {
    setIsGenerating(true);
    
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

      const promptText = await loadPrompt();
      const fullPrompt = `${promptText}\n\n${subtitleContent}`;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      // Parse the JSON response
      const words = JSON.parse(text);
      setVocabularyWords(words);
      updateSessionData(videoFile, subtitleFile, words);
      showMessage(`Generated ${words.length} vocabulary items!`, 'success');
    } catch (error) {
      console.error('Generation error:', error);
      showMessage('Failed to generate vocabulary. Check your API key or try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
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
        vocabularyWords: words
      });
    }
  };

  const isReady = videoFile && subtitleFile && vocabularyWords.length > 0;

  return (
    <div className="file-upload-container">
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
          <label>Video File (.mp4, .mkv, etc.)</label>
          <input 
            type="file" 
            accept="video/*" 
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
              onClick={handleExtractSubtitles} 
              className="extract-button"
              disabled={!videoFile}
            >
              Get from Video
            </button>
          </div>
          {subtitleFile && <span className="file-name">✓ {subtitleFile.name}</span>}
        </div>

        <div className="upload-item">
          <label>Vocabulary JSON</label>
          <div className="vocabulary-controls">
            <button onClick={handlePasteJSON} className="vocab-button">
              📋 Paste from Clipboard
            </button>
            <button 
              onClick={handleGenerateVocabulary} 
              className="vocab-button generate"
              disabled={!subtitleFile || isGenerating}
            >
              {isGenerating ? '⏳ Generating...' : '✨ Generate It'}
            </button>
          </div>
          {vocabularyWords.length > 0 && (
            <span className="file-name">✓ {vocabularyWords.length} words loaded</span>
          )}
        </div>

        {showApiKeyInput && (
          <div className="api-key-input">
            <input 
              type="password" 
              placeholder="Enter your Gemini API key" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleApiKeySubmit()}
            />
            <button onClick={handleApiKeySubmit}>Save & Generate</button>
          </div>
        )}

        {isGenerating && (
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