import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

function escapeText(value: string): string {
  return value.replace(/"/g, '\\"').replace(/\n/g, " ");
}

function elementText(el: ExcalidrawElement): string {
  if (el.type === "text" && "text" in el) {
    return String(el.text ?? "");
  }
  return "";
}

export function dumpElements(elements: readonly ExcalidrawElement[]): string {
  return elements
    .filter((el) => !el.isDeleted)
    .map((el) => {
      if (el.type === "arrow") {
        const from = "startBinding" in el && el.startBinding?.elementId ? el.startBinding.elementId : "";
        const to = "endBinding" in el && el.endBinding?.elementId ? el.endBinding.elementId : "";
        return `arrow id=${el.id} from=${from} to=${to}`;
      }
      return `${el.type} id=${el.id} text="${escapeText(elementText(el))}"`;
    })
    .join("\n");
}

export function sceneElementIds(elements: readonly ExcalidrawElement[]): string[] {
  return elements.filter((el) => !el.isDeleted).map((el) => el.id);
}
