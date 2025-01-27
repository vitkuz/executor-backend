import { getObject } from './s3';
import { Readable } from 'stream';
const ffmpeg = require('fluent-ffmpeg');

export interface VideoInput {
    imageKey: string;
    audioKey: string;
    outputKey: string;
    options?: VideoOptions;
}

export interface VideoCreationResult {
    outputKey: string;
    error?: string;
}

export interface Resolution {
    width: number;
    height: number;
}

export interface VideoOptions {
    resolution?: Resolution;
    duration?: number;
    outputFormat?: string;
}

export interface MergeVideosResult {
    outputKey: string;
    error?: string;
}

export async function createVideo(
    imageKey: string,
    audioKey: string,
    outputKey: string,
    options: VideoOptions = {}
): Promise<string> {
    try {
        console.log('🎬 Starting video creation process...');
        console.log('📁 Input files:');
        console.log(`  📷 Image: ${imageKey}`);
        console.log(`  🎵 Audio: ${audioKey}`);
        console.log(`  📼 Output: ${outputKey}`);

        // Get files from S3
        console.log('\n📥 Downloading files from S3...');
        const imageData = await getObject(imageKey);
        console.log('  ✅ Image downloaded successfully');
        const audioData = await getObject(audioKey);
        console.log('  ✅ Audio downloaded successfully');

        // Create temporary file paths
        const tempImagePath = `/tmp/${imageKey.split('/').pop()}`;
        const tempAudioPath = `/tmp/${audioKey.split('/').pop()}`;
        const tempOutputPath = `/tmp/${outputKey.split('/').pop()}`;
        console.log('\n📝 Temporary file paths:');
        console.log(`  🖼️  Image: ${tempImagePath}`);
        console.log(`  🔊 Audio: ${tempAudioPath}`);
        console.log(`  🎥 Output: ${tempOutputPath}`);

        // Write files to temporary storage
        console.log('\n💾 Writing files to temporary storage...');
        await streamToFile(imageData.body, tempImagePath);
        console.log('  ✅ Image saved to temporary storage');
        await streamToFile(audioData.body, tempAudioPath);
        console.log('  ✅ Audio saved to temporary storage');

        // Get audio duration if not provided
        console.log('\n⏱️  Getting audio duration...');
        const duration = options.duration || await getAudioDuration(tempAudioPath);

        // Get image resolution if not provided
        console.log('\n📏 Getting resolution...');
        const resolution = options.resolution || await getImageResolution(tempImagePath);

        console.log('\n⚙️  Video configuration:');
        console.log(`  ⏱️  Duration: ${duration} seconds`);
        console.log(`  📐 Resolution: ${resolution.width}x${resolution.height}`);

        // Merge image and audio
        console.log('\n🎞️  Starting FFmpeg processing...');
        await mergeImageAndAudio(
            tempImagePath,
            tempAudioPath,
            tempOutputPath,
            duration,
            resolution
        );

        // Upload result to S3
        console.log('\n📤 Uploading video to S3...');
        const { putObject } = await import('./s3');
        await putObject(outputKey, await readFile(tempOutputPath), {
            contentType: 'video/mp4',
            metadata: {
                'generated-by': 'ffmpeg',
                'source-image': imageKey,
                'source-audio': audioKey,
                'duration': duration.toString(),
                'resolution': `${resolution.width}x${resolution.height}`
            }
        });
        console.log('  ✅ Video uploaded successfully');

        // Clean up temporary files
        console.log('\n🧹 Cleaning up temporary files...');
        await cleanupFiles([tempImagePath, tempAudioPath, tempOutputPath]);

        console.log('\n✨ Video creation completed successfully!');
        return outputKey;
    } catch (error) {
        console.error('Error creating video:', error);
        throw error;
    }
}

