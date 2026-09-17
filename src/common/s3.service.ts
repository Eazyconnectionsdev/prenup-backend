import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
  PutObjectCommandOutput,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Config } from '../config';

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
};

@Injectable()
export class S3Service {
  private client = new S3Client({
    region: Config.aws.region,
    credentials: {
      accessKeyId: Config.aws.accessKey!,
      secretAccessKey: Config.aws.secretKey!,
    },
  });

  async putToBucket(
    fileContent: Buffer,
    fileName: string,

    contentType?: string,
  ): Promise<string> {

    const resolvedContentType = contentType ?? this.inferContentType(fileName);

    const input: PutObjectCommandInput = {
      Body: fileContent,
      Bucket: Config.aws.s3.bucketName,
      Key: fileName,
      ContentType: resolvedContentType,

    };

    try {
      const response: PutObjectCommandOutput = await this.client.send(
        new PutObjectCommand(input),
      );

      if (response.$metadata.httpStatusCode !== 200) {

        throw new InternalServerErrorException(


          `S3 upload returned status ${response.$metadata.httpStatusCode}`,
        );

      }

      return Config.aws.s3.bucketURL + fileName;
    } catch (error) {


      if (error instanceof S3ServiceException) {
        throw new InternalServerErrorException(

          `Failed to upload "${fileName}" to S3: ${error.message}`,

        );
      }
      throw error;

    }
  }



  async getFromBucket(fileName: string): Promise<Buffer> {

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: Config.aws.s3.bucketName,


          Key: fileName,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException(`No content found for "${fileName}"`);
      }

      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (error) {

      if (error instanceof S3ServiceException) {

        if (error.name === 'NoSuchKey') {
          throw new NotFoundException(`File not found in S3: "${fileName}"`);
        }
        throw new InternalServerErrorException(
          `Failed to fetch "${fileName}" from S3: ${error.message}`,
        );
      }
      throw error;
    }
  }

  private inferContentType(fileName: string): string | undefined {
    const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    return CONTENT_TYPE_BY_EXTENSION[extension];
  }
}