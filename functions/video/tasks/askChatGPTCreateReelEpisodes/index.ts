import { generateChatResponse } from '../../services/openai';
import { jsonrepair } from 'jsonrepair';
import {prompt} from "./prompt";
import {cleanJsonString} from "./utils";

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

export async function generateReelEpisodes(previousResults: any, executionId: string): Promise<ReelEpisodesRecord> {
    try {
        console.log('🎬 Generating Reel episodes...');

        // Generate content using ChatGPT
        const response = await generateChatResponse(prompt, {
            model: 'gpt-4o',
            temperature: 0.9
        });

        // Parse the response
        const cleanedJson = cleanJsonString(response);
        const repairedJson = jsonrepair(cleanedJson);
        const parsedResponse = JSON.parse(repairedJson);

        console.log(JSON.stringify(parsedResponse, null, 2))

        // Create record without saving
        const record = {
            id: `reel-${Date.now()}`,
            type: 'reel-episodes',
            content: parsedResponse,
            createdAt: new Date().toISOString()
        };

        console.log('✅ Episodes generated successfully');
        JSON.stringify(record, null, 2)
        return record;
    } catch (error) {
        console.error('❌ Error generating Reel episodes:', error);
        throw error;
    }
}