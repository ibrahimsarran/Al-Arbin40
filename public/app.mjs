import { ReaderController } from './js/controllers/reader-controller.mjs';
import { LanguageController } from './js/controllers/language-controller.mjs';
// Application entry point. The interface language and reader have separate lifecycles.
export const language = new LanguageController(document);
export const application = new ReaderController({ languageController: language });
await application.start();
