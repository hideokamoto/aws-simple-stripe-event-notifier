# AWS Simple Stripe Event Notifier

AWS CDK Construct Library for creating a complete Stripe event notification system using AWS EventBridge and SNS.

## Overview

This library provides a CDK Construct for receiving Stripe webhook events through AWS EventBridge and sending notifications to SNS topics. It integrates with Stripe's partner event source to deliver real-time event notifications.

## Key Features

- **EventBridge Integration**: Receives events from Stripe's partner event source
- **Event Filtering**: Processes only specified event types
- **SNS Notifications**: Sends notifications to SNS with customizable message templates
- **Automatic IAM Setup**: Automatically configures required permissions
- **TypeScript Support**: Provides full type safety

## Installation

```bash
npm install aws-simple-stripe-event-notifier
```

## Getting Started

### Step 1: Set up Stripe Event Destination & Amazon EventBridge

Before using this library, you need to set up Stripe Event Destinations and create a partner event bus in Amazon EventBridge. Follow these steps:

#### 1.1: Enable Workbench

1. Go to your Stripe Dashboard
2. Navigate to **Developer settings** → **Workbench**
3. Enable Workbench if not already enabled

#### 1.2: Create Event Destination

1. Open the **Webhooks** tab in Workbench
2. Click **Create new destination**
3. Select **Account** to listen to events from your own account
4. Choose the event types you want to receive
5. Select **Amazon EventBridge** as your destination type
6. Enter your AWS account ID and region
7. Click **Create destination**

#### 1.3: Associate Partner Event Source

1. Go to AWS Management Console → **EventBridge** → **Partner event sources**
2. Select the region you chose in Step 1.2
3. Find the newly created partner event source (format: `aws.partner/stripe.com/{UNIQUE_ID}`)
4. Click **Associate with event bus**
5. Select permissions and click **Associate**

#### 1.4: Create EventBridge Rules

1. Navigate to **EventBridge** → **Rules**
2. Click **Create Rule**
3. Select your event bus from the dropdown
4. Under **Event source**, select **AWS events or EventBridge partner events**
5. Under **Event Pattern**, select **EventBridge partners** → **Stripe**
6. Choose event types or select **All events**
7. Configure your target (SNS, Lambda, etc.)
8. Click **Create Rule**

For detailed instructions, refer to the [official Stripe documentation](https://docs.stripe.com/event-destinations/eventbridge).

### Step 2: Install and Use the Library

Now you can install and use the library in your CDK project:

```bash
npm install aws-simple-stripe-event-notifier
```

## Usage

### Basic Usage Example

```typescript
import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
import { AwsSimpleStripeEventNotifier } from 'aws-simple-stripe-event-notifier';

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference Stripe's partner event source
    const eventBus = events.EventBus.fromEventBusName(
      this,
      'StripePartnerEventBus',
      'aws.partner/stripe.com/ed_xxxxxx'
    );

    // Create SNS topic
    const topic = new sns.Topic(this, 'StripeNotificationTopic', {
      topicName: 'StripeEventNotifications',
    });

    // Create Stripe event notification system
    new AwsSimpleStripeEventNotifier(this, 'StripeEventNotifier', {
      eventBus,
      topic,
      eventTypes: ['payment_intent.succeeded', 'customer.created'],
      messageTemplate: EventField => ({
        version: '1.0',
        source: 'stripe',
        content: {
          textType: 'client-markdown',
          title: ':bell: Stripe Event Notification',
          description: [
            `**Event Type:** ${EventField.fromPath('$.detail-type')}`,
            `**Event ID:** ${EventField.fromPath('$.id')}`,
            `**Occurred At:** ${EventField.fromPath('$.time')}`,
            '',
            '**Details:**',
            `\`\`\`json\n${EventField.fromPath('$.detail')}\n\`\`\``,
          ].join('\n'),
        },
        metadata: {
          eventId: EventField.fromPath('$.id'),
          eventType: EventField.fromPath('$.detail-type'),
          eventTime: EventField.fromPath('$.time'),
        },
      }),
    });
  }
}
```

### Slack Notification Configuration Example

```typescript
// SNS topic for #shifter-activities channel
const snsTopicForShifterActivitiesChannel = new sns.Topic(
  this,
  'SnsTopicForShifterActivitiesChannel',
  {
    topicName: 'NotifyToShifterActivitiesChannel',
  }
);

