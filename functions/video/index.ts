import {generateReelEpisodes} from "./tasks/askChatGPTCreateReelEpisodes";
import {createRecord, updateRecord} from "./services/dynamo";
import { v4 as uuidv4 } from 'uuid';
import {createVoiceNarrations} from "./tasks/createVoiceNarrations";
import {createImages} from "./tasks/createImages";
import {createVideos} from "./tasks/createVideos";
import {uploadFinalVideo} from "./tasks/uploadFinalVideo";
import {uploadRandomImage} from "./tasks/uploadRandomImage";
const ffmpeg = require('fluent-ffmpeg');

// Set FFmpeg path for the Lambda environment
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

enum TaskStatus {
    PENDING = 'pending',
    PROGRESS = 'progress',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

interface Execution {
    id: string;
    startTime?: string;
    endTime?: string;
    tasks: Array<{
        status: TaskStatus;
        result: any;
        error?: {
            message: string;
            stack?: string;
        };
    }>;
}

const tasks = [
    async (previousResults: any, executionId: string) => {
        const response = await generateReelEpisodes(previousResults, executionId);
        return response;
    },
    async (previousResults: any, executionId: string) => {
        const reelEpisodesRecord = previousResults[0];
        const response = await createVoiceNarrations(reelEpisodesRecord,executionId);
        return response;
    },
    async (previousResults: any, executionId: string) => {
        const reelEpisodesRecord = previousResults[0];
        const response = await createImages(reelEpisodesRecord,executionId);
        return response;
    },
    async (previousResults:any, executionId: string) => {
        const reelEpisodesRecord = previousResults[0];
        const voiceNarrationsRecord = previousResults[1];
        const imagesRecord = previousResults[2];
        const response = await createVideos(reelEpisodesRecord, voiceNarrationsRecord, imagesRecord,executionId);
        return response;
    },
    async (previousResults:any, executionId: string) => {
        const videosRecord = previousResults[3];
        const response = await uploadFinalVideo(videosRecord, executionId);
        return response;
    },
    async (previousResults:any, executionId: string) => {
        const imagesRecord = previousResults[2];
        const response = await uploadRandomImage(imagesRecord, executionId);
        return response;
    }
];

exports.handler = async () => {
    try {
        console.log('🚀 Starting pipeline execution...');

        // Create execution record
        const executionId = uuidv4();
        const execution: Execution = {
            id: executionId,
            startTime: new Date().toISOString(),
            tasks: tasks.map(() => ({
                status: TaskStatus.PENDING,
                result: null
            }))
        };

        // Save initial execution record
        await createRecord(execution);
        console.log('📝 Created execution record:', executionId);

        for (const [index, task] of tasks.entries()) {
            console.log(`\n📋 Executing task ${index + 1}/${tasks.length}...`);

            // Update task status to in progress
            execution.tasks[index].status = TaskStatus.PROGRESS;
            await updateRecord(executionId, execution);
            console.log('⏳ Updated task status to in progress');

            try {
                // Pass previous results to the task if it's not the first one
                const previousResults = execution.tasks
                    .slice(0, index)
                    .map(task => task.result)
                    .filter(result => result !== null);

                console.log(JSON.stringify(previousResults, null, 2))

                const taskResult = await task(previousResults, executionId);
                execution.tasks[index].result = taskResult;
                execution.tasks[index].status = TaskStatus.COMPLETED;
                await updateRecord(executionId, execution);
            } catch (error) {
                execution.tasks[index].status = TaskStatus.FAILED;
                execution.tasks[index].error = {
                    message: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                };
                await updateRecord(executionId, execution);
                throw error;
            }



            console.log(`✅ Task ${index + 1} completed`);
        }
        execution.endTime = new Date().toISOString();
        await updateRecord(executionId, execution);
        console.log('\n🎉 Pipeline completed successfully!');
        return execution;
    } catch (error) {
        console.error('\n❌ Pipeline failed:', error);
        throw error;
    }
};