// secrets.ts - Dual secret resolver for local and cloud runtimes
import {defineSecret} from "firebase-functions/params";
import * as fs from "fs";
import * as path from "path";

export const openAiApiKeySecret = defineSecret("OPENAI_API_KEY");

let localSecretsLoaded = false;

/**
 * Loads secrets from functions/.secret.local if running in local emulator.
 */
function loadLocalSecretFile(): void {
  if (localSecretsLoaded) return;
  localSecretsLoaded = true;

  try {
    const secretPath = path.resolve(__dirname, "..", ".secret.local");
    if (fs.existsSync(secretPath)) {
      const content = fs.readFileSync(secretPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const k = trimmed.substring(0, eqIdx).trim();
          const v = trimmed.substring(eqIdx + 1).trim();
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      }
    }
  } catch {
    // Silently continue if reading fails
  }
}

/**
 * Resolves the OpenAI API key safely from Secret Manager or .secret.local.
 * @return {string} Configured key or empty string if absent.
 */
export function getOpenAIApiKey(): string {
  loadLocalSecretFile();

  // 1. Try Secret Manager param value (bound in Cloud Functions)
  try {
    const val = openAiApiKeySecret.value();
    if (val && val.trim().length > 0) {
      return val.trim();
    }
  } catch {
    // Secret not bound in this context
  }

  // 2. Try process.env (populated by emulator or loadLocalSecretFile)
  return (process.env.OPENAI_API_KEY || "").trim();
}