// Stripe subscription creation event notification
new AwsSimpleStripeEventNotifier(this, 'StripeSubscriptionCreatedToSNS', {
  eventBus,
  topic: snsTopicForShifterActivitiesChannel,
  eventTypes: ['customer.subscription.created'],
  messageTemplate: EventField => ({
    version: '1.0',
    source: 'custom',
    content: {
      textType: 'client-markdown',
      title: ':warning: Stripe Subscription Created Notification',
      description: [
        'A new subscription has been created',
        '',
        '📋 *Details:*',
        `• *Subscription ID:* ${EventField.fromPath('$.detail.data.object.id')}`,
        `• *Customer ID:* ${EventField.fromPath('$.detail.data.object.customer')}`,
        `• *Currency:* ${EventField.fromPath('$.detail.data.object.currency')}`,
        `• *Plan Name:* ${EventField.fromPath('$.detail.data.object.items.data[0].plan.nickname')}`,
        `• *Billing Interval:* ${EventField.fromPath('$.detail.data.object.items.data[0].plan.interval')}`,
        '',
        '🔗 *Stripe Dashboard:*',
        `• <https://dashboard.stripe.com/customers/${EventField.fromPath('$.detail.data.object.customer')}|👤 View Customer>`,
        `• <https://dashboard.stripe.com/subscriptions/${EventField.fromPath('$.detail.data.object.id')}|📋 View Subscription>`,
      ].join('\n'),
      nextSteps: [
        'Please review the new subscription details in the Stripe Dashboard',
        'Verify that customer billing information and plan are correctly configured',
      ],
    },
    metadata: {
      customerId: EventField.fromPath('$.detail.data.object.customer'),
      subscriptionId: EventField.fromPath('$.detail.data.object.id'),
      eventTime: EventField.fromPath('$.time'),
      eventSource: EventField.fromPath('$.source'),
    },
  }),
});
```

## API Reference

### AwsSimpleStripeEventNotifierProps

| Property          | Type                  | Required | Description                                       |
| ----------------- | --------------------- | -------- | ------------------------------------------------- |
| `eventBus`        | `events.IEventBus`    | ✅       | EventBridge event bus that receives Stripe events |
| `topic`           | `sns.ITopic`          | ✅       | SNS topic to send notifications to                |
| `eventTypes`      | `string[]`            | ✅       | Array of Stripe event types to monitor            |
| `messageTemplate` | `(EventField) => any` | ✅       | Template function to generate SNS message content |

### EventField Utility

EventField methods available within the `messageTemplate` function:

- `EventField.fromPath(path)`: Extract values from event data using JSONPath
- `EventField.fromPath('$.id')`: Get event ID
- `EventField.fromPath('$.detail-type')`: Get event type
- `EventField.fromPath('$.time')`: Get event occurrence time
- `EventField.fromPath('$.detail.data.object.*')`: Access Stripe event detail data

## Additional Setup

### AWS Chatbot Setup (for Slack notifications)

- Connect SNS topic with Slack channel

## Supported Event Types

Supports all Stripe event types. Major event types include:

- `payment_intent.succeeded` - Payment successful
- `customer.created` - Customer created
- `customer.subscription.created` - Subscription created
- `invoice.payment_succeeded` - Invoice payment successful
- `charge.dispute.created` - Chargeback occurred

For details, see [Stripe Webhook Events](https://stripe.com/docs/api/events/types).

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

### Watch Mode

```bash
npm run watch
```

## License

MIT License

## Contributing

Pull requests and issue reports are welcome.

## Support

If you encounter any issues, please report them on the GitHub Issues page.
