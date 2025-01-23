import { copyObject } from '../../services/s3';

export interface ImageGenerationResult {
    episodeIndex: number;
    s3Keys: string[];
    error?: string;
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

export interface RandomImageRecord {
    id: string;
    type: string;
    content: {
        originalImageKey: string;
        finalImageKey: string;
        reelEpisodesId: string;
    };
    createdAt: string;
}

export async function uploadRandomImage(
    imagesRecord: ImagesRecord,
    executionId: string
): Promise<RandomImageRecord> {
    try {
        console.log('\n🎨 Starting random image upload...');
        console.log('📄 Input Record:');
        console.log(`  🖼️ Images Record ID: ${imagesRecord.id}`);

        // Get all successful image generations
        const successfulImages = imagesRecord.content.images
            .filter(img => !img.error && img.s3Keys.length > 0)
            .flatMap(img => img.s3Keys);

        if (successfulImages.length === 0) {
            throw new Error('No successful images available to choose from');
        }

        // Select a random image
        const randomIndex = Math.floor(Math.random() * successfulImages.length);
        const selectedImageKey = successfulImages[randomIndex];
        console.log(`  🎲 Selected Random Image: ${selectedImageKey}`);

        // Generate the final image key
        const finalImageKey = `${executionId}-thumbnail.jpg`;
        console.log(`  🔑 Final Image Key: ${finalImageKey}`);

        // Copy the selected image to the final videos bucket
        console.log('  📋 Copying image to final bucket...');
        await copyObject(
            selectedImageKey,
            finalImageKey,
            process.env.FINAL_VIDEOS_BUCKET_NAME!
        );
        console.log('  ✅ Image copied successfully');

        // Create the record
        const record: RandomImageRecord = {
            id: `random-image-${Date.now()}`,
            type: 'random-image',
            content: {
                originalImageKey: selectedImageKey,
                finalImageKey,
                reelEpisodesId: imagesRecord.content.reelEpisodesId
            },
            createdAt: new Date().toISOString()
        };

        console.log('\n📝 Created Random Image Record:');
        console.log(`  🆔 Record ID: ${record.id}`);
        console.log(`  📅 Created At: ${record.createdAt}`);
        console.log(`  🖼️ Final Image Key: ${record.content.finalImageKey}`);

        return record;
    } catch (error) {
        console.error('\n❌ Fatal Error in uploadRandomImage:');
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