import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * Configuration properties for the Stripe Events to SNS construct.
 *
 * This interface defines the required parameters to set up a complete Stripe event
 * notification system using AWS EventBridge and SNS.
 *
 * @interface StripeEventsToSnsProps
 */
export interface StripeEventsToSnsProps {
  /**
   * The EventBridge event bus where Stripe events will be received.
   * This should be the custom event bus configured to receive events from Stripe.
   */
  eventBus: events.IEventBus;

  /**
   * The SNS topic where Stripe event notifications will be published.
   * This topic will receive formatted notifications for each matching Stripe event.
   */
  topic: sns.ITopic;

  /**
   * Array of Stripe event types to listen for (e.g., 'payment_intent.succeeded', 'customer.created').
   * Only events matching these types will trigger notifications.
   */
  eventTypes: string[];

  /**
   * Template function that defines how to format the SNS message from the Stripe event data.
   * This function receives EventField utilities and should return a properly formatted message object.
   */
  messageTemplate: (eventField: typeof events.EventField) => any;
}

/**
 * Stripe Events to SNS Construct
 *
 * This construct creates a complete Stripe event notification system that:
 * 1. Listens for Stripe events on a specified EventBridge event bus
 * 2. Filters events based on configured event types
 * 3. Publishes formatted notifications to an SNS topic
 * 4. Handles all necessary IAM permissions automatically
 *
 * The construct is designed to be a drop-in solution for Stripe webhook processing
 * using AWS EventBridge as the event router and SNS for notification delivery.
 *
 * @class StripeEventsToSns
 * @extends Construct
 */
export class StripeEventsToSns extends Construct {
  /**
   * Creates a new instance of the Stripe Events to SNS construct.
   *
   * This constructor sets up the complete event processing pipeline including:
   * - EventBridge rule for filtering Stripe events
   * - IAM permissions for EventBridge to publish to SNS
   * - SNS target configuration with custom message templating
   *
   * @param scope - The parent construct (usually a CDK Stack)
   * @param id - Unique identifier for this construct
   * @param props - Configuration properties for the notifier
   */
  constructor(scope: Construct, id: string, props: StripeEventsToSnsProps) {
    super(scope, id);

    // Validate required properties - collect all errors before throwing
    const errors: string[] = [];

    if (!props.eventBus) {
      errors.push('eventBus is required');
    }
    if (!props.topic) {
      errors.push('topic is required');
    }
    if (!props.eventTypes || props.eventTypes.length === 0) {
      errors.push('eventTypes must be a non-empty array');
    }
    if (!props.messageTemplate) {
      errors.push('messageTemplate is required');
    }

    if (errors.length > 0) {
      throw new Error(
        `StripeEventsToSns validation failed:\n  - ${errors.join('\n  - ')}`
      );
    }

    /**
     * EventBridge Rule for Stripe Event Processing
     *
     * This rule acts as the central event filter and router for Stripe events.
     * It listens for events from the Stripe partner event source and filters
     * them based on the specified event types. Only matching events will
     * trigger the notification pipeline.
     *
     * Key features:
     * - Source filtering: Only processes events from 'aws.partner/stripe.com'
     * - Event type filtering: Only processes specified Stripe event types
     * - Event bus routing: Uses the provided custom event bus
     */
    const rule = new events.Rule(this, 'StripeEventRule', {
      eventBus: props.eventBus,
      eventPattern: {
        // Filter for events from Stripe's AWS partner integration
        source: [{ prefix: 'aws.partner/stripe.com' }] as any,
        // Filter for specific Stripe event types (e.g., payment_intent.succeeded)
        detailType: props.eventTypes,
      },
      description: 'Generic rule to relay Stripe events to SNS',
    });

    /**
     * IAM Resource Policy for SNS Topic Access
     *
     * This policy statement grants EventBridge the necessary permissions to publish
     * messages to the SNS topic. Without this permission, EventBridge would be
     * unable to deliver notifications, resulting in failed event processing.
     *
     * Security considerations:
     * - Only allows the EventBridge service principal to publish
     * - Restricts access to the specific SNS topic resource
     * - Uses source ARN condition to ensure only this specific rule can publish
     * - Follows the principle of least privilege for secure access control
     */
    props.topic.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        // Grant permission only to the EventBridge service
        principals: [new iam.ServicePrincipal('events.amazonaws.com')],
        // Allow only the SNS Publish action
        actions: ['sns:Publish'],
        // Restrict to the specific SNS topic
        resources: [props.topic.topicArn],
        conditions: {
          StringEquals: {
            // Ensure only this specific EventBridge rule can publish
            'aws:SourceArn': rule.ruleArn,
          },
        },
      })
    );

    /**
     * SNS Target Configuration with Message Templating
     *
     * This section configures the EventBridge rule to send notifications to SNS
     * when Stripe events are received. The message content is dynamically generated
     * using the provided template function, allowing for flexible message formatting.
     *
     * Key features:
     * - Dynamic message generation using the provided template function
     * - Access to EventField utilities for extracting event data
     * - Automatic JSON serialization of the template output
     * - Integration with SNS for reliable message delivery
     *
     * The template function receives EventField utilities that allow access to:
     * - Event metadata (source, time, region, etc.)
     * - Event detail data (the actual Stripe event payload)
     * - Event context information for proper message formatting
     */
    rule.addTarget(
      new targets.SnsTopic(props.topic, {
        // Use the provided template function to generate the SNS message content
        // The template function receives EventField utilities for data extraction
        message: events.RuleTargetInput.fromObject(
          props.messageTemplate(events.EventField)
        ),
      })
    );
  }
}
