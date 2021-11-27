import { FileCache } from './views/activityBar/changes/changeTreeView/file/fileCache';
import { FileProvider, GERRIT_FILE_SCHEME } from './providers/fileProvider';
import { ChangesTreeProvider } from './views/activityBar/changes';
import { ExtensionContext, window, workspace } from 'vscode';
import { CommentManager } from './providers/commentProvider';
import { GerritUser } from './lib/gerritAPI/gerritUser';
import { registerCommands } from './commands/commands';
import { showStatusBarIcon } from './views/statusBar';
import { createOutputChannel } from './lib/log';
import { setContextProp } from './lib/context';
import { isUsingGerrit } from './lib/gerrit';
import { storageInit } from './lib/storage';

export async function activate(context: ExtensionContext) {
	// Initially hide icon
	setContextProp('gerrit.isUsingGerrit', false);

	// Init storage
	storageInit(context);

	// Create logging output channel
	createOutputChannel();

	// Register commands
	registerCommands(context);

	// Check if we're even using gerrit
	const usesGerrit = await isUsingGerrit();

	// Set context to show/hide icon
	setContextProp('gerrit.isUsingGerrit', usesGerrit);
	if (!usesGerrit) {
		return;
	}

	// Register status bar entry
	await showStatusBarIcon(context);

	// Register tree views
	context.subscriptions.push(
		window.createTreeView('changeExplorer', {
			treeDataProvider: new ChangesTreeProvider(context),
			showCollapseAll: true,
		})
	);

	// Register file provider
	context.subscriptions.push(
		workspace.registerTextDocumentContentProvider(
			GERRIT_FILE_SCHEME,
			new FileProvider(context)
		)
	);

	// Create comment controller
	context.subscriptions.push(new CommentManager());

	// Warm up cache for self
	void GerritUser.getSelf();
}

export function deactivate() {
	FileCache.clear();
}
