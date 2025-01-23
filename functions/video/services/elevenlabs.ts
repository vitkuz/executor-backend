import axios from 'axios';

const ELEVEN_LABS_API_TOKEN = process.env.ELEVEN_LABS_API_TOKEN!;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID!;

export interface TextToSpeechOptions {
    stability?: number;
    similarityBoost?: number;
    styleExaggeration?: number;
    modelId?: string;
}

export async function textToSpeech(
    text: string,
    options: TextToSpeechOptions = {}
): Promise<Buffer> {
    const {
        stability = 0.75,
        similarityBoost = 0.75,
        styleExaggeration = 0.30,
        modelId = 'eleven_multilingual_v2'
    } = options;

    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_LABS_VOICE_ID}`,
            {
                text,
                model_id: modelId,
                voice_settings: {
                    stability,
                    similarity_boost: similarityBoost,
                    style_exaggeration: styleExaggeration
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVEN_LABS_API_TOKEN
                },
                responseType: 'arraybuffer'
            }
        );

        return Buffer.from(response.data);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(`ElevenLabs API error: ${error.response?.data || error.message}`);
        }
        throw error;
    }
}

export async function textToSpeechAndSave(
    text: string,
    s3Key: string,
    options: TextToSpeechOptions = {}
): Promise<void> {
    const audioBuffer = await textToSpeech(text, options);

    // Import the S3 service here to avoid circular dependencies
    const { putObject } = await import('./s3');

    await putObject(s3Key, audioBuffer, {
        contentType: 'audio/mpeg',
        metadata: {
            'generated-by': 'elevenlabs',
            'generation-date': new Date().toISOString()
        }
    });
}

export interface BatchTextToSpeechResult {
    text: string;
    s3Key: string;
    error?: string;
}

export async function textToSpeechBatch(
    texts: string[],
    s3KeyPrefix: string,
    options: TextToSpeechOptions = {}
): Promise<BatchTextToSpeechResult[]> {
    const results: BatchTextToSpeechResult[] = [];

    for (const [index, text] of texts.entries()) {
        const s3Key = `${s3KeyPrefix}-${index}.mp3`;
        try {
            await textToSpeechAndSave(text, s3Key, options);
            results.push({ text, s3Key });
        } catch (error) {
            results.push({
                text,
                s3Key,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    return results;
}