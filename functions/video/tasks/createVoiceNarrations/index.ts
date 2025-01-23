import { textToSpeechAndSave } from '../../services/elevenlabs';

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

export interface VoiceNarrationResult {
    episodeIndex: number;
    s3Key: string;
    error?: string;
    voiceNarration: string;
}

export interface VoiceNarrationsRecord {
    id: string;
    type: string;
    content: {
        narrations: VoiceNarrationResult[];
        reelEpisodesId: string;
    };
    createdAt: string;
}
export async function createVoiceNarrations(reelEpisodesRecord: ReelEpisodesRecord, executionId: string): Promise<VoiceNarrationsRecord> {

    console.log('createVoiceNarrations',JSON.stringify(reelEpisodesRecord, null, 2))
    try {
        console.log('\n🎙️ Starting voice narrations generation...');
        console.log('📄 Input Record Details:');
        console.log(`  🆔 Record ID: ${reelEpisodesRecord.id}`);
        console.log(`  📅 Created At: ${reelEpisodesRecord.createdAt}`);
        console.log(`  📝 Episodes Count: ${reelEpisodesRecord.content.length}`);

        const narrations: VoiceNarrationResult[] = [];
        let successCount = 0;
        let failureCount = 0;

        // Process each episode's voice narration
        for (const [index, episode] of reelEpisodesRecord.content.entries()) {
            console.log(`\n🎬 Episode ${index + 1}/${reelEpisodesRecord.content.length}:`);
            console.log(`  📅 Day: ${episode.day}`);
            console.log(`  📝 Event: ${episode.event}`);
            console.log(`  🗣️ Voice Narration Length: ${episode.voice_narration.length} characters`);

            try {
                const s3Key = `${executionId}/narrations/${reelEpisodesRecord.id}/episode-${index + 1}.mp3`;
                console.log(`  🔑 Target S3 Key: ${s3Key}`);
                console.log('  ⚙️ TTS Configuration:');
                console.log('    - Model: eleven_multilingual_v2');
                console.log('    - Stability: 0.75');
                console.log('    - Similarity Boost: 0.75');
                console.log('    - Style Exaggeration: 0.30');

                console.log('  🎙️ Converting text to speech...');
                await textToSpeechAndSave(
                    episode.voice_narration,
                    s3Key,
                    {
                        stability: 0.75,
                        similarityBoost: 0.75,
                        styleExaggeration: 0.30,
                        modelId: 'eleven_multilingual_v2'
                    }
                );

                narrations.push({
                    voiceNarration: episode.voice_narration,
                    episodeIndex: index,
                    s3Key
                });
                successCount++;

                console.log('  ✅ Narration generated and saved successfully');
                console.log(`  📂 Saved to: ${s3Key}`);
            } catch (error) {
                failureCount++;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`  ❌ Error generating narration:`);
                console.error(`    - Message: ${errorMessage}`);
                if (error instanceof Error && error.stack) {
                    console.error(`    - Stack: ${error.stack}`);
                }

                narrations.push({
                    voiceNarration: episode.voice_narration,
                    episodeIndex: index,
                    s3Key: '',
                    error: errorMessage
                });
            }
        }

        // Create the record
        console.log('\n📊 Generation Summary:');
        console.log(`  ✅ Successful: ${successCount}`);
        console.log(`  ❌ Failed: ${failureCount}`);
        console.log(`  📊 Success Rate: ${((successCount / reelEpisodesRecord.content.length) * 100).toFixed(1)}%`);

        const record: VoiceNarrationsRecord = {
            id: `narrations-${Date.now()}`,
            type: 'voice-narrations',
            content: {
                narrations,
                reelEpisodesId: reelEpisodesRecord.id
            },
            createdAt: new Date().toISOString()
        };

        console.log('\n📝 Created Voice Narrations Record:');
        console.log(`  🆔 Record ID: ${record.id}`);
        console.log(`  📅 Created At: ${record.createdAt}`);
        // console.log(`  🔗 Reel Episodes ID: ${record.content.reelEpisodesId}`);
        // console.log(`  📊 Total Narrations: ${record.content.narrations.length}`);

        return record;
    } catch (error) {
        console.error('\n❌ Fatal Error in createVoiceNarrations:');
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