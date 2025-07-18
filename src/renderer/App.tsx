import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import VocabularySession from './components/VocabularySession';
import { SessionData, WordResult } from './types';

const App: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);

  const handleFilesUploaded = (data: SessionData) => {
    setSessionData(data);
  };

  const handleStartSession = () => {
    if (sessionData) {
      setSessionStarted(true);
    }
  };

  const handleSessionComplete = async (results: WordResult[]) => {
    // Collect words the user ever marked as unknown
    const unknownWords = results
      .filter(result => result.wasUnknown)
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

    // Reset session
    setSessionStarted(false);
    setSessionData(null);
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