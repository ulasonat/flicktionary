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
      openExternal: (url: string) => Promise<{ success: boolean }>;
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      convertToMp3: (videoPath: string) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
      openProgressWindow: () => Promise<void>;
      onConvertProgress: (callback: (percent: number) => void) => void;
    };
  }
}