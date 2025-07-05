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
  /** Absolute path to the uploaded video on disk */
  videoFilePath: string;
  vocabularyWords: VocabularyWord[];
}

export interface WordResult {
  word: VocabularyWord;
  known: boolean;
}
