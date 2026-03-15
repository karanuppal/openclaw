import {
  getExtensionHostContextEngineFactory,
  listExtensionHostContextEngineIds,
  registerExtensionHostContextEngine,
  resolveExtensionHostContextEngine,
  type ExtensionHostContextEngineFactory,
} from "../extension-host/context-engine-runtime.js";
import type { ContextEngine } from "./types.js";

export type ContextEngineFactory = ExtensionHostContextEngineFactory;

export function registerContextEngine(id: string, factory: ContextEngineFactory): void {
  registerExtensionHostContextEngine(id, factory);
}

export function getContextEngineFactory(id: string): ContextEngineFactory | undefined {
  return getExtensionHostContextEngineFactory(id);
}

export function listContextEngineIds(): string[] {
  return listExtensionHostContextEngineIds();
}

export async function resolveContextEngine(
  config?: import("../config/config.js").OpenClawConfig,
): Promise<ContextEngine> {
  return resolveExtensionHostContextEngine(config);
}
