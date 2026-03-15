"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Section data
// ---------------------------------------------------------------------------

interface Section {
  id: string;
  title: string;
  icon: string;
}

interface SectionGroup {
  label: string;
  sections: Section[];
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    label: "Getting Started",
    sections: [
      { id: "getting-started", title: "Getting Started", icon: "rocket" },
      { id: "python-api", title: "Python API", icon: "code" },
    ],
  },
  {
    label: "Visualization",
    sections: [
      { id: "plot-types", title: "Plot Types", icon: "chart" },
      { id: "grid-view", title: "Grid View", icon: "grid" },
      { id: "multi-plot", title: "Multi-Plot Dashboard", icon: "panels" },
      { id: "media-viewer", title: "Media Viewer", icon: "image" },
    ],
  },
  {
    label: "Data Management",
    sections: [
      { id: "selection", title: "Selection Tools", icon: "lasso" },
      { id: "filtering", title: "Filtering", icon: "filter" },
      { id: "labels", title: "Labels & Labeling", icon: "tag" },
      { id: "focus-mode", title: "Focus Mode", icon: "focus" },
      { id: "projects", title: "Projects", icon: "folder" },
      { id: "export", title: "Export & Download", icon: "download" },
    ],
  },
  {
    label: "Analysis",
    sections: [
      { id: "similarity", title: "Similarity Search", icon: "search" },
      { id: "text-search", title: "Text Search", icon: "text" },
      { id: "insights", title: "Insights & ML", icon: "brain" },
      { id: "active-learning", title: "Active Learning", icon: "sparkle" },
    ],
  },
  {
    label: "Reference",
    sections: [
      { id: "shortcuts", title: "Keyboard Shortcuts", icon: "keyboard" },
    ],
  },
];

// Flat list for scroll-spy iteration
const SECTIONS: Section[] = SECTION_GROUPS.flatMap((g) => g.sections);

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid extra dependencies)
// ---------------------------------------------------------------------------

function SectionIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0";
  switch (type) {
    case "rocket":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      );
    case "chart":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="7.5" r="1.5" /><circle cx="12" cy="14" r="1.5" /><circle cx="17" cy="9" r="1.5" />
          <path d="M3 3v18h18" />
        </svg>
      );
    case "grid":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case "panels":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /><path d="M3 12h18" />
        </svg>
      );
    case "lasso":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 22a5 5 0 0 1-2-4" /><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-3.7-.5" />
          <circle cx="7" cy="18" r="2" />
        </svg>
      );
    case "tag":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" />
        </svg>
      );
    case "folder":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      );
    case "filter":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      );
    case "brain":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" /><path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
          <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" /><path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
          <path d="M19.938 10.5a4 4 0 0 1 .585.396" /><path d="M6 18a4 4 0 0 1-1.967-.516" />
          <path d="M19.967 17.484A4 4 0 0 1 18 18" />
        </svg>
      );
    case "sparkle":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
        </svg>
      );
    case "search":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "text":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 6.1H3" /><path d="M21 12.1H3" /><path d="M15.1 18H3" />
        </svg>
      );
    case "download":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    case "image":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
    case "keyboard":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.001" /><path d="M10 8h.001" /><path d="M14 8h.001" /><path d="M18 8h.001" />
          <path d="M8 12h.001" /><path d="M12 12h.001" /><path d="M16 12h.001" /><path d="M7 16h10" />
        </svg>
      );
    case "focus":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "code":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-gray-600 shadow-[0_1px_0_0_rgba(0,0,0,0.08)]">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Python syntax highlighting (lightweight, no dependencies)
// ---------------------------------------------------------------------------

const PY_KEYWORDS = new Set([
  "False","None","True","and","as","assert","async","await","break","class",
  "continue","def","del","elif","else","except","finally","for","from","global",
  "if","import","in","is","lambda","nonlocal","not","or","pass","raise","return",
  "try","while","with","yield",
]);

const PY_BUILTINS = new Set([
  "print","len","range","int","float","str","list","dict","set","tuple","bool",
  "type","isinstance","enumerate","zip","map","filter","sorted","min","max",
  "sum","abs","any","all","open","super","property","staticmethod","classmethod",
  "Optional","Union","List","Dict","Tuple","Set",
]);

interface Token {
  type: "keyword" | "builtin" | "string" | "comment" | "number" | "decorator" | "param" | "default";
  text: string;
}

