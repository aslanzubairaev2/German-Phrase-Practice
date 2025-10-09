/**
 * Practice Chat Service - Redesigned
 *
 * A simplified, robust service for Practice Chat AI conversations.
 * This service replaces the problematic practiceConversation from geminiService.
 *
 * Key improvements:
 * - Simple flat JSON schema (no nested contentParts confusion)
 * - Clear field naming (primaryText, translation, suggestions)
 * - Robust validation and fallbacks
 * - Exponential backoff retry logic
 * - Better error messages
 */

import { GoogleGenAI, Type } from '@google/genai';
import type {
  Phrase,
  LanguageProfile,
  PracticeChatMessage,
  PracticeChatAIResponse,
  PracticeChatMessageType,
} from '../types';

// Retry helper (from geminiService.ts)
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === maxRetries - 1;

      console.warn(
        `[retryWithExponentialBackoff] Attempt ${attempt + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : error
      );

      if (isLastAttempt) {
        console.error('[retryWithExponentialBackoff] All retries exhausted');
        break;
      }

      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(`[retryWithExponentialBackoff] Waiting ${delayMs}ms before retry...`);

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// Language name mapping
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'German',
  ru: 'Russian',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  zh: 'Chinese',
  ja: 'Japanese',
  ar: 'Arabic',
  hi: 'Hindi',
};

/**
 * Simplified JSON Schema for Practice Chat
 * No nested objects, clear field names, all required fields explicit
 */
const practiceChatResponseSchema = {
  type: Type.OBJECT,
  properties: {
    messageType: {
      type: Type.STRING,
      enum: ['greeting', 'question', 'correction', 'explanation', 'encouragement', 'suggestion'],
      description: 'Type of AI response'
    },
    primaryText: {
      type: Type.STRING,
      description: 'Main text in learning language'
    },
    translation: {
      type: Type.STRING,
      description: 'Translation of primaryText in native language'
    },
    secondaryText: {
      type: Type.STRING,
      description: 'Additional explanation in native language (optional)',
      nullable: true
    },
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2-3 quick reply suggestions in learning language'
    },
    hints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Hints if user is stuck (optional)',
      nullable: true
    },
    vocabularyUsed: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'IDs of phrases from vocabulary used (optional)',
      nullable: true
    }
  },
  required: ['messageType', 'primaryText', 'translation', 'suggestions']
};

/**
 * Validate AI response structure
 */
function validateAIResponse(response: any): response is PracticeChatAIResponse {
  if (!response || typeof response !== 'object') {
    console.error('[validateAIResponse] Response is not an object:', response);
    return false;
  }

  // Check required fields
  const hasMessageType = typeof response.messageType === 'string';
  const hasPrimaryText = typeof response.primaryText === 'string' && response.primaryText.length > 0;
  const hasTranslation = typeof response.translation === 'string' && response.translation.length > 0;
  const hasSuggestions = Array.isArray(response.suggestions) && response.suggestions.length > 0;

  if (!hasMessageType) {
    console.error('[validateAIResponse] Missing or invalid messageType');
  }
  if (!hasPrimaryText) {
    console.error('[validateAIResponse] Missing or invalid primaryText');
  }
  if (!hasTranslation) {
    console.error('[validateAIResponse] Missing or invalid translation');
  }
  if (!hasSuggestions) {
    console.error('[validateAIResponse] Missing or invalid suggestions');
  }

  return hasMessageType && hasPrimaryText && hasTranslation && hasSuggestions;
}

/**
 * Create fallback response when AI fails
 */
function createFallbackResponse(
  errorMessage: string,
  lang: LanguageProfile
): PracticeChatMessage {
  const learningLangName = LANGUAGE_NAMES[lang.learning] || lang.learning;

  return {
    role: 'assistant',
    messageType: 'explanation',
    content: {
      primary: {
        text: lang.learning === 'de' ? 'Entschuldigung' :
              lang.learning === 'fr' ? 'Désolé' :
              lang.learning === 'es' ? 'Lo siento' :
              'Sorry',
        translation: 'Sorry'
      },
      secondary: {
        text: errorMessage
      }
    },
    actions: {
      suggestions: [
        'OK',
        lang.learning === 'de' ? 'Noch einmal' :
        lang.learning === 'fr' ? 'Encore' :
        lang.learning === 'es' ? 'Otra vez' :
        'Try again'
      ]
    },
    metadata: {
      timestamp: Date.now()
    }
  };
}

/**
 * Convert AI response to PracticeChatMessage
 */
function convertAIResponseToMessage(
  aiResponse: PracticeChatAIResponse
): PracticeChatMessage {
  return {
    role: 'assistant',
    messageType: aiResponse.messageType,
    content: {
      primary: {
        text: aiResponse.primaryText,
        translation: aiResponse.translation
      },
      secondary: (aiResponse.secondaryText !== undefined && aiResponse.secondaryText !== null && aiResponse.secondaryText !== '') ? {
        text: aiResponse.secondaryText
      } : undefined
    },
    actions: {
      suggestions: aiResponse.suggestions,
      hints: aiResponse.hints,
      phraseUsed: aiResponse.vocabularyUsed?.[0] // Take first phrase ID
    },
    metadata: {
      timestamp: Date.now(),
      vocabulary: aiResponse.vocabularyUsed
    }
  };
}

/**
 * Format conversation history for Gemini API
 */
function formatHistoryForAPI(history: PracticeChatMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  return history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{
      text: msg.role === 'user'
        ? msg.content.primary.text
        : `${msg.content.primary.text}${msg.content.secondary ? `\n${msg.content.secondary.text}` : ''}`
    }]
  }));
}

/**
 * Send message to Practice Chat AI
 *
 * @param history - Previous conversation messages
 * @param userMessage - New message from user
 * @param userVocabulary - User's phrase collection
 * @param languageProfile - User's language settings
 * @returns AI response as PracticeChatMessage
 */
export async function sendPracticeChatMessage(
  history: PracticeChatMessage[],
  userMessage: string,
  userVocabulary: Phrase[],
  languageProfile: LanguageProfile
): Promise<PracticeChatMessage> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const api = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.0-flash-exp';

  const learningLang = LANGUAGE_NAMES[languageProfile.learning] || languageProfile.learning;
  const nativeLang = LANGUAGE_NAMES[languageProfile.native] || languageProfile.native;

  // Build vocabulary list (limit to 30 phrases for context window)
  const vocabList = userVocabulary
    .slice(0, 30)
    .map(p => `- "${p.text.learning}" (${p.text.native}) [id: ${p.id}]`)
    .join('\n');

  // Determine if this is first message
  const isFirstMessage = history.length === 0;

  // Create system instruction
  const systemInstruction = `You are Alex, a friendly ${learningLang} language tutor helping learners practice natural conversation.

**Mission:** Have a natural, authentic conversation in ${learningLang} at the user's level, using phrases from their vocabulary.

**User's Vocabulary (${userVocabulary.length} phrases, showing first 30):**
${vocabList || 'No phrases yet'}

**Conversation Rules:**
1. **Be natural**: Respond like a real person in conversation - NO PARROTING what the user said
2. **Use their vocabulary**: Base conversation topics around phrases they know
3. **Correct mistakes**: If user makes an error, correct it gently with explanation in ${nativeLang}
4. **Encourage progress**: Praise correct usage with "encouragement" messages
5. **Match their level**: Use appropriate complexity based on their vocabulary
6. **Track usage**: Always include vocabularyUsed IDs when you use their phrases
7. **Authentic dialogue**: Have a goal in each message - ask questions, share info, or respond naturally
8. **Don't repeat**: When user answers correctly, acknowledge and MOVE FORWARD with new content

**IMPORTANT - Natural Conversation Flow:**
❌ BAD (parroting):
User: "Ich bin müde"
AI: "Ah, du bist müde! Warum bist du müde?"

✅ GOOD (natural):
User: "Ich bin müde"
AI: "Oh nein! Hast du schlecht geschlafen?" (moves conversation forward)

**Response Format (STRICT JSON, NO MARKDOWN):**

{
  "messageType": "greeting|question|correction|explanation|encouragement|suggestion",
  "primaryText": "Your ${learningLang} response here - NATURAL conversation, NO parroting",
  "translation": "${nativeLang} translation of primaryText",
  "secondaryText": "Optional ${nativeLang} explanation/correction (ONLY use for corrections/grammar notes)",
  "suggestions": ["${learningLang} suggestion 1", "${learningLang} suggestion 2", "${learningLang} suggestion 3"],
  "hints": ["${nativeLang} hint 1", "${nativeLang} hint 2"],
  "vocabularyUsed": ["phrase_id_1", "phrase_id_2"]
}

**Message Types:**
- "greeting": Initial welcome, start conversation
- "question": Ask question to continue dialogue
- "correction": User made a mistake - correct it
- "explanation": Explain grammar/vocabulary
- "encouragement": Praise correct usage
- "suggestion": Suggest using a phrase

**Example Natural Responses:**

First greeting:
{
  "messageType": "greeting",
  "primaryText": "Hallo! Wie geht es dir heute?",
  "translation": "Hello! How are you today?",
  "secondaryText": "Давай попрактикуем разговор используя фразы из твоего словаря",
  "suggestions": ["Gut, danke!", "Sehr gut!", "Es geht so"],
  "vocabularyUsed": []
}

Natural question (user said "Gut, danke"):
{
  "messageType": "question",
  "primaryText": "Das freut mich! Was machst du heute?",
  "translation": "I'm glad! What are you doing today?",
  "suggestions": ["Ich arbeite", "Ich lerne Deutsch", "Ich habe frei"],
  "vocabularyUsed": ["phrase_id_if_used"]
}

Correction (user said "Ich habe geht"):
{
  "messageType": "correction",
  "primaryText": "Ich verstehe! Meinst du 'Ich bin gegangen'?",
  "translation": "I understand! Do you mean 'I went'?",
  "secondaryText": "Правильная форма: 'Ich bin gegangen' (прошедшее время от 'gehen'). Глаголы движения используют 'sein', не 'haben'",
  "suggestions": ["Ja, genau", "Danke für die Korrektur", "Noch einmal bitte"],
  "vocabularyUsed": []
}

Encouragement:
{
  "messageType": "encouragement",
  "primaryText": "Ausgezeichnet! Du lernst schnell!",
  "translation": "Excellent! You're learning fast!",
  "suggestions": ["Danke!", "Was kommt als Nächstes?", "Weiter üben"],
  "vocabularyUsed": []
}

**CRITICAL:**
- Return ONLY valid JSON
- NO markdown code blocks
- ALL explanations/corrections MUST be in ${nativeLang}
- primaryText is ALWAYS in ${learningLang}
- translation is ALWAYS in ${nativeLang}
- secondaryText is ALWAYS in ${nativeLang} (for corrections/explanations)
- suggestions array ALWAYS in ${learningLang}
- hints array ALWAYS in ${nativeLang}
- NO PARROTING - respond naturally, move conversation forward
- ALL required fields must be present`;

  // Wrap in retry logic
  return retryWithExponentialBackoff(async () => {
    try {
      // Format history
      const formattedHistory = formatHistoryForAPI(history);

      // Add user message
      const userMsg = {
        role: 'user',
        parts: [{ text: userMessage || '(Start the conversation)' }]
      };

      // Call Gemini API
      const response = await api.models.generateContent({
        model,
        contents: [...formattedHistory, userMsg],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: practiceChatResponseSchema,
          temperature: 0.7,
        },
      });

      const jsonText = response.text.trim();

      // Log for debugging
      console.log('[sendPracticeChatMessage] Raw response:', jsonText.substring(0, 200));

      // Check empty response
      if (!jsonText) {
        console.error('[sendPracticeChatMessage] Empty response from Gemini');
        return createFallbackResponse(
          'I received an empty response. Please try again.',
          languageProfile
        );
      }

      // Parse JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('[sendPracticeChatMessage] JSON parse failed:', parseError);
        console.error('[sendPracticeChatMessage] Raw text:', jsonText);
        return createFallbackResponse(
          'I had trouble parsing the response. Please try again.',
          languageProfile
        );
      }

      // Validate structure
      if (!validateAIResponse(parsed)) {
        console.error('[sendPracticeChatMessage] Invalid response structure:', parsed);
        return createFallbackResponse(
          'The response structure was invalid. Please try again.',
          languageProfile
        );
      }

      // Convert to PracticeChatMessage
      return convertAIResponseToMessage(parsed);

    } catch (error) {
      console.error('[sendPracticeChatMessage] Error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return createFallbackResponse(
        `Error: ${errorMsg}. Please try again.`,
        languageProfile
      );
    }
  }, 3, 1000); // 3 retries, exponential backoff
}

/**
 * Create initial greeting message
 */
export function createInitialGreeting(
  languageProfile: LanguageProfile,
  userVocabulary: Phrase[]
): PracticeChatMessage {
  const learningLang = LANGUAGE_NAMES[languageProfile.learning] || languageProfile.learning;
  const nativeLang = LANGUAGE_NAMES[languageProfile.native] || languageProfile.native;

  const greetings: Record<string, { text: string; translation: string }> = {
    de: { text: 'Hallo! Lass uns Deutsch üben!', translation: 'Hello! Let\'s practice German!' },
    en: { text: 'Hello! Let\'s practice English!', translation: 'Привет! Давай практиковать английский!' },
    fr: { text: 'Bonjour! Pratiquons le français!', translation: 'Hello! Let\'s practice French!' },
    es: { text: '¡Hola! ¡Practiquemos español!', translation: 'Hello! Let\'s practice Spanish!' },
    it: { text: 'Ciao! Pratichiamo l\'italiano!', translation: 'Hello! Let\'s practice Italian!' },
    pt: { text: 'Olá! Vamos praticar português!', translation: 'Hello! Let\'s practice Portuguese!' },
    pl: { text: 'Cześć! Ćwiczmy polski!', translation: 'Hello! Let\'s practice Polish!' },
    zh: { text: '你好！让我们练习中文！', translation: 'Hello! Let\'s practice Chinese!' },
    ja: { text: 'こんにちは！日本語を練習しましょう！', translation: 'Hello! Let\'s practice Japanese!' },
    ar: { text: 'مرحبا! دعونا نمارس العربية!', translation: 'Hello! Let\'s practice Arabic!' },
  };

  const greeting = greetings[languageProfile.learning] || greetings['en'];

  const suggestionsByLang: Record<string, string[]> = {
    de: ['Hallo!', 'Guten Tag!', 'Ja, gerne!'],
    en: ['Hello!', 'Hi!', 'Yes, let\'s go!'],
    fr: ['Bonjour!', 'Salut!', 'Oui, d\'accord!'],
    es: ['¡Hola!', '¡Buenos días!', '¡Sí, claro!'],
    it: ['Ciao!', 'Buongiorno!', 'Sì, certo!'],
    pt: ['Olá!', 'Bom dia!', 'Sim, vamos!'],
    pl: ['Cześć!', 'Dzień dobry!', 'Tak, chętnie!'],
    zh: ['你好！', '早上好！', '好的！'],
    ja: ['こんにちは！', 'おはよう！', 'はい！'],
    ar: ['مرحبا!', 'صباح الخير!', 'نعم!'],
  };

  const suggestions = suggestionsByLang[languageProfile.learning] || suggestionsByLang['en'];

  // Explanations in native language
  const explanations: Record<string, string> = {
    ru: 'Я буду вести с тобой естественный разговор используя фразы из твоего словаря. Давай начнем!',
    en: `I'll have a natural conversation with you using phrases from your vocabulary. Let's begin!`,
    de: 'Ich werde ein natürliches Gespräch mit dir führen und dabei Phrasen aus deinem Vokabular verwenden. Lass uns beginnen!',
    fr: 'Je vais avoir une conversation naturelle avec toi en utilisant des phrases de ton vocabulaire. Commençons!',
    es: 'Voy a tener una conversación natural contigo usando frases de tu vocabulario. ¡Empecemos!',
    it: 'Avrò una conversazione naturale con te usando frasi dal tuo vocabolario. Cominciamo!',
    pt: 'Vou ter uma conversa natural contigo usando frases do teu vocabulário. Vamos começar!',
    pl: 'Będę prowadzić naturalną rozmowę z tobą używając fraz z twojego słownictwa. Zacznijmy!',
    zh: '我会用你词汇表中的短语与你进行自然对话。让我们开始吧！',
    ja: 'あなたの語彙のフレーズを使って自然な会話をします。始めましょう！',
    ar: 'سأجري محادثة طبيعية معك باستخدام عبارات من مفرداتك. لنبدأ!',
  };

  return {
    role: 'assistant',
    messageType: 'greeting',
    content: {
      primary: {
        text: greeting.text,
        translation: greeting.translation
      },
      secondary: {
        text: explanations[languageProfile.native] || explanations['en']
      }
    },
    actions: {
      suggestions
    },
    metadata: {
      timestamp: Date.now()
    }
  };
}
