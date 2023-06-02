import * as vscode from "vscode";
import { getEnv } from "./fetch";
import { LanguageConfig } from "../languages";

export const getCompletionItemsProvider =
  (languageConfigs: LanguageConfig[]) =>
  async (document: vscode.TextDocument, position: vscode.Position) => {
    const fsPath = document.uri.fsPath;

    const linePrefix = document
      .lineAt(position)
      .text.substr(0, position.character);

    for (const { autoCompleteRegex } of languageConfigs) {
      if (autoCompleteRegex.test(linePrefix)) {
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
