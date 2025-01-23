/**
 * Cleans up JSON string from ChatGPT response by removing markdown code blocks
 */
export function cleanJsonString(input: string): string {
    return input.replace(/```json|```/g, '').trim();
}