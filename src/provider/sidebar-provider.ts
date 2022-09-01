import * as vscode from "vscode";
import { getNonce } from "../getIdentifierStr";
import { WorkingFilesHistoryTab } from './working-files-history-provider';
import { WorkingHistoryFiles } from "../service/working-history-files";
import { Settings } from "../lib/settings";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;
  _context?: vscode.ExtensionContext;
  _vscode: any;
  _extensionUri: vscode.Uri;
  _settings: Settings;
  _mainTab: WorkingFilesHistoryTab | undefined = undefined;
  _app: any;

  constructor(params: {
    vscode: any,
    context: vscode.ExtensionContext,
    settings: Settings,
    app: any
  }) {
    this._vscode = params.vscode;
    this._context = params.context;
    this._extensionUri = this._context.extensionUri;
    this._settings = params.settings;
    this._view = this._vscode.WebviewView;
    this._doc = this._vscode.TextDocument;
    this._app = params.app;
  }

  _historyWorkData() {
    return new WorkingHistoryFiles();
  }

  public async eventDataChange() {
    const monthList = await this._historyWorkData().getHistoryByMonth();
    if (this._view) {
      this._update();
    }
  }

  public async _update() {
    this._view.webview.html = await this._getHtmlForWebview(this._view.webview);
    this._view.webview.onDidReceiveMessage(this.onReceiveMessage());
  }

  createNewMainTab(targetFolder: string): WorkingFilesHistoryTab {
    const mainTab = new WorkingFilesHistoryTab({
      vscode: this._vscode,
      app: this._app
    });
    mainTab.createOrShow(this, targetFolder);
    return mainTab;
  }

  onReceiveMessage() {
    return (async (data) => {
      switch (data.type) {
        case "onInfo": {
          if (!data.value) {
            return;
          }
          vscode.window.showInformationMessage(data.value);
          break;
        }
        case "onError": {
          if (!data.value) {
            return;
          }
          vscode.window.showErrorMessage(data.value);
          break;
        }
        case "onReloadWindow": {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
          break;
        }
        case "onRunDeveloperTool": {
          vscode.commands.executeCommand("workbench.action.webview.openDeveloperTools");
          break;
        }
        case "onOpenWorkingFilesHistory": {
          if (this._mainTab !== undefined && this._mainTab._currentWinTab !== undefined) {
            this._mainTab._update(data.value);
            return;
          } else if (this._mainTab !== undefined && this._mainTab._currentWinTab === undefined) {
            this._mainTab = this.createNewMainTab(data.value);
            return;
          }
          this._mainTab = this._mainTab = this.createNewMainTab(data.value);
          break;
        }
        case "getHistoryOfMonth": {
          const list = await this._historyWorkData().getHistoryDatesByMonth(data.value);
          this._view.webview.postMessage({
            type: 'getHistoryOfMonth',
            value: {
              key: data.value,
              list: list
            }
          });
          break;
        }
        case "settingHistoryIgnoreRemoveItem": {
          const doRemoveHistItem = await this._settings.removeHistoryIgnoreItem(data.value);
          if (doRemoveHistItem === false) {
            this._view.webview.postMessage({
              type: 'settingHistoryIgnoreCANCELRemoveItem',
              value: 'cancel'
            })
          }
          break;
        }
        case "delHistoryFolder": {
          this._historyWorkData().deleteHistoryFolder(data.value)
            .then(() => {
              this._view.webview.postMessage({
                type: 'removeDateHistoryOfMonth',
                value: data.value
              })
            })
            .catch(err => {
              console.log(err)
            })
          break;
        }
      }
    })
  }

  public async resolveWebviewView(webviewView: any, ExtensionContext: any, token: any) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(this.onReceiveMessage());
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private async _getHtmlForWebview(webview: vscode.Webview) {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "compiled/Sidebar.js")
    );
    const stylesPathNadiCss = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "nadi-extension.css")
    );
    const fontaw = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "font-awesome.css")
    );

    const nonce = getNonce();
    const initHistoryList = await this._historyWorkData().getHistoryByMonth();
    let settings = {
      historyIgnore: this._settings.getHistoryIgnoreList(true),
      devTool: false
    };

    if (this._context.extensionMode === vscode.ExtensionMode.Development) {
      settings.devTool = true;
    }

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
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${stylesPathNadiCss}" rel="stylesheet">
                <script nonce="${nonce}">
                    const nadivscode = acquireVsCodeApi();
                    const initHistoryList = ${JSON.stringify(initHistoryList)}
                    const settings = ${JSON.stringify(settings)}
                </script>
            </head>
            <body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
} 