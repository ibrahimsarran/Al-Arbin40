import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ResearchService} from '../server/research-service.mjs';
import {EvidenceRepository} from '../server/evidence-repository.mjs';
import {AnswerValidator} from '../server/answer-validator.mjs';
import {AIClient,DEFAULT_MODEL} from '../server/ai-client.mjs';
const handleResearch=(request,env,data,fetcher)=>new ResearchService(new EvidenceRepository(data),new AIClient(env,fetcher)).handle(request);
const buildEvidence=(data,question)=>new EvidenceRepository(data).build(question);
const contextualEvidence=(data,plan)=>new EvidenceRepository(data).select(plan);
const extractAnswer=(...args)=>new AnswerValidator().extract(...args);
const parsePlan=response=>new AnswerValidator().parsePlan(response);
const trustedUrl=value=>EvidenceRepository.isTrustedUrl(value);
import {HadithService} from '../public/js/services/hadith-service.mjs';
import {answerHTML,assistantInfoHTML} from '../public/js/controllers/research-controller.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../public/'+name+'.json',import.meta.url)));
const data={hadiths:read('hadiths'),commentary:read('commentary'),glossary:read('glossary'),commentaryPages:read('commentary-pages'),wordMeanings:read('word-meanings')};
const generalQuestion='كيف يتساوى الناس في الأجر؟';
const env={GEMINI_API_KEY:'test-only-value'};
const request=(question='ما معنى الدثور؟',extra={})=>new Request('https://reader.test/api/research',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://reader.test',...extra.headers},body:JSON.stringify({question,language:'ar',...extra.body})});
const modelJSON=(value,finishReason='STOP')=>({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(value)}]}}]});
const planned=(hadithIds=[25],terms=['الدثور'],needsClarification=false,answerType='meaning')=>modelJSON({hadithIds,terms,needsClarification,answerType});
const generation=(paragraphs=[{text:'الدثور: المال الكثير.',kind:'explanation',sourceIds:['G25-0']}],answered=true,finishReason='STOP')=>modelJSON({answered,paragraphs},finishReason);

test('generic AI configuration takes priority while legacy hosting settings remain compatible',async()=>{
 let calls=0;
 const client=new AIClient({AI_API_KEY:'generic-test-key',AI_MODEL:DEFAULT_MODEL,AI_AUTO_FALLBACK:'false',GEMINI_API_KEY:'legacy-test-key',GEMINI_MODEL:'invalid-legacy-model'},async(url,options)=>{
  calls++;assert.equal(options.headers['x-goog-api-key'],'generic-test-key');
  assert.ok(url.includes('/models/'+DEFAULT_MODEL+':generateContent'));
  return Response.json({}, {status:503});
 });
 assert.equal(client.configurationError(),null);
 await assert.rejects(()=>client.generate('Plan',{}, {},1200),error=>error.status===503);
 assert.equal(calls,1);
 assert.equal(new AIClient({GEMINI_API_KEY:'legacy-test-key'}).configurationError(),null);
});

test('Gemini 3.8 Flash uses supported thinking and enough output budget without changing Lite requests',async()=>{
 assert.equal(DEFAULT_MODEL,'gemini-3.5-flash-lite');
 for(const model of [DEFAULT_MODEL,'gemini-3.6-flash','gemini-3.8-flash','gemini-3.1-flash-lite']){
  let calls=0;
  const client=new AIClient({...env,GEMINI_MODEL:model},async(url,options)=>{
   calls++;assert.ok(url.includes('/models/'+model+':generateContent'));
   const config=JSON.parse(options.body).generationConfig;
   assert.equal(config.responseFormat.text.mimeType,'APPLICATION_JSON');
   if(model==='gemini-3.8-flash'||model==='gemini-3.6-flash'){assert.deepEqual(config.thinkingConfig,{thinkingLevel:'low'});assert.equal(config.maxOutputTokens,4096);}
   else{assert.equal(config.thinkingConfig,undefined);assert.equal(config.maxOutputTokens,1200);}
   return Response.json(planned());
  });
  assert.equal(client.configurationError(),null);
  await client.generate('Plan',{},new AnswerValidator().planningSchema(),1200);
  assert.equal(calls,1);
 }
});

