export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const FREE_MODELS = new Set([DEFAULT_MODEL, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite']);
// The only class that can make provider requests; credentials stay server-side.
export class AIClient {
    constructor(env, fetcher = fetch) {
        this.apiKey = env.AI_API_KEY || env.GEMINI_API_KEY;
        this.model = env.AI_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL;
        this.activeModel = this.model;
        this.modelsUsed = new Set();
        this.allowFallback = (env.AI_AUTO_FALLBACK ?? env.GEMINI_AUTO_FALLBACK) !== 'false';
        this.fetcher = fetcher;
    }
    configurationError() {
        if (!this.apiKey)
            return 'not_configured';
        if (!FREE_MODELS.has(this.model))
            return 'invalid_model';
        return null;
    }
    async generate(instructions, payload, schema, maxOutputTokens, signal) {
        const alternatives = this.activeModel === 'gemini-3.1-flash-lite' ? [this.activeModel]
            : [...new Set([this.activeModel, DEFAULT_MODEL, 'gemini-3.6-flash', 'gemini-3.8-flash'])];
        const models = this.allowFallback ? alternatives : [this.activeModel];
        for (const model of models) {
            signal?.throwIfAborted();
            try {
                const response = await this.generateForModel(model, instructions, payload, schema, maxOutputTokens, signal);
                this.activeModel = model;
                this.modelsUsed.add(model);
                return response;
            }
            catch (error) {
                if (signal?.aborted)
                    throw signal.reason;
                const temporary = [408, 500, 502, 503, 504].includes(error.status)
                    || error.name === 'TimeoutError' || error.name === 'TypeError';
                if (!temporary || model === models.at(-1)) {
                    if (temporary && !error.status)
                        error.status = 503;
                    throw error;
                }
            }
        }
    }
    async generateForModel(model, instructions, payload, schema, maxOutputTokens, signal) {
        const generationConfig = { maxOutputTokens, responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } } };
        if (model === 'gemini-3.8-flash' || model === 'gemini-3.6-flash') {
            // Leave room for the thinking model's JSON answer; keep latency bounded.
            generationConfig.thinkingConfig = { thinkingLevel: 'low' };
            generationConfig.maxOutputTokens = Math.max(maxOutputTokens, 4096);
        }
        const timeout = AbortSignal.timeout(20000);
        const attemptSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
        try {
            const response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                method: 'POST', headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' }, signal: attemptSignal,
                body: JSON.stringify({ systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }], generationConfig })
            });
            if (!response.ok)
                throw Object.assign(new Error('provider_failure'), { status: response.status });
            return await response.json();
        }
        catch (error) {
            // Worker runtimes can report an expired fetch as AbortError.
            if (!signal?.aborted && timeout.aborted)
                throw Object.assign(new Error('provider_timeout'), { status: 503 });
            throw error;
        }
    }
}
