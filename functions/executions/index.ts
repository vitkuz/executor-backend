import { getAllRecords } from './services/dynamo';

export const handler = async (event: any) => {
    try {
        console.log('🔄 Fetching all executions...');
        const executions = await getAllRecords();

        console.log(`✅ Successfully retrieved ${executions.length} executions`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: JSON.stringify(executions)
        };
    } catch (error) {
        console.error('❌ Error fetching executions:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: JSON.stringify({
                message: 'Error fetching executions',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};