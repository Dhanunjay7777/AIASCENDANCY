// components/Citations.jsx
import React from 'react';
import { safeHostname } from '../utils/citations';

export const Citations = ({ citations = [] }) => {
  if (!citations.length) return null;
  // De‑dupe by URL to avoid repeated sources
  const unique = [];
  const seen = new Set();
  for (const c of citations) {
    const key = c.url || c.id;
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
  }

  return (
    <div className="citations">
      <div className="citations-title">Sources</div>
      <div className="citations-list">
        {unique.map((c, i) => {
          const host = safeHostname(c.url);
          return (
            <a
              key={c.id ?? i}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="citation-pill"
              title={c.title || c.url}
              aria-label={`Open source ${i + 1}: ${c.title || host}`}
            >
              <sup>[{i + 1}]</sup>
              <span className="citation-host">{host || 'source'}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
};
