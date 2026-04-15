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

export function buildPreviewHtml(option: PreviewOption): string {
  const steps = option.flowStructure.map((s) => s.stepName);
  const allSteps = ["signup", "login", ...steps, "complete"];

  const componentEntries = Object.entries(option.componentCode)
    .map(
      ([name, code]) => `
    "${name}": function ${sanitizeName(name)}Component() {
      ${extractComponentBody(code)}
    }`
    )
    .join(",\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${option.name} Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect } = React;

    const STEPS = ${JSON.stringify(allSteps)};

    // Mock auth state
    const useAuth = () => {
      const [user, setUser] = useState(null);
      const signup = (email, password) => {
        setUser({ email });
        return true;
      };
      const login = (email, password) => {
        setUser({ email });
        return true;
      };
      return { user, signup, login };
    };

    // Auth components
    function SignupPage({ onNext, auth }) {
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");
      const [confirm, setConfirm] = useState("");
      const [error, setError] = useState("");

      const handleSubmit = (e) => {
        e.preventDefault();
        if (password !== confirm) { setError("Passwords don't match"); return; }
        if (auth.signup(email, password)) onNext();
      };

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-center">Sign Up</h1>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border rounded-lg" required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-lg" required />
            <input type="password" placeholder="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full p-3 border rounded-lg" required />
            <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700">Create Account</button>
            <p className="text-center text-sm text-gray-500">Already have an account? <button type="button" onClick={() => onNext("login")} className="text-blue-600 hover:underline">Log in</button></p>
          </form>
        </div>
      );
    }

    function LoginPage({ onNext, auth }) {
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");

      const handleSubmit = (e) => {
        e.preventDefault();
        if (auth.login(email, password)) onNext();
      };

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-center">Log In</h1>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border rounded-lg" required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-lg" required />
            <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700">Log In</button>
            <p className="text-center text-sm text-gray-500">Need an account? <button type="button" onClick={() => onNext("signup")} className="text-blue-600 hover:underline">Sign up</button></p>
          </form>
        </div>
      );
    }

    // Onboarding step components
    const stepComponents = {
      ${componentEntries}
    };

    function CompletePage() {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center space-y-4">
            <div className="text-6xl">&#10003;</div>
            <h1 className="text-3xl font-bold">You're all set!</h1>
            <p className="text-gray-500">Onboarding complete. You're ready to go.</p>
          </div>
        </div>
      );
    }

    // Main app with step navigation
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

      const step = STEPS[currentStep];

      if (step === "signup") return <SignupPage onNext={goNext} auth={auth} />;
      if (step === "login") return <LoginPage onNext={goNext} auth={auth} />;
      if (step === "complete") return <CompletePage />;

      const StepComponent = stepComponents[step];
      if (StepComponent) return <StepComponent onNext={goNext} auth={auth} />;

      return <div className="p-8">Unknown step: {step}</div>;
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  </script>
</body>
</html>`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

function extractComponentBody(code: string): string {
  let cleaned = code
    .replace(/^export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{/, "")
    .replace(/^function\s+\w+\s*\([^)]*\)\s*\{/, "")
    .replace(/\}[\s]*$/, "");

  if (cleaned.trim().startsWith("<") || cleaned.trim().startsWith("return")) {
    return cleaned;
  }

  return `return (${cleaned})`;
}
