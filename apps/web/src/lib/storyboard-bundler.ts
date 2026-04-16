interface StoryboardStripInput {
  name: string;
  flowStructure: Array<{ stepName: string; type: string; description: string }>;
  mockupCode: Record<string, string>;
  authMockup: { login: string; signup: string };
}

export interface ExtractedComponent {
  declaration: string;
  name: string;
}

/**
 * Build a single-iframe HTML document that renders one option's storyboard
 * strip: auth screens (signup + login) followed by each flow step, laid out
 * horizontally as scaled thumbnails. Pure static — no state, no handlers.
 *
 * Note: helpers (extractComponent, toIdentifier, escapeHtml,
 * escapeForTextScript) are exported for reuse by single-screen-bundler.ts.
 * They still duplicate preview-bundler.ts; consolidating all three bundlers
 * onto one shared helper module is tracked as follow-up.
 */
export function buildStoryboardStripHtml(input: StoryboardStripInput): string {
  const screens: Array<{ slotName: string; label: string; comp: ExtractedComponent }> = [];

  if (input.authMockup.signup) {
    screens.push({
      slotName: "__screen_signup",
      label: "signup",
      comp: extractComponent(input.authMockup.signup, "signup"),
    });
  }
  if (input.authMockup.login) {
    screens.push({
      slotName: "__screen_login",
      label: "login",
      comp: extractComponent(input.authMockup.login, "login"),
    });
  }

  for (const step of input.flowStructure) {
    const code = input.mockupCode[step.stepName];
    if (!code) continue;
    screens.push({
      slotName: `__screen_${toIdentifier(step.stepName)}`,
      label: step.stepName,
      comp: extractComponent(code, step.stepName),
    });
  }

  const componentDeclarations = screens
    .map(
      ({ slotName, comp }) => `const ${slotName} = (function() {
${comp.declaration}
  return typeof ${comp.name} !== "undefined" ? ${comp.name} : null;
})();`
    )
    .join("\n\n");

  const panelsJsx = screens
    .map(
      ({ slotName, label }) =>
        `<div className="panel"><div className="panel-label">${escapeHtml(
          label
        )}</div><div className="panel-frame"><div className="panel-scale">{${slotName} ? <${slotName}/> : <div className="p-8 text-gray-400">missing</div>}</div></div></div>`
    )
    .join("");

  const tsxSource = `
    ${componentDeclarations}

    function Strip() {
      return (
        <div className="strip">
          ${panelsJsx}
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<Strip />);
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(input.name)} Storyboard</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body, #root { margin: 0; height: 100%; background: #f9fafb; }
    .strip { display: flex; gap: 24px; padding: 24px; overflow-x: auto; height: 100%; align-items: flex-start; }
    .panel { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; }
    .panel-label { font: 600 12px/1 -apple-system, sans-serif; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; padding-left: 4px; }
    .panel-frame { width: 400px; height: 280px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; overflow: hidden; position: relative; }
    .panel-scale { transform: scale(0.35); transform-origin: top left; width: calc(100% / 0.35); height: calc(100% / 0.35); }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="preview-error" style="display:none;position:fixed;top:0;left:0;right:0;padding:12px;background:#fee2e2;color:#991b1b;font-family:monospace;font-size:12px;white-space:pre-wrap;z-index:9999;"></div>
  <script>
    function showPreviewError(msg) {
      var el = document.getElementById("preview-error");
      if (el) { el.style.display = "block"; el.textContent = msg; }
      try { console.error(msg); } catch(_) {}
    }
    window.addEventListener("error", function(e) {
      var detail = e.error && e.error.stack ? e.error.stack : (e.message || "unknown");
      showPreviewError("Runtime error: " + detail);
    });
  </script>
  <script id="storyboard-tsx-source" type="text/plain">${escapeForTextScript(tsxSource)}</script>
  <script>
    (function() {
      try {
        var source = document.getElementById("storyboard-tsx-source").textContent;
        var compiled = Babel.transform(source, {
          presets: [
            ["typescript", { isTSX: true, allExtensions: true, allowDeclareFields: true }],
            "react"
          ]
        }).code;
        (0, eval)(compiled);
      } catch (e) {
        showPreviewError("Compile error: " + (e && e.message ? e.message : String(e)));
      }
    })();
  </script>
</body>
</html>`;
}

export function extractComponent(code: string, stepName: string): ExtractedComponent {
  let cleaned = code;
  cleaned = cleaned.replace(/^```(?:jsx?|tsx?)?\s*\n/, "").replace(/\n?```\s*$/, "");
  cleaned = cleaned.replace(/^[ \t]*import[ \t][^\n]*;?\s*$/gm, "");
  cleaned = cleaned.replace(/^[ \t]*["']use client["'];?\s*$/gm, "");

  const safeName = toIdentifier(stepName);

  const exportFnMatch = cleaned.match(/export\s+default\s+function\s+([A-Za-z_]\w*)/);
  if (exportFnMatch) {
    cleaned = cleaned.replace(/export\s+default\s+/, "");
    return { declaration: cleaned, name: exportFnMatch[1] };
  }
  const exportNameMatch = cleaned.match(/export\s+default\s+([A-Za-z_]\w*)\s*;?\s*$/m);
  if (exportNameMatch) {
    cleaned = cleaned.replace(/export\s+default\s+[A-Za-z_]\w*\s*;?\s*$/m, "");
    return { declaration: cleaned, name: exportNameMatch[1] };
  }
  const exportArrowMatch = cleaned.match(/export\s+default\s+(?=\(|[A-Za-z_])/);
  if (exportArrowMatch) {
    cleaned = cleaned.replace(/export\s+default\s+/, `const ${safeName} = `);
    return { declaration: cleaned, name: safeName };
  }
  const bareFnMatch = cleaned.match(/^[ \t]*function\s+([A-Z]\w*)\s*\(/m);
  if (bareFnMatch) return { declaration: cleaned, name: bareFnMatch[1] };
  const bareConstMatch = cleaned.match(/^[ \t]*const\s+([A-Z]\w*)\s*=\s*(?:\(|async\s|[A-Za-z_])/m);
  if (bareConstMatch) return { declaration: cleaned, name: bareConstMatch[1] };

  return {
    declaration: `function ${safeName}() { return <div className="p-8 text-gray-500">Could not parse mockup for "${stepName}"</div>; }`,
    name: safeName,
  };
}

export function toIdentifier(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9]/g, "_");
  return /^[0-9]/.test(safe) ? `_${safe}` : safe || "_Component";
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeForTextScript(str: string): string {
  return str.replace(/<\/script/gi, "<\\/script");
}
