export interface VocabularyWord {
  term: string;
  beginTimestamp: string;
  endTimestamp: string;
  englishMeaning: string;
  turkishMeaning: string;
  sampleSentenceInEnglish: string;
  sampleSentenceInTurkish: string;
}

export interface SessionData {
  videoFile: File;
  subtitleFile: File;
  vocabularyWords: VocabularyWord[];
  /** Absolute path to the temporary video file on disk */
  videoPath: string;
}

export interface WordResult {
  word: VocabularyWord;
  known: boolean;
}
