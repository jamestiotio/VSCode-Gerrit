import {
	EMPTY_FILE_META,
	FileMeta,
	FileProvider,
	GERRIT_FILE_SCHEME,
} from '../../providers/fileProvider';
import {
	GerritCommentSide,
	GerritRevisionFile,
	GerritRevisionFileStatus,
} from './types';
import { DynamicallyFetchable } from './shared';
import { GerritChange } from './gerritChange';
import { Uri, workspace } from 'vscode';
import { GerritAPIWith } from './api';
import { getAPI } from '../gerritAPI';

export class TextContent {
	private constructor(
		public buffer: Buffer,
		public meta: Omit<FileMeta, 'side'>
	) {}

	static from(
		meta: Omit<FileMeta, 'side'>,
		content: string,
		encoding: BufferEncoding
	) {
		return new TextContent(Buffer.from(content, encoding), meta);
	}

	getText() {
		return this.buffer.toString('utf8');
	}

	toVirtualFile(forSide: GerritCommentSide) {
		return Uri.from({
			scheme: GERRIT_FILE_SCHEME,
			path: this.meta.filePath,
			query: FileProvider.createMeta({ ...this.meta, side: forSide }),
		});
	}

	isEmpty() {
		return this.meta === EMPTY_FILE_META;
	}
}

export class GerritFile extends DynamicallyFetchable {
	public linesInserted: number;
	public linesDeleted: number;
	public sizeDelta: number;
	public size: number;
	public status: GerritRevisionFileStatus | null;
	public oldPath: string | null;

	constructor(
		protected _patchID: string,
		public change: GerritChange,
		public currentRevision: string,
		public filePath: string,
		response: GerritRevisionFile
	) {
		super();
		this.linesInserted = response.lines_inserted;
		this.linesDeleted = response.lines_deleted;
		this.sizeDelta = response.size_delta;
		this.size = response.size;
		this.status = response.status ?? null;
		this.oldPath = response.old_path ?? null;
	}

	async getNewContent(): Promise<TextContent | null> {
		return this.getContent(this.currentRevision);
	}

	async getOldContent(): Promise<TextContent | null> {
		const api = getAPI();
		if (!api) {
			return null;
		}

		const commit = await this.change.getCurrentCommit(
			GerritAPIWith.CURRENT_FILES
		);
		if (!commit) {
			return null;
		}

		return this.getContent(
			commit.parents[commit.parents.length - 1].commit,
			true
		);
	}

	async getContent(
		revision: string = this.currentRevision,
		useOldPath: boolean = false
	): Promise<TextContent | null> {
		const filePath = useOldPath
			? this.oldPath ?? this.filePath
			: this.filePath;
		const api = getAPI();
		if (!api) {
			return null;
		}

		const content = await api.getFileContent(
			this.change.project,
			revision,
			this.change.id,
			filePath
		);
		if (!content) {
			return null;
		}

		return content;
	}

	getLocalURI(forSide: GerritCommentSide) {
		if (
			!workspace.workspaceFolders ||
			workspace.workspaceFolders.length !== 1
		) {
			return null;
		}
		const workspaceFolder = workspace.workspaceFolders[0];
		const filePath = Uri.joinPath(workspaceFolder.uri, this.filePath);
		return filePath.with({
			query: FileProvider.createMeta({
				project: this.change.project,
				commit: this.currentRevision,
				filePath: this.filePath,
				changeId: this.change.id,
				side: forSide,
			}),
		});
	}

	async isLocalFile(content: TextContent): Promise<boolean> {
		const filePath = this.getLocalURI(GerritCommentSide.LEFT);
		if (!filePath) {
			return false;
		}
		const stat = await (async () => {
			try {
				return await workspace.fs.stat(filePath);
			} catch (e) {
				return false;
			}
		})();
		if (!stat) {
			return false;
		}

		const fileContent = await workspace.fs.readFile(filePath);
		return (
			stat.size === content.buffer.length &&
			content.buffer.equals(fileContent)
		);
	}
}
