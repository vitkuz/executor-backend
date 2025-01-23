import { S3Client, paginateListObjectsV2, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.FINAL_VIDEOS_BUCKET_NAME!;
const AWS_REGION = process.env.AWS_REGION!;

async function checkFileExists(url: string): Promise<boolean> {
    try {
        const response = await axios.head(url);
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const minutes = Math.floor(diffInSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    if (hours > 0) {
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    if (minutes > 0) {
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    return 'just now';
}

const generateHtml = async (files: any[]) => {
    const styles = `
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        margin: 0;
        background: #000;
        color: #fff;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
      .video-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
        padding: 20px;
      }
      .video-card {
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        background: #1a1a1a;
        aspect-ratio: 9/16;
      }
      .video-thumbnail {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 0.3s ease;
      }
      .play-button {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.3s ease;
      }
      .play-button:hover {
        background: rgba(0, 0, 0, 0.9);
      }
      .play-button svg {
        width: 24px;
        height: 24px;
        fill: white;
      }
      .video-title {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 15px;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
        color: white;
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .video-date {
        position: absolute;
        bottom: 40px;
        left: 0;
        right: 0;
        padding: 5px 15px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
      }
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: none;
      }
      .video-card.playing video {
        display: block;
      }
      .video-card.playing .video-thumbnail, 
      .video-card.playing .play-button,
      .video-card.playing .video-title,
      .video-card.playing .video-date {
        display: none;
      }
      @media (max-width: 768px) {
        .video-grid {
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        }
      }
    </style>
  `;

    const videoPromises = files
        .filter(file => /\.(mp4|webm|mov)$/i.test(file.Key))
        .map(async file => {
            // Extract the ID from the video filename
            const videoId = file.Key.match(/([a-f0-9-]+)-final\.(mp4|webm|mov)$/i)?.[1];
            // const videoUrl = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${file.Key}`;
            const videoUrl = `https://s3.${AWS_REGION}.amazonaws.com/${BUCKET_NAME}/${file.Key}`;

            // Skip if video doesn't exist or doesn't match our naming pattern
            const exists = await checkFileExists(videoUrl);
            if (!exists) return '';

            // Look for matching thumbnail using the video ID
            const thumbnailKey = videoId ? `${videoId}-thumbnail.jpg` : file.Key.replace(/\.[^/.]+$/, '.jpg');
            // const thumbnailUrl = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${thumbnailKey}`;
            const thumbnailUrl = `https://s3.${AWS_REGION}.amazonaws.com/${BUCKET_NAME}/${thumbnailKey}`;
            const thumbnailExists = await checkFileExists(thumbnailUrl);

            const relativeTime = file.LastModified ? formatRelativeTime(new Date(file.LastModified)) : '';

            return `
        <div class="video-card" data-video-url="${videoUrl}">
          <img 
            class="video-thumbnail" 
            src="${thumbnailExists ? thumbnailUrl : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%23333\'/%3E%3C/svg%3E'}"
            alt="${file.Key}"
            alt="${file.Key.split('/').pop()}"
          />
          <button class="play-button" aria-label="Play video">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <div class="video-date">${relativeTime}</div>
          <div class="video-title">${file.Key.split('/').pop()}</div>
          <video 
            preload="none"
            poster="${thumbnailExists ? thumbnailUrl : ''}"
            controls
            playsinline
            data-src="${videoUrl}"
          ></video>
        </div>
      `;
        });

    const videoItems = (await Promise.all(videoPromises)).filter(Boolean);

    const script = `
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const videoCards = document.querySelectorAll('.video-card');
        let currentlyPlaying = null;

        videoCards.forEach(card => {
          const playButton = card.querySelector('.play-button');
          const video = card.querySelector('video');

          playButton.addEventListener('click', () => {
            // Stop currently playing video if exists
            if (currentlyPlaying && currentlyPlaying !== video) {
              currentlyPlaying.pause();
              currentlyPlaying.parentElement.classList.remove('playing');
            }

            // Load and play the clicked video
            if (!video.src) {
              video.src = video.dataset.src;
            }
            
            video.play();
            card.classList.add('playing');
            currentlyPlaying = video;
          });

          // Handle video end
          video.addEventListener('ended', () => {
            card.classList.remove('playing');
            currentlyPlaying = null;
          });
        });
      });
    </script>
  `;

    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Video Gallery</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <h1>Video Gallery</h1>
          <div class="video-grid">
            ${videoItems.join('')}
          </div>
        </div>
        ${script}
      </body>
    </html>
  `;
};

export const handler = async (event: any) => {

    console.log(JSON.stringify(event, null, 2));

    try {
        // Check if this is an S3 event and if the file is an MP4
        if (event.Records?.[0]?.s3?.object?.key) {
            const key = event.Records[0].s3.object.key;
            if (!key.toLowerCase().endsWith('.mp4')) {
                console.log('🔄 Skipping non-MP4 file:', key);
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'Skipped non-MP4 file' })
                };
            }
        }


        console.log('🔄 Starting gallery generation...');
        console.log('📦 Listing files in bucket:', BUCKET_NAME);

        const files = [];
        const paginator = paginateListObjectsV2({ client: s3Client }, { Bucket: BUCKET_NAME });

        for await (const page of paginator) {
            if (page.Contents) {
                files.push(...page.Contents);
            }
        }

        // Sort files by LastModified date, newest first
        files.sort((a, b) => {
            const dateA = a.LastModified?.getTime() || 0;
            const dateB = b.LastModified?.getTime() || 0;
            return dateB - dateA;
        });

        console.log(`📄 Found ${files.length} files`);
        console.log('🎨 Generating HTML...');

        const html = await generateHtml(files);

        console.log('📤 Uploading index.html to S3...');

        const putParams = {
            Bucket: BUCKET_NAME,
            Key: 'index.html',
            Body: html,
            ContentType: 'text/html',
            CacheControl: 'no-cache'
        }

        const uploadCommand = new PutObjectCommand(putParams);

        await s3Client.send(uploadCommand);
        console.log('✅ Successfully uploaded index.html');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Gallery updated successfully' })
        };
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
};