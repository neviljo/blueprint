import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "0.85em",
            background: "var(--button-hover-bg)",
            padding: "0.05em 0.3em",
            borderRadius: "0.25rem",
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
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
  let ordered: string[] = [];

  const flushBullet = () => {
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

  const flushOrdered = () => {
    if (ordered.length === 0) return;
    nodes.push(
      <ol key={`ol-${nodes.length}`} style={{ margin: "0.4em 0 0.4em 1.1em", padding: 0 }}>
        {ordered.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ol>
    );
    ordered = [];
  };

  const flushLists = () => {
    flushBullet();
    flushOrdered();
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushOrdered();
      list.push(bullet[1]);
      return;
    }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      flushBullet();
      ordered.push(numbered[1]);
      return;
    }
    flushLists();
    if (line.trim() === "") {
      nodes.push(<br key={`br-${i}`} />);
      return;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const size = Math.max(0.95, 1.2 - heading[1].length * 0.06);
      nodes.push(
        <p
          key={`h-${i}`}
          style={{ margin: "0.5em 0 0.25em", fontWeight: 700, fontSize: `${size}rem` }}
        >
          {inline(heading[2])}
        </p>
      );
      return;
    }
    nodes.push(
      <p key={`p-${i}`} style={{ margin: "0.35em 0" }}>
        {inline(line)}
      </p>
    );
  });
  flushLists();
  return <>{nodes}</>;
}
