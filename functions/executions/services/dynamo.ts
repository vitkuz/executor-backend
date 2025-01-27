import { DynamoDBClient, ReturnValue } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    PutCommand,
    DeleteCommand,
    GetCommand,
    UpdateCommand,
    ScanCommand
} from '@aws-sdk/lib-dynamodb';

const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TableName = process.env.TABLE_NAME!;

export interface DynamoRecord {
    id: string;
    [key: string]: any;
}

export async function getRecordById(id: string): Promise<DynamoRecord | null> {
    const params = {
        TableName,
        Key: { id }
    };

    const result = await docClient.send(new GetCommand(params));
    return result.Item as DynamoRecord || null;
}

export async function deleteRecordById(id: string): Promise<void> {
    const params = {
        TableName,
        Key: { id }
    };

    await docClient.send(new DeleteCommand(params));
}

export async function createRecord(record: DynamoRecord): Promise<DynamoRecord> {
    const params = {
        TableName,
        Item: record
    };

    await docClient.send(new PutCommand(params));
    return record;
}

export async function partialUpdateRecord(id: string, updates: Partial<DynamoRecord>): Promise<DynamoRecord> {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: { [key: string]: any } = {};

    Object.entries(updates).forEach(([key, value], index) => {
        if (key !== 'id') {
            const attributeName = `#attr${index}`;
            const attributeValue = `:val${index}`;
            updateExpressions.push(`${attributeName} = ${attributeValue}`);
            expressionAttributeNames[attributeName] = key;
            expressionAttributeValues[attributeValue] = value;
        }
    });


    const params = {
        TableName,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW' as ReturnValue
    };

    const result = await docClient.send(new UpdateCommand(params));
    return result.Attributes as DynamoRecord || {} as DynamoRecord;
}

export async function updateRecord(id: string, record: Omit<DynamoRecord, 'id'>): Promise<DynamoRecord> {
    const fullRecord = {
        id,
        ...record
    };

    const params = {
        TableName,
        Item: fullRecord
    };

    await docClient.send(new PutCommand(params));
    return fullRecord;
}

export async function getAllRecords(): Promise<DynamoRecord[]> {
    const records: DynamoRecord[] = [];

    async function scanRecursively(lastEvaluatedKey?: Record<string, any>) {
        const params = {
            TableName,
            ExclusiveStartKey: lastEvaluatedKey
        };

        const result = await docClient.send(new ScanCommand(params));

        if (result.Items) {
            records.push(...(result.Items as DynamoRecord[]));
        }

        if (result.LastEvaluatedKey) {
            await scanRecursively(result.LastEvaluatedKey);
        }
    }

    await scanRecursively();
    return records;
}