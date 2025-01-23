import { createRecord, getRecordById, updateRecord, deleteRecordById, getAllRecords } from './services/dynamo';
import { getObject, putObject, deleteObject } from './services/s3';
import { textToSpeechAndSave, textToSpeechBatch } from './services/elevenlabs';
import { generateChatResponse } from './services/openai';
import { generateImage, generateImageBatch, generateImageAndSave, generateImageAndSaveBatch } from './services/replicate';
import {createVideo, createVideoBatch, mergeVideos} from "./services/video";
import axios from 'axios';
const ffmpeg = require('fluent-ffmpeg');

// Set FFmpeg path for the Lambda environment
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

exports.handler = async () => {
    try {
        // Test FFmpeg using command() to get version
        const version = await new Promise((resolve, reject) => {
            ffmpeg()
                .on('error', reject)
                .on('end', () => resolve('FFmpeg is available'))
                .outputOptions('-version')
                .save('/dev/null');
        });

        console.log('FFmpeg is working! Version info:', version);

        // Test S3 operations
        console.log('\nTesting S3 operations...');

        // Create test content
        const testKey = `test-${Date.now()}.txt`;
        const testContent = 'Hello S3!';

        // Test putObject
        console.log('\nUploading test file to S3...');
        await putObject(testKey, testContent, {
            contentType: 'text/plain',
            metadata: {
                'test-id': Date.now().toString(),
                'test-type': 'integration-test'
            }
        });
        console.log('Upload successful');

        // Test getObject
        console.log('\nRetrieving file from S3...');
        const retrieved = await getObject(testKey);
        const chunks: Buffer[] = [];
        for await (const chunk of retrieved.body) {
            chunks.push(Buffer.from(chunk));
        }
        const content = Buffer.concat(chunks).toString('utf-8');
        console.log('Retrieved content:', content);
        console.log('Content type:', retrieved.contentType);
        console.log('Metadata:', retrieved.metadata);

        // Test deleteObject
        console.log('\nDeleting file from S3...');
        await deleteObject(testKey);
        console.log('File deleted');

        // Verify deletion (this should throw an error)
        let deletionVerified = false;
        try {
            await getObject(testKey);
        } catch (error) {
            console.log('Deletion verified - file no longer exists');
            deletionVerified = true;
        }

        // Test ElevenLabs TTS
        if (process.env.ELEVEN_LABS_API_TOKEN && process.env.ELEVEN_LABS_VOICE_ID) {
            console.log('\nTesting ElevenLabs text-to-speech...');

            const testText = 'Hello, this is a test of the ElevenLabs text-to-speech service.';
            const audioKey = `test-audio-${Date.now()}.mp3`;

            console.log('Converting text to speech and saving to S3...');
            await textToSpeechAndSave(testText, audioKey);
            console.log('Audio file saved to S3:', audioKey);

            // Clean up test audio file
            await deleteObject(audioKey);
            console.log('Test audio file deleted');
        }

        // Test batch text-to-speech
        if (process.env.ELEVEN_LABS_API_TOKEN && process.env.ELEVEN_LABS_VOICE_ID) {
            console.log('\nTesting batch text-to-speech...');

            const testTexts = [
                'First test sentence.',
                'Second test sentence.',
                'Third test sentence.'
            ];

            console.log('Converting multiple texts to speech...');
            const results = await textToSpeechBatch(testTexts, `test-batch-${Date.now()}`);
            console.log('Batch conversion results:', results);

            // Clean up test audio files
            for (const result of results) {
                if (!result.error) {
                    await deleteObject(result.s3Key);
                }
            }
            console.log('Test audio files deleted');
        }

        // Test OpenAI chat
        if (process.env.OPENAI_API_KEY) {
            console.log('\nTesting OpenAI chat...');

            const testPrompt = 'What is the capital of France?';
            console.log('Sending test prompt:', testPrompt);
            const response = await generateChatResponse(testPrompt);
            console.log('Chat response:', response);
        }

        let singleGenerationSuccess = false;
        let batchGenerationSuccess = false;
        let singleSaveSuccess = false;
        let batchSaveSuccess = false;
        if (process.env.REPLICATE_API_TOKEN) {
            // Variables to track test results
            console.log('\nTesting Replicate image generation...');

            const imagePrompt = 'A beautiful sunset over mountains';
            console.log('Generating image with prompt:', imagePrompt);
            const imageResult = await generateImage(imagePrompt);

            if (imageResult.error) {
                console.error('Image generation error:', imageResult.error);
            } else {
                console.log('Generated image URLs:', imageResult.urls);

                // Save the generated images to S3
                for (const [index, url] of imageResult.urls.entries()) {
                    try {
                        const response = await axios.get(url, { responseType: 'arraybuffer' });
                        const imageBuffer = Buffer.from(response.data);
                        const s3Key = `test-image-${Date.now()}-${index}.jpg`;

                        await putObject(s3Key, imageBuffer, {
                            contentType: 'image/jpeg',
                            metadata: {
                                'generated-by': 'replicate',
                                'prompt': imagePrompt
                            }
                        });
                        console.log('Saved generated image to S3:', s3Key);
                    } catch (error) {
                        console.error('Error saving image to S3:', error);
                    }
                }
                singleGenerationSuccess = true;
            }

            // Test batch image generation
            console.log('\nTesting batch image generation...');
            const imagePrompts = [
                'A serene lake at dawn',
                'A bustling cityscape at night'
            ];

            const batchResults = await generateImageBatch(imagePrompts);
            console.log('Batch generation results:', batchResults);
            batchGenerationSuccess = batchResults.every(r => !r.result.error);

            // Test generateImageAndSave
            console.log('\nTesting generateImageAndSave...');
            const savePrompt = 'A majestic mountain range at sunset';
            const s3KeyPrefix = `test-save-${Date.now()}`;

            console.log('Testing image generation and save with prompt:', savePrompt);
            const saveResult = await generateImageAndSave(savePrompt, s3KeyPrefix);
            singleSaveSuccess = !saveResult.error;
            console.log('Generate and save result:', saveResult);

            // Clean up saved images
            if (saveResult.s3Keys.length > 0) {
                console.log('Cleaning up saved test images...');
                for (const s3Key of saveResult.s3Keys) {
                    await deleteObject(s3Key);
                }
                console.log('Test images cleaned up');
            }

            // Test generateImageAndSaveBatch
            console.log('\nTesting generateImageAndSaveBatch...');
            const saveBatchPrompts = [
                'A peaceful garden with blooming flowers',
                'A cozy mountain cabin in winter'
            ];
            const batchS3KeyPrefix = `test-batch-save-${Date.now()}`;

            console.log('Testing batch generation and save with prompts:', saveBatchPrompts);
            const saveBatchResults = await generateImageAndSaveBatch(saveBatchPrompts, batchS3KeyPrefix);
            console.log('Batch generate and save results:', saveBatchResults);
            batchSaveSuccess = saveBatchResults.every(r => !r.result.error);

            // Clean up batch saved images
            console.log('Cleaning up batch test images...');
            for (const result of saveBatchResults) {
                if (result.result.s3Keys.length > 0) {
                    for (const s3Key of result.result.s3Keys) {
                        await deleteObject(s3Key);
                    }
                }
            }
            console.log('Batch test images cleaned up');
        }

        // Test Video Merging
        console.log('\n🎥 Testing Video Merge Functionality...');

        if (!process.env.ELEVEN_LABS_API_TOKEN || !process.env.ELEVEN_LABS_VOICE_ID) {
            console.log('⚠️ Skipping video merge test: ElevenLabs credentials not configured');
        } else {
            try {
                // Step 1: Create multiple test videos
                console.log('\n1️⃣ Creating test videos for merging...');

                const testVideos = [
                    {
                        text: 'This is the first test video.',
                        imagePrompt: 'A beautiful sunrise over mountains',
                    },
                    {
                        text: 'This is the second test video.',
                        imagePrompt: 'A peaceful lake at sunset',
                    }
                ];

                const videoKeys: string[] = [];

                for (const [index, test] of testVideos.entries()) {
                    console.log(`\n📽️ Creating test video ${index + 1}/${testVideos.length}`);

                    // Generate audio
                    const audioKey = `test-merge-audio-${index}-${Date.now()}.mp3`;
                    await textToSpeechAndSave(test.text, audioKey);
                    console.log(`✅ Audio generated: ${audioKey}`);

                    // Generate image
                    const imageResult = await generateImageAndSave(
                        test.imagePrompt,
                        `test-merge-image-${index}-${Date.now()}`
                    );
                    if (imageResult.error || imageResult.s3Keys.length === 0) {
                        throw new Error(`Failed to generate image: ${imageResult.error}`);
                    }
                    const imageKey = imageResult.s3Keys[0];
                    console.log(`✅ Image generated: ${imageKey}`);

                    // Create video
                    const videoKey = `test-merge-video-${index}-${Date.now()}.mp4`;
                    await createVideo(imageKey, audioKey, videoKey);
                    console.log(`✅ Video created: ${videoKey}`);

                    videoKeys.push(videoKey);

                    // Clean up individual components
                    await deleteObject(audioKey);
                    await deleteObject(imageKey);
                }

                // Step 2: Merge the videos
                console.log('\n2️⃣ Testing video merge...');
                const mergedVideoKey = `test-merged-${Date.now()}.mp4`;
                const mergeResult = await mergeVideos(videoKeys, mergedVideoKey);

                if (mergeResult.error) {
                    throw new Error(`Failed to merge videos: ${mergeResult.error}`);
                }

                console.log('✅ Videos merged successfully:', mergeResult.outputKey);

                // Step 3: Clean up
                console.log('\n3️⃣ Cleaning up test files...');
                for (const videoKey of videoKeys) {
                    await deleteObject(videoKey);
                }
                await deleteObject(mergedVideoKey);
                console.log('✅ Test files cleaned up');

            } catch (error) {
                console.error('❌ Error in video merge test:', error);
                throw error;
            }
        }

        // Test Video Creation
        console.log('\n🎥 Testing Video Creation Service...');

        // Step 1: Generate text-to-speech audio
        console.log('\n1️⃣ Generating audio from text...');
        const speechText = 'Welcome to our test video. This is a demonstration of the video creation service.';
        const audioKey = `test-audio-${Date.now()}.mp3`;

        if (!process.env.ELEVEN_LABS_API_TOKEN || !process.env.ELEVEN_LABS_VOICE_ID) {
            console.log('⚠️ Skipping video test: ElevenLabs credentials not configured');
        } else {
            try {
                await textToSpeechAndSave(speechText, audioKey);
                console.log('✅ Audio generated successfully:', audioKey);

                // Step 2: Generate image
                console.log('\n2️⃣ Generating image...');
                if (!process.env.REPLICATE_API_TOKEN) {
                    console.log('⚠️ Skipping image generation: Replicate API token not configured');
                    throw new Error('Replicate API token required');
                }

                const imagePrompt = 'A beautiful mountain landscape with a sunset';
                const imageResult = await generateImageAndSave(imagePrompt, `test-image-${Date.now()}`);

                if (imageResult.error || imageResult.s3Keys.length === 0) {
                    throw new Error('Failed to generate image: ' + imageResult.error);
                }

                const imageKey = imageResult.s3Keys[0];
                console.log('✅ Image generated successfully:', imageKey);

                // Step 3: Create video
                console.log('\n3️⃣ Creating video from image and audio...');
                const videoKey = `test-video-${Date.now()}.mp4`;
                const videoResult = await createVideo(imageKey, audioKey, videoKey);
                console.log('✅ Video created successfully:', videoResult);

                // Step 4: Test batch video creation
                console.log('\n4️⃣ Testing batch video creation...');
                const batchInputs = [
                    {
                        imageKey,
                        audioKey,
                        outputKey: `test-video-batch-1-${Date.now()}.mp4`
                    },
                    {
                        imageKey,
                        audioKey,
                        outputKey: `test-video-batch-2-${Date.now()}.mp4`,
                        options: {
                            resolution: { width: 1280, height: 720 }
                        }
                    }
                ];

                console.log('Creating multiple videos...');
                const batchResults = await createVideoBatch(batchInputs);
                console.log('✅ Batch video creation results:', batchResults);

                // Clean up test files
                console.log('\n🧹 Cleaning up test files...');
                await deleteObject(audioKey);
                await deleteObject(imageKey);
                await deleteObject(videoKey);
                // Clean up batch test files
                for (const result of batchResults) {
                    if (!result.error) {
                        await deleteObject(result.outputKey);
                    }
                }
                console.log('✅ Test files cleaned up');

            } catch (error) {
                console.error('❌ Error in video creation test:', error);
                throw error;
            }
        }

        // Test DynamoDB operations
        console.log('\nTesting DynamoDB operations...');

        // Create a test record
        const testRecord = {
            id: 'test-' + Date.now(),
            name: 'Test Record',
            timestamp: new Date().toISOString()
        };
        console.log('Creating record:', testRecord);
        const createdRecord = await createRecord(testRecord);
        console.log('Created record:', createdRecord);

        // Get the record
        console.log('\nGetting record by id:', testRecord.id);
        const retrievedRecord = await getRecordById(testRecord.id);
        console.log('Retrieved record:', retrievedRecord);

        // Update the record
        console.log('\nUpdating record...');
        const updatedRecord = await updateRecord(testRecord.id, {
            name: 'Updated Test Record',
            status: 'updated',
            updateTime: new Date().toISOString()
        });
        console.log('Updated record:', updatedRecord);

        // Test getAllRecords
        console.log('\nGetting all records...');
        const allRecords = await getAllRecords();
        console.log('Total records found:', allRecords.length);
        console.log('Sample of records:', allRecords.slice(0, 3));

        // Delete the record
        console.log('\nDeleting record...');
        await deleteRecordById(testRecord.id);
        console.log('Record deleted');

        // Verify deletion
        const deletedRecord = await getRecordById(testRecord.id);
        console.log('Verification after deletion:', deletedRecord);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'All tests completed successfully',
                ffmpeg: {
                    status: 'working',
                    ffmpegPath,
                    ffprobePath
                },
                s3: {
                    testKey,
                    uploadSuccess: true,
                    downloadSuccess: content === testContent,
                    contentType: retrieved.contentType,
                    metadata: retrieved.metadata,
                    deletionVerified
                },
                elevenlabs: process.env.ELEVEN_LABS_API_TOKEN ? {
                    status: 'tested',
                    message: 'Text-to-speech conversion successful'
                } : {
                    status: 'skipped',
                    message: 'ElevenLabs API token not configured'
                },
                openai: process.env.OPENAI_API_KEY ? {
                    status: 'tested',
                    message: 'Chat completion successful'
                } : {
                    status: 'skipped',
                    message: 'OpenAI API key not configured'
                },
                replicate: process.env.REPLICATE_API_TOKEN ? {
                    status: 'tested',
                    message: 'Image generation successful',
                    tests: {
                        singleGeneration: singleGenerationSuccess,
                        batchGeneration: batchGenerationSuccess,
                        singleSave: singleSaveSuccess,
                        batchSave: batchSaveSuccess
                    }
                } : {
                    status: 'skipped',
                    message: 'Replicate API token not configured'
                },
                dynamodb: {
                    created: createdRecord,
                    retrieved: retrievedRecord,
                    updated: updatedRecord,
                    totalRecords: allRecords.length,
                    recordsSample: allRecords.slice(0, 3),
                    deleted: deletedRecord === null ? 'confirmed' : 'failed'
                }
            }, null, 2)
        };
    } catch (error) {
        console.error('Error during tests:', error);
        // @ts-ignore
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error during tests',
                // @ts-ignore
                error: error.toString(),
                // @ts-ignore
                stack: error.stack
            }, null, 2)
        };
    }
};