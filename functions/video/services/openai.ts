import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export interface ChatOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export async function generateChatResponse(
    userInput: string,
    options: ChatOptions = {}
): Promise<string> {
    const {
        model = 'gpt-4',
        temperature = 0.7,
        // maxTokens = 1000
    } = options;

    try {
        const chatCompletion = await client.chat.completions.create({
            messages: [{ role: 'user', content: userInput }],
            model,
            temperature,
            // max_tokens: maxTokens
        });

        const assistantReply = chatCompletion.choices[0].message.content;
        if (!assistantReply) {
            throw new Error('No response received from OpenAI');
        }

        return assistantReply.trim();
    } catch (error) {
        if (error instanceof OpenAI.APIError) {
            throw new Error(`OpenAI API error: ${error.message}`);
        }
        throw error;
    }
}

// export interface BatchChatResult {
//     input: string;
//     response?: string;
//     error?: string;
// }

// export async function generateChatResponseBatch(
//     inputs: string[],
//     options: ChatOptions = {}
// ): Promise<BatchChatResult[]> {
//     const results: BatchChatResult[] = [];
//
//     for (const input of inputs) {
//         try {
//             const response = await generateChatResponse(input, options);
//             results.push({ input, response });
//         } catch (error) {
//             results.push({
//                 input,
//                 error: error instanceof Error ? error.message : 'Unknown error'
//             });
//         }
//     }
//
//     return results;
// }