export {};

declare global {
  interface Window {
    apexDesktop?: {
      getSetupToken(workspaceId?: string): Promise<string | null>;
      openSettings(): Promise<void>;
    };
  }
}
