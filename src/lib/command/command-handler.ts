import * as vscode from 'vscode';
import { config } from "../global/config";
import { MakeFile } from "../make-directory-file";
import * as path from 'path';
import * as fs from 'fs';

export default class CommandHandler {
    private _vscode: any;
    private _extensionContext: vscode.ExtensionContext;
    constructor(params: any) {
        this._vscode = params.vscode
        this._extensionContext = params.extensionContext

        this._extensionContext.globalState.update('file-to-compare', undefined)
    }

    execute(name: string, options?: any) {
        const workingFolder = this._vscode.Uri.parse(this._vscode.workspace.workspaceFolders[0].uri.path);
        const makeFile = new MakeFile();
        switch (name) {
            case 'create-folder':
                return makeFile.createFileOrFolder('folder', workingFolder ? makeFile.findDir(workingFolder.fsPath) : '/');
            case 'create-file':
                return makeFile.createFileOrFolder('file', workingFolder ? makeFile.findDir(workingFolder.fsPath) : '/');
            case 'history-ignore-file':
                const path = options.fsPath;
                this._addToHistoryIgnoreList(path)
                return;
            case 'add-to-compare':
                const addComparePath = options.fsPath;
                this._extensionContext.globalState.update('file-to-compare', addComparePath);
                return;
            case 'do-compare':
                const coComparePath = options.fsPath;
                if (this._extensionContext.globalState.get('file-to-compare') === undefined) {
                    this._vscode.window.showInformationMessage('Please add file to compare first!');
                } else {
                    this._vscode.commands.executeCommand(
                        "vscode.diff",
                        this._vscode.Uri.parse(this._extensionContext.globalState.get('file-to-compare')),
                        this._vscode.Uri.parse(coComparePath)
                    );
                    this._extensionContext.globalState.update('file-to-compare', undefined);
                }
                return;
            default:
                return;
        }
    }

    _addToHistoryIgnoreList(targetPath: string) {
        const $this = this;
        let historyIgnoreFile = path.join(config.localDirectory, '.historyIgnore');
        let cleanTargetPath = targetPath.replace(config.workingDirectory + '/', '');
        if (fs.existsSync(historyIgnoreFile)) {
            fs.readFile(historyIgnoreFile, 'utf-8', (err, data) => {
                if (err) {
                    console.log(err);
                    return;
                }
                let dataArray = data.split('\n');
                if (!dataArray.includes(cleanTargetPath)) {
                    fs.appendFile(historyIgnoreFile, (dataArray.length > 0 && dataArray[0].trim() != '' ? '\n' : '') + cleanTargetPath, (err) => {
                        if (err) {
                            console.error(err);
                        } else {
                            $this._vscode.commands.executeCommand("workbench.action.reloadWindow");
                        }
                    });
                }
            });
        }
    }
}