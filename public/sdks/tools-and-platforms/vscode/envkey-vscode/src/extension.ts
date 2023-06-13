import * as vscode from "vscode";
import { envsByFsPath } from "./lib/fetch";
import { regexes, RegexConfig } from "./lib/languages";
import { getCompletionItemsProvider } from "./lib/completion";
import { updateDiagnostics } from "./lib/diagnostics";

export const activate = (context: vscode.ExtensionContext) => {
  console.log("Activating EnvKey extension");

  const diagnostics = vscode.languages.createDiagnosticCollection("EnvKey");

  const languageToProvider: Record<string, vscode.Disposable> = {};

  function registerProviderIfNeeded(
    language: string,
    languageConfigs: RegexConfig[]
  ) {
    if (languageToProvider[language]) {
      return;
    }

    const provider = vscode.languages.registerCompletionItemProvider(
      language,
      {
        provideCompletionItems: getCompletionItemsProvider(languageConfigs),
      },
      ...languageConfigs.flatMap(({ triggerCharacters }) => triggerCharacters)
    );
    context.subscriptions.push(provider);
    languageToProvider[language] = provider;
  }

  const addChangeListenerIfNeeded = (editor: vscode.TextEditor) => {
    const fsPath = editor.document.uri.fsPath;

    if (!envsByFsPath[fsPath]) {
      envsByFsPath[fsPath] = {};
    }

    envsByFsPath[fsPath].onChange ??= () => {
      updateDiagnostics(diagnostics, editor);
    };
  };

  vscode.window.visibleTextEditors.forEach((editor) => {
    const document = editor.document;
    const languageConfigs = regexes[document.languageId];
    if (languageConfigs) {
      registerProviderIfNeeded(document.languageId, languageConfigs);
      updateDiagnostics(diagnostics, editor);
      addChangeListenerIfNeeded(editor);
    }
  });

  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor) {
      return;
    }
    const document = editor.document;
    const languageConfigs = regexes[document.languageId];
    if (languageConfigs) {
      registerProviderIfNeeded(document.languageId, languageConfigs);
      updateDiagnostics(diagnostics, editor);
      addChangeListenerIfNeeded(editor);
    }
  });

  vscode.workspace.onDidCloseTextDocument((document) => {
    const fsPath = document.uri.fsPath;
    if (envsByFsPath[fsPath]) {
      delete envsByFsPath[fsPath];
    }
  });

  vscode.workspace.onDidChangeTextDocument((event) => {
    if (vscode.window.activeTextEditor?.document === event.document) {
      updateDiagnostics(diagnostics, vscode.window.activeTextEditor);
    }
  });
};
