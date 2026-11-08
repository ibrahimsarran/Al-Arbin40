import commentaryPages from '../../../public/commentary-pages.json';
import hadiths from '../../../public/hadiths.json';
import commentary from '../../../public/commentary.json';
import glossary from '../../../public/glossary.json';
import wordMeanings from '../../../public/word-meanings.json';
import { ResearchService } from '../../../server/research-service.mjs';
import { EvidenceRepository } from '../../../server/evidence-repository.mjs';
import { AIClient } from '../../../server/ai-client.mjs';
import { env } from 'cloudflare:workers';
const evidenceRepository = new EvidenceRepository({ hadiths, commentary, glossary, commentaryPages, wordMeanings });
export async function POST(request: Request) {
    return new ResearchService(evidenceRepository, new AIClient(env)).handle(request);
}
export function GET() {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });
}
