// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { activateWatchAttach } from './activeWatchAttach';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('[.NET Container Watch Attach] Extension activating...');
  try {
    activateWatchAttach(context);
    console.log('[.NET Container Watch Attach] Extension activated successfully');
  } catch (error) {
    console.error('[.NET Container Watch Attach] Error during activation:', error);
    throw error;
  }
  if (process.platform === 'darwin') {
    vscode.window.showWarningMessage(
        '⚠️ This extension has not been tested on macOS and may not work correctly. ' +
        'Please report any issues you encounter on GitHub.',
        'OK'
    );
  }
}

// this method is called when your extension is deactivated
export function deactivate() {
  console.log();
}