export async function createVideoBatch(
    inputs: VideoInput[]
): Promise<VideoCreationResult[]> {
    console.log('🎬 Starting batch video creation process...');
    console.log(`📋 Processing ${inputs.length} videos...`);

    const results: VideoCreationResult[] = [];

    for (const [index, input] of inputs.entries()) {
        console.log(`\n🎥 Processing video ${index + 1}/${inputs.length}`);
        console.log(`  📷 Image: ${input.imageKey}`);
        console.log(`  🎵 Audio: ${input.audioKey}`);
        console.log(`  📼 Output: ${input.outputKey}`);

        try {
            const outputKey = await createVideo(
                input.imageKey,
                input.audioKey,
                input.outputKey,
                input.options
            );
            results.push({ outputKey });
            console.log(`✅ Video ${index + 1} created successfully: ${outputKey}`);
        } catch (error) {
            console.error(`❌ Error creating video ${index + 1}:`, error);
            results.push({
                outputKey: input.outputKey,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    console.log('\n📊 Batch Processing Summary:');
    console.log(`  ✅ Successful: ${results.filter(r => !r.error).length}`);
    console.log(`  ❌ Failed: ${results.filter(r => r.error).length}`);

    return results;
}

export async function mergeVideos(
    videoKeys: string[],
    outputKey: string,
    options: VideoOptions = {}
): Promise<MergeVideosResult> {
    try {
        console.log('🎬 Starting video merge process...');
        console.log('📁 Input files:', videoKeys);
        console.log('📼 Output:', outputKey);

        // Download all videos from S3
        console.log('\n📥 Downloading videos from S3...');
        const tempVideoPaths: string[] = [];

        for (const [index, videoKey] of videoKeys.entries()) {
            console.log(`  ⬇️  Downloading video ${index + 1}/${videoKeys.length}: ${videoKey}`);
            const videoData = await getObject(videoKey);
            const tempPath = `/tmp/video-${index}-${videoKey.split('/').pop()}`;
            await streamToFile(videoData.body, tempPath);
            tempVideoPaths.push(tempPath);
            console.log(`  ✅ Video ${index + 1} downloaded and saved to ${tempPath}`);
        }

        // Create temporary output path
        const tempOutputPath = `/tmp/merged-${outputKey.split('/').pop()}`;
        console.log('\n📝 Output will be saved to:', tempOutputPath);

        // Merge videos
        console.log('\n🎞️  Starting FFmpeg merge process...');
        await mergeVideoFiles(tempVideoPaths, tempOutputPath);

        // Upload result to S3
        console.log('\n📤 Uploading merged video to S3...');
        const { putObject } = await import('./s3');
        await putObject(outputKey, await readFile(tempOutputPath), {
            contentType: 'video/mp4',
            metadata: {
                'generated-by': 'ffmpeg-merge',
                'source-videos': JSON.stringify(videoKeys),
                'merge-date': new Date().toISOString()
            }
        });
        console.log('  ✅ Merged video uploaded successfully');

        // Clean up temporary files
        console.log('\n🧹 Cleaning up temporary files...');
        await cleanupFiles([...tempVideoPaths, tempOutputPath]);

        console.log('\n✨ Video merge completed successfully!');
        return { outputKey };
    } catch (error) {
        console.error('❌ Error merging videos:', error);
        return {
            outputKey,
            error: error instanceof Error ? error.message : 'Unknown error during video merge'
        };
    }
}

function generateZoomPanFilter(config:any) {
    const {
        initialZoom,
        finalZoom,
        frames,
        inputWidth,
        inputHeight,
    } = config;

    // Calculate zoom increment per frame
    const zoomIncrement = (finalZoom - initialZoom) / frames;

    // Center pan position
    const centerX = 0.5;
    const centerY = 0.5;

    // Construct the filter string
    const filterString = `scale=8000:-1,zoompan=z='min(zoom+${zoomIncrement.toFixed(4)},${finalZoom})':d=${frames}:` +
        `x='(iw-(iw/zoom))*(${centerX})':` +
        `y='(ih-(ih/zoom))*(${centerY})':` +
        `s=${inputWidth}x${inputHeight}`;

    return filterString;
}

function mergeImageAndAudio(
    imagePath: string,
    audioPath: string,
    outputPath: string,
    duration: number,
    resolution: Resolution
): Promise<string> {

    const fps = 60;
    const frames = Math.ceil(duration * fps); // Total frames based on audio duration
    const zoomPanConfig = {
        initialZoom: 1,
        finalZoom: 1.5,
        frames: frames,
        inputWidth: resolution.width,
        inputHeight: resolution.height,
    };

    let zoomPanFilter = generateZoomPanFilter(zoomPanConfig);

    return new Promise((resolve, reject) => {
        console.log('  🔄 FFmpeg: Merging image and audio...');

        ffmpeg()
            .input(imagePath)
            .inputOptions(['-loop 1']) // Loop the image for the duration
            .input(audioPath) // Add audio input
            .complexFilter([zoomPanFilter]) // Pass the filter as a separate parameter
            .outputOptions([
                '-c:v libx264', // Video codec
                '-pix_fmt yuv420p', // Pixel format
                `-r ${fps}`, // Frame rate
                `-t ${duration}`, // Duration based on audio
                '-c:a aac', // Audio codec
                '-b:a 192k', // Audio bitrate
            ])
            .output(outputPath)
            .on('start', (command: string) => {
                console.log(`  📋 FFmpeg command: ${command}`);
            })
            .on('end', () => {
                console.log('  ✅ FFmpeg: Video creation successful');
                resolve(outputPath);
            })
            .on('error', (err: Error) => {
                console.error('  ❌ FFmpeg Error:', err.message);
                reject(err);
            })
            .run();
    });
}

function mergeVideoFiles(videoPaths: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log('  🔄 FFmpeg: Merging videos...');

        const ffmpegCommand = ffmpeg();

        // Add each video as input
        videoPaths.forEach(videoPath => {
            console.log(`  ➕ Adding video to merge: ${videoPath}`);
            ffmpegCommand.input(videoPath);
        });

        // Configure the merge
        ffmpegCommand
            .on('start', (command: string) => {
                console.log(`  📋 FFmpeg command: ${command}`);
            })
            .on('end', () => {
                console.log('  ✅ FFmpeg: Video merge successful');
                resolve();
            })
            .on('error', (err: Error) => {
                console.error('  ❌ FFmpeg Error:', err.message);
                reject(err);
            })
            .mergeToFile(outputPath, '/tmp');
    });
}

function getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        console.log('  🔍 Probing audio file for duration...');
        ffmpeg.ffprobe(audioPath, (err: Error, metadata: any) => {
            if (err) {
                console.error('  ❌ Error getting audio duration:', err.message);
                reject(err);
                return;
            }
            console.log(`  ✅ Audio duration: ${metadata.format.duration} seconds`);
            resolve(metadata.format.duration);
        });
    });
}

