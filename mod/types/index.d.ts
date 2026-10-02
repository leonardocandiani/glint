export type GlintPrefs = { on: boolean; icons?: "plain" | "nerd" };

declare module "claude-code" {
  interface PluginState {
    glint: { prefs: GlintPrefs };
  }
}
