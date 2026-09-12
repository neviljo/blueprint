const FORBIDDEN =
  /\b(sequenceDiagram|classDiagram|erDiagram|stateDiagram|pie|gantt|mindmap|gitGraph|C4|subgraph|classDef|click|%%\{)\b/i;

export function extractMermaid(text: string): string | null {
  const fenced = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  if (!/^flowchart\s+(TD|LR)\b/i.test(body)) {
    return null;
  }
  if (FORBIDDEN.test(body) || /\bstyle\s+\w+/i.test(body)) {
    return null;
  }
  return body;
}

export function stripMermaidFences(text: string): string {
  return text.replace(/```(?:mermaid)?\s*[\s\S]*?```/gi, "").trim();
}
