import * as vscode from "vscode";
import { getEnv } from "./fetch";
import { RegexConfig } from "./languages";

export const getCompletionItemsProvider =
  (languageConfigs: RegexConfig[]) =>
  async (document: vscode.TextDocument, position: vscode.Position) => {
    const fsPath = document.uri.fsPath;

    const linePrefix = document
      .lineAt(position)
      .text.substr(0, position.character);

    for (const { autoCompleteRegex } of languageConfigs) {
      const matchIterator = linePrefix.matchAll(autoCompleteRegex);
      const matches = Array.from(matchIterator);

      if (matches.length === 0) {
        continue;
      }
      const lastMatch = matches[matches.length - 1];
      if (typeof lastMatch.index === "undefined") {
        continue;
      }

      // Check if the match goes right up to the current position
      const matchEndIndex = lastMatch.index + lastMatch[0].length;

      if (matchEndIndex === linePrefix.length) {
        // Fetch envVars based on the file location
        const vars = await getEnv(fsPath);

        return Object.keys(vars).map((envVar) => {
          const item = new vscode.CompletionItem(
            envVar,
            vscode.CompletionItemKind.Variable
          );
          item.sortText = "0";
          item.detail = `EnvKey variable | ${
            vars[envVar] ? "string" : "empty string"
          }`;
          return item;
        });
      }
    }

    return undefined;
  };
