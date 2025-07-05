export {};

declare global {
  interface Window {
    electronAPI: {
      saveResults: (results: any[]) => Promise<{ success: boolean; path?: string }>;
      getFilePath: (fileData: ArrayBuffer) => Promise<string>;
      extractSubtitles: (videoPath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      getApiKey: () => Promise<string | null>;
      saveApiKey: (apiKey: string) => Promise<{ success: boolean }>;
    };
  }
}