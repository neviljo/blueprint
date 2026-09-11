import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

function viewportOffset(
  elements: ExcalidrawElement[],
  api: ExcalidrawImperativeAPI
): { x: number; y: number } {
  const appState = api.getAppState();
  const zoom = typeof appState.zoom === "number" ? appState.zoom : appState.zoom?.value ?? 1;
  const targetX = -appState.scrollX + 80 / zoom;
  const targetY = -appState.scrollY + 80 / zoom;
  let minX = Infinity;
  let minY = Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: targetX, y: targetY };
  }
  return { x: targetX - minX, y: targetY - minY };
}

export function insertGeneratedElements(
  api: ExcalidrawImperativeAPI,
  generated: ExcalidrawElement[],
  options?: { replaceIds?: string[] }
): void {
  const batchId = crypto.randomUUID();
  const includingDeleted =
    api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements();
  const replace = new Set(options?.replaceIds ?? []);

  const next = includingDeleted.map((el) => {
    if (!replace.has(el.id)) return el;
    return {
      ...el,
      isDeleted: true,
      version: el.version + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
    };
  });

  const offset = viewportOffset(generated, api);
  const tagged = generated.map((el) => ({
    ...el,
    x: el.x + offset.x,
    y: el.y + offset.y,
    customData: { ...(el.customData ?? {}), aiBatchId: batchId },
  }));

  api.updateScene({
    elements: [...next, ...tagged],
  });
}
