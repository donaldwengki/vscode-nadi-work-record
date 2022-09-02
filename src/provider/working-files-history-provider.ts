import * as path from 'path';
import * as vscode from "vscode";
import { getNonce } from "../getIdentifierStr";
import { config } from "../lib/global/config";
import { WorkingHistoryFiles } from "../service/working-history-files";
import { SidebarProvider } from './sidebar-provider';

export class WorkingFilesHistoryTab {
  public viewType = "nadi-web-admin";
  private _vscode: any;
  private _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  public _app: any;
  public _windowTab: vscode.WebviewPanel = null;
  public _currentWinTab: WorkingFilesHistoryTab | undefined;
  public _sidebar: SidebarProvider;

  public workingHistoryFiles = new WorkingHistoryFiles();

  constructor(params: {
    vscode: any,
    app?: any
  }) {
    this._extensionUri = params.vscode.Uri;

    if (params.app !== undefined) {
      this._app = params.app;
    }

    this._vscode = params.vscode;
  }

  public createOrShow(sidebar, targetFolder: any) {
    const column = this._vscode.window.activeTextEditor
      ? this._vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (!this._windowTab) {
      this._sidebar = sidebar;

      const windowTab = this._vscode.window.createWebviewPanel(
        this.viewType,
        "Working History",
        column,
        {
          // Enable javascript in the webview
          enableScripts: true,

          // And restrict the webview to only loading content from our extension's `media` directory.
          localResourceRoots: [
            this._vscode.Uri.joinPath(sidebar._extensionUri, "media"),
            this._vscode.Uri.joinPath(sidebar._extensionUri, "out/compiled"),
          ],
        }
      );

      windowTab.webview.html = this._getHtmlForWebview(windowTab.webview, sidebar, targetFolder);
      windowTab.webview.onDidReceiveMessage(this.onReceiveMessage(sidebar, targetFolder));
      this._windowTab = windowTab;

      // Listen for when the panel is disposed
      // This happens when the user closes the panel or when the panel is closed programatically
      this._windowTab.onDidDispose(() => this._dispose(), null, this._disposables);

      this._currentWinTab = this;
    } else {
      this._update(targetFolder);
    }
  }

  _update(targetFolder: any) {
    return new Promise<void>((resolve, reject) => {
      this._windowTab.webview.html = this._getHtmlForWebview(this._windowTab.webview, this._sidebar, targetFolder);
      this._windowTab.webview.onDidReceiveMessage(this.onReceiveMessage(this._sidebar, targetFolder));
      this._windowTab.reveal(this._vscode.window.activeTextEditor ? this._vscode.window.activeTextEditor.viewColumn : undefined);
      resolve();
    })
  }

  _dispose() {
    this._currentWinTab = undefined;

    // Clean up our resources
    this._windowTab.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private onReceiveMessage(sidebar: any, targetFolder: any) {
    const nTargetFolder = targetFolder;
    const $this = this;
    return (async (dataMessage) => {
      switch (dataMessage.type) {
        case "alert":
          this._vscode.window.showErrorMessage(dataMessage.text);
          return;
        case "getHistoryCollections": {
          if (!dataMessage.value) {
            return;
          }
          const histCol = this.workingHistoryFiles.readHistoryCollections(dataMessage.value);
          this._windowTab.webview.postMessage({
            type: 'receiveHistoryCollections',
            value: histCol
          });
          break;
        }
        case "seeHistoryFileDiff":
          this.workingHistoryFiles.takeHistoryDiff(dataMessage.value);
          break;
        case "deleteHistoryFile":
          this.workingHistoryFiles.deleteHistoryFile(dataMessage.value)
            .then(res => {
              if (res) {
                $this._update(nTargetFolder).then(() => {
                  $this._sidebar._update();
                });
              }
            })
            .catch(err => {
              console.log(err)
            })
          break;
        case "deleteBulkHistoryFile":
          this.workingHistoryFiles.deleteBulkHistoryFile(dataMessage.value)
            .then(res => {
              if (res) {
                $this._update(nTargetFolder).then(() => {
                  $this._sidebar._update();
                });
              }
            })
            .catch(err => {
              console.log(err)
            })
          break;
        case "sidebarStopProcessIndicator":
          this._sidebar._view.webview.postMessage({
            type: "stopProcessIndicator",
            value: null
          });
          break;
      }
    })
  }

  _getHistoryList(targetFolder: any | undefined) {
    if (targetFolder !== undefined) {
      return this.workingHistoryFiles.readHistoryCollections(path.join(config.localDirectory, 'history', targetFolder));
    } else {
      return this.workingHistoryFiles.readHistoryFolder();
    }
  }

  _getTargetFolderData(targetFolder: any | undefined) {
    if (targetFolder !== undefined) {
      return {
        date: this.workingHistoryFiles.convertTimeToDate(targetFolder),
        key: targetFolder
      }
    } else {
      return {}
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, mainApp: any, targetFolder) {

    const styleResetPath = webview.asWebviewUri(this._vscode.Uri.joinPath(mainApp._extensionUri, "media", "reset.css"));
    const stylesPathMainPath = webview.asWebviewUri(this._vscode.Uri.joinPath(mainApp._extensionUri, "media", "vscode.css"));
    const stylesPathNadiCss = webview.asWebviewUri(this._vscode.Uri.joinPath(mainApp._extensionUri, "media", "nadi-extension.css"));
    const fontaw = webview.asWebviewUri(this._vscode.Uri.joinPath(mainApp._extensionUri, "media", "font-awesome.css"));
    const scriptMn = webview.asWebviewUri(this._vscode.Uri.joinPath(mainApp._extensionUri, "out/compiled", "WorkingFilesHistoryTab.js"));

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource
      }; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${fontaw}" rel="stylesheet">
        <link href="${styleResetPath}" rel="stylesheet">
        <link href="${stylesPathMainPath}" rel="stylesheet">
        <link href="${stylesPathNadiCss}" rel="stylesheet">
        <script nonce="${nonce}">
            const nadivscode = acquireVsCodeApi();
            const workFilesHistory = ${JSON.stringify(this._getHistoryList(targetFolder))};
            const targetFolderData = ${JSON.stringify(this._getTargetFolderData(targetFolder))};
        </script>
			</head>
      <body>
      </body>
      <script src="${scriptMn}" nonce="${nonce}"></script>
	</html>`;
  }
}