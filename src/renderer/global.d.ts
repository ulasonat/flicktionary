export {};

declare global {
  interface Window {
    electronAPI: {
      saveResults: (
        results: any[],
        videoFileName: string
      ) => Promise<{ success: boolean; path?: string }>;
      getFilePath: (fileData: ArrayBuffer) => Promise<string>;
      extractSubtitles: (videoPath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      getApiKey: () => Promise<string | null>;
      saveApiKey: (apiKey: string) => Promise<{ success: boolean }>;
      openExternal: (url: string) => Promise<{ success: boolean }>;
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    };
  }
}
