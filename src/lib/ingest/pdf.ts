import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Reads a PDF and returns its text one page at a time.
 * pages[0] is page 1 of the file (the number a browser's #page=N uses),
 * which is not always the number printed on the page.
 */
export async function readPdfPages(filePath: string): Promise<string[]> {
	const buffer = await readFile(filePath);
	const pdf = await getDocumentProxy(new Uint8Array(buffer));
	const { text } = await extractText(pdf, { mergePages: false });
	return text;
}
