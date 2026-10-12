// Prints a PDF's extracted text with page markers, for checking how a parser will see it.
// Usage: npx tsx scripts/dump-pdf.ts data/some-file.pdf > dump.txt
import { readPdfPages } from '#lib/ingest/pdf.ts';

const filePath = process.argv[2];
if (!filePath) {
	console.error('Usage: npx tsx scripts/dump-pdf.ts <path-to-pdf>');
	process.exit(1);
}

const pages = await readPdfPages(filePath);
pages.forEach((text, i) => {
	console.log(`\n===== PAGE ${i + 1} =====`);
	console.log(text);
});
