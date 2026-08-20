import type { AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Payload broadcast on the canvas channel to sync the scene. */
export interface SceneMessage {
  elements: ExcalidrawElement[];
  appState?: {
    theme?: "light" | "dark";
    viewBackgroundColor?: string;
  };
  /** Sender's full scene version (sum of element versions) at publish time. */
  sceneVersion: number;
  /** true = replace the whole scene; false = merge these elements into it. */
  full: boolean;
  /** Present when a large scene is split across multiple messages. */
  chunk?: {
    index: number;
    total: number;
    nonce: string;
  };
}

// Ably caps each published message at 65536 bytes; chunked scene parts use a
// conservative budget so the payload plus protocol overhead stays well under.
export const SCENE_CHUNK_BYTES = 32000;

export function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/** Splits elements into parts that each stay under the per-message byte budget. */
export function splitElements(
  elements: readonly ExcalidrawElement[]
): ExcalidrawElement[][] {
  const parts: ExcalidrawElement[][] = [];
  let part: ExcalidrawElement[] = [];
  let partSize = 0;

  for (const element of elements) {
    const elementBytes = byteLength(JSON.stringify(element));
    if (part.length > 0 && partSize + elementBytes > SCENE_CHUNK_BYTES) {
      parts.push(part);
      part = [element];
      partSize = elementBytes;
    } else {
      part.push(element);
      partSize += elementBytes;
    }
  }
  if (part.length > 0) parts.push(part);

  return parts;
}

/** Merges remote delta elements into the local scene, keeping the higher version. */
export function mergeSceneElements(
  local: readonly ExcalidrawElement[],
  remote: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const byId = new Map<string, ExcalidrawElement>();
  for (const element of local) byId.set(element.id, element);
  for (const element of remote) {
    const existing = byId.get(element.id);
    if (
      !existing ||
      element.version > existing.version ||
      (element.version === existing.version &&
        element.versionNonce > existing.versionNonce)
    ) {
      byId.set(element.id, element);
    }
  }
  return [...byId.values()];
}

/** Only the fields we are willing to sync across clients. */
export function cleanSceneAppState(
  appState: Partial<AppState>
): SceneMessage["appState"] {
  return {
    theme: appState.theme,
    viewBackgroundColor: appState.viewBackgroundColor,
  };
}

/** Byte size of the serialized scene payload (chunk field excluded). */
export function scenePayloadBytes(message: SceneMessage): number {
  return byteLength(
    JSON.stringify({
      elements: message.elements,
      appState: message.appState,
      sceneVersion: message.sceneVersion,
      full: message.full,
    })
  );
}

interface SceneChunkBuffer {
  nonce: string;
  total: number;
  parts: Map<number, ExcalidrawElement[]>;
  appState?: SceneMessage["appState"];
  sceneVersion: number;
  full: boolean;
}

/**
 * Reassembles scene messages that were split across multiple Ably messages
 * (one buffer per sender, keyed by the chunk nonce). Once every part of the
 * newest batch has arrived, the fully assembled scene is returned for apply;
 * while parts are still outstanding null is returned so the caller just waits.
 */
export class SceneChunkAssembler {
  private buffers = new Map<string, SceneChunkBuffer>();

  reset(): void {
    this.buffers.clear();
  }

  accept(sender: string, data: SceneMessage): SceneMessage | null {
    const chunk = data.chunk;
    if (!chunk) return data;

    const { index, total, nonce } = chunk;
    let buffer = this.buffers.get(sender);

    if (!buffer || buffer.nonce !== nonce) {
      buffer = {
        nonce,
        total,
        parts: new Map(),
        appState: undefined,
        sceneVersion: data.sceneVersion,
        full: data.full,
      };
      this.buffers.set(sender, buffer);
    }

    buffer.parts.set(index, data.elements);
    if (data.appState) buffer.appState = data.appState;

    if (buffer.parts.size < total) return null;

    this.buffers.delete(sender);

    const assembled: ExcalidrawElement[] = [];
    for (let i = 0; i < total; i++) {
      const part = buffer.parts.get(i);
      if (!part) return null;
      assembled.push(...part);
    }

    return {
      elements: assembled,
      appState: buffer.appState ?? {},
      sceneVersion: buffer.sceneVersion,
      full: buffer.full,
    };
  }
}