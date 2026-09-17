import * as dotenv from 'dotenv';
dotenv.config();

export const Config = {
  nodeEnv: process.env.NODE_ENV,
  mongoURI: process.env.MONGODB_URI || 'mongodb://localhost:27017/ezconnection',

  aws: {
    region: process.env.AWS_REGION,
    accessKey: process.env.AWS_ACCESS_KEY,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3: {
      bucketName: process.env.AWS_S3_BUCKET,
      bucketURL: process.env.AWS_S3_BUCKET_URL,
    }
  }
};