function tokenizePython(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    // Comments
    if (code[i] === "#") {
      let end = code.indexOf("\n", i);
      if (end === -1) end = code.length;
      tokens.push({ type: "comment", text: code.slice(i, end) });
      i = end;
      continue;
    }
    // Triple-quoted strings
    if (code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") {
      const q = code.slice(i, i + 3);
      let end = code.indexOf(q, i + 3);
      end = end === -1 ? code.length : end + 3;
      tokens.push({ type: "string", text: code.slice(i, end) });
      i = end;
      continue;
    }
    // Strings
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q) {
        if (code[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", text: code.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // f-string prefix
    if ((code[i] === "f" || code[i] === "F") && (code[i + 1] === '"' || code[i + 1] === "'")) {
      const q = code[i + 1];
      let j = i + 2;
      while (j < code.length && code[j] !== q) {
        if (code[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", text: code.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // Decorators
    if (code[i] === "@" && (i === 0 || code[i - 1] === "\n")) {
      let end = i + 1;
      while (end < code.length && /[\w.]/.test(code[end])) end++;
      tokens.push({ type: "decorator", text: code.slice(i, end) });
      i = end;
      continue;
    }
    // Numbers
    if (/\d/.test(code[i]) && (i === 0 || /[\s(,=[\-+*/:><!]/.test(code[i - 1]))) {
      let end = i;
      while (end < code.length && /[\d._xXoObBeE]/.test(code[end])) end++;
      tokens.push({ type: "number", text: code.slice(i, end) });
      i = end;
      continue;
    }
    // Words (identifiers / keywords)
    if (/[a-zA-Z_]/.test(code[i])) {
      let end = i;
      while (end < code.length && /\w/.test(code[end])) end++;
      const word = code.slice(i, end);
      // Check if followed by = (keyword argument / parameter name)
      let afterWord = end;
      while (afterWord < code.length && code[afterWord] === " ") afterWord++;
      const isParam = code[afterWord] === "=" && code[afterWord + 1] !== "=";
      if (PY_KEYWORDS.has(word)) {
        tokens.push({ type: "keyword", text: word });
      } else if (PY_BUILTINS.has(word)) {
        tokens.push({ type: "builtin", text: word });
      } else if (isParam) {
        tokens.push({ type: "param", text: word });
      } else {
        tokens.push({ type: "default", text: word });
      }
      i = end;
      continue;
    }
    // Everything else (whitespace, operators, punctuation)
    tokens.push({ type: "default", text: code[i] });
    i++;
  }
  return tokens;
}

const TOKEN_COLORS: Record<Token["type"], string> = {
  keyword: "text-purple-400",
  builtin: "text-yellow-300",
  string: "text-green-400",
  comment: "text-gray-500 italic",
  number: "text-orange-300",
  decorator: "text-cyan-400",
  param: "text-orange-200",
  default: "text-gray-100",
};

function HighlightedCode({ code }: { code: string }) {
  const tokens = tokenizePython(code);
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} className={TOKEN_COLORS[tok.type]}>
          {tok.text}
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// CodeBlock with copy button and syntax highlighting
// ---------------------------------------------------------------------------

function CodeBlock({
  children,
  title,
  lang = "python",
}: {
  children: string;
  title?: string;
  lang?: "python" | "bash";
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = children.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(trimmed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="group relative overflow-hidden rounded-lg border border-gray-200">
      {title && (
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
          <span className="text-xs font-medium text-gray-500">{title}</span>
          <CopyButton copied={copied} onClick={handleCopy} />
        </div>
      )}
      <div className="relative">
        {!title && (
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton copied={copied} onClick={handleCopy} />
          </div>
        )}
        <pre className="overflow-x-auto bg-gray-900 p-4 text-[13px] leading-relaxed">
          <code>
            {lang === "python" ? <HighlightedCode code={trimmed} /> : <span className="text-gray-100">{trimmed}</span>}
          </code>
        </pre>
      </div>
    </div>
  );
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      ) }
    </button>
  );
}

function FeatureCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{description}</p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
      </svg>
      <p className="text-sm leading-relaxed text-blue-800">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main docs page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const registerRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    [],
  );

  // Scroll-spy: update active section based on scroll position
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const onScroll = () => {
      const scrollTop = container.scrollTop;
      let current = SECTIONS[0].id;
      for (const section of SECTIONS) {
        const el = sectionRefs.current[section.id];
        if (el && el.offsetTop - 80 <= scrollTop) {
          current = section.id;
        }
      }
      setActiveSection(current);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* Sidebar navigation */}
      <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-3 py-4 md:block">
        <div className="mb-4 px-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Documentation
          </h2>
        </div>
        <div className="space-y-4">
          {SECTION_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.sections.map((section) => (
                  <li key={section.id}>
                    <button
                      onClick={() => scrollTo(section.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                        activeSection === section.id
                          ? "bg-gray-100 font-medium text-gray-900"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      }`}
                    >
                      <SectionIcon type={section.icon} />
                      {section.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">

          {/* Hero */}
          <div className="mb-10">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Clusterfun Documentation
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Interactive data exploration with plots, grids, labels, and in-browser machine learning.
              Everything runs locally — your data never leaves your machine.
            </p>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Getting Started */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("getting-started")} id="getting-started" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Getting Started</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Clusterfun lets you explore datasets of images, videos, and audio interactively.
              Create a view from Python with a single function call, then explore in the browser.
            </p>

            <CodeBlock title="Install" lang="bash">
{`pip install clusterfun`}
            </CodeBlock>

            <div className="mt-4" />

            <CodeBlock title="Quick start">
{`import clusterfun as cfu
import pandas as pd

df = pd.read_parquet("my_data.parquet")

# Scatter plot colored by label
cfu.scatter(df, x="umap_x", y="umap_y", media="image_path", color="label")

# Image grid
cfu.grid(df, media="image_path")

# With embeddings for ML features
cfu.grid(df, media="image_path", embeddings="embedding_col")`}
            </CodeBlock>

            <Tip>
              The browser UI opens automatically. All data stays local — clusterfun runs a
              lightweight server on your machine and serves a static frontend. No internet required.
            </Tip>

            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              You can also reopen a saved view from the command line:
            </p>

            <CodeBlock lang="bash">
{`clusterfun path/to/saved/view`}
            </CodeBlock>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Plot Types */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("plot-types")} id="plot-types" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Plot Types</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Clusterfun supports several plot types. Each one lets you click any data point to
              inspect the underlying media, and select groups of points to view in the grid.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureCard title="Scatter" description="Two-dimensional plot mapping data columns to X and Y axes. Best for embeddings (UMAP, t-SNE) and exploring relationships between numeric variables.">
                <CodeBlock>
{`cfu.scatter(df, x="umap_x", y="umap_y",
            media="path", color="label")`}
                </CodeBlock>
              </FeatureCard>

              <FeatureCard title="Histogram" description="Distribution of a single numeric column shown as binned dot counts. Useful for understanding value distributions and spotting anomalies.">
                <CodeBlock>
{`cfu.histogram(df, x="confidence",
              media="path", bins=30)`}
                </CodeBlock>
              </FeatureCard>

              <FeatureCard title="Bar Chart" description="One bar per unique category value with points scattered inside. Color-stacking shows sub-category breakdowns.">
                <CodeBlock>
{`cfu.bar_chart(df, x="category",
              media="path", color="source")`}
                </CodeBlock>
              </FeatureCard>

              <FeatureCard title="Violin" description="Density-based distribution grouped by a categorical column. Shows the shape of distributions, not just summaries.">
                <CodeBlock>
{`cfu.violin(df, y="score",
            media="path", color="class")`}
                </CodeBlock>
              </FeatureCard>

              <FeatureCard title="Confusion Matrix" description="Classification results visualized as a grid with scattered points at each true/predicted intersection.">
                <CodeBlock>
{`cfu.confusion_matrix(df, y_true="gt",
    y_pred="pred", media="path")`}
                </CodeBlock>
              </FeatureCard>

              <FeatureCard title="Pie Chart" description="Proportional breakdown of a categorical column shown as a polar scatter.">
                <CodeBlock>
{`cfu.pie_chart(df, color="category",
              media="path")`}
                </CodeBlock>
              </FeatureCard>

              <FeatureCard title="Embedding Map" description="2D projection of high-dimensional embeddings using UMAP, t-SNE, or PCA. Shows image thumbnails on the plot for visual exploration.">
                <p className="mb-2 text-sm leading-relaxed text-gray-600">
                  Select <strong>Embedding Map</strong> from the plot type dropdown. Choose a
                  projection method (UMAP, t-SNE, or PCA), sample size, and neighbor count.
                  The projection is cached so switching colors or re-opening is instant.
                </p>
              </FeatureCard>
            </div>

            <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-900">Common parameters</h3>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 font-medium text-gray-600">Parameter</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">media</td><td className="px-4 py-2 text-gray-600">Column with file paths (images, video, audio). Required.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">color</td><td className="px-4 py-2 text-gray-600">Column used to color data points. Categorical or numeric.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">title</td><td className="px-4 py-2 text-gray-600">Title shown above the plot.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">display</td><td className="px-4 py-2 text-gray-600">Column(s) to show as overlays on grid items.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">embeddings</td><td className="px-4 py-2 text-gray-600">Column with embedding vectors. Enables similarity search and insights.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">bounding_box</td><td className="px-4 py-2 text-gray-600">Column with bounding box data for object detection.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">hline / vline</td><td className="px-4 py-2 text-gray-600">Draw horizontal/vertical reference lines on the plot.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">show</td><td className="px-4 py-2 text-gray-600">Set <code className="rounded bg-gray-100 px-1 text-xs">False</code> to save without opening the browser.</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Grid View */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("grid-view")} id="grid-view" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Grid View</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              The grid view displays your media items in a browsable gallery. Switch to it from any
              plot by clicking the <strong>Grid</strong> tab, or start directly with <code className="rounded bg-gray-100 px-1 text-xs">cfu.grid()</code>.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureCard title="Subsampling" description="Use the sample dropdown (1%, 5%, 10%, 25%, 50%) to browse a random slice of your data without loading everything. Great for quickly scanning large datasets." />
              <FeatureCard title="Sorting" description="Sort items by any column in ascending or descending order using the sort dropdown in the toolbar." />
              <FeatureCard title="Grid Size" description="Adjust the number of columns (1–10) using the size slider in the toolbar. Fewer columns show larger previews." />
              <FeatureCard title="Pagination" description="Navigate pages with Previous/Next buttons. Click the page number to jump directly to any page." />
              <FeatureCard title="Column Values" description="Overlay additional metadata on grid items using the column display dropdown. Show multiple columns simultaneously." />
              <FeatureCard title="Bounding Boxes" description="When bounding box data is provided, boxes are drawn on images. Toggle box labels via the toolbar." />
              <FeatureCard title="Statistics Bar" description="Toggle a statistics visualization showing the distribution of your current selection." />
            </div>

            <Tip>
              Hover over any item to preview it in the sidebar with full metadata.
              Click to open the full media viewer.
            </Tip>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Multi-Plot Dashboard */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("multi-plot")} id="multi-plot" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Multi-Plot Dashboard</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Create up to 4 simultaneous plots to compare different views of your data.
              Each panel is independently configurable.
            </p>

            <div className="space-y-3">
              <FeatureCard title="Adding Panels" description="Click the &quot;+ Add plot&quot; button in the toolbar to add a new panel (max 4). Panels arrange in a 2&times;2 grid." />
              <FeatureCard title="Per-Panel Configuration" description="Each panel has its own type, X, Y, and color selectors. Change a scatter to a histogram, pick different columns — each panel fetches its own data." />
              <FeatureCard title="Linked Brushing">
                <p className="text-sm leading-relaxed text-gray-600">
                  Select points in one panel and they are highlighted across all panels.
                  This lets you see how a cluster in UMAP space maps to a histogram distribution,
                  or how different color encodings relate to each other.
                </p>
              </FeatureCard>
              <FeatureCard title="Removing Panels" description="Click the &times; button on any panel to remove it. You always keep at least one panel." />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Selection Tools */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("selection")} id="selection" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Selection Tools</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Three selection modes are available in the plot toolbar. Switch between them
              to interact with your data differently.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <FeatureCard title="Box Select">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-gray-50">
                    <svg className="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4 2" /></svg>
                  </div>
                  <p className="text-xs text-gray-500">Click and drag to draw a rectangle around points.</p>
                </div>
              </FeatureCard>

              <FeatureCard title="Lasso Select">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-gray-50">
                    <svg className="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 22a5 5 0 0 1-2-4" /><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-3.7-.5" /></svg>
                  </div>
                  <p className="text-xs text-gray-500">Draw freeform shapes to select non-convex clusters.</p>
                </div>
              </FeatureCard>

              <FeatureCard title="Pan & Zoom">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-gray-50">
                    <svg className="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><path d="M2 12h20" /><path d="M12 2v20" /></svg>
                  </div>
                  <p className="text-xs text-gray-500">Click and drag to pan. Scroll to zoom in and out.</p>
                </div>
              </FeatureCard>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              After selecting points on a plot, click the <strong>Grid</strong> tab to view
              the selected items as a gallery. Use <Kbd>Escape</Kbd> to go back.
            </p>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Labels & Labeling */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("labels")} id="labels" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Labels & Labeling</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              The sidebar&apos;s Labels section lets you create, apply, and manage labels
              for your data items. Labels are persisted and can be exported as CSV.
              Each label gets a unique color so labelled items are instantly visible in the grid.
            </p>

            <div className="space-y-3">
              <FeatureCard title="Creating Labels" description="Type a label name in the input field at the bottom of the Labels section and press Enter. You can create up to 9 labels." />
              <FeatureCard title="Applying Labels">
                <p className="text-sm leading-relaxed text-gray-600">
                  Hover over a grid item and press <Kbd>1</Kbd>–<Kbd>9</Kbd> to
                  toggle the corresponding label. Press the same key again to remove it.
                  You can also click label buttons in the sidebar preview when an item is hovered.
                </p>
              </FeatureCard>
              <FeatureCard title="Batch Labeling" description={'Click "Label page" next to any label in the sidebar to apply it to all items currently visible on the page. Click "Remove all" to remove it from all visible items.'} />
              <FeatureCard title="Visual Indicators" description="Labeled items show colored badges in the top-left corner of each grid item. Each label has a consistent color, matching the dot shown in the sidebar." />
              <FeatureCard title="Undo" description="Press Ctrl+Z (or Cmd+Z on Mac) to undo the last label action." />
              <FeatureCard title="Label Counts" description="Each label card in the sidebar shows the count of labeled items on the current page and across the entire dataset." />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Focus Mode */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("focus-mode")} id="focus-mode" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Focus Mode</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Focus Mode presents one item at a time for fast, sequential labeling.
              Press <Kbd>F</Kbd> in the grid view or click the crosshairs icon in the toolbar to enter.
            </p>

            <div className="space-y-3">
              <FeatureCard title="Labeling">
                <p className="text-sm leading-relaxed text-gray-600">
                  Press <Kbd>1</Kbd>–<Kbd>9</Kbd> to toggle labels, just like in the grid.
                  Each label can also be clicked as a button below the image. By default,
                  labeling auto-advances to the next item. Toggle the <strong>auto-advance</strong> checkbox
                  in the header to stay on the current item — useful when applying multiple labels.
                  Press <Kbd>Enter</Kbd> to manually advance when auto-advance is off.
                </p>
              </FeatureCard>
              <FeatureCard title="Navigation">
                <p className="text-sm leading-relaxed text-gray-600">
                  <Kbd>Space</Kbd> skips to the next item without labeling.{" "}
                  <Kbd>Backspace</Kbd> or <Kbd>←</Kbd> goes back.{" "}
                  <Kbd>→</Kbd> advances forward. <Kbd>Escape</Kbd> exits focus mode and returns to the grid.
                  Side arrow buttons are also available for mouse navigation.
                </p>
              </FeatureCard>
              <FeatureCard title="Zoom & Pan">
                <p className="text-sm leading-relaxed text-gray-600">
                  Scroll the mouse wheel to zoom in on the image. Click and drag to pan when zoomed.
                  Double-click to toggle between zoomed and fit-to-screen views.
                </p>
              </FeatureCard>
              <FeatureCard title="Active Learning Integration" description="When active learning predictions are available, Focus Mode shows the predicted class and confidence score above the image. Combined with uncertainty sorting, this creates a tight label-review loop: label a few items, refit, then focus-mode through the most uncertain items." />
              <Tip>
                Focus Mode prefetches upcoming images in the background so there is no loading delay as you move through items.
              </Tip>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Projects */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("projects")} id="projects" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Projects</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Projects let you persist labels across multiple views of the same dataset.
              When you create different plots (scatter, histogram, grid, etc.) with the same
              project name, labels applied in one view are automatically available in all others.
            </p>

            <div className="space-y-3">
              <FeatureCard title="Creating a Project">
                <p className="text-sm leading-relaxed text-gray-600">
                  Pass the <code className="rounded bg-gray-100 px-1 text-xs">project</code> parameter
                  to any plot function. Views with the same project name share labels.
                </p>
              </FeatureCard>
              <CodeBlock title="Example: project parameter">
{`import clusterfun as cfu

# Both views share the "my-dataset" project labels
cfu.scatter(df, x="x", y="y", media="img", project="my-dataset")
cfu.grid(df, media="img", project="my-dataset")`}
              </CodeBlock>
              <FeatureCard title="How It Works">
                <p className="text-sm leading-relaxed text-gray-600">
                  Labels are stored by original media path (not by dataframe index), so they
                  transfer correctly even when your dataframe is reordered, filtered, or
                  reconstructed. The project name appears in the tab bar when active.
                </p>
              </FeatureCard>
              <FeatureCard title="Retrieving Labels from Python">
                <p className="text-sm leading-relaxed text-gray-600">
                  Use the Python API to access your labels programmatically for downstream
                  ML pipelines.
                </p>
              </FeatureCard>
              <CodeBlock title="Project API">
{`import clusterfun as cfu

# List all projects
cfu.list_projects()  # ["my-dataset", "another-project"]

# Get labels as a dict: {media_path: [labels]}
labels = cfu.get_labels("my-dataset")

# Get labels as a DataFrame with one column per label
df = cfu.get_labels_df("my-dataset")
# Columns: media_path, good, bad, ...

# Filter to a specific label
good_items = cfu.get_labels_df("my-dataset", label="good")`}
              </CodeBlock>
              <FeatureCard title="Serving by Project Name">
                <p className="text-sm leading-relaxed text-gray-600">
                  You can serve the most recent view of a project directly from the CLI:
                </p>
              </FeatureCard>
              <CodeBlock title="CLI">
{`# Serve by project name (opens most recent view)
clusterfun my-dataset

# Or by UUID as before
clusterfun abc123-def456`}
              </CodeBlock>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Filtering */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("filtering")} id="filtering" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Filtering</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Add column-based filters to narrow down your data. Filters appear in the
              toolbar at the top of the plot or grid view.
            </p>

            <div className="space-y-3">
              <FeatureCard title="Adding Filters" description="Click the filter area in the toolbar to add a filter. Select a column, choose an operator (equals, not equals, greater than, less than, contains), and pick values." />
              <FeatureCard title="Multiple Filters" description="Add as many filters as you need. They combine with AND logic, progressively narrowing your view." />
              <FeatureCard title="Filter Stacking">
                <p className="text-sm leading-relaxed text-gray-600">
                  Each filter or selection creates a new level in the navigation stack.
                  Click the back button or press <Kbd>Escape</Kbd> to pop back to the
                  previous level. This lets you drill down and back up fluidly.
                </p>
              </FeatureCard>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Insights & ML */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("insights")} id="insights" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Insights & ML</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              The Insights tab provides dataset analysis tools. Image statistics work on any
              image dataset. Embedding-powered tools (outliers, duplicates, weirdest) require
              embeddings — for small datasets (&le;5,000 items), these run entirely in the browser.
            </p>

            <h3 className="mb-2 text-sm font-semibold text-gray-900">Image Statistics</h3>
            <p className="mb-3 text-sm leading-relaxed text-gray-600">
              Click <strong>Compute</strong> to automatically analyse every image in your dataset.
              The following per-image metrics are calculated and added as new columns:
            </p>
            <div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 font-medium text-gray-600">Metric</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">brightness</td><td className="px-4 py-2 text-gray-600">Mean luminance (0–1)</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">contrast</td><td className="px-4 py-2 text-gray-600">Standard deviation of luminance (0–1)</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">sharpness</td><td className="px-4 py-2 text-gray-600">Laplacian variance (log scale) — higher = sharper</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">colorfulness</td><td className="px-4 py-2 text-gray-600">Hasler &amp; S&uuml;sstrunk metric (0–1)</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">saturation</td><td className="px-4 py-2 text-gray-600">Mean HSV saturation (0–1)</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">aspect_ratio</td><td className="px-4 py-2 text-gray-600">Width / height</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">width, height</td><td className="px-4 py-2 text-gray-600">Original image dimensions in pixels</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Once computed, these appear as regular columns — use them in scatter plots, histograms,
              filters, and sorting. Computation runs in the background, so you can leave the page
              and track progress via the task indicator in the top navigation bar.
            </p>

            <h3 className="mb-2 text-sm font-semibold text-gray-900">Embedding Analysis</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <FeatureCard title="Find Outliers">
                <p className="text-sm leading-relaxed text-gray-600">
                  Uses the <strong>Local Outlier Factor</strong> (LOF) algorithm to identify
                  items in sparse regions of embedding space — likely anomalies, edge cases,
                  or mislabeled data.
                </p>
              </FeatureCard>

              <FeatureCard title="Find Duplicates">
                <p className="text-sm leading-relaxed text-gray-600">
                  Detects near-duplicate groups using <strong>cosine similarity</strong> with
                  a configurable threshold. Results are grouped using a union-find structure so
                  transitive duplicates are merged.
                </p>
              </FeatureCard>

              <FeatureCard title="Show Weirdest">
                <p className="text-sm leading-relaxed text-gray-600">
                  Ranks items by <strong>distance from the embedding centroid</strong>.
                  Items furthest from the center are the most unusual in your dataset.
                </p>
              </FeatureCard>
            </div>

            <Tip>
              After running any insight, click &quot;View in grid&quot; to see the results.
              For duplicates, you can also view individual groups to inspect each cluster.
              Long-running tasks show progress in the top-right corner and continue when you navigate away.
            </Tip>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Active Learning */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("active-learning")} id="active-learning" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Active Learning</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              When you have labels and embeddings, the Active Learning section helps you
              label data more efficiently by suggesting the most informative items next.
              All models run in the browser.
            </p>

            <h3 className="mb-2 text-sm font-semibold text-gray-900">Methods</h3>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 font-medium text-gray-600">Method</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Min. Classes</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="px-4 py-2 font-medium text-gray-800">Centroid Search</td><td className="px-4 py-2 text-gray-600">1</td><td className="px-4 py-2 text-gray-600">Finds items most similar to the centroid of labeled examples.</td></tr>
                  <tr><td className="px-4 py-2 font-medium text-gray-800">KNN</td><td className="px-4 py-2 text-gray-600">1</td><td className="px-4 py-2 text-gray-600">k-Nearest Neighbor voting based on labeled embeddings.</td></tr>
                  <tr><td className="px-4 py-2 font-medium text-gray-800">Linear Classifier</td><td className="px-4 py-2 text-gray-600">2</td><td className="px-4 py-2 text-gray-600">Logistic regression on embeddings. Fast and interpretable.</td></tr>
                  <tr><td className="px-4 py-2 font-medium text-gray-800">Prototype Network</td><td className="px-4 py-2 text-gray-600">2</td><td className="px-4 py-2 text-gray-600">Class prototypes with temperature-scaled similarity.</td></tr>
                  <tr><td className="px-4 py-2 font-medium text-gray-800">Neural Network</td><td className="px-4 py-2 text-gray-600">2</td><td className="px-4 py-2 text-gray-600">Multi-layer perceptron (1–3 layers). Most powerful but slower.</td></tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3">
              <FeatureCard title="Workflow">
                <ol className="list-inside list-decimal space-y-1 text-sm text-gray-600">
                  <li>Label a few items using <Kbd>1</Kbd>–<Kbd>9</Kbd></li>
                  <li>Choose an active learning method</li>
                  <li>Click <strong>Suggest next</strong> to rank unlabeled items</li>
                  <li>Label suggested items, then click <strong>Refit</strong> to update</li>
                  <li>Switch between &quot;Most similar&quot; and &quot;Most uncertain&quot; sorting</li>
                </ol>
              </FeatureCard>
              <FeatureCard title="Exclude Items" description="Press X on a grid item to mark it as excluded. Excluded items are skipped during active learning predictions." />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Similarity Search */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("similarity")} id="similarity" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Similarity Search</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              When embeddings are available, click the <strong>Find similar</strong> button in
              the sidebar while previewing any item. This searches for the most similar items
              in embedding space and displays them in the grid.
            </p>
            <Tip>
              Similarity search uses cosine similarity on the embedding vectors. For best
              results, use high-quality embeddings like CLIP, DINOv2, or domain-specific models.
            </Tip>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Text Search */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("text-search")} id="text-search" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Text Search</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              When an <code className="rounded bg-gray-100 px-1 text-xs">embeddings_model</code> is
              provided (e.g., a CLIP model), you can search your dataset by typing natural language
              descriptions. The model runs entirely in the browser using ONNX.
            </p>

            <CodeBlock title="Enable text search">
{`cfu.grid(df, media="path",
         embeddings="clip_embeddings",
         embeddings_model="openai/clip-vit-large-patch14")`}
            </CodeBlock>

            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              A progress indicator shows while the model loads for the first time. Once loaded,
              type any text in the search bar and press Enter to rank items by text-image similarity.
            </p>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Export & Download */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("export")} id="export" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Export & Download</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Export your work in several ways from the sidebar&apos;s Labels section.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureCard title="Download CSV" description="Download labeled items as a CSV file. Includes all original dataframe columns merged with your labels. Download per-label or all labels at once." />
              <FeatureCard title="Save as Grid" description="Create a new clusterfun grid view from labeled items. A toast notification shows the command to open it." />
              <FeatureCard title="Scope" description="Downloads can include items from the current selection or from the entire dataset." />
              <FeatureCard title="Grid Data" description="Download the current grid view as CSV including all visible items and their metadata." />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Media Viewer */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("media-viewer")} id="media-viewer" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Media Viewer</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              Click any item in the grid to open it in the full media viewer.
              Supports images, video, and audio.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureCard title="Navigation" description="Use ← and → arrow keys to move between items in the current list. Press Escape to return to the grid." />
              <FeatureCard title="Image Adjustments">
                <p className="text-sm leading-relaxed text-gray-600">
                  Toggle the adjustments panel to control:
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-600">
                  <li>Brightness</li>
                  <li>Contrast (gamma correction)</li>
                  <li>Rotation (90° increments)</li>
                </ul>
              </FeatureCard>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Keyboard Shortcuts */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("shortcuts")} id="shortcuts" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium text-gray-600">Shortcut</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">Context</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>1</Kbd> – <Kbd>9</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Grid (hover)</td>
                    <td className="px-4 py-2.5 text-gray-600">Toggle label on hovered item</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>X</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Grid (hover)</td>
                    <td className="px-4 py-2.5 text-gray-600">Toggle exclude label (active learning)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Grid</td>
                    <td className="px-4 py-2.5 text-gray-600">Undo last label action</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>Escape</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Grid (filtered)</td>
                    <td className="px-4 py-2.5 text-gray-600">Go back to previous selection level</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>←</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Media viewer</td>
                    <td className="px-4 py-2.5 text-gray-600">Previous item</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>→</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Media viewer</td>
                    <td className="px-4 py-2.5 text-gray-600">Next item</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>Escape</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Media viewer</td>
                    <td className="px-4 py-2.5 text-gray-600">Return to grid</td>
                  </tr>
                  <tr className="bg-gray-50/50">
                    <td className="px-4 py-2.5"><Kbd>F</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Grid</td>
                    <td className="px-4 py-2.5 text-gray-600">Enter Focus Mode</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>Space</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Focus Mode</td>
                    <td className="px-4 py-2.5 text-gray-600">Skip to next item</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>Backspace</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Focus Mode</td>
                    <td className="px-4 py-2.5 text-gray-600">Go back to previous item</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><Kbd>Enter</Kbd></td>
                    <td className="px-4 py-2.5 text-gray-600">Focus Mode</td>
                    <td className="px-4 py-2.5 text-gray-600">Confirm &amp; advance (when auto-advance is off)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Python API Reference */}
          {/* ---------------------------------------------------------------- */}
          <section ref={registerRef("python-api")} id="python-api" className="mb-12 scroll-mt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Python API Reference</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              All plot functions share a common signature. Each returns the path to the saved
              view data.
            </p>

            <CodeBlock title="Full scatter signature">
{`cfu.scatter(
    df: pd.DataFrame,
    x: str,                          # X-axis column
    y: str,                          # Y-axis column
    media: str,                      # Media file path column
    color: Optional[str] = None,     # Color-by column
    title: Optional[str] = None,     # Plot title
    show: bool = True,               # Open browser automatically
    bounding_box: Optional[str] = None,
    display: Optional[Union[str, List[str]]] = None,
    embeddings: Optional[str] = None,
    embeddings_model: Optional[str] = None,
    hline: Optional[float] = None,
    vline: Optional[float] = None,
    color_is_categorical: bool = True,
    project: Optional[str] = None,   # Share labels across views
)`}
            </CodeBlock>

            <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-900">All plot functions</h3>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 font-medium text-gray-600">Function</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Required Params</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">cfu.scatter(df, x, y, media)</td><td className="px-4 py-2 text-gray-600">x, y, media</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">cfu.histogram(df, x, media)</td><td className="px-4 py-2 text-gray-600">x, media</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">cfu.bar_chart(df, x, media)</td><td className="px-4 py-2 text-gray-600">x, media</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">cfu.violin(df, y, media)</td><td className="px-4 py-2 text-gray-600">y, media</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">cfu.confusion_matrix(df, y_true, y_pred, media)</td><td className="px-4 py-2 text-gray-600">y_true, y_pred, media</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">cfu.pie_chart(df, color, media)</td><td className="px-4 py-2 text-gray-600">color, media</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs text-gray-800">cfu.grid(df, media)</td><td className="px-4 py-2 text-gray-600">media</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-900">Data sources</h3>
            <p className="mb-3 text-sm leading-relaxed text-gray-600">
              The <code className="rounded bg-gray-100 px-1 text-xs">media</code> column can contain:
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
              <li>Local file paths (absolute or relative)</li>
              <li>S3 URLs (<code className="rounded bg-gray-100 px-1 text-xs">s3://bucket/key</code>)</li>
              <li>GCS URLs (<code className="rounded bg-gray-100 px-1 text-xs">gs://bucket/path</code>)</li>
            </ul>
          </section>

          {/* Footer */}
          <div className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
            Clusterfun — interactive data exploration
          </div>
        </div>
      </div>
    </div>
  );
}
