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

  async parseMessage(text: string, context?: any) {
    this.logger.log(`[Parser] Received text: ${text}`);

    // Call Gemini LLM Parser as the primary parser
    try {
      return await this.callGemini(text, context);
    } catch (e) {
      this.logger.warn('[Parser] Gemini failed, falling back to Regex...', e);
      // Fallback (Regex Parser)
      const amountMatch = text.match(/(\d+)(k|rb|jt)?/i);
      const accountMatch = text.match(/\b(bca|gopay|ovo|dana|cash)\b/i);

      if (amountMatch) {
        let amount = parseInt(amountMatch[1]);
        const multiplier = amountMatch[2]?.toLowerCase();
        if (multiplier === 'k' || multiplier === 'rb') amount *= 1000;
        if (multiplier === 'jt') amount *= 1000000;

        let subcategory = text
          .replace(amountMatch[0], '')
          .replace(accountMatch?.[0] || '', '')
          .trim();

        if (!subcategory) subcategory = 'Lainnya';

        let type = 'EXPENSE';
        if (text.toLowerCase().includes('gaji') || text.toLowerCase().includes('terima') || text.toLowerCase().includes('masuk')) {
          type = 'INCOME';
        } else if (text.toLowerCase().includes('transfer') || text.toLowerCase().includes('top up') || text.toLowerCase().includes('isi')) {
          type = 'TRANSFER';
        }

        return {
          source: 'regex_fallback',
          status: 'success',
          data: {
            amount,
            type: type,
            category: 'UNCATEGORIZED',
            subcategory,
            fromAccount: type !== 'INCOME' ? (accountMatch?.[1] || 'CASH').toUpperCase() : undefined,
            toAccount: type !== 'EXPENSE' ? (accountMatch?.[1] || 'CASH').toUpperCase() : undefined,
            confidence: 0.5
          }
        };
      }

      return { source: 'regex_fallback', status: 'error', message: 'Could not parse message' };
    }
  }

  private async callGemini(text: string, context?: any, retries = 2) {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            amount: { type: SchemaType.NUMBER, description: "Exact transaction amount (e.g., 50000 for 50k, 10000 for ceban)" },
            type: { type: SchemaType.STRING, format: "enum", enum: ["EXPENSE", "INCOME", "TRANSFER"], description: "Type of transaction" },
            category: { type: SchemaType.STRING, format: "enum", enum: ["FOOD", "TRANSPORT", "SHOPPING", "BILLS", "HEALTH", "ENTERTAINMENT", "INCOME", "OTHER"], description: "Top level category (uppercase)" },
            subcategory: { type: SchemaType.STRING, description: "Specific subcategory, item name, or merchant" },
            fromAccount: { type: SchemaType.STRING, description: "Source payment method/bank (e.g., BCA, GoPay, Cash) for EXPENSE or TRANSFER" },
            toAccount: { type: SchemaType.STRING, description: "Destination payment method/bank for INCOME or TRANSFER" },
            confidence: { type: SchemaType.NUMBER, description: "Confidence score (0.0 to 1.0)" }
          },
          required: ["amount", "type", "category", "confidence"],
        },
      },
    });

    const accountsStr = context?.accounts ? `\n    Available User Accounts: ${context.accounts}` : '';

    const prompt = `
    You are an Indonesian expense tracker assistant.
    Extract transaction details from the following raw text message.
    Account for Indonesian slang (k = ribu, jt = juta, ceban = 10k, goceng = 5k, etc).${accountsStr}
    If the user mentions an account/payment method, accurately match it to one of the Available User Accounts.
    For EXPENSE, populate 'fromAccount'. For INCOME, populate 'toAccount'.
    For TRANSFER, populate BOTH 'fromAccount' (source) and 'toAccount' (destination).
    If an account is not mentioned, guess it based on context or leave it empty.
    
    Raw Message: "${text}"
    Make no mistakes.
    `;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const jsonText = result.response.text();
        const parsedData = JSON.parse(jsonText);

        if (parsedData.category) {
          parsedData.category = parsedData.category.toUpperCase();
        }

        return {
          source: 'gemini',
          status: 'success',
          data: parsedData
        };
      } catch (error) {
        this.logger.warn(`[Parser] Gemini attempt ${attempt} failed: ${error.message}`);
        if (attempt === retries) {
          this.logger.error('[Parser] All Gemini retries failed.');
          throw error; // Throw so the caller (parseMessage) can catch it and fallback to Regex
        }
        // Wait 1 second before retrying
        await new Promise(res => setTimeout(res, 1000));
      }
    }
  }
}
