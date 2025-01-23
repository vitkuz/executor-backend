import { generateImageAndSave } from '../../services/replicate';

export interface ReelEpisode {
    day: number;
    event: string;
    image_prompt: string;
    voice_narration: string;
}

export interface ReelEpisodesRecord {
    id: string;
    type: string;
    content: ReelEpisode[];
    createdAt: string;
}

export interface ImageGenerationResult {
    episodeIndex: number;
    s3Keys: string[];
    error?: string;
    imagePrompt: string;
}

export interface ImagesRecord {
    id: string;
    type: string;
    content: {
        images: ImageGenerationResult[];
        reelEpisodesId: string;
    };
    createdAt: string;
}

export async function createImages(reelEpisodesRecord: ReelEpisodesRecord, executionId: string): Promise<ImagesRecord> {
    try {
        console.log('\n🎨 Starting image generation...');
        console.log('📄 Input Record Details:');
        console.log(`  🆔 Record ID: ${reelEpisodesRecord.id}`);
        console.log(`  📅 Created At: ${reelEpisodesRecord.createdAt}`);
        console.log(`  📝 Episodes Count: ${reelEpisodesRecord.content.length}`);

        const images: ImageGenerationResult[] = [];
        let successCount = 0;
        let failureCount = 0;

        // Process each episode's image prompt
        for (const [index, episode] of reelEpisodesRecord.content.entries()) {
            console.log(`\n🎬 Episode ${index + 1}/${reelEpisodesRecord.content.length}:`);
            console.log(`  📅 Day: ${episode.day}`);
            console.log(`  📝 Event: ${episode.event}`);
            console.log(`  🎨 Image Prompt: ${episode.image_prompt}`);

            try {
                const s3KeyPrefix = `${executionId}/images/${reelEpisodesRecord.id}/episode-${index + 1}`;
                console.log(`  🔑 Target S3 Key Prefix: ${s3KeyPrefix}`);
                console.log('  ⚙️ Replicate Configuration:');
                console.log('    - Model: dev');
                console.log('    - Aspect Ratio: 9:16');
                console.log('    - Output Format: jpg');

                console.log('  🎨 Generating image...');
                const result = await generateImageAndSave(
                    episode.image_prompt,
                    s3KeyPrefix,
                    {
                        aspect_ratio: '9:16',
                        output_format: 'jpg',
                        num_outputs: 1
                    }
                );

                if (result.error) {
                    throw new Error(result.error);
                }

                images.push({
                    imagePrompt: episode.image_prompt,
                    episodeIndex: index,
                    s3Keys: result.s3Keys
                });
                successCount++;

                console.log('  ✅ Image generated and saved successfully');
                console.log(`  📂 Saved to: ${result.s3Keys.join(', ')}`);
            } catch (error) {
                failureCount++;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`  ❌ Error generating image:`);
                console.error(`    - Message: ${errorMessage}`);
                if (error instanceof Error && error.stack) {
                    console.error(`    - Stack: ${error.stack}`);
                }

                images.push({
                    imagePrompt: episode.image_prompt,
                    episodeIndex: index,
                    s3Keys: [],
                    error: errorMessage
                });
            }
        }

        // Create the record
        console.log('\n📊 Generation Summary:');
        console.log(`  ✅ Successful: ${successCount}`);
        console.log(`  ❌ Failed: ${failureCount}`);
        console.log(`  📊 Success Rate: ${((successCount / reelEpisodesRecord.content.length) * 100).toFixed(1)}%`);

        const record: ImagesRecord = {
            id: `images-${Date.now()}`,
            type: 'images',
            content: {
                images,
                reelEpisodesId: reelEpisodesRecord.id
            },
            createdAt: new Date().toISOString()
        };

        console.log('\n📝 Created Images Record:');
        console.log(`  🆔 Record ID: ${record.id}`);
        console.log(`  📅 Created At: ${record.createdAt}`);
        console.log(`  🔗 Reel Episodes ID: ${record.content.reelEpisodesId}`);
        console.log(`  📊 Total Images: ${record.content.images.length}`);

        return record;
    } catch (error) {
        console.error('\n❌ Fatal Error in createImages:');
        console.error('  📄 Error Details:');
        if (error instanceof Error) {
            console.error(`    - Message: ${error.message}`);
            console.error(`    - Stack: ${error.stack}`);
        } else {
            console.error(`    - Unknown error: ${error}`);
        }
        throw error;
    }
}