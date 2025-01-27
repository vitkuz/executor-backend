import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import {Construct} from 'constructs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import 'dotenv/config'

console.log(
    {
        ELEVEN_LABS_API_KEY: process.env.ELEVEN_LABS_API_KEY,
        ELEVEN_LABS_VOICE_ID: process.env.ELEVEN_LABS_VOICE_ID,
        REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    }
)

export class VitkuzVideoLambdaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create public S3 bucket for storing files
        const bucket = new s3.Bucket(this, 'VideoStorageBucket', {
            publicReadAccess: true,
            blockPublicAccess: new s3.BlockPublicAccess({
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false
            }),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            cors: [
                {
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.DELETE,
                    ],
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                },
            ],
        });

        // Create public S3 bucket for final videos

        const reelstagramBucket = new s3.Bucket(this, 'ReelstagramBucket', {
            publicReadAccess: true,
            bucketName: 'reelstagram.travelgig.info',
            websiteIndexDocument: 'index.html', // Entry point
            websiteErrorDocument: 'error.html', // Error page
            blockPublicAccess: new s3.BlockPublicAccess({
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false
            }),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            cors: [
                {
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.DELETE,
                    ],
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                },
            ],
        });

        const executionManagerBucket = new s3.Bucket(this, 'ExecutionManagerBucket', {
            publicReadAccess: true,
            bucketName: 'executionmanager.travelgig.info',
            websiteIndexDocument: 'index.html', // Entry point
            websiteErrorDocument: 'index.html', // Error page
            blockPublicAccess: new s3.BlockPublicAccess({
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false
            }),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            cors: [
                {
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.DELETE,
                    ],
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                },
            ],
        });

        const distribution = new cloudfront.Distribution(this, 'Distribution', {
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 404,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(1),
                },
            ],
            defaultBehavior: {
                origin: new origins.S3StaticWebsiteOrigin(executionManagerBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
        });

        // Create DynamoDB table for executions
        const executionsTable = new dynamodb.Table(this, 'ExecutionsTable', {
            partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl'
        });

        // Create Lambda layer
        const layer = new lambda.LayerVersion(this, 'ReplicateLayer', {
            code: lambda.Code.fromAsset('./scripts/lambda-layer.zip'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            description: 'Dependencies for Replicate API proxy',
        });

        // Create FFmpeg layer from S3 zip
        const ffmpegLayer = new lambda.LayerVersion(this, 'FfmpegLayer', {
            code: lambda.Code.fromBucket(
                cdk.aws_s3.Bucket.fromBucketName(this, 'LayersBucket', 'node-layers-582347504313'),
                'ffmpeg_layer/ffmpeg-layer.zip'
            ),
            description: 'FFmpeg binaries for Lambda',
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            compatibleArchitectures: [lambda.Architecture.X86_64]
        });

        // Create Sharp layer from S3 zip
        const sharpLayer = new lambda.LayerVersion(this, 'SharpLayer', {
            code: lambda.Code.fromBucket(
                cdk.aws_s3.Bucket.fromBucketName(this, 'LayersBucket2', 'node-layers-582347504313'),
                'sharp-layer.zip'
            ),
            description: 'Sharp image processing library',
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            compatibleArchitectures: [lambda.Architecture.X86_64]
        });

        // Create gallery generator Lambda function
        const galleryFunction = new lambda.Function(this, 'GalleryFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../functions/gallery')),
            memorySize: 512,
            timeout: cdk.Duration.seconds(900),
            layers: [layer],
            logRetention: logs.RetentionDays.ONE_DAY,
            environment: {
                FINAL_VIDEOS_BUCKET_NAME: reelstagramBucket.bucketName,
            }
        });

        // Grant the gallery function permissions to access the final videos bucket
        reelstagramBucket.grantReadWrite(galleryFunction);

        // Add S3 trigger for the gallery function
        reelstagramBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.LambdaDestination(galleryFunction)
        );

        // Create Lambda function
        const ffmpegFunction = new lambda.Function(this, 'FfmpegFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../functions/video')),
            memorySize: 4024,
            timeout: cdk.Duration.seconds(900),
            layers: [ffmpegLayer, sharpLayer, layer],
            logRetention: logs.RetentionDays.ONE_DAY,
            environment: {
                BUCKET_NAME: bucket.bucketName,
                FINAL_VIDEOS_BUCKET_NAME: reelstagramBucket.bucketName,
                TABLE_NAME: executionsTable.tableName,
                NODE_OPTIONS: '--enable-source-maps',
                DEPLOY_TIME: `${Date.now()}`,
                ELEVEN_LABS_API_TOKEN: process.env.ELEVEN_LABS_API_KEY!,
                ELEVEN_LABS_VOICE_ID: process.env.ELEVEN_LABS_VOICE_ID!,
                REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN!,
                OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
            }
        });

        // Grant the Lambda function permissions to access the S3 bucket
        bucket.grantReadWrite(ffmpegFunction);
        reelstagramBucket.grantReadWrite(ffmpegFunction);

        // Grant the Lambda function permissions to access the DynamoDB table
        executionsTable.grantReadWriteData(ffmpegFunction);

        // Create Executions Lambda function
        const executionsFunction = new lambda.Function(this, 'ExecutionsFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../functions/executions')),
            memorySize: 256,
            timeout: cdk.Duration.seconds(30),
            logRetention: logs.RetentionDays.ONE_DAY,
            environment: {
                TABLE_NAME: executionsTable.tableName,
            }
        });

        // Grant the Executions Lambda function permissions to access the DynamoDB table
        executionsTable.grantReadData(executionsFunction);

        // Create API Gateway
        const api = new apigateway.RestApi(this, 'ExecutionsApi', {
            restApiName: 'Executions Service',
            description: 'API for retrieving video generation executions',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS
            }
        });

        // Create API Gateway resource and method
        const executions = api.root.addResource('executions');
        executions.addMethod('GET', new apigateway.LambdaIntegration(executionsFunction));
        executions.addMethod('POST', new apigateway.LambdaIntegration(ffmpegFunction));

        // Create an EventBridge rule for the schedule
        const rule = new events.Rule(this, 'ScheduleRule', {
            schedule: events.Schedule.cron({
                minute: '0', // On the hour
                hour: '0,8,16', // At 12:00 AM, 8:00 AM, and 4:00 PM UTC
                day: '*', // Every day
                month: '*', // Every month
                year: '*', // Every year
            }),
        });

        // Add the Lambda function as the target of the rule
        rule.addTarget(new targets.LambdaFunction(ffmpegFunction));

        new cdk.CfnOutput(this, 'FunctionArn', {
            value: ffmpegFunction.functionArn,
            description: 'FFmpeg Lambda function ARN'
        });

        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
            description: 'API Gateway URL'
        });
    }
}
