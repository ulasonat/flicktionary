import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import VocabularySession from './components/VocabularySession';
import { SessionData, VocabularyWord } from './types';

const App: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [hasRepeated, setHasRepeated] = useState(false);

  const shuffleArray = <T,>(arr: T[]): T[] => {
    const array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const handleFilesUploaded = (data: SessionData) => {
    setSessionData(data);
    setHasRepeated(false);
  };

  const handleStartSession = () => {
    if (sessionData) {
      setSessionStarted(true);
    }
  };

  const handleSessionComplete = async (results: any[]) => {
    // Filter out known words
    const unknownWords = results
      .filter(result => !result.known)
      .map(result => result.word);

    // Save results
    if (window.electronAPI) {
      try {
        const videoName = sessionData?.videoFile.name || 'video';
        const result = await window.electronAPI.saveResults(
          unknownWords,
          videoName
        );
        if (result.success) {
          alert(`Results saved to: ${result.path}`);
        }
      } catch (error) {
        console.error('Error saving results:', error);
        alert('Error saving results. Please try again.');
      }
    } else {
      // Fallback for development or if electronAPI is not available
      console.log('Unknown words:', unknownWords);
      alert('Results logged to console (Electron API not available)');
    }

    if (!hasRepeated && unknownWords.length > 0 && sessionData) {
      const shuffled = shuffleArray<VocabularyWord>(unknownWords);
      const newSessionData: SessionData = {
        ...sessionData,
        vocabularyWords: shuffled
      };
      setSessionData(newSessionData);
      setHasRepeated(true);
      setSessionStarted(true);
    } else {
      setSessionStarted(false);
      setSessionData(null);
      setHasRepeated(false);
    }
  };

  return (
    <div className="app">
      {!sessionStarted ? (
        <FileUpload 
          onFilesUploaded={handleFilesUploaded}
          onStartSession={handleStartSession}
          sessionData={sessionData}
        />
      ) : (
        sessionData && (
          <VocabularySession
            sessionData={sessionData}
            onComplete={handleSessionComplete}
          />
        )
      )}
    </div>
  );
};

export default App;