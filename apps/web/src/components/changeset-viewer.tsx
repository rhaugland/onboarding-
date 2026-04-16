"use client";

interface IntegrationFile {
  path: string;
  content: string;
  action: "create" | "modify";
  diff?: string;
}

interface ChangesetViewerProps {
  files: IntegrationFile[];
  commands: string[];
  envVars: string[];
}

export default function ChangesetViewer({
  files,
  commands,
  envVars,
}: ChangesetViewerProps) {
  const created = files.filter((f) => f.action === "create");
  const modified = files.filter((f) => f.action === "modify");

  return (
    <div className="space-y-6">
      {created.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2">
            Files to Create ({created.length})
          </h3>
          <div className="space-y-1">
            {created.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-2 p-2 bg-green-50 rounded text-sm"
              >
                <span className="text-green-600 font-mono">+</span>
                <span className="font-mono text-gray-700">{f.path}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {modified.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-yellow-700 uppercase tracking-wide mb-2">
            Files to Modify ({modified.length})
          </h3>
          <div className="space-y-1">
            {modified.map((f) => (
              <div key={f.path} className="p-2 bg-yellow-50 rounded">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-yellow-600 font-mono">~</span>
                  <span className="font-mono text-gray-700">{f.path}</span>
                </div>
                {f.diff && (
                  <p className="text-xs text-gray-500 mt-1 ml-5">{f.diff}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {commands.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Commands to Run After
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 space-y-1">
            {commands.map((cmd, i) => (
              <div key={i} className="font-mono text-sm text-green-400">
                $ {cmd}
              </div>
            ))}
          </div>
        </section>
      )}

      {envVars.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Add to .env
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 space-y-1">
            {envVars.map((v, i) => (
              <div key={i} className="font-mono text-sm text-yellow-400">
                {v}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
