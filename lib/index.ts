// import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface AwsSimpleStripeEventNotifierProps {
  // Define construct properties here
}

export class AwsSimpleStripeEventNotifier extends Construct {

  constructor(scope: Construct, id: string, props: AwsSimpleStripeEventNotifierProps = {}) {
    super(scope, id);

    // Define construct contents here

    // example resource
    // const queue = new sqs.Queue(this, 'AwsSimpleStripeEventNotifierQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
