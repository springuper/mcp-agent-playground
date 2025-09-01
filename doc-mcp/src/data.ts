export type DocEntry = {
  title: string;
  url: string;
  snippets: string[];
};

export type LibraryId = "node" | "typescript" | "react";

export const libraries: Record<LibraryId, DocEntry[]> = {
  node: [
    {
      title: "Event Loop Overview",
      url: "https://nodejs.org/en/learn/asynchronous/work-with-the-event-loop",
      snippets: [
        "Node.js uses an event-driven, non-blocking I/O model.",
        "The event loop offloads I/O to the system and invokes callbacks when complete."
      ]
    },
    {
      title: "FS Module Basics",
      url: "https://nodejs.org/api/fs.html",
      snippets: [
        "The fs module provides an API for interacting with the file system.",
        "Use promises API (fs/promises) for async/await patterns."
      ]
    },
    {
      title: "Streams Fundamentals",
      url: "https://nodejs.org/api/stream.html",
      snippets: [
        "Streams are objects that let you read data from a source or write data to a destination in continuous fashion.",
        "Use pipeline for safe composition of streams."
      ]
    }
  ],
  typescript: [
    {
      title: "Types vs Interfaces",
      url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html",
      snippets: [
        "Interfaces and type aliases are similar but have subtle differences.",
        "Interfaces can be extended and merged; type aliases are more general."
      ]
    },
    {
      title: "Generics",
      url: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
      snippets: [
        "Generics provide variables to types.",
        "Use constraints to narrow acceptable types."
      ]
    },
    {
      title: "Narrowing",
      url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html",
      snippets: [
        "Narrowing refines types using control flow analysis.",
        "Common techniques include typeof, instanceof, and equality checks."
      ]
    }
  ],
  react: [
    {
      title: "Components and Props",
      url: "https://react.dev/learn/your-first-component",
      snippets: [
        "Components describe UI and accept inputs called props.",
        "Props are read-only and should not be mutated by children."
      ]
    },
    {
      title: "Hooks",
      url: "https://react.dev/learn/hooks-intro",
      snippets: [
        "Hooks let you use state and other React features without writing a class.",
        "Common hooks include useState, useEffect, and useMemo."
      ]
    },
    {
      title: "Effect Basics",
      url: "https://react.dev/learn/synchronizing-with-effects",
      snippets: [
        "Effects synchronize your component with external systems.",
        "Cleanup functions run before the effect re-runs or on unmount."
      ]
    }
  ]
};

export function listLibraryIds(): LibraryId[] {
  return Object.keys(libraries) as LibraryId[];
}

export function searchLibrary(library: LibraryId, keyword: string) {
  const q = keyword.trim().toLowerCase();
  const entries = libraries[library] ?? [];
  return entries
    .map((entry) => {
      const hay = [entry.title, entry.url, ...entry.snippets].join("\n").toLowerCase();
      const score = q ? (hay.includes(q) ? 1 : 0) : 0;
      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .slice(0, 5)
    .map(({ entry }) => ({ title: entry.title, url: entry.url, snippet: entry.snippets[0] }));
}

