export interface BevaraDocumentDelegate {
	getFileData(): Promise<Uint8Array>;
}