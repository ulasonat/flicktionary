import React, { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import { SessionData, WordResult } from '../types';

interface VocabularySessionProps {
  sessionData: SessionData;
  onComplete: (results: WordResult[]) => void;
}

const VocabularySession: React.FC<VocabularySessionProps> = ({
  sessionData,
  onComplete
}) => {
  const [wordList, setWordList] = useState(sessionData.vocabularyWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<WordResult[]>([]);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [subtitleUrl, setSubtitleUrl] = useState<string>('');
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create object URL for video file
    const url = URL.createObjectURL(sessionData.videoFile);
    setVideoUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [sessionData.videoFile]);

  useEffect(() => {
    let url: string;
    const reader = new FileReader();
    reader.onload = () => {
      const srtText = reader.result as string;
      const vttText = srtToVtt(srtText);
      const blob = new Blob([vttText], { type: 'text/vtt' });
      url = URL.createObjectURL(blob);
      setSubtitleUrl(url);
    };
    reader.readAsText(sessionData.subtitleFile);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sessionData.subtitleFile]);

  const srtToVtt = (srt: string): string => {
    return (
      'WEBVTT\n\n' +
      srt
        .replace(/\r+/g, '')
        .split('\n')
        .map(line => line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'))
        .join('\n')
    );
  };

  const currentWord = wordList[currentIndex];

  const handleGenerateAudio = async () => {
    try {
      const result = await window.electronAPI.convertToMp3(sessionData.videoFilePath);
      if (result.success && result.path) {
        const url = 'file://' + result.path;
        audioRef.current = new Audio(url);
        setAudioReady(true);
      } else if (result.error) {
        console.error('Audio conversion failed', result.error);
        alert('Audio conversion failed: ' + result.error);
      }
    } catch (err) {
      console.error('Audio conversion failed', err);
    }
  };
  
  const handleResponse = (known: boolean) => {
    const existingIndex = results.findIndex(r => r.word.term === currentWord.term);

    const updatedResult: WordResult = existingIndex >= 0
      ? {
          word: currentWord,
          known,
          wasUnknown: results[existingIndex].wasUnknown || !known
        }
      : {
          word: currentWord,
          known,
          wasUnknown: !known
        };

    if (existingIndex >= 0) {
      const newResults = [...results];
      newResults[existingIndex] = updatedResult;
      setResults(newResults);
    } else {
      setResults([...results, updatedResult]);
    }

    if (!known) {
      // Append to list and advance to the new item
      setWordList(prev => [...prev, currentWord]);
      setCurrentIndex(i => i + 1);
    } else if (currentIndex < wordList.length - 1) {
      // Move to next existing word
      setCurrentIndex(i => i + 1);
    }
  };

  const handleNavigation = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (direction === 'next' && currentIndex < wordList.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleFinish = () => {
    if (
      results.length === sessionData.vocabularyWords.length &&
      results.every(r => r.known)
    ) {
      onComplete(results);
    } else {
      alert('Please respond to all words with "I already knew" before finishing');
    }
  };

  const getCurrentResponse = () => {
    const result = results.find(r => r.word.term === currentWord.term);
    return result?.known;
  };

  const isCurrentAnswered = () => {
    return results.some(r => r.word.term === currentWord.term);
  };

  return (
    <div className="vocabulary-session">
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${((currentIndex + 1) / wordList.length) * 100}%` }}
        />
        <span className="progress-text">
          Word {currentIndex + 1} of {wordList.length}
        </span>
      </div>

      <div className="session-content">
        <div className="video-section">
          <VideoPlayer
            videoUrl={videoUrl}
            subtitleUrl={subtitleUrl}
            beginTimestamp={currentWord.beginTimestamp}
            endTimestamp={currentWord.endTimestamp}
            videoFileName={sessionData.videoFile.name}
            externalAudio={audioRef.current || undefined}
            showAudioButton={currentIndex === 0 && !audioReady}
            onRequestAudio={handleGenerateAudio}
            key={currentWord.term} // Force remount on word change
          />
        </div>

        <div className="word-info-section">
          <div className="word-details">
            <h2 className="term">{currentWord.term}</h2>
            
            <div className="meaning-section">
              <h3>English Meaning</h3>
              <p>{currentWord.englishMeaning}</p>
            </div>

            <div className="meaning-section">
              <h3>Turkish Meaning</h3>
              <p>{currentWord.turkishMeaning}</p>
            </div>

            <div className="sample-section">
              <h3>Sample Sentence</h3>
              <p className="sample-english">{currentWord.sampleSentenceInEnglish}</p>
              <p className="sample-turkish">{currentWord.sampleSentenceInTurkish}</p>
            </div>
          </div>

          <div className="response-buttons">
            <button 
              className={`response-btn known ${getCurrentResponse() === true ? 'selected' : ''}`}
              onClick={() => handleResponse(true)}
            >
              ✓ I already knew
            </button>
            <button 
              className={`response-btn unknown ${getCurrentResponse() === false ? 'selected' : ''}`}
              onClick={() => handleResponse(false)}
            >
              ✗ I didn't know
            </button>
          </div>

          <div className="navigation-buttons">
            <button 
              onClick={() => handleNavigation('prev')}
              disabled={currentIndex === 0}
              className="nav-btn"
            >
              ← Previous
            </button>
            <button
              onClick={() => handleNavigation('next')}
              disabled={
                currentIndex === wordList.length - 1 ||
                !isCurrentAnswered()
              }
              className="nav-btn"
            >
              Next →
            </button>
          </div>

          {currentIndex === wordList.length - 1 && (
            <button onClick={handleFinish} className="finish-button">
              Finish Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VocabularySession;