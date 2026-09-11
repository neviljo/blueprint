import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(<strong key={key++}>{match[1]}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

export function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} style={{ margin: "0.4em 0 0.4em 1.1em", padding: 0 }}>
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList();
    if (line.trim() === "") {
      nodes.push(<br key={`br-${i}`} />);
      return;
    }
    nodes.push(
      <p key={`p-${i}`} style={{ margin: "0.35em 0" }}>
        {inline(line)}
      </p>
    );
  });
  flushList();
  return <>{nodes}</>;
}
