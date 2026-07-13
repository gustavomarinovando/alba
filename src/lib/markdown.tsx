import type { ReactNode } from "react";

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(INLINE_PATTERN)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={key} className="ai-chat-inline-code">{part.slice(1, -1)}</code>;
      if (part.startsWith("*") && part.endsWith("*")) return <em key={key}>{part.slice(1, -1)}</em>;
      return part;
    });
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/** Minimal, dependency-free markdown: bold/italic/code, bullet & numbered lists, tables, headings, paragraphs. */
export function renderMarkdown(content: string): ReactNode {
  const blocks = content.split(/\n{2,}/).filter((block) => block.trim().length > 0);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);

    if (lines.length >= 2 && lines[0].includes("|") && isTableSeparatorRow(lines[1])) {
      const headerCells = splitTableRow(lines[0]);
      const bodyRows = lines.slice(2).map(splitTableRow);
      return (
        <div key={blockIndex} className="ai-chat-table-wrap">
          <table className="ai-chat-table">
            <thead>
              <tr>
                {headerCells.map((cell, cellIndex) => (
                  <th key={cellIndex}>{renderInline(cell, `${blockIndex}-th-${cellIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell, `${blockIndex}-td-${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
      return (
        <ul key={blockIndex} className="ai-chat-list">
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>{renderInline(line.replace(/^[-*]\s+/, ""), `${blockIndex}-${lineIndex}`)}</li>
          ))}
        </ul>
      );
    }

    if (lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/.test(line))) {
      return (
        <ol key={blockIndex} className="ai-chat-list">
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>{renderInline(line.replace(/^\d+[.)]\s+/, ""), `${blockIndex}-${lineIndex}`)}</li>
          ))}
        </ol>
      );
    }

    const headingMatch = block.match(/^#{1,3}\s+(.*)$/);
    if (headingMatch) {
      return <p key={blockIndex} className="ai-chat-heading">{renderInline(headingMatch[1], `${blockIndex}-h`)}</p>;
    }

    return (
      <p key={blockIndex}>
        {block.split("\n").map((line, lineIndex, all) => (
          <span key={lineIndex}>
            {renderInline(line, `${blockIndex}-${lineIndex}`)}
            {lineIndex < all.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  });
}
