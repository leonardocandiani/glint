export type GlintPrefs = { on: boolean };

declare module "claude-code" {
  interface PluginState {
    glint: { prefs: GlintPrefs };
  }
}
