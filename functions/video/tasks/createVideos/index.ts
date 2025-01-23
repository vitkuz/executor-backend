import {createVideo, mergeVideos} from '../../services/video';

export interface ReelEpisode {
    day: number;
    event: string;
    image_prompt: string;
    voice_narration: string;
}

export interface VoiceNarrationResult {
    episodeIndex: number;
    s3Key: string;
    error?: string;
}

export interface ImageGenerationResult {
    episodeIndex: number;
    s3Keys: string[];
    error?: string;
}

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

export async function createVideos(
    reelEpisodesRecord: any,
    voiceNarrationsRecord: any,
    imagesRecord: any,
    executionId: string
): Promise<VideosRecord> {
    try {
        console.log('\n🎥 Starting video creation...');
        console.log('📄 Input Records:');
        console.log(`  🎬 Reel Episodes ID: ${reelEpisodesRecord.id}`);
        console.log(`  🎙️ Voice Narrations ID: ${voiceNarrationsRecord.id}`);
        console.log(`  🖼️ Images ID: ${imagesRecord.id}`);

        const videos: VideoResult[] = [];
        let successCount = 0;
        let failureCount = 0;

        // Create individual videos for each episode
        for (const [index, episode] of reelEpisodesRecord.content.entries()) {
            console.log(`\n🎬 Processing Episode ${index + 1}/${reelEpisodesRecord.content.length}:`);

            try {
                const narration = voiceNarrationsRecord.content.narrations.find(
                    (n: VoiceNarrationResult) => n.episodeIndex === index
                );
                const image = imagesRecord.content.images.find(
                    (i: ImageGenerationResult) => i.episodeIndex === index
                );

                if (!narration?.s3Key || !image?.s3Keys?.length) {
                    throw new Error('Missing required assets');
                }

                const outputKey = `${executionId}/videos/${reelEpisodesRecord.id}/episode-${index + 1}.mp4`;
                console.log(`  📂 Creating video: ${outputKey}`);
                console.log(`    🖼️ Using image: ${image.s3Keys[0]}`);
                console.log(`    🎙️ Using audio: ${narration.s3Key}`);

                const videoKey = await createVideo(
                    image.s3Keys[0],
                    narration.s3Key,
                    outputKey,
                    {
                        resolution: { width: 1080, height: 1920 } // 9:16 aspect ratio for Reels
                    }
                );

                videos.push({
                    episodeIndex: index,
                    s3Key: videoKey
                });
                successCount++;
                console.log('  ✅ Video created successfully');

            } catch (error) {
                failureCount++;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`  ❌ Error creating video:`);
                console.error(`    - Message: ${errorMessage}`);

                videos.push({
                    episodeIndex: index,
                    s3Key: '',
                    error: errorMessage
                });
            }
        }

        // Merge all successful videos
        console.log('\n🎬 Merging videos...');
        const successfulVideos = videos.filter(v => !v.error).map(v => v.s3Key);
        const mergedVideoKey = `${executionId}/videos/${reelEpisodesRecord.id}/merged.mp4`;

        let mergedVideo = { s3Key: '', error: undefined };
        if (successfulVideos.length > 0) {
            try {
                const mergeResult = await mergeVideos(successfulVideos, mergedVideoKey);
                mergedVideo = {
                    s3Key: mergeResult.outputKey,
                    // @ts-ignore
                    error: mergeResult.error
                };
                console.log('  ✅ Videos merged successfully');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('  ❌ Error merging videos:', errorMessage);
                // @ts-ignore
                mergedVideo.error = errorMessage;
            }
        } else {
            // @ts-ignore
            mergedVideo.error = 'No successful videos to merge';
        }

        // Create the record
        console.log('\n📊 Creation Summary:');
        console.log(`  ✅ Successful: ${successCount}`);
        console.log(`  ❌ Failed: ${failureCount}`);
        console.log(`  📊 Success Rate: ${((successCount / reelEpisodesRecord.content.length) * 100).toFixed(1)}%`);

        const record: VideosRecord = {
            id: `videos-${Date.now()}`,
            type: 'videos',
            content: {
                videos,
                mergedVideo,
                reelEpisodesId: reelEpisodesRecord.id
            },
            createdAt: new Date().toISOString()
        };

        console.log('\n📝 Created Videos Record:');
        console.log(`  🆔 Record ID: ${record.id}`);
        console.log(`  📅 Created At: ${record.createdAt}`);
        console.log(`  📊 Total Videos: ${videos.length}`);
        console.log(`  🎬 Merged Video: ${mergedVideo.s3Key || 'Failed'}`);

        return record;
    } catch (error) {
        console.error('\n❌ Fatal Error in createVideos:');
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