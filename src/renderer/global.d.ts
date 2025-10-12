export {};

declare global {
  interface Window {
    electronAPI: {
      saveResults: (
        results: any[],
        videoFileName: string
      ) => Promise<{ success: boolean; path?: string }>;
      getFilePath: (fileData: ArrayBuffer, originalFileName?: string) => Promise<string>;
      extractSubtitles: (videoPath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      getApiKey: () => Promise<string | null>;
      saveApiKey: (apiKey: string) => Promise<{ success: boolean }>;
      getGeminiApiPreference: () => Promise<boolean>;
      setGeminiApiPreference: (
        enabled: boolean
      ) => Promise<{ success: boolean; enabled: boolean }>;
      getAutoGeneratePreference: () => Promise<boolean>;
      setAutoGeneratePreference: (
        enabled: boolean
      ) => Promise<{ success: boolean; enabled: boolean }>;
      fetchSubtitles: (
        fileName: string
      ) => Promise<{
        success: boolean;
        subtitle?: string;
        metadata?: { title?: string; year?: number | null; imdbId?: string | null };
        error?: string;
      }>;
      openExternal: (url: string) => Promise<{ success: boolean }>;
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      convertToMp3: (videoPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    };
  }
}
