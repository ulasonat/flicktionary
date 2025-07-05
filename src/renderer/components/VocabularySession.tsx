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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<WordResult[]>([]);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [subtitleUrl, setSubtitleUrl] = useState<string>('');

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

  const currentWord = sessionData.vocabularyWords[currentIndex];
  
  const handleResponse = (known: boolean) => {
    const newResult: WordResult = {
      word: currentWord,
      known
    };

    // Update or add result
    const existingIndex = results.findIndex(r => r.word.term === currentWord.term);
    if (existingIndex >= 0) {
      const newResults = [...results];
      newResults[existingIndex] = newResult;
      setResults(newResults);
    } else {
      setResults([...results, newResult]);
    }

    // Move to next word if not at the end
    if (currentIndex < sessionData.vocabularyWords.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleNavigation = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (direction === 'next' && currentIndex < sessionData.vocabularyWords.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleFinish = () => {
    if (results.length === sessionData.vocabularyWords.length) {
      onComplete(results);
    } else {
      alert('Please respond to all words before finishing');
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
          style={{ width: `${((currentIndex + 1) / sessionData.vocabularyWords.length) * 100}%` }}
        />
        <span className="progress-text">
          Word {currentIndex + 1} of {sessionData.vocabularyWords.length}
        </span>
      </div>

      <div className="session-content">
        <div className="video-section">
          <VideoPlayer
            videoUrl={videoUrl}
            videoType={sessionData.videoFile.type}
            subtitleUrl={subtitleUrl}
            beginTimestamp={currentWord.beginTimestamp}
            endTimestamp={currentWord.endTimestamp}
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
                currentIndex === sessionData.vocabularyWords.length - 1 ||
                !isCurrentAnswered()
              }
              className="nav-btn"
            >
              Next →
            </button>
          </div>

          {currentIndex === sessionData.vocabularyWords.length - 1 && (
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
