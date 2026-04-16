import {
  extractComponent,
  toIdentifier,
  escapeHtml,
  escapeForTextScript,
} from "./storyboard-bundler";

/**
 * Build a single-iframe HTML document that renders one React component at
 * its native size, filling the iframe. Used by StoryboardFullscreen to show
 * one screen (login, signup, or a flow step) full-size in the carousel.
 *
 * Uses the same Babel standalone + React UMD + Tailwind CDN pipeline as
 * storyboard-bundler and preview-bundler. No scaling, no horizontal strip
 * layout — just one component in a centered root container.
 */
export function buildSingleScreenHtml(code: string, label: string): string {
  const comp = extractComponent(code, label);
  const safeName = toIdentifier(label);
  const slotName = `__screen_${safeName}`;

  const tsxSource = `
    const ${slotName} = (function() {
${comp.declaration}
      return typeof ${comp.name} !== "undefined" ? ${comp.name} : null;
    })();

    function Screen() {
      if (!${slotName}) {
        return <div className="p-8 text-gray-400">missing</div>;
      }
      return <${slotName}/>;
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<Screen />);
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(label)}</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body, #root { margin: 0; height: 100%; background: white; }
    body { overflow: auto; }
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
  <script id="screen-tsx-source" type="text/plain">${escapeForTextScript(tsxSource)}</script>
  <script>
    (function() {
      try {
        var source = document.getElementById("screen-tsx-source").textContent;
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
