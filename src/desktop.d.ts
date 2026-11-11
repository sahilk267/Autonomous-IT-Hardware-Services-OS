export {};

declare global {
  interface Window {
    apexDesktop?: {
      getSetupToken(): Promise<string | null>;
      openSettings(): Promise<void>;
    };
  }
}