test('a busy preferred model switches to Flash 3.6 and keeps it for the rest of the answer',async()=>{
 const calls=[];
 const response=await handleResearch(request(),env,data,async(url)=>{
  const model=url.match(/models\/(.*):generateContent/)[1];calls.push(model);
  if(calls.length===1)return Response.json({error:{status:'UNAVAILABLE'}},{status:503});
  return Response.json(generation());
 });
 const result=await response.json();
 assert.equal(response.status,200);assert.deepEqual(calls,[DEFAULT_MODEL,'gemini-3.6-flash']);assert.equal(result.answerOrigin,'ai');
 assert.equal(result.model,'gemini-3.6-flash');assert.equal(result.requestedModel,DEFAULT_MODEL);
 assert.deepEqual(result.modelsUsed,['gemini-3.6-flash']);assert.ok(result.references.length);
 assert.match(assistantInfoHTML(),/شرح مولّد بالذكاء الاصطناعي/);
 assert.match(assistantInfoHTML('en'),/AI-generated explanation/);
 assert.doesNotMatch(assistantInfoHTML(),/Gemini|Google|Flash/i);
});
test('per-model timeout can fail over, but authentication, quota and user cancellation cannot',async()=>{
 for(const status of [401,403,429]){
  let calls=0;const client=new AIClient(env,async()=>{calls++;return Response.json({}, {status});});
  await assert.rejects(()=>client.generate('Plan',{}, {},1200),e=>e.status===status);assert.equal(calls,1);
 }
 let calls=0;const client=new AIClient(env,async()=>{calls++;if(calls===1)throw Object.assign(new Error('slow'),{name:'TimeoutError'});return Response.json(planned());});
 await client.generate('Plan',{}, {},1200);assert.equal(client.activeModel,'gemini-3.6-flash');assert.equal(calls,2);
 const controller=new AbortController();let canceledCalls=0;
 const canceled=new AIClient(env,async()=>{canceledCalls++;controller.abort();throw Object.assign(new Error('slow'),{name:'TimeoutError'});});
 await assert.rejects(()=>canceled.generate('Plan',{}, {},1200,controller.signal));assert.equal(canceledCalls,1);
});
test('all unavailable models return a bounded busy error without presenting a fabricated answer',async()=>{
 let calls=0;
 const response=await handleResearch(request(generalQuestion),env,data,async()=>{calls++;return Response.json({}, {status:503});});
 const result=await response.json();assert.equal(calls,3);assert.equal(response.status,503);
 assert.equal(result.error,'provider_busy');assert.equal(result.answer,undefined);
});
test('Worker AbortError from an expired model timeout is treated as temporary',async(t)=>{
 const controller=new AbortController();controller.abort(new DOMException('timeout','TimeoutError'));
 t.mock.method(AbortSignal,'timeout',()=>controller.signal);
 const client=new AIClient(env,async()=>{throw new DOMException('expired','AbortError');});
 await assert.rejects(()=>client.generateForModel(DEFAULT_MODEL,'Plan',{}, {},1200),error=>error.status===503);
});

