import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set!');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async parseMessage(text: string) {
    this.logger.log(`[Parser] Received text: ${text}`);

    // 1. FAST PATH (Regex Parser)
    // Matches patterns like "50k makan siang bca"
    const regexPattern = /^(\d+)(k|rb|jt)?\s+(.+?)\s+(bca|gopay|ovo|dana|cash)$/i;
    const match = text.match(regexPattern);

    if (match) {
      this.logger.log('[Parser] Hit Regex Fast-Path!');
      let amount = parseInt(match[1]);
      const multiplier = match[2]?.toLowerCase();
      if (multiplier === 'k' || multiplier === 'rb') amount *= 1000;
      if (multiplier === 'jt') amount *= 1000000;

      return {
        source: 'regex',
        status: 'success',
        data: {
          amount,
          type: 'EXPENSE',
          category: 'UNCATEGORIZED', // We leave category mapping for Regex to a dictionary later
          subcategory: match[3].trim(),
          account: match[4].toUpperCase(),
          confidence: 1.0
        }
      };
    }

    // 2. FALLBACK (Gemini LLM Parser)
    this.logger.log('[Parser] Regex failed, falling back to Gemini LLM...');
    return await this.callGemini(text);
  }

  private async callGemini(text: string) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-flash-latest',
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              amount: { type: SchemaType.NUMBER, description: "Exact transaction amount (e.g., 50000 for 50k, 10000 for ceban)" },
              type: { type: SchemaType.STRING, format: "enum", enum: ["EXPENSE", "INCOME", "TRANSFER"], description: "Type of transaction" },
              category: { type: SchemaType.STRING, format: "enum", enum: ["Food & Drink", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Income", "Other"], description: "Top level category" },
              subcategory: { type: SchemaType.STRING, description: "Specific subcategory, item name, or merchant" },
              account: { type: SchemaType.STRING, description: "Payment method/bank (e.g., BCA, GoPay, Cash)" },
              confidence: { type: SchemaType.NUMBER, description: "Confidence score (0.0 to 1.0)" }
            },
            required: ["amount", "type", "category", "confidence"],
          },
        },
      });

      const prompt = `
      You are an Indonesian expense tracker assistant.
      Extract transaction details from the following raw text message.
      Account for Indonesian slang (k = ribu, jt = juta, ceban = 10k, goceng = 5k, etc).
      If the account is not mentioned, guess it or leave it empty.
      
      Raw Message: "${text}"
      `;

      const result = await model.generateContent(prompt);
      const jsonText = result.response.text();

      return {
        source: 'gemini',
        status: 'success',
        data: JSON.parse(jsonText)
      };
    } catch (error) {
      this.logger.error('[Parser] Gemini failed', error);
      return {
        source: 'gemini',
        status: 'error',
        message: error.message
      };
    }
  }
}
