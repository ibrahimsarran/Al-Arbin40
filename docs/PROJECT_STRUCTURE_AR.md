# تنظيم ملفات المشروع

المشروع يستخدم JavaScript Classes وES Modules. كل Class من كلاسات التطبيق الـ17 له ملف مستقل. تبقى الدوال المساعدة التي لا تحتاج إلى حالة داخل `utils`، ولا نحولها إلى Classes إضافية لمجرد زيادة العدد.

## تقسيم المجلدات

| المجلد أو الملف | المسؤولية |
| --- | --- |
| `public/app.mjs` | نقطة البداية: إنشاء LanguageController وReaderController وتشغيل التطبيق. |
| `public/js/controllers/` | تنسيق أحداث المستخدم والتنقل واللغة والصوت ونافذة المساعد. |
| `public/js/views/` | بناء صفحات الواجهة والنوافذ والتفاصيل. |
| `public/js/services/` | منطق الأحاديث وبيانات الدراسة والتحقق من تنزيل الصوت. |
| `public/js/repositories/` | تحميل المحتوى وقراءة بيانات المتصفح وحفظها. |
| `public/js/audio/` | جلسة تشغيل الصوت والتحكم بشريط الوقت. |
| `public/js/utils/` | دوال النص والبحث والصفحات والتوقيتات وتنسيق عناصر العرض ومفاتيح التسجيلات. |
| `server/` | فهم السؤال واسترجاع المقاطع وتوليد الإجابة والتحقق منها على الخادم. |
| `app/api/research/route.ts` | استقبال HTTP وربط الطلب بـResearchService. |
| `public/*.json` | المتون والشروح والمعاني والإعراب وقوائم الصوت والتوقيتات. |
| `public/audio/` و`public/fonts/` | التسجيلات والخطوط المرفقة. |
| `tests/` | اختبارات السلوك والتخزين والصوت والواجهة وربط الملفات. |
| `docs/` | دليل تنظيم الكود ومصادر المحتوى. |
| `tools/` | تشغيل الاختبارات. |

## كل Class وملفه

| Class | الملف |
| --- | --- |
| ReaderController | `public/js/controllers/reader-controller.mjs` |
| ReaderView | `public/js/views/reader-view.mjs` |
| LanguageController | `public/js/controllers/language-controller.mjs` |
| ResearchController | `public/js/controllers/research-controller.mjs` |
| AudioController | `public/js/controllers/audio-controller.mjs` |
| HadithService | `public/js/services/hadith-service.mjs` |
| StudyService | `public/js/services/study-service.mjs` |
| AudioDownloadService | `public/js/services/audio-download-service.mjs` |
| HadithRepository | `public/js/repositories/hadith-repository.mjs` |
| StudyRepository | `public/js/repositories/study-repository.mjs` |
| AudioRepository | `public/js/repositories/audio-repository.mjs` |
| AudioPlayer | `public/js/audio/audio-player.mjs` |
| SeekControl | `public/js/audio/seek-control.mjs` |
| ResearchService | `server/research-service.mjs` |
| EvidenceRepository | `server/evidence-repository.mjs` |
| AIClient | `server/ai-client.mjs` |
| AnswerValidator | `server/answer-validator.mjs` |

## أين تبدأ التعديل؟

1. افتح `README.md` لتشغيل المشروع.
2. افتح `public/app.mjs` لفهم نقطة البداية.
3. استخدم جدول الكلاسات والملفات أعلاه لتحديد Class المسؤول عن الميزة التي تريد تعديلها.

للتصميم عدّل `public/style.css` وReaderView. للبحث المحلي عدّل HadithService ودوال النص في utils. للإشارات والملاحظات عدّل StudyService، ولطريقة الحفظ عدّل StudyRepository. للاستماع عدّل AudioController وAudioPlayer وSeekControl بحسب المسؤولية. لمراحل إجابة المساعد عدّل ResearchService، وللاتصال بالمزوّد عدّل AIClient.

## قواعد التنظيم

- Controller ينسق الأمر، وView يعرضه، وService ينفذ منطق الميزة، وRepository يصل إلى البيانات.
- كل Class في ملف مستقل؛ الدوال المساعدة لها ملفات واضحة وتُستورد عند الحاجة.
- تبقى بيانات النص والصوت وتوقيتاته خارج ملفات السلوك.
- لا توجد ملفات وسيطة تُعيد تصدير تنظيم قديم؛ تستخدم الاستيرادات المسارات الحالية مباشرة.
- توجد أسماء واضحة للأحداث مثل `handleClick` و`handleInput` و`handleChange` بدل جمعها في معالج واحد.
- تستقبل المستودعات والخدمات Dependencies قابلة للتمرير للاختبار، مثل التخزين وfetcher.
- يُفحص أن جميع ملفات JavaScript المطلوبة موجودة في Offline Cache.

بعد التعديل شغّل `npm test` و`npm run build`. لا تغيّر مواضع كلمات المتن عند تعديل الشكل، لأن المعاني والإعراب والتظليل مرتبطة بها.
