interface PreviewOption {
  name: string;
  authCode: {
    login: string;
    signup: string;
  };
  flowStructure: Array<{
    stepName: string;
    type: string;
    description: string;
  }>;
  componentCode: Record<string, string>;
}

interface ExtractedComponent {
  declaration: string;
  name: string;
}

export function buildPreviewHtml(option: PreviewOption): string {
  const steps = option.flowStructure.map((s) => s.stepName);
  const allSteps = ["signup", "login", ...steps, "complete"];

  // Auth pages (login/signup) come from the plan call's authCode — they carry
  // the app's real brand colors and design language. Treat them as step
  // components keyed by "signup" / "login" so they flow through the same
  // IIFE + extraction pipeline as Claude-generated flow steps.
  const authEntries: Array<[string, string]> = [];
  if (option.authCode?.signup) authEntries.push(["signup", option.authCode.signup]);
  if (option.authCode?.login) authEntries.push(["login", option.authCode.login]);

  const allComponentEntries: Array<[string, string]> = [
    ...authEntries,
    ...Object.entries(option.componentCode),
  ];

  const extractedComponents: Array<{
    stepName: string;
    slotName: string;
    comp: ExtractedComponent;
  }> = allComponentEntries.map(([stepName, code]) => ({
    stepName,
    slotName: `__step_${toIdentifier(stepName)}`,
    comp: extractComponent(code, stepName),
  }));

  // Wrap each component's declaration in an IIFE so top-level constants
  // (like `const STYLES = [...]`) don't collide across components.
  const componentDeclarations = extractedComponents
    .map(
      ({ slotName, comp }) => `const ${slotName} = (function() {
${comp.declaration}
  return typeof ${comp.name} !== "undefined" ? ${comp.name} : null;
})();`
    )
    .join("\n\n");

  const componentMapEntries = extractedComponents
    .map(
      ({ stepName, slotName }) =>
        `      ${JSON.stringify(stepName)}: ${slotName}`
    )
    .join(",\n");

  // The TSX source that will be compiled by Babel at runtime in the iframe.
  // We pass it through as a JSON-encoded string, then Babel.transform() with
  // proper { isTSX: true } config handles both TypeScript and JSX together.
  const tsxSource = `
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    const STEPS = ${JSON.stringify(allSteps)};

    // Mock auth
    const useAuth = () => {
      const [user, setUser] = useState(null);
      return {
        user,
        signup: (email) => { setUser({ email }); return true; },
        login: (email) => { setUser({ email }); return true; },
      };
    };

    // Fallback auth pages used only if Claude's authCode failed to generate/parse.
    // The real auth components are pulled in via stepComponents["signup"/"login"] below.
    function FallbackSignup({ onNext }) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <p className="text-gray-500">Signup page could not be generated.</p>
          <button onClick={() => onNext()} className="ml-4 text-blue-600 underline">Skip</button>
        </div>
      );
    }
    function FallbackLogin({ onNext }) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <p className="text-gray-500">Login page could not be generated.</p>
          <button onClick={() => onNext()} className="ml-4 text-blue-600 underline">Skip</button>
        </div>
      );
    }

    function CompletePage() {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center space-y-4">
            <div className="text-6xl">\u2713</div>
            <h1 className="text-3xl font-bold">You're all set!</h1>
            <p className="text-gray-500">Onboarding complete. You're ready to go.</p>
          </div>
        </div>
      );
    }

    // ====== Claude-generated step components ======
${componentDeclarations}
    // ===============================================

    const stepComponents = {
${componentMapEntries}
    };

    function App() {
      const [currentStep, setCurrentStep] = useState(0);
      const auth = useAuth();

      const goNext = (target) => {
        if (typeof target === "string") {
          const idx = STEPS.indexOf(target);
          if (idx !== -1) { setCurrentStep(idx); return; }
        }
        setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
      };

      const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

      const step = STEPS[currentStep];

      if (step === "complete") return <CompletePage />;

      const StepComponent = stepComponents[step];
      if (StepComponent) return <StepComponent onNext={goNext} onBack={goBack} auth={auth} />;

      if (step === "signup") return <FallbackSignup onNext={goNext} />;
      if (step === "login") return <FallbackLogin onNext={goNext} />;

      return <div className="p-8 text-gray-500">Unknown step: {step}</div>;
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(option.name)} Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body, #root { height: 100%; margin: 0; }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="preview-error" style="display:none;position:fixed;top:0;left:0;right:0;padding:12px;background:#fee2e2;color:#991b1b;font-family:monospace;font-size:12px;white-space:pre-wrap;z-index:9999;max-height:60vh;overflow:auto;"></div>
  <script>
    function showPreviewError(msg) {
      var el = document.getElementById("preview-error");
      if (el) { el.style.display = "block"; el.textContent = msg; }
      try { console.error(msg); } catch(_) {}
    }
    window.addEventListener("error", function(e) {
      var detail = e.error && e.error.stack ? e.error.stack : (e.message || "unknown error");
      showPreviewError("Runtime error: " + detail);
    });
    window.addEventListener("unhandledrejection", function(e) {
      showPreviewError("Unhandled promise rejection: " + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
    });
  </script>
  <script id="preview-tsx-source" type="text/plain">${escapeForTextScript(
    tsxSource
  )}</script>
  <script>
    (function() {
      try {
        var source = document.getElementById("preview-tsx-source").textContent;
        // Compile TS + JSX together with proper TSX handling.
        // isTSX:true + allExtensions:true lets the typescript preset strip TS
        // syntax while the react preset handles JSX — in one parse pass.
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

/**
 * Extract a usable top-level declaration from Claude-generated component code.
 *
 * Handles these shapes:
 *   - `export default function Name(props) { ... }`
 *   - `function Name(props) { ... } export default Name;`
 *   - `const Name = (props) => { ... }; export default Name;`
 *   - `export default (props) => { ... }` (anonymous)
 *
 * Strips `import` statements entirely (React/hooks live in the outer scope).
 * Returns the modified declaration plus the name to reference later.
 *
 * Note: TypeScript syntax is handled downstream by Babel's typescript preset
 * with isTSX:true — we do NOT string-strip TS syntax here because it's
 * impossible to do correctly without a real parser.
 */
function extractComponent(code: string, stepName: string): ExtractedComponent {
  let cleaned = code;

  // Strip markdown code fences if Claude wrapped them
  cleaned = cleaned.replace(/^```(?:jsx?|tsx?)?\s*\n/, "").replace(/\n?```\s*$/, "");

  // Remove import statements (React/hooks are globals in this bundle)
  cleaned = cleaned.replace(/^[ \t]*import[ \t][^\n]*;?\s*$/gm, "");

  // Remove 'use client' directive if present
  cleaned = cleaned.replace(/^[ \t]*["']use client["'];?\s*$/gm, "");

  const safeName = toIdentifier(stepName);

  // Shape: `export default function Name(args) { body }`
  const exportFnMatch = cleaned.match(
    /export\s+default\s+function\s+([A-Za-z_]\w*)/
  );
  if (exportFnMatch) {
    cleaned = cleaned.replace(/export\s+default\s+/, "");
    return { declaration: cleaned, name: exportFnMatch[1] };
  }

  // Shape: `export default Name;` after a prior declaration
  const exportNameMatch = cleaned.match(
    /export\s+default\s+([A-Za-z_]\w*)\s*;?\s*$/m
  );
  if (exportNameMatch) {
    cleaned = cleaned.replace(/export\s+default\s+[A-Za-z_]\w*\s*;?\s*$/m, "");
    return { declaration: cleaned, name: exportNameMatch[1] };
  }

  // Shape: `export default (args) => { ... }` — anonymous arrow
  const exportArrowMatch = cleaned.match(/export\s+default\s+(?=\(|[A-Za-z_])/);
  if (exportArrowMatch) {
    cleaned = cleaned.replace(
      /export\s+default\s+/,
      `const ${safeName} = `
    );
    return { declaration: cleaned, name: safeName };
  }

  // Shape: bare `function PascalName(args) { ... }` with no export at all.
  // Claude often emits this for auth pages (e.g. `function SignupPage() {}`).
  // Match the first top-level capitalized function declaration.
  const bareFnMatch = cleaned.match(/^[ \t]*function\s+([A-Z]\w*)\s*\(/m);
  if (bareFnMatch) {
    return { declaration: cleaned, name: bareFnMatch[1] };
  }

  // Shape: bare `const PascalName = (...) => { ... }` with no export.
  const bareConstMatch = cleaned.match(
    /^[ \t]*const\s+([A-Z]\w*)\s*=\s*(?:\(|async\s|[A-Za-z_])/m
  );
  if (bareConstMatch) {
    return { declaration: cleaned, name: bareConstMatch[1] };
  }

  // Fallback: render a placeholder if we can't parse.
  return {
    declaration: `function ${safeName}() { return <div className="p-8 text-gray-500">Could not parse component for step "${stepName}"</div>; }`,
    name: safeName,
  };
}

function toIdentifier(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9]/g, "_");
  return /^[0-9]/.test(safe) ? `_${safe}` : safe || "_Component";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape text for embedding inside `<script type="text/plain">`. The only
 * dangerous sequence is `</script` which would close the tag.
 */
function escapeForTextScript(str: string): string {
  return str.replace(/<\/script/gi, "<\\/script");
}
