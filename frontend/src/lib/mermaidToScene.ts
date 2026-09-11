import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export class MermaidConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidConvertError";
  }
}

export async function mermaidToElements(definition: string): Promise<ExcalidrawElement[]> {
  const parsed = await parseMermaidToExcalidraw(definition, {
    flowchart: { curve: "linear" },
  });
  const converted = convertToExcalidrawElements(parsed.elements);
  const withoutImages = converted.filter((el) => el.type !== "image");
  if (withoutImages.length === 0) {
    throw new MermaidConvertError(
      "Converter returned an image-only fallback. Use a simpler flowchart TD."
    );
  }
  return withoutImages as ExcalidrawElement[];
}