function getImageResolution(imagePath: string): Promise<Resolution> {
    return new Promise((resolve, reject) => {
        console.log('  🔍 Probing image file for resolution...');
        ffmpeg.ffprobe(imagePath, (err: Error, metadata: any) => {
            if (err) {
                console.error('  ❌ Error getting image resolution:', err.message);
                reject(err);
                return;
            }
            const stream = metadata.streams[0];
            const resolution = {
                width: stream.width,
                height: stream.height
            };
            console.log(`  ✅ Image resolution: ${resolution.width}x${resolution.height}`);
            resolve(resolution);
        });
    });
}

function streamToFile(stream: Readable, path: string): Promise<void> {
    const fs = require('fs');
    return new Promise((resolve, reject) => {
        console.log(`  📝 Writing stream to file: ${path}`);
        const writeStream = fs.createWriteStream(path);
        stream.pipe(writeStream);
        writeStream.on('finish', () => {
            console.log(`  ✅ File written successfully: ${path}`);
            resolve();
        });
        writeStream.on('error', (err: { message: any; }) => {
            console.error(`  ❌ Error writing file ${path}:`, err.message);
            reject(err);
        });
    });
}

function readFile(path: string): Promise<Buffer> {
    const fs = require('fs');
    return fs.promises.readFile(path);
}

async function cleanupFiles(paths: string[]): Promise<void> {
    const fs = require('fs');
    console.log('  🗑️  Cleaning up temporary files...');
    const promises = paths.map(path =>
        fs.promises.unlink(path).catch((err: { message: any; }) =>
            console.warn(`  ⚠️  Warning: Failed to delete ${path}:`, err.message)
        )
    );
    await Promise.all(promises);
    console.log('  ✅ Cleanup completed');
}