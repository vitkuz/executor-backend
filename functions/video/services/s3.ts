import {S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const client = new S3Client({});
const bucketName = process.env.BUCKET_NAME!;

export interface S3GetObjectResult {
    body: Readable;
    contentType?: string;
    contentLength?: number;
    metadata?: { [key: string]: string };
}

export async function getObject(key: string): Promise<S3GetObjectResult> {
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    const response = await client.send(command);

    return {
        body: response.Body as Readable,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        metadata: response.Metadata,
    };
}

export async function putObject(
    key: string,
    body: Buffer | Readable | string,
    options?: {
        contentType?: string;
        metadata?: { [key: string]: string };
    }
): Promise<void> {
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
    });

    await client.send(command);
}

export async function deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    await client.send(command);
}

export async function copyObject(
    sourceKey: string,
    destinationKey: string,
    destinationBucket: string
): Promise<void> {
    const command = new CopyObjectCommand({
        CopySource: `${bucketName}/${sourceKey}`,
        Bucket: destinationBucket,
        Key: destinationKey
    });

    await client.send(command);
}