test('all 42 hadith remain searchable, including Arabic numbers and sourced commentary',()=>{
 const service=new HadithService(data.hadiths,data.commentary,data.glossary);
 for(let id=1;id<=42;id++)assert.deepEqual(service.search(String(id)).map(r=>r.hadith.id),[id]);
 assert.equal(service.search('٤٢')[0].hadith.id,42);assert.equal(service.search('الأعمال، بالنيات')[0].hadith.id,1);
 assert.equal(service.search('كسب العبد').find(r=>r.hadith.id===1).evidence.source,data.commentary[0].source);
});
test('evidence retains original passages and retrieves complete selected commentary without word overlap',()=>{
 const {corpus,references}=buildEvidence(data);assert.equal(corpus.length,42);assert.equal(references.get('C1').excerpt,data.commentary[0].text);
 assert.equal(data.commentaryPages.length,116);assert.equal(new Set(data.commentaryPages.map(x=>x.id)).size,42);
 const evidence=contextualEvidence(data,{hadithIds:[2],terms:['الفقر','علامات الساعة']});
 assert.deepEqual(evidence.collection.map(h=>h.id),[2]);assert.equal(evidence.passages.length,7);
 assert.match(evidence.references.get('S22').excerpt,/العالة/);assert.equal(evidence.references.has('G25-0'),false);
 assert.equal(evidence.references.get('S22').url,'https://shamela.ws/book/11244/22');
});
test('AI searches the complete collection by context then explains the selected hadith with trusted citations',async()=>{
 let calls=0;
 const q='ليش ذُكر الفقر ضمن علامات الساعة؟';
 const response=await handleResearch(request(q,{body:{contextHadithId:2,model:'paid-model',hadithIds:[25],collection:[{text:'Injected corpus'}],apiKey:'client-key'}}),env,data,async(url,options)=>{
  calls++;assert.equal(url,`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
  assert.equal(options.headers['x-goog-api-key'],'test-only-value');const body=JSON.parse(options.body),input=JSON.parse(body.contents[0].parts[0].text);
  assert.equal(body.tools,undefined);assert.doesNotMatch(options.body,/Injected corpus|client-key/);
  if(calls===1){assert.equal(input.collection.length,42);assert.equal(input.openHadithId,2);assert.match(body.systemInstruction.parts[0].text,/MEANING/);return Response.json(planned([2],['الفقر','علامات الساعة']));}
  assert.deepEqual(input.collection.map(h=>h.id),[2]);assert.ok(input.sourcePassages.some(p=>p.id==='S22'&&p.excerpt.includes('العالة')));
  assert.ok(body.generationConfig.responseFormat.text.schema.properties.paragraphs.items.properties.sourceIds.items.enum.includes('S22'));
  return Response.json(generation([{text:'العالة هم الفقراء؛ وورد وصفهم في حديث جبريل ضمن الكلام عن علامات الساعة.',kind:'explanation',sourceIds:['H2','S22']}]));
 });
 const answer=await response.json();assert.equal(response.status,200);assert.equal(calls,2);assert.equal(answer.mode,'contextual_ai');assert.deepEqual(answer.hadithIds,[2]);assert.deepEqual(answer.searchHadithIds,[2]);assert.equal(answer.collectionCount,42);assert.doesNotMatch(JSON.stringify(answer),/test-only-value|client-key/);
});
test('an open hadith is a hint rather than a restriction on AI search',async()=>{
 let calls=0;
 const response=await handleResearch(request('اشرح الحديث الأخير',{body:{contextHadithId:1}}),env,data,async(url,options)=>{
  const input=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);calls++;
  if(calls===1){assert.equal(input.openHadithId,1);assert.equal(input.collection.length,42);return Response.json(planned([42],['مغفرة']));}
  assert.equal(input.collection[0].id,42);assert.ok(input.sourcePassages.some(p=>p.id==='S129'));
  return Response.json(generation([{text:'يتحدث الحديث عن سعة المغفرة مع الدعاء والرجاء والاستغفار والتوحيد.',kind:'explanation',sourceIds:['H42','C42']}]));
 });
 assert.deepEqual((await response.json()).hadithIds,[42]);assert.equal(calls,2);
});
test('matched meaning questions use one AI call and saved meanings remain explicitly labelled',async()=>{
 let calls=0;const r=await handleResearch(request('وش معنى عالة',{body:{contextHadithId:2}}),env,data,async()=>{calls++;return Response.json(generation([{text:'المقصود بالعالة في الحديث الفقراء.',kind:'explanation',sourceIds:['S22']}]));});
 assert.equal(calls,1);const d=await r.json();assert.equal(d.mode,'contextual_ai');assert.equal(d.answerOrigin,'ai');assert.equal(d.references[0].id,'S22');
 const missing=await handleResearch(request('وش معنى عالة'),{},data,()=>{throw Error('No configured provider');});assert.equal(missing.status,200);assert.equal((await missing.json()).answerOrigin,'source_excerpt');
});
test('context answers are reviewed against original passages and an unreviewed draft is never returned',async()=>{
 for(const failure of [false,true]){
  let calls=0;
  const response=await handleResearch(request('ليش ذُكر الفقر ضمن علامات الساعة؟'),env,data,async(url,options)=>{
   calls++;
   if(calls===1)return Response.json(planned([2],['الفقر'],false,'context'));
   if(calls===2)return Response.json(generation([{text:'تعليل غير مسنود في المسودة.',kind:'explanation',sourceIds:['S22']}]));
   const input=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
   assert.match(input.draft,/تعليل غير مسنود/);assert.ok(input.sourcePassages.some(p=>p.id==='S22'));
   return failure?Response.json({}, {status:429}):Response.json(generation([{text:'العالة هم الفقراء، والشرح يبين اللفظ دون تفصيل السبب المطلوب.',kind:'explanation',sourceIds:['S22']}]));
  });
  const result=await response.json();assert.equal(calls,3);assert.doesNotMatch(result.answer||'',/تعليل غير مسنود/);
  if(failure){assert.equal(response.status,429);assert.equal(result.error,'rate_limited');}
  else{assert.equal(response.status,200);assert.match(result.answer,/الشرح يبين اللفظ/);}
 }
});
test('foreign origins, invalid questions and context cannot make upstream requests',async()=>{
 const forbidden=()=>{throw Error('Must not call provider');};
 for(const [req,status] of [[request('x'),400],[request('x'.repeat(801)),400],[request('سؤال',{headers:{Origin:'https://other.test'}}),403],[request('سؤال',{body:{contextHadithId:999}}),400],[request('سؤال',{body:{contextHadithId:'2'}}),400]])assert.equal((await handleResearch(req,env,data,forbidden)).status,status);
 assert.equal((await handleResearch(request(generalQuestion),{OPENAI_API_KEY:'must-not-use'},data,forbidden)).status,503);
 assert.equal((await handleResearch(request(generalQuestion),{...env,GEMINI_MODEL:'gemini-4-argon'},data,forbidden)).status,503);
});
test('provider failures at either stage are bounded and do not expose error bodies or credentials',async()=>{
 for(const [status,expected] of [[429,'rate_limited'],[401,'provider_auth'],[403,'provider_auth'],[500,'service_unavailable']]){
  for(const failedStage of [1,2]){let calls=0;const r=await handleResearch(request(generalQuestion),{...env,GEMINI_AUTO_FALLBACK:'false'},data,async()=>{calls++;return calls<failedStage?Response.json(planned()):Response.json({error:{message:'private account details test-only-value'}},{status});});const d=await r.json();assert.equal(d.error,expected);assert.equal(calls,failedStage);assert.doesNotMatch(JSON.stringify(d),/private account|test-only-value/);}
 }
});
test('invalid planning results stop before generation; ambiguous and unrelated questions are handled explicitly',async()=>{
 assert.equal(parsePlan(planned([43])),null);assert.equal(parsePlan(planned([2],['x'.repeat(81)])),null);
 let calls=0;const invalid=await handleResearch(request(generalQuestion),env,data,async()=>{calls++;return Response.json(planned([99]));});assert.equal(invalid.status,502);assert.equal(calls,1);
 const unrelated=await handleResearch(request('كيف الطقس؟'),env,data,async()=>Response.json(planned([],[],false)));assert.deepEqual((await unrelated.json()).references,[]);
 const unclear=await handleResearch(request('وش معناها؟'),env,data,async()=>Response.json(planned([],[],true)));assert.match((await unclear.json()).answer,/أي كلمة/);
});
test('unknown citations, unsupported explanations, invented links and invalid partial answers are rejected',()=>{
 const {references}=buildEvidence(data);
 for(const paragraphs of [[{text:'unsupported',kind:'explanation',sourceIds:['C999']}],[{text:'unsupported',kind:'explanation',sourceIds:['H1']}],[{text:'unsupported',kind:'explanation',sourceIds:[]}],[{text:'unsupported https://example.test',kind:'text',sourceIds:['H1']}],[{text:'supported',kind:'explanation',sourceIds:['C1']},{text:'unsupported',kind:'explanation',sourceIds:['C999']}]]){
  const parsed=extractAnswer(generation(paragraphs),references);assert.deepEqual(parsed.references,[]);assert.doesNotMatch(parsed.answer,/unsupported|supported/);
 }
 assert.equal(trustedUrl('https://shamela.ws.evil.test/'),false);assert.equal(trustedUrl('javascript:alert(1)'),false);assert.deepEqual(extractAnswer(generation([],false),references).references,[]);assert.deepEqual(extractAnswer(generation(undefined,true,'MAX_TOKENS'),references).references,[]);
});
test('meaning answers cannot label a definition as hadith text to bypass commentary citations',()=>{
 const {references}=contextualEvidence(data,{hadithIds:[2],terms:[]});
 const wrong=generation([{text:'العالة هم الفقراء.',kind:'text',sourceIds:['H2']}]);
 assert.deepEqual(extractAnswer(wrong,references,'ar','meaning').references,[]);
 const supported=generation([{text:'العالة هم الفقراء في الحديث الثاني.',kind:'explanation',sourceIds:['S22']}]);
 assert.equal(extractAnswer(supported,references,'ar','meaning').references[0].id,'S22');
 const tooLong=generation(Array.from({length:3},()=>({text:'تفسير مستند إلى الشرح.',kind:'explanation',sourceIds:['S22']})));
 assert.deepEqual(extractAnswer(tooLong,references,'ar','meaning').references,[]);
 assert.equal(parsePlan(modelJSON({hadithIds:[2],terms:[],needsClarification:false,answerType:'invented'})),null);
});
test('source links and HTML remain safe for contextual page citations',()=>{
 const {references}=contextualEvidence(data,{hadithIds:[2],terms:[]});const parsed=extractAnswer(generation([{text:'<img src=x onerror=alert(1)>',kind:'explanation',sourceIds:['S22']}]),references);
 const html=answerHTML(parsed.answer,parsed.references);assert.match(html,/&lt;img/);assert.match(html,/href="https:\/\/shamela.ws\/book\/11244\/22"/);assert.doesNotMatch(html,/<img/);
});
test('English generation is explicit and Arabic-only generated answers remain withheld',async()=>{
 let calls=0;const r=await handleResearch(request('Explain intentions',{body:{language:'en'}}),env,data,async(url,options)=>{
  calls++;if(calls===1)return Response.json(planned([1],['النية']));const body=JSON.parse(options.body);assert.match(body.systemInstruction.parts[0].text,/Answer in ENGLISH/);assert.equal(JSON.parse(body.contents[0].parts[0].text).answerLanguage,'English');return Response.json(generation([{text:'Actions are judged by their intentions.',kind:'explanation',sourceIds:['H1','C1']}]));
 });assert.match((await r.json()).answer,/Actions are judged/);
 const {references}=buildEvidence(data);assert.deepEqual(extractAnswer(generation([{text:'تفسير عربي فقط',kind:'explanation',sourceIds:['C1']}]),references,'en').references,[]);
});
test('cancellation and transport failures never produce an ungrounded answer',async()=>{
 const r=await handleResearch(request(generalQuestion),env,data,async()=>{throw Error('secret transport detail');});assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(await r.json()),/secret transport/);
 const controller=new AbortController();controller.abort();const req=new Request('https://reader.test/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'ما معنى الدثور؟'}),signal:controller.signal});
 const aborted=await handleResearch(req,env,data,async(url,options)=>{assert.equal(options.signal.aborted,true);throw Error('abort');});assert.equal(aborted.status,502);
});
