import * as vscode from "vscode";
import { getEnv } from "./fetch";
import { RegexConfig } from "./languages";

const MAX_WINDOW_SIZE = 200;

export const getCompletionItemsProvider =
  (languageConfigs: RegexConfig[]) =>
  async (document: vscode.TextDocument, position: vscode.Position) => {
    const fsPath = document.uri.fsPath;

    const linePrefix = document
      .lineAt(position)
      .text.substr(0, position.character);

    const lineCount = document.lineCount;
    const startLine = Math.max(position.line - MAX_WINDOW_SIZE, 0);
    const endLine = Math.min(position.line + MAX_WINDOW_SIZE, lineCount - 1);
    const windowText = document.getText(
      new vscode.Range(
        startLine,
        0,
        endLine,
        document.lineAt(endLine).range.end.character
      )
    );

    for (const config of languageConfigs) {
      const toMatch = config.multiline ? windowText : linePrefix;

      let matchIterator: IterableIterator<RegExpMatchArray>;
      if ("autoCompleteRegex" in config) {
        matchIterator = toMatch.matchAll(config.autoCompleteRegex);
      } else {
        matchIterator = toMatch.matchAll(config.autoCompletePreRegex);
      }

      const matches = Array.from(matchIterator);

      if (matches.length === 0) {
        continue;
      }
      const lastMatch = matches[matches.length - 1];
      if (typeof lastMatch.index === "undefined") {
        continue;
      }

      if (!config.multiline) {
        // Check if the match goes right up to the current position
        const matchEndIndex = lastMatch.index + lastMatch[0].length;
        if (matchEndIndex !== toMatch.length) {
          continue;
        }
      }

      if ("autoCompletePostRegex" in config) {
        const postMatch = toMatch.match(config.autoCompletePostRegex);
        if (!postMatch) {
          continue;
        }
      }

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

    return undefined;
  };
