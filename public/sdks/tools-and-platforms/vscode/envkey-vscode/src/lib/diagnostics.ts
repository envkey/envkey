import * as vscode from "vscode";
import { getEnv } from "./fetch";
import { regexes } from "./languages";

export const updateDiagnostics = async (
  diagnostics: vscode.DiagnosticCollection,
  editor?: vscode.TextEditor
) => {
  if (!editor) {
    return;
  }

  const envVars = await getEnv(editor.document.uri.fsPath);
  const matched: vscode.Diagnostic[] = [];
  const missing: vscode.Diagnostic[] = [];
  const text = editor.document.getText();
  const languageId = editor.document.languageId;

  const languageConfigs = regexes[languageId];
  if (!languageConfigs) {
    return;
  }

  for (const { diagnosticRegex, splitDiagnosticMatch } of languageConfigs) {
    const matches = text.matchAll(diagnosticRegex);

    for (const match of matches) {
      if (typeof match.index !== "number") {
        continue;
      }

      const fullMatch = match[0];
      const captured = match[1];

      const vars = (
        splitDiagnosticMatch ? captured.split(splitDiagnosticMatch) : [captured]
      )
        .map((s) => s.trim())
        .filter(Boolean);

      for (let s of vars) {
        const startIndex = match.index + fullMatch.indexOf(s);
        const endIndex = startIndex + s.length;

        const startPos = editor.document.positionAt(startIndex);
        const endPos = editor.document.positionAt(endIndex);

        // Only create the diagnostic if the environment variable exists
        if (typeof envVars[s] == "string") {
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(startPos, endPos),
            `EnvKey variable | ${
              envVars[s] ? "string" + `\n\n${envVars[s]}` : "empty string"
            }`,
            vscode.DiagnosticSeverity.Information
          );
          matched.push(diagnostic);
        } else {
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(startPos, endPos),
            `EnvKey: ${s} not set in current environment.`,
            vscode.DiagnosticSeverity.Warning
          );
          missing.push(diagnostic);
        }
      }
    }
  }

  // Clear previously set diagnostics
  diagnostics.clear();

  // Set diagnostics
  diagnostics.set(editor.document.uri, matched.concat(missing));
};
