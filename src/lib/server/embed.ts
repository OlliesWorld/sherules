import { GoogleGenAI } from '@google/genai';

// gemini-embedding-2 is Google's current recommended embedding model.
// It returns 3072 numbers by default. 768 is one of Google's recommended smaller sizes:
// a quarter of the storage, with a small loss of precision. The model normalizes
// shortened vectors itself, so cosine distance works without extra steps.
export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIMENSIONS = 768;
/** Stored on every row so we know what to re-embed after switching models or sizes. */
export const EMBEDDING_MODEL_TAG = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;

const BATCH_SIZE = 20;
const PAUSE_BETWEEN_BATCHES_MS = 1000;
const MAX_RETRIES = 5;

// gemini-embedding-2 has no task_type setting. Instead, the text itself is prefixed
// to say whether it's a document being stored or a question being searched.
export function documentInput(title: string, text: string): string {
	return `title: ${title} | text: ${text}`;
}

export function queryInput(question: string): string {
	return `task: search result | query: ${question}`;
}

export function createEmbedder(apiKey: string) {
	const ai = new GoogleGenAI({ apiKey });

	async function embedBatch(inputs: string[]): Promise<number[][]> {
		const response = await ai.models.embedContent({
			model: EMBEDDING_MODEL,
			// Each input must be its own Content object. A plain array of strings is
			// treated as one Content with many parts, which returns ONE combined embedding.
			contents: inputs.map((text) => ({ role: 'user', parts: [{ text }] })),
			config: { outputDimensionality: EMBEDDING_DIMENSIONS }
		});

		const vectors = (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
		if (vectors.length !== inputs.length) {
			throw new Error(`Sent ${inputs.length} texts but got ${vectors.length} embeddings back`);
		}
		for (const vector of vectors) {
			if (vector.length !== EMBEDDING_DIMENSIONS) {
				throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`);
			}
		}
		return vectors;
	}

	/** Embeds many texts in small batches, retrying with backoff when rate-limited. */
	async function embedAll(inputs: string[], onProgress?: (done: number, total: number) => void): Promise<number[][]> {
		const vectors: number[][] = [];

		for (let start = 0; start < inputs.length; start += BATCH_SIZE) {
			const batch = inputs.slice(start, start + BATCH_SIZE);
			vectors.push(...(await withRetry(() => embedBatch(batch))));
			onProgress?.(vectors.length, inputs.length);
			if (start + BATCH_SIZE < inputs.length) await sleep(PAUSE_BETWEEN_BATCHES_MS);
		}

		return vectors;
	}

	return { embedAll, embedOne: async (input: string) => (await embedBatch([input]))[0] };
}

async function withRetry<T>(task: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await task();
		} catch (error) {
			const status = (error as { status?: number }).status;
			const retryable = status === 429 || (status !== undefined && status >= 500);
			if (!retryable || attempt >= MAX_RETRIES) throw error;
			const waitMs = 2 ** attempt * 1000;
			console.warn(`  Gemini returned ${status}, retrying in ${waitMs / 1000}s (attempt ${attempt}/${MAX_RETRIES})`);
			await sleep(waitMs);
		}
	}
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
