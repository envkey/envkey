import * as vscode from "vscode";
import { getEnv } from "./fetch";
import { languages } from "../languages";

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

  const languageConfigs = languages[languageId];
  if (!languageConfigs) {
    return;
  }

  for (const { diagnosticRegex } of languageConfigs) {
    const matches = text.matchAll(diagnosticRegex);

    for (const match of matches) {
      if (typeof match.index !== "number") {
        continue;
      }
      const fullMatch = match[0];
      const matchedVar = match[1];

      const startIndex = match.index + fullMatch.indexOf(matchedVar);
      const endIndex = startIndex + matchedVar.length;

      const startPos = editor.document.positionAt(startIndex);
      const endPos = editor.document.positionAt(endIndex);

      // Only create the diagnostic if the environment variable exists
      if (typeof envVars[matchedVar] == "string") {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(startPos, endPos),
          `EnvKey variable | ${
            envVars[matchedVar]
              ? "string" + `\n\n${envVars[matchedVar]}`
              : "empty string"
          }`,
          vscode.DiagnosticSeverity.Information
        );
        matched.push(diagnostic);
      } else {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(startPos, endPos),
          `EnvKey: ${matchedVar} not set in current environment.`,
          vscode.DiagnosticSeverity.Warning
        );
        missing.push(diagnostic);
      }
    }
  }

  // Clear previously set diagnostics
  diagnostics.clear();

  // Set diagnostics
  diagnostics.set(editor.document.uri, matched.concat(missing));
};
