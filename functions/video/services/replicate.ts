import axios from "axios";
const Replicate = require('replicate');

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;
const REPLICATE_MODEL_ID = 'vitkuz/lily:70a95a700a394552368f765fee2e22aa77d6addb933ba3ad914683c5e11940e1';

export interface ReplicateImageParams {
    model?: string;
    go_fast?: boolean;
    lora_scale?: number;
    megapixels?: string;
    num_outputs?: number;
    aspect_ratio?: string;
    output_format?: string;
    guidance_scale?: number;
    output_quality?: number;
    prompt_strength?: number;
    extra_lora_scale?: number;
    num_inference_steps?: number;
}

const DEFAULT_REPLICATE_INPUT_PARAMS: ReplicateImageParams = {
    model: 'dev',
    go_fast: false,
    lora_scale: 1,
    megapixels: '1',
    num_outputs: 1,
    aspect_ratio: '9:16',
    output_format: 'jpg',
    guidance_scale: 3,
    output_quality: 100,
    prompt_strength: 0.8,
    extra_lora_scale: 1,
    num_inference_steps: 28,
};

const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
});

export interface GenerateImageResult {
    urls: string[];
    error?: string;
}

export async function generateImage(
    prompt: string,
    params: Partial<ReplicateImageParams> = {}
): Promise<GenerateImageResult> {
    try {
        console.log('Sending image generation request to Replicate...');
        const output = await replicate.run(
            REPLICATE_MODEL_ID,
            {
                input: {
                    ...DEFAULT_REPLICATE_INPUT_PARAMS,
                    ...params,
                    prompt
                }
            }
        );

        if (!output || !Array.isArray(output)) {
            throw new Error('Invalid response from Replicate');
        }

        console.log('Image generated successfully');
        return { urls: output as string[] };
    } catch (error) {
        console.error('Error generating image:', error);
        return {
            urls: [],
            error: error instanceof Error ? error.message : 'Unknown error generating image'
        };
    }
}

export interface BatchGenerateImageResult {
    prompt: string;
    result: GenerateImageResult;
}

export async function generateImageBatch(
    prompts: string[],
    params: Partial<ReplicateImageParams> = {}
): Promise<BatchGenerateImageResult[]> {
    const results: BatchGenerateImageResult[] = [];

    for (const prompt of prompts) {
        const result = await generateImage(prompt, params);
        results.push({ prompt, result });
    }

    return results;
}


export interface GenerateAndSaveResult {
    urls: string[];
    s3Keys: string[];
    error?: string;
    imagePrompt: string;
}

export async function generateImageAndSave(
    imagePrompt: string,
    s3KeyPrefix: string,
    params: Partial<ReplicateImageParams> = {}
): Promise<GenerateAndSaveResult> {
    try {
        const imageResult = await generateImage(imagePrompt, params);

        if (imageResult.error) {
            return { ...imageResult, s3Keys: [], imagePrompt };
        }

        const s3Keys: string[] = [];

        // Import the S3 service here to avoid circular dependencies
        const { putObject } = await import('./s3');

        // Download and save each generated image
        for (const [index, url] of imageResult.urls.entries()) {
            try {
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data);
                const s3Key = `${s3KeyPrefix}-${index}.jpg`;

                await putObject(s3Key, imageBuffer, {
                    contentType: 'image/jpeg',
                    metadata: {
                        'generated-by': 'replicate',
                        'model-id': REPLICATE_MODEL_ID,
                        'imagePrompt': imagePrompt,
                        'generation-date': new Date().toISOString()
                    }
                });

                s3Keys.push(s3Key);
            } catch (error) {
                console.error('Error saving image to S3:', error);
                // Continue with other images even if one fails
            }
        }

        return {
            imagePrompt,
            urls: imageResult.urls,
            s3Keys,
            error: s3Keys.length === 0 ? 'Failed to save any images to S3' : undefined
        };
    } catch (error) {
        console.error('Error in generateImageAndSave:', error);
        return {
            imagePrompt,
            urls: [],
            s3Keys: [],
            error: error instanceof Error ? error.message : 'Unknown error in generateImageAndSave'
        };
    }
}

export interface BatchGenerateAndSaveResult {
    prompt: string;
    result: GenerateAndSaveResult;
}

export async function generateImageAndSaveBatch(
    prompts: string[],
    s3KeyPrefix: string,
    params: Partial<ReplicateImageParams> = {}
): Promise<BatchGenerateAndSaveResult[]> {
    const results: BatchGenerateAndSaveResult[] = [];

    for (const [index, prompt] of prompts.entries()) {
        const result = await generateImageAndSave(
            prompt,
            `${s3KeyPrefix}-${index}`,
            params
        );
        results.push({ prompt, result });
    }

    return results;
}