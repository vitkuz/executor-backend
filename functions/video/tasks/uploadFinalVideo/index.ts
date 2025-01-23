import { copyObject } from '../../services/s3';

export interface VideoResult {
    episodeIndex: number;
    s3Key: string;
    error?: string;
}

export interface VideosRecord {
    id: string;
    type: string;
    content: {
        videos: VideoResult[];
        mergedVideo: {
            s3Key: string;
            error?: string;
        };
        reelEpisodesId: string;
    };
    createdAt: string;
}

export interface FinalVideoRecord {
    id: string;
    type: string;
    content: {
        originalVideoKey: string;
        finalVideoKey: string;
        reelEpisodesId: string;
    };
    createdAt: string;
}

export async function uploadFinalVideo(
    videosRecord: VideosRecord,
    executionId: string
): Promise<FinalVideoRecord> {
    try {
        console.log('\n📤 Starting final video upload...');
        console.log('📄 Input Record:');
        console.log(`  🎬 Videos Record ID: ${videosRecord.id}`);
        console.log(`  🎥 Merged Video Key: ${videosRecord.content.mergedVideo.s3Key}`);

        if (!videosRecord.content.mergedVideo.s3Key) {
            throw new Error('No merged video available to upload');
        }

        // Generate the final video key
        const finalVideoKey = `${executionId}-final.mp4`;
        console.log(`  🔑 Final Video Key: ${finalVideoKey}`);

        // Copy the merged video to the final videos bucket
        console.log('  📋 Copying video to final bucket...');
        await copyObject(
            videosRecord.content.mergedVideo.s3Key,
            finalVideoKey,
            process.env.FINAL_VIDEOS_BUCKET_NAME!
        );
        console.log('  ✅ Video copied successfully');

        // Create the record
        const record: FinalVideoRecord = {
            id: `final-video-${Date.now()}`,
            type: 'final-video',
            content: {
                originalVideoKey: videosRecord.content.mergedVideo.s3Key,
                finalVideoKey,
                reelEpisodesId: videosRecord.content.reelEpisodesId
            },
            createdAt: new Date().toISOString()
        };

        console.log('\n📝 Created Final Video Record:');
        console.log(`  🆔 Record ID: ${record.id}`);
        console.log(`  📅 Created At: ${record.createdAt}`);
        console.log(`  🎬 Final Video Key: ${record.content.finalVideoKey}`);

        return record;
    } catch (error) {
        console.error('\n❌ Fatal Error in uploadFinalVideo:');
